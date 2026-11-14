import { DAY_S } from '@/core/simulation/constants';
import type { Simulation } from '@/core/simulation/Simulation';
import type { FlowId } from '@/core/voyage/types';

/**
 * Stock left on arrival under this many days is TIGHT (GDD `gate-decision-info` B: the
 * threshold sets the gamble). OWNER: design
 */
export const FORECAST_TIGHT_DAYS = 15;
/**
 * Fuel charges left on arrival under this are TIGHT (the next leg then surely needs more).
 * OWNER: design
 */
export const FORECAST_TIGHT_CHARGES = 0.25;
/**
 * Substeps one forecast slice integrates: the work is split in slices this small so a frame's
 * share of the forecast stays near its budget even where substeps are short (near bodies).
 */
const SLICE_SUBSTEPS = 8;
/**
 * A forecast leg that has not arrived after this many planned durations is given up
 * (`LegForecast.gaveUp`: the autopilot failed, not the fuel).
 */
const GIVE_UP_PLANS = 4;

/** OK / TIGHT / SHORT: a caption under the exact numbers (GDD D15, `gate-decision-info`). */
export type ForecastVerdict = 'ok' | 'tight' | 'short';

/** Stocks the forecast follows: the four in days and the cabin's warmth (`heat`). */
export const FORECAST_STOCKS: readonly FlowId[] = ['oxygen', 'water', 'food', 'power', 'heat'];

/** One stock in a forecast. */
export interface StockForecast {
  /** Amount at the start of the forecast leg (days). */
  now: number;
  /**
   * Amount on arrival; when the ship does not arrive, when it begins to drift (`drifts`) or
   * when the forecast gave up (`gaveUp`).
   */
  onArrival: number;
  /** Simulated day of the voyage it runs out on the way, or null. */
  runsOutDay: number | null;
  /**
   * `short` - runs out before arrival (oxygen, water, food, heat: the crew dies; power: the
   * cabin starts to cool and powered items die); `tight` - under `FORECAST_TIGHT_DAYS` left
   * (heat: the cabin cools on the way); `ok`.
   */
  verdict: ForecastVerdict;
}

/**
 * The forecast of one leg (D16): a headless copy of the voyage flies it with the autopilot,
 * exactly as the game will, without events (only events are unknown, GDD D15).
 */
export interface LegForecast {
  /** Leg flown: it ends at gate `leg`. */
  leg: number;
  /** Simulated day of the voyage the forecast starts at (the departure, or now mid-leg). */
  startDay: number;
  /** Whether the ship reaches the gate (false: it drifts, `drifts`, or `gaveUp`). */
  arrives: boolean;
  /**
   * Simulated days of the leg from `startDay`: to the arrival; when the ship does not arrive,
   * to the autopilot's planned arrival (the leg's length for the map; the drift itself is at
   * `driftDay`).
   */
  legDays: number;
  /**
   * The charges run out on the way and the ship drifts (D13): the crew is lost a few real
   * seconds of Run later (`drift`). The stocks' `onArrival` are then the amounts at that moment.
   */
  drifts: boolean;
  /** Simulated day of the voyage the drift begins, or null when the ship does not drift. */
  driftDay: number | null;
  /** How far along the leg the drift begins, 0..1 of `legDays` by time, or null. */
  driftLegFraction: number | null;
  /**
   * The forecast flew `GIVE_UP_PLANS` planned durations without arriving or drifting and gave
   * up (an autopilot failure, not a fuel shortage; not expected on the shipped legs).
   */
  gaveUp: boolean;
  /** Fuel charges now, burnt on the leg (to the drift: all of them), left on arrival. */
  fuelNow: number;
  charges: number;
  fuelOnArrival: number;
  /**
   * Not enough charges to reach the gate (D6, plan I7): true exactly when `drifts`. Go on is
   * allowed, the ship drifts and the crew is lost (`drift`); the gate card must warn.
   */
  fuelShort: boolean;
  /** Fuel verdict: short when `fuelShort`, tight under `FORECAST_TIGHT_CHARGES` left. */
  fuelVerdict: ForecastVerdict;
  stocks: Record<FlowId, StockForecast>;
  /** The worst of the stocks' and the fuel's verdicts; short when `gaveUp`. */
  verdict: ForecastVerdict;
  /**
   * The first stock to run out on the way (the panel's mark, D7): which, on what day, how far
   * along the leg (0..1 of `legDays`) and where the ship is then (m); null if none does.
   */
  firstDepletion: {
    stock: FlowId;
    day: number;
    legFraction: number;
    x: number;
    y: number;
  } | null;
}

const RANK: Record<ForecastVerdict, number> = { ok: 0, tight: 1, short: 2 };

/** The worse of two verdicts. */
export function worseVerdict(a: ForecastVerdict, b: ForecastVerdict): ForecastVerdict {
  return RANK[a] >= RANK[b] ? a : b;
}

/**
 * A forecast in the making: flies a forecast copy (`Simulation.forecastCopy`) of the voyage in
 * slices, so the game spreads it over frames (a long leg costs up to seconds of CPU) and the
 * tools run it at once (`runAll`). Start it parked at a gate (it departs the copy itself) or
 * mid-leg (it flies the rest of the leg).
 */
export class ForecastJob {
  private readonly copy: Simulation;
  private readonly startS: number;
  private readonly planEndS: number;
  private readonly start: Record<FlowId, number>;
  private readonly fuelNow: number;
  private readonly leg: number;
  private done: LegForecast | null = null;

  constructor(simulation: Simulation) {
    const copy = simulation.forecastCopy();
    const parked = copy.autopilot.phase === 'arrived';
    if (parked) copy.departToNextGate();
    const pilot = copy.autopilot;
    const snapshot = copy.snapshot();
    this.copy = copy;
    this.leg = pilot.legIndex;
    this.startS = copy.time;
    this.planEndS = Math.max(pilot.arrivalS, copy.time);
    this.fuelNow = snapshot.resources.fuel.value;
    this.start = Object.fromEntries(
      FORECAST_STOCKS.map((id) => [id, snapshot.resources[id].value]),
    ) as Record<FlowId, number>;
    if (pilot.phase === 'drifting') this.done = this.result('drifts');
    else if (pilot.phase !== 'flying' && pilot.phase !== 'docking') {
      throw new Error(`ForecastJob: no leg to forecast (autopilot ${pilot.phase})`);
    }
  }

  /** The finished forecast, or null while it is still being computed. */
  get finished(): LegForecast | null {
    return this.done;
  }

  /**
   * Works for about `budgetMs` of wall-clock time (at least one slice of `SLICE_SUBSTEPS`
   * substeps, so a frame overruns the budget by at most one slice); returns the forecast when
   * finished, else null. `now` reads the clock (ms). The result does not depend on the budget:
   * the copy takes the game's substeps and stops on the same one (arrival, drift, give-up).
   */
  work(budgetMs: number, now: () => number = () => performance.now()): LegForecast | null {
    if (this.done) return this.done;
    const until = now() + budgetMs;
    const limitS = this.startS + GIVE_UP_PLANS * Math.max(DAY_S, this.planEndS - this.startS);
    do {
      this.copy.flySubsteps(SLICE_SUBSTEPS, limitS);
      const phase = this.copy.autopilot.phase;
      if (phase === 'arrived' || phase === 'finished') this.done = this.result('arrives');
      else if (phase === 'drifting') this.done = this.result('drifts');
      else if (this.copy.time >= limitS) this.done = this.result('gaveUp');
    } while (!this.done && now() < until);
    return this.done;
  }

  /** Computes the whole forecast at once (tools, tests). */
  runAll(): LegForecast {
    return this.work(Number.POSITIVE_INFINITY) as LegForecast;
  }

  private result(end: 'arrives' | 'drifts' | 'gaveUp'): LegForecast {
    const copy = this.copy;
    const snapshot = copy.snapshot();
    const arrives = end === 'arrives';
    const drifts = end === 'drifts';
    const endS = arrives ? copy.time : this.planEndS;
    const legDays = (endS - this.startS) / DAY_S;
    const fuelOnArrival = snapshot.resources.fuel.value;
    const fuelShort = drifts;
    const depletions = copy.depletions;
    const stocks = {} as Record<FlowId, StockForecast>;
    let first: LegForecast['firstDepletion'] = null;
    for (const id of FORECAST_STOCKS) {
      const out = depletions[id];
      const onArrival = snapshot.resources[id].value;
      let verdict: ForecastVerdict;
      if (id === 'heat') {
        verdict = out ? 'short' : onArrival < snapshot.resources.heat.max ? 'tight' : 'ok';
      } else {
        verdict = out ? 'short' : onArrival < FORECAST_TIGHT_DAYS ? 'tight' : 'ok';
      }
      stocks[id] = {
        now: this.start[id],
        onArrival,
        runsOutDay: out ? out.timeS / DAY_S : null,
        verdict,
      };
      if (out && (!first || out.timeS / DAY_S < first.day)) {
        first = {
          stock: id,
          day: out.timeS / DAY_S,
          legFraction: legDays > 0 ? (out.timeS - this.startS) / DAY_S / legDays : 0,
          x: out.x,
          y: out.y,
        };
      }
    }
    const fuelVerdict: ForecastVerdict = fuelShort
      ? 'short'
      : fuelOnArrival < FORECAST_TIGHT_CHARGES
        ? 'tight'
        : 'ok';
    // A forecast that gave up does not reach the gate either.
    let verdict: ForecastVerdict = end === 'gaveUp' ? 'short' : fuelVerdict;
    for (const id of FORECAST_STOCKS) verdict = worseVerdict(verdict, stocks[id].verdict);
    return {
      leg: this.leg,
      startDay: this.startS / DAY_S,
      arrives,
      legDays,
      drifts,
      driftDay: drifts ? copy.time / DAY_S : null,
      driftLegFraction: drifts
        ? legDays > 0
          ? Math.min(1, (copy.time - this.startS) / DAY_S / legDays)
          : 0
        : null,
      gaveUp: end === 'gaveUp',
      fuelNow: this.fuelNow,
      charges: Math.max(0, this.fuelNow - fuelOnArrival),
      fuelOnArrival,
      fuelShort,
      fuelVerdict,
      stocks,
      verdict,
      firstDepletion: first,
    };
  }
}
