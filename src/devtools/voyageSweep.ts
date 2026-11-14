/**
 * The loadout sweep (plan S12, D30): every set of cargo the hold can take, flown along a voyage
 * flown once. The ship's mass is constant, so the flight does not depend on the cargo, the
 * warp, the pace or the time spent at gates (plan S5): `preflight` flies the six legs once,
 * frame by frame as the game does, and records the time, the real seconds of Run, the fuel
 * charges burnt and the pace at every frame. `evaluateVoyage` then follows one loadout along
 * that flight with the game's own pure functions - `stepLife`/`evaluateFlows` for the
 * resources, `resourceDeath`, `lifeForecast` for the alarm, `rollFor` and the event registry
 * for the events, `colonyFit` for the tiers - in a few steps per leg instead of the
 * integrator's thousands. `voyageCrossCheck.ts` checks it against the real `Voyage`.
 *
 * Must not import `@/config`, `@/core/services` or the event bus: they read `window` on load.
 */
import { ship } from '@/content/simulation/ship';
import { solarSystem } from '@/content/simulation/solar-system';
import { cargo } from '@/content/voyage/cargo';
import { colony } from '@/content/voyage/colony';
import { voyageEvents } from '@/content/voyage/events';
import { gates } from '@/content/voyage/gates';
import { legs } from '@/content/voyage/legs';
import { DAY_S } from '@/core/simulation/constants';
import { type PaceState, realSecondsAhead, Simulation } from '@/core/simulation/Simulation';
import { SolarSystem } from '@/core/simulation/SolarSystem';
import type { LegDef, Resources } from '@/core/simulation/types';
import { COLONY_TIERS, colonyFit } from '@/core/voyage/colony';
import {
  DRIFT_DEATH_REAL_S,
  evaluateFlows,
  FLOW_IDS,
  freshLife,
  lifeForecast,
  resourceDeath,
  stepLife,
} from '@/core/voyage/flows';
import { loadoutOf, startResources } from '@/core/voyage/loadout';
import type { DeathCause, LifeState, Loadout, StockId } from '@/core/voyage/types';
import {
  applyEventEffect,
  clampChance,
  enabledChoices,
  eventContext,
  rollEvent,
  rollRisk,
  type EffectTarget,
  type VoyageEventCatalog,
} from '@/core/voyage/voyageEvents';
import { FRAME_S } from '@/devtools/voyageFlight';

/** The route the game flies (src/content/voyage). */
export const route = { ship, gates, legs, cargo };
/** The solar system of the game, built once. */
export const system = new SolarSystem(solarSystem);

/** Seeds of the sweep's Monte Carlo with events (plan S12: 20; I8 reads them). OWNER: design */
export const SWEEP_SEEDS: readonly number[] = Array.from({ length: 20 }, (_, i) => i + 1);

/**
 * Fuel charges of the pre-flight: so many that no balance number (`dvBudget`, the charges per
 * crate) can leave the reference flight adrift - the burn it records does not depend on them.
 */
const PREFLIGHT_FUEL = 1e6;
/** A pre-flown leg that has not arrived after this much simulated time is a failure, s. */
const PREFLIGHT_LEG_LIMIT_S = 1000 * DAY_S;
/** Frames between the pre-flight's saved states (`Flight.checkpoints`): half a second of Run. */
const CHECKPOINT_FRAMES = 30;

/** One leg of the pre-flown voyage. */
export interface FlownLeg {
  /** Simulated time the leg began (the departure), its planned duration, the arrival, s. */
  startS: number;
  planS: number;
  arrivalS: number;
  /** Fuel charges burnt from the start of the voyage to the leg's start and to its arrival. */
  burntAtStart: number;
  burntAtArrival: number;
  /** Indices of the leg's first and last recorded frames. */
  firstFrame: number;
  lastFrame: number;
}

/**
 * The voyage flown once (`preflight`): per frame (after the frame's step, when the game reads
 * the alarm) the simulated time, the real seconds of Run since the start (time at the gates
 * does not count: Run stands there), the charges burnt, the leg and the pace.
 */
export interface Flight {
  timeS: Float64Array;
  realS: Float64Array;
  burnt: Float64Array;
  leg: Int8Array;
  pace: PaceState[];
  legs: FlownLeg[];
  /**
   * The pre-flight's simulation saved every `CHECKPOINT_FRAMES` frames while flying (index of
   * the frame after which it was saved, the copy): `driftEndS` flies a drift on from them.
   */
  checkpoints: { frame: number; simulation: Simulation }[];
  /** `driftEndS` results by leg and drift start. */
  driftEnds: Map<string, number>;
  /** Wall-clock milliseconds the pre-flight took. */
  wallMs: number;
  /**
   * Why the reference flight did not reach every gate (the autopilot failed with these
   * numbers), or null. `legs` then holds only the legs flown; `npm run balance` reports it as a
   * failed invariant.
   */
  failure: string | null;
}

/**
 * Flies the voyage once with Go on at every gate, recording every frame (`Flight`). The ship
 * is a forecast copy (`Simulation.forecastCopy`: nobody aboard dies) with `PREFLIGHT_FUEL`
 * charges, so only the autopilot itself can fail it (`Flight.failure`).
 */
export function preflight(): Flight {
  const started = performance.now();
  const fuelDef = cargo.items.fuel;
  const preflightCargo = {
    ...cargo,
    items: {
      ...cargo.items,
      fuel: { ...fuelDef, start: { ...fuelDef.start, fuel: PREFLIGHT_FUEL } },
    },
  };
  const simulation = new Simulation(
    system,
    { ...route, cargo: preflightCargo },
    loadoutOf(preflightCargo, { fuel: 1 }),
  ).forecastCopy();
  const fuel0 = simulation.snapshot().resources.fuel.value;
  const timeS: number[] = [];
  const realS: number[] = [];
  const burnt: number[] = [];
  const legIndex: number[] = [];
  const pace: PaceState[] = [];
  const flown: FlownLeg[] = [];
  const checkpoints: Flight['checkpoints'] = [];
  let failure: string | null = null;
  let real = 0;
  const beginLeg = () => {
    const pilot = simulation.autopilot;
    flown.push({
      startS: pilot.legStartS,
      planS: Math.max(0, pilot.arrivalS - pilot.legStartS),
      arrivalS: Number.NaN,
      burntAtStart: fuel0 - simulation.snapshot().resources.fuel.value,
      burntAtArrival: Number.NaN,
      firstFrame: timeS.length,
      lastFrame: -1,
    });
  };
  beginLeg();
  for (;;) {
    simulation.advance(FRAME_S);
    real += FRAME_S;
    const leg = flown.length - 1;
    timeS.push(simulation.time);
    realS.push(real);
    burnt.push(fuel0 - simulation.snapshot().resources.fuel.value);
    legIndex.push(leg);
    pace.push(simulation.pace());
    if (timeS.length % CHECKPOINT_FRAMES === 0 && simulation.autopilot.phase === 'flying') {
      checkpoints.push({ frame: timeS.length - 1, simulation: simulation.forecastCopy() });
    }
    const phase = simulation.autopilot.phase;
    const target = gates[leg]?.body ?? `gate ${leg}`;
    if (phase === 'drifting' || simulation.dead) {
      failure = `the reference flight stopped on its way to ${target} (${phase})`;
    } else if (simulation.time - flown[leg].startS > PREFLIGHT_LEG_LIMIT_S) {
      failure =
        `the reference flight did not reach ${target} in ` +
        `${PREFLIGHT_LEG_LIMIT_S / DAY_S} days (autopilot ${phase})`;
    }
    if (failure) {
      flown.pop();
      break;
    }
    if (simulation.takeArrivals().length > 0) {
      const current = flown[leg];
      current.arrivalS = simulation.time;
      current.burntAtArrival = burnt[burnt.length - 1];
      current.lastFrame = timeS.length - 1;
      if (!simulation.departToNextGate()) break;
      beginLeg();
    }
  }
  return {
    timeS: Float64Array.from(timeS),
    realS: Float64Array.from(realS),
    burnt: Float64Array.from(burnt),
    leg: Int8Array.from(legIndex),
    pace,
    legs: flown,
    checkpoints,
    driftEnds: new Map(),
    wallMs: performance.now() - started,
    failure,
  };
}

/** First frame of leg `leg` whose time is at least `t` (the leg's last frame if none). */
function frameAt(flight: Flight, leg: number, t: number): number {
  const { firstFrame, lastFrame } = flight.legs[leg];
  let low = firstFrame;
  let high = lastFrame;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (flight.timeS[mid] >= t) high = mid;
    else low = mid + 1;
  }
  return low;
}

/** Real seconds of Run at simulated time `t` of leg `leg` (between frames: linear). */
function realAt(flight: Flight, leg: number, t: number): number {
  const f = frameAt(flight, leg, t);
  const t1 = flight.timeS[f];
  const r1 = flight.realS[f];
  if (t >= t1) return r1 + (t - t1) / flight.pace[f].timeScale;
  const t0 = f > 0 ? flight.timeS[f - 1] : 0;
  const r0 = f > 0 ? flight.realS[f - 1] : 0;
  return r0 + ((r1 - r0) * (t - t0)) / Math.max(1e-9, t1 - t0);
}

/**
 * Simulated time the crew is lost when the ship goes adrift at `startS` of leg `leg`: the game's
 * drift flown for real (`DRIFT_DEATH_REAL_S` of Run frame by frame, the clock counting from the
 * frame the fuel runs out in), from the last pre-flight checkpoint before `startS`. A drifting
 * ship coasts where the reference flight thrusts, and the time scale follows the distance to
 * the nearest body, so the reference flight's pace would get the drift's length wrong near a
 * body. Cached per leg and start.
 */
function driftEndS(flight: Flight, leg: number, startS: number): number {
  const key = `${leg}:${startS}`;
  const cached = flight.driftEnds.get(key);
  if (cached !== undefined) return cached;
  const { firstFrame } = flight.legs[leg];
  let checkpoint: Flight['checkpoints'][number] | undefined;
  for (const c of flight.checkpoints) {
    if (c.frame >= firstFrame && flight.timeS[c.frame] <= startS) checkpoint = c;
  }
  if (!checkpoint) throw new Error(`no pre-flight checkpoint on leg ${leg} before ${startS} s`);
  // A forecast copy: nobody aboard dies, so only the drift's own clock ends it here.
  const simulation = checkpoint.simulation.forecastCopy();
  while (simulation.time < startS) simulation.advance(FRAME_S, startS);
  // Empty the whole tank (the pre-flight's charges and the base's own), as a leak to 0 does.
  const fuel = simulation.snapshot().resources.fuel.value;
  simulation.applyEvent('drift', { stocks: { fuel: -fuel } });
  // The rest of the frame the fuel ran out in, then whole frames, as `Simulation.advance` counts.
  simulation.advance(0);
  let driftRealS = FRAME_S;
  while (driftRealS < DRIFT_DEATH_REAL_S) {
    simulation.advance(FRAME_S);
    driftRealS += FRAME_S;
  }
  flight.driftEnds.set(key, simulation.time);
  return simulation.time;
}

/**
 * Simulated time on leg `leg` when the charges burnt since the voyage's start reach `burnt`
 * (the engine stops there: drift), or null if the leg arrives first.
 */
function burnOutTime(flight: Flight, leg: number, burnt: number): number | null {
  const flown = flight.legs[leg];
  if (burnt > flown.burntAtArrival) return null;
  if (burnt <= flown.burntAtStart) return flown.startS;
  let low = flown.firstFrame;
  let high = flown.lastFrame;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (flight.burnt[mid] >= burnt) high = mid;
    else low = mid + 1;
  }
  const b1 = flight.burnt[low];
  const t1 = flight.timeS[low];
  const b0 = low > flown.firstFrame ? flight.burnt[low - 1] : flown.burntAtStart;
  const t0 = low > flown.firstFrame ? flight.timeS[low - 1] : flown.startS;
  return b1 > b0 ? t0 + ((t1 - t0) * (burnt - b0)) / (b1 - b0) : t1;
}

/** How a fast-evaluated voyage ended. */
export interface FastOutcome {
  /** `landed` at the last gate (or at `stopAt`), or `died`. */
  kind: 'landed' | 'died';
  /** Last gate reached alive, -1 before the Moon. */
  gate: number;
  cause: DeathCause | null;
  /** Simulated day of the end (death or landing). */
  day: number;
  /** Leg the death came on (the gate it was flying to). */
  leg: number;
  /** Simulated day the ship began to drift, or null. */
  driftDay: number | null;
  /** Fuel charges at each gate reached, and whether the next leg's charges are short there. */
  fuelAtGate: number[];
  fuelShortAtGate: boolean[];
  /** Resources at each gate reached (day, stocks) for the cross-check. */
  stocksAtGate: Record<StockId, number>[];
  /** Real seconds of Run from the death cause's alarm coming on to the death (no events only). */
  alarmLeadRealS: number | null;
  /**
   * Events that happened: the answer, whether its risk struck, the simulated day, and the
   * stocks its effect emptied (from above 0 to 0).
   */
  events: { id: string; choice: string; hit: boolean; day: number; emptied: StockId[] }[];
  /**
   * The crew died while an event's effect was applied: its own death (`event:<id>`), a stock
   * it emptied, or one that ran out while waiting.
   */
  diedInEvent: boolean;
  /** The ship went adrift because an event's effect took fuel (a leak). */
  leakDrift: boolean;
}

/** What `evaluateVoyage` flies. */
export interface FastPolicy {
  /** Events on the way (none: an empty registry). */
  events: VoyageEventCatalog;
  seed: number;
  /** Answer by event id (an answer missing or disabled: the first enabled choice). */
  choices?: Readonly<Record<string, string>>;
  /** Stop at this gate (default: Go on to the last). */
  stopAt?: number;
  /** Compute the alarm lead of the death (`FastOutcome.alarmLeadRealS`). */
  alarm?: boolean;
}

/** A stretch of constant flows: start time, stocks then, rates, the leg, offline items. */
interface Segment {
  t0: number;
  t1: number;
  values: Record<StockId, number>;
  maxes: Record<StockId, number>;
  rates: Record<string, number>;
  leg: number;
  offline: string[];
}

const STOCK_IDS: readonly StockId[] = ['fuel', 'oxygen', 'water', 'food', 'power', 'heat'];
/** A stock this close to 0 after a step that ends where it runs out is 0 (rounding). */
const ZERO_EPS = 1e-9;

/**
 * The ship's living state along a voyage: the game's `Resources` and `LifeState`, advanced with
 * `stepLife` (the game's step) over stretches where the flows are constant, split exactly where
 * a stock runs out (so power running out switches to the unpowered flows on the day it does).
 */
class LifeTrack {
  readonly resources: Resources;
  readonly life: LifeState = freshLife();
  /** Recorded stretches (only when the alarm is wanted). */
  readonly segments: Segment[] | null;

  constructor(
    readonly loadout: Loadout,
    record: boolean,
  ) {
    this.resources = startResources(cargo, loadout);
    stepLife(this.resources, loadout, legs[0], this.life, 0);
    this.segments = record ? [] : null;
  }

  /**
   * Flows for `dtS` simulated seconds on leg `leg` starting at time `t0` (for the record).
   * Returns the seconds after which the crew died (`life.cause` set), or null.
   */
  flow(dtS: number, leg: number, t0: number): number | null {
    const def: LegDef = legs[leg];
    let done = 0;
    for (let guard = 0; guard < 64; guard++) {
      const rates = evaluateFlows(this.loadout, def, {
        powered: this.resources.power.value > 0,
        offline: this.life.offline,
      });
      let step = dtS - done;
      const untils: { id: StockId; until: number }[] = [];
      for (const id of FLOW_IDS) {
        const value = this.resources[id].value;
        if (rates[id] < 0 && value > 0) untils.push({ id, until: (value / -rates[id]) * DAY_S });
      }
      for (const { until } of untils) step = Math.min(step, until);
      // Every stock that runs out at the end of this step (two at once: the game's order wins).
      const zeroIds = untils
        .filter(({ until }) => until <= step * (1 + 1e-12) + 1e-9)
        .map(({ id }) => id);
      if (this.segments && Number.isFinite(t0)) {
        this.segments.push({
          t0: t0 + done,
          t1: t0 + done + step,
          values: this.values(),
          maxes: this.maxes(),
          rates,
          leg,
          offline: [...this.life.offline],
        });
      }
      stepLife(this.resources, this.loadout, def, this.life, step);
      done += step;
      if (zeroIds.length > 0) {
        for (const id of zeroIds) {
          if (this.resources[id].value < ZERO_EPS) this.resources[id].value = 0;
        }
        // The step's end: power at 0 takes the powered items offline (the game's next step).
        stepLife(this.resources, this.loadout, def, this.life, 0);
      }
      const cause = resourceDeath(this.resources);
      if (cause) {
        this.life.cause = cause;
        return done;
      }
      if (zeroIds.length === 0 || done >= dtS) return null;
    }
    throw new Error('LifeTrack.flow: no progress');
  }

  /**
   * What an event's effect changes on leg `leg` (`applyEventEffect`): the flows step as the
   * game's `Simulation.flowResources` does (one `stepLife`, then the death check), the fuel
   * is whatever the caller put in `resources.fuel` (the drift follows from what is left).
   */
  effectTarget(leg: number): EffectTarget {
    const { resources, life, loadout } = this;
    return {
      resources,
      life,
      flow: (dtS) => {
        stepLife(resources, loadout, legs[leg], life, dtS);
        life.cause ??= resourceDeath(resources);
      },
      fuelOut: () => {},
      die: (cause) => {
        life.cause ??= cause;
      },
    };
  }

  values(): Record<StockId, number> {
    return Object.fromEntries(STOCK_IDS.map((id) => [id, this.resources[id].value])) as Record<
      StockId,
      number
    >;
  }

  private maxes(): Record<StockId, number> {
    return Object.fromEntries(STOCK_IDS.map((id) => [id, this.resources[id].max])) as Record<
      StockId,
      number
    >;
  }
}

/**
 * Follows `loadout` along the pre-flown voyage `flight` with `policy` (events, seed, answers,
 * where to stop): what the game's `Voyage` would do, at a fraction of the cost. Resources step
 * exactly where a stock runs out (the game: at the end of that integrator substep); events are
 * rolled where they are due; drift starts where the charges burnt reach the fuel aboard, and
 * the crew is lost `DRIFT_DEATH_REAL_S` real seconds of a real drift later (`driftEndS`).
 */
export function evaluateVoyage(flight: Flight, loadout: Loadout, policy: FastPolicy): FastOutcome {
  const track = new LifeTrack(loadout, policy.alarm === true);
  const fuelStart = track.resources.fuel.value;
  /** Charges lost to events (a leak). */
  let leaked = 0;
  const fuelAt = (burnt: number) => Math.max(0, fuelStart - burnt - leaked);
  const out: FastOutcome = {
    kind: 'died',
    gate: -1,
    cause: null,
    day: 0,
    leg: 0,
    driftDay: null,
    fuelAtGate: [],
    fuelShortAtGate: [],
    stocksAtGate: [],
    alarmLeadRealS: null,
    events: [],
    diedInEvent: false,
    leakDrift: false,
  };
  const died = (t: number, leg: number, drifting: boolean): FastOutcome => {
    out.kind = 'died';
    out.cause = track.life.cause;
    out.day = t / DAY_S;
    out.leg = leg;
    if (policy.alarm && out.cause) {
      out.alarmLeadRealS = drifting
        ? DRIFT_DEATH_REAL_S
        : alarmLead(flight, track, out.cause, t, leg);
    }
    return out;
  };
  const charges = (leg: number) => flight.legs[leg].burntAtArrival - flight.legs[leg].burntAtStart;

  for (let leg = 0; leg < flight.legs.length; leg++) {
    const flown = flight.legs[leg];
    let t = flown.startS;
    const due = Object.entries(policy.events)
      .filter(([, def]) => def.leg === leg)
      .map(([id, def]) => ({ id, def, dueS: flown.startS + def.at * flown.planS }))
      .sort((a, b) => a.dueS - b.dueS);
    let drift = burnOutTime(flight, leg, fuelStart - leaked);
    for (;;) {
      const event = due[0];
      const next = Math.min(event?.dueS ?? Infinity, drift ?? Infinity, flown.arrivalS);
      const after = track.flow(next - t, leg, t);
      if (after !== null) return died(t + after, leg, false);
      t = next;
      if (drift !== null && t >= drift) {
        // Adrift: the crew is lost DRIFT_DEATH_REAL_S of Run later, unless a stock runs out first.
        out.driftDay = t / DAY_S;
        const end = driftEndS(flight, leg, t);
        const before = track.flow(end - t, leg, t);
        if (before !== null) return died(t + before, leg, false);
        track.life.cause = 'drift';
        return died(end, leg, true);
      }
      if (event && t >= event.dueS && event.dueS < flown.arrivalS) {
        due.shift();
        // The fuel aboard now, for the effect; what it leaves is a leak (or a gain).
        const fuelNow = fuelAt(burntAt(flight, leg, t));
        track.resources.fuel.value = fuelNow;
        const answer = answerEvent(track, policy, event.id, leg, t);
        if (answer) out.events.push(answer);
        if (track.resources.fuel.value !== fuelNow) {
          leaked += fuelNow - track.resources.fuel.value;
          const wasDrift = drift;
          drift = burnOutTime(flight, leg, fuelStart - leaked);
          if (drift !== null) drift = Math.max(drift, t);
          if (drift !== null && (wasDrift === null || drift < wasDrift)) out.leakDrift = true;
        }
        if (track.life.cause) {
          out.diedInEvent = true;
          return died(t, leg, false);
        }
        continue;
      }
      // Arrived at gate `leg`.
      out.gate = leg;
      const fuel = fuelAt(flown.burntAtArrival);
      out.fuelAtGate.push(fuel);
      out.fuelShortAtGate.push(leg + 1 < flight.legs.length && fuel < charges(leg + 1));
      out.stocksAtGate.push({ ...track.values(), fuel });
      if (leg === flight.legs.length - 1 || leg === policy.stopAt) {
        out.kind = 'landed';
        out.day = t / DAY_S;
        out.leg = leg;
        return out;
      }
      break;
    }
  }
  return out;
}

/** Charges burnt at time `t` of leg `leg` (between frames: linear). */
function burntAt(flight: Flight, leg: number, t: number): number {
  const flown = flight.legs[leg];
  const f = frameAt(flight, leg, t);
  const t1 = flight.timeS[f];
  const b1 = flight.burnt[f];
  if (f === flown.firstFrame || t >= t1) {
    const t0 = flown.startS;
    return t1 > t0 ? flown.burntAtStart + ((b1 - flown.burntAtStart) * (t - t0)) / (t1 - t0) : b1;
  }
  const t0 = flight.timeS[f - 1];
  const b0 = flight.burnt[f - 1];
  return b0 + ((b1 - b0) * (t - t0)) / Math.max(1e-9, t1 - t0);
}

/**
 * Rolls event `id` where it is due at time `t` (the game's `Voyage.roll`), answers it by
 * `policy` (the choice asked for when enabled, else the first enabled one, as
 * `runSeededVoyage`) and applies the answer to `track` with the game's `applyEventEffect`.
 * Returns the answer, or null when the event does not happen.
 */
function answerEvent(
  track: LifeTrack,
  policy: FastPolicy,
  id: string,
  leg: number,
  t: number,
): FastOutcome['events'][number] | null {
  const def = policy.events[id];
  const resources = track.resources;
  const ctx = eventContext(
    track.loadout,
    track.life.offline,
    (stock: StockId) => resources[stock].value,
    legs[leg].comms,
    leg,
  );
  if (!rollEvent(def, id, policy.seed, ctx).happened) return null;
  const enabled = enabledChoices(def, ctx);
  const wanted = def.choices.find((choice) => choice.id === policy.choices?.[id]);
  const choice = wanted && enabled.includes(wanted) ? wanted : enabled[0];
  const { hit } = rollRisk(choice, id, policy.seed, ctx);
  const before = track.values();
  const target = track.effectTarget(leg);
  applyEventEffect(target, id, choice.effect);
  if (hit) applyEventEffect(target, id, choice.onHit);
  const emptied = STOCK_IDS.filter((stock) => before[stock] > 0 && resources[stock].value <= 0);
  return { id, choice: choice.id, hit, day: t / DAY_S, emptied };
}

/**
 * Real seconds of Run between the alarm of `cause` coming on (and staying on) and the death at
 * time `deathS` on leg `leg`: the game reads `lifeForecast` after every frame's step; here it
 * is read at the pre-flown frames with the stocks of the recorded stretches and the pace of
 * that frame (`realSecondsAhead`).
 */
function alarmLead(
  flight: Flight,
  track: LifeTrack,
  cause: DeathCause,
  deathS: number,
  leg: number,
): number {
  const segments = track.segments ?? [];
  const deathFrame = frameAt(flight, leg, deathS);
  const deathReal = realAt(flight, leg, deathS);
  let onset = deathReal;
  let s = segments.length - 1;
  // Back from the death frame by frame, across gates (time stands there, Run too).
  for (let f = deathFrame; f >= 0; f--) {
    const t = flight.timeS[f];
    if (t >= deathS) continue;
    while (s > 0 && segments[s].t0 > t) s--;
    const segment = segments[s];
    if (!segment || segment.t0 > t) break;
    const resources = resourcesAt(segment, t);
    const life: LifeState = { ...freshLife(), offline: [...segment.offline] };
    const pace = flight.pace[f];
    const forecast = lifeForecast({
      resources,
      loadout: track.loadout,
      leg: legs[segment.leg],
      life,
      realSecondsTo: (days) => realSecondsAhead(pace, days),
      timeScale: pace.timeScale,
      drifting: false,
    }).find((entry) => entry.cause === cause);
    if (!forecast?.alarm) break;
    onset = flight.realS[f];
  }
  return deathReal - onset;
}

/** The stocks of `segment` at time `t` (linear within it, as `stepLife` steps). */
function resourcesAt(segment: Segment, t: number): Resources {
  const dtDays = (t - segment.t0) / DAY_S;
  const resources = {} as Resources;
  for (const id of STOCK_IDS) {
    const rate = segment.rates[id] ?? 0;
    const value = Math.min(segment.maxes[id], Math.max(0, segment.values[id] + rate * dtDays));
    resources[id] = { value, max: segment.maxes[id], ratePerS: rate / DAY_S };
  }
  resources.comms = { value: 2, max: 2, ratePerS: 0 };
  return resources;
}

// --- The sweep ---------------------------------------------------------------------------

/** Every set of cargo the hold takes: copy counts by id, at most `cargo.bays` bays. */
export function allLoadouts(): Record<string, number>[] {
  const ids = Object.keys(cargo.items);
  const sets: Record<string, number>[] = [];
  const walk = (i: number, bays: number, counts: Record<string, number>) => {
    if (i === ids.length) {
      sets.push({ ...counts });
      return;
    }
    const def = cargo.items[ids[i]];
    for (let n = 0; n <= def.maxCopies && bays + n * def.bays <= cargo.bays; n++) {
      if (n > 0) counts[ids[i]] = n;
      else delete counts[ids[i]];
      walk(i + 1, bays + n * def.bays, counts);
    }
    delete counts[ids[i]];
  };
  walk(0, 0, {});
  return sets;
}

/** A set as `--loadout` writes it: `fuel:2,oxygen,reactor` (`base`: nothing aboard). */
export function loadoutSpec(counts: Readonly<Record<string, number>>): string {
  const parts = Object.keys(cargo.items)
    .filter((id) => (counts[id] ?? 0) > 0)
    .map((id) => (counts[id] > 1 ? `${id}:${counts[id]}` : id));
  return parts.length > 0 ? parts.join(',') : 'base';
}

/** Tier rank on a body: -1 not reached, then `COLONY_TIERS` order (0 outpost .. 2 colony). */
export type TierRank = -1 | 0 | 1 | 2;

/** One set of the sweep. */
export interface SweepRow {
  spec: string;
  counts: Record<string, number>;
  bays: number;
  /** Without events, Go on at every gate. */
  outcome: FastOutcome;
  /** Last gate reached without events (-1: none). */
  range: number;
  /** Tier rank of a colony on each gate body, -1 where the set does not get to. */
  tiers: TierRank[];
  /**
   * With events (`SWEEP_SEEDS`): for each gate, the share of seeds that reach it alive with
   * the best fixed answers for that gate (`bestPolicy`), and those answers.
   */
  eventSurvival: number[];
  bestPolicy: (Record<string, string> | null)[];
  /** Share of the other sets this one is at least as good as on every metric (I4). */
  dominates: number;
  /** Number of sets at least as good on every metric and better on one (Pareto-dominated). */
  dominatedBy: number;
}

/** The whole sweep. */
export interface Sweep {
  flight: Flight;
  rows: SweepRow[];
  wallMs: number;
}

/**
 * Every combination of answers to the events `loadout` can meet (an event whose chance is 0
 * with this cargo is left out): what a player may decide before knowing the rolls.
 */
function answerPolicies(loadout: Loadout): Record<string, string>[] {
  const ctx = eventContext(loadout, [], () => Infinity, 'ok', 0);
  let policies: Record<string, string>[] = [{}];
  for (const [id, def] of Object.entries(voyageEvents)) {
    if (clampChance(def.chance({ ...ctx, leg: def.leg, comms: legs[def.leg].comms })) <= 0) {
      continue;
    }
    const enabled = enabledChoices(def, ctx);
    policies = policies.flatMap((p) => enabled.map((choice) => ({ ...p, [id]: choice.id })));
  }
  return policies;
}

/**
 * Runs the sweep along `flight`: every set without events (with the alarm), then with events.
 * Throws if the reference flight failed (`Flight.failure`: check it first).
 */
export function runSweep(flight: Flight): Sweep {
  if (flight.failure) throw new Error(`runSweep: ${flight.failure}`);
  const started = performance.now();
  const rows: SweepRow[] = [];
  for (const counts of allLoadouts()) {
    const loadout = loadoutOf(cargo, counts);
    const outcome = evaluateVoyage(flight, loadout, { events: {}, seed: 0, alarm: true });
    const range = outcome.gate;
    const tiers = gates.map((gate, i) =>
      i <= range ? (COLONY_TIERS.indexOf(colonyFit(gate.body, loadout, colony)) as TierRank) : -1,
    ) as TierRank[];
    // With events: for every answer policy, the deepest gate each seed reaches.
    const policies = answerPolicies(loadout);
    const reachedBy = policies.map((choices) =>
      SWEEP_SEEDS.map(
        (seed) => evaluateVoyage(flight, loadout, { events: voyageEvents, seed, choices }).gate,
      ),
    );
    const eventSurvival: number[] = [];
    const bestPolicy: (Record<string, string> | null)[] = [];
    for (let g = 0; g < gates.length; g++) {
      let best = -1;
      let bestP: Record<string, string> | null = null;
      reachedBy.forEach((reached, p) => {
        const share = reached.filter((gate) => gate >= g).length / reached.length;
        if (share > best) {
          best = share;
          bestP = policies[p];
        }
      });
      eventSurvival.push(best);
      bestPolicy.push(best > 0 ? bestP : null);
    }
    rows.push({
      spec: loadoutSpec(counts),
      counts,
      bays: Object.entries(counts).reduce((sum, [id, n]) => sum + cargo.items[id].bays * n, 0),
      outcome,
      range,
      tiers,
      eventSurvival,
      bestPolicy,
      dominates: 0,
      dominatedBy: 0,
    });
  }
  markDominance(rows);
  return { flight, rows, wallMs: performance.now() - started };
}

/** The metrics I4 compares: range, then the tier on every gate body. */
export function metrics(row: SweepRow): number[] {
  return [row.range, ...row.tiers];
}

/** Fills `dominates` and `dominatedBy` (I4: weak dominance over every metric). */
function markDominance(rows: SweepRow[]): void {
  const m = rows.map(metrics);
  for (let i = 0; i < rows.length; i++) {
    let weakly = 0;
    let by = 0;
    for (let j = 0; j < rows.length; j++) {
      if (i === j) continue;
      let geq = true;
      let leq = true;
      let less = false;
      for (let k = 0; k < m[i].length; k++) {
        if (m[i][k] < m[j][k]) {
          geq = false;
          less = true;
        }
        if (m[i][k] > m[j][k]) leq = false;
      }
      if (geq) weakly++;
      if (leq && less) by++;
    }
    rows[i].dominates = weakly / (rows.length - 1);
    rows[i].dominatedBy = by;
  }
}

/** The sweep as CSV: one line per set. */
export function sweepCsv(sweep: Sweep): string {
  const header = [
    'loadout',
    'bays',
    'range_gate',
    'range_body',
    'result',
    'death_cause',
    'death_day',
    'death_leg_to',
    'drift_day',
    'alarm_lead_real_s',
    ...gates.map((gate) => `tier_${gate.body}`),
    ...gates.map((gate) => `events_reach_${gate.body}`),
    'dominates_share',
    'dominated_by',
  ];
  const lines = [header.join(',')];
  const num = (x: number | null, digits = 2) => (x === null ? '' : x.toFixed(digits));
  for (const row of sweep.rows) {
    const o = row.outcome;
    lines.push(
      [
        `"${row.spec}"`,
        row.bays,
        row.range,
        row.range >= 0 ? gates[row.range].body : 'none',
        o.kind,
        o.cause ?? '',
        o.kind === 'died' ? num(o.day, 1) : '',
        o.kind === 'died' ? gates[o.leg].body : '',
        num(o.driftDay, 1),
        num(o.alarmLeadRealS),
        ...row.tiers.map((t) => (t < 0 ? '' : COLONY_TIERS[t])),
        ...row.eventSurvival.map((p) => num(p)),
        num(row.dominates, 4),
        row.dominatedBy,
      ].join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

/** The sweep's summary as text lines (`npm run voyage-check -- --all`). */
export function sweepSummary(sweep: Sweep): string[] {
  const rows = sweep.rows;
  const n = rows.length;
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const pad = (text: string | number, width: number) => String(text).padStart(width);
  const out = [
    `Sweep: ${n} loadouts (every hold of at most ${cargo.bays} bays, fuel up to 3 crates), ` +
      `${(sweep.wallMs / 1000).toFixed(1)} s; pre-flight ${(sweep.flight.wallMs / 1000).toFixed(1)} s, ` +
      `${sweep.flight.timeS.length} frames, ${SWEEP_SEEDS.length} seeds with events`,
    '',
    'How many loadouts reach each gate (no events, Go on at every gate):',
    `  ${pad('gate', 7)} ${pad('sets', 5)} ${pad('share', 6)} ${pad('no reactor', 10)}  ` +
      `best with events (share of seeds; loadout)`,
  ];
  gates.forEach((gate, g) => {
    const reach = rows.filter((r) => r.range >= g);
    const best = [...reach].sort((a, b) => b.eventSurvival[g] - a.eventSurvival[g])[0];
    out.push(
      `  ${pad(gate.body, 7)} ${pad(reach.length, 5)} ${pad(pct(reach.length / n), 6)} ` +
        `${pad(reach.filter((r) => !r.counts.reactor).length, 10)}  ` +
        (best ? `${pct(best.eventSurvival[g])}; ${best.spec}` : '-'),
    );
  });
  const causes = new Map<string, number>();
  for (const row of rows) {
    const key =
      row.outcome.kind === 'landed'
        ? `landed at ${gates[gates.length - 1].body}`
        : String(row.outcome.cause);
    causes.set(key, (causes.get(key) ?? 0) + 1);
  }
  out.push('', `How they end: ${[...causes].map(([c, k]) => `${c} ${k}`).join(', ')}`);
  out.push('', 'Colony tier per body (loadouts that get there: outpost / settlement / colony):');
  gates.forEach((gate, g) => {
    const counts = COLONY_TIERS.map((_, t) => rows.filter((r) => r.tiers[g] === t).length);
    out.push(`  ${pad(gate.body, 7)} ${counts.map((c) => pad(c, 5)).join(' /')}`);
  });
  const sorted = [...rows].sort((a, b) => b.dominates - a.dominates);
  const front = rows.filter((r) => r.dominatedBy === 0).length;
  out.push(
    '',
    `Dominance (range and the tier on every body): ${front} loadouts on the Pareto front; ` +
      `the closest to dominant is at least as good as ${pct(sorted[0].dominates)} of the others: ` +
      `${sorted[0].spec}`,
  );
  const leads = rows.filter(
    (r) => r.outcome.alarmLeadRealS !== null && r.outcome.cause !== 'drift',
  );
  const shortest = leads.sort(
    (a, b) => (a.outcome.alarmLeadRealS ?? 0) - (b.outcome.alarmLeadRealS ?? 0),
  )[0];
  if (shortest) {
    out.push(
      `Shortest alarm before a resource death: ${shortest.outcome.alarmLeadRealS?.toFixed(2)} ` +
        `real s (${shortest.spec}, ${shortest.outcome.cause}); before a drift: ` +
        `${DRIFT_DEATH_REAL_S} s by construction`,
    );
  }
  const last = rows.filter((r) => r.range === gates.length - 1);
  out.push(
    `Reach ${gates[gates.length - 1].body}: ${last.length}, e.g. ` +
      `${last
        .slice(0, 10)
        .map((r) => r.spec)
        .join('; ')}`,
  );
  return out;
}
