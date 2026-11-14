/**
 * The sweep's evaluator (plan variable-mass S6, E3): what the game's `Voyage` does with one
 * loadout, seed and answers, without flying the whole voyage again for every seed. The flight
 * depends on the cargo - the ship's mass at the start and as it falls with the stocks and the
 * burn sets the acceleration, the delta-v and the transfer the autopilot picks (D20) - so every
 * loadout flies its own voyage with the game's `Simulation`, frame by frame as the game does.
 *
 * A flight is a forecast copy (`Simulation.forecastCopy`: nobody aboard dies) and records, in
 * order, what the game would act on (`Entry`): the first resource death, the drift and its
 * death `DRIFT_DEATH_REAL_S` of Run later, the gates (stocks, fuel, delta-v, and whether the
 * flight from there drifts on the next leg - the gate card's `fuelShort`), and the points where
 * events are due (`stop`, the state saved). One flight without events serves the sweep's voyage
 * without events (with the alarm of the death, `flyVoyage`'s); one with the events' stops serves
 * every seed and answer (`Voyage` stops the integrator exactly where an event is due, so its
 * frames differ from the flight without events). An event that happens changes the stocks,
 * hence the mass and the flight: its answer is applied to the saved state with the game's own
 * `Simulation.applyEvent` and the voyage flies on from there - a branch, flown once per loadout
 * and answer path (`Node.children`) and shared by every seed that takes it.
 *
 * `voyageCrossCheck.ts` checks it against the real `Voyage`.
 *
 * Must not import `@/config`, `@/core/services` or the event bus: they read `window` on load.
 */
import { ship } from '@/content/simulation/ship';
import { solarSystem } from '@/content/simulation/solar-system';
import { cargo } from '@/content/voyage/cargo';
import { gates } from '@/content/voyage/gates';
import { legs } from '@/content/voyage/legs';
import { DAY_S } from '@/core/simulation/constants';
import { Simulation } from '@/core/simulation/Simulation';
import { SolarSystem } from '@/core/simulation/SolarSystem';
import type { SimulationSnapshot } from '@/core/simulation/types';
import { DRIFT_DEATH_REAL_S, FLOW_IDS, resourceDeath } from '@/core/voyage/flows';
import type { DeathCause, Loadout, StockId } from '@/core/voyage/types';
import {
  enabledChoices,
  eventContext,
  rollEvent,
  rollRisk,
  type VoyageEventCatalog,
  type VoyageEventDef,
} from '@/core/voyage/voyageEvents';
import { FRAME_S } from '@/devtools/voyageFlight';

/** The route the game flies (src/content/voyage). */
export const route = { ship, gates, legs, cargo };
/** The solar system of the game, built once. */
export const system = new SolarSystem(solarSystem);

/**
 * A leg not over (arrived or adrift) after this much simulated time is given up: the autopilot
 * failed with these numbers (the outcome `gave up`; `npm run balance` fails on it), s.
 */
const LEG_LIMIT_S = 1000 * DAY_S;

const STOCK_IDS: readonly StockId[] = ['fuel', 'oxygen', 'water', 'food', 'power', 'heat'];

/** How an evaluated voyage ended. */
export interface FastOutcome {
  /**
   * `landed` at the last gate (or at `stopAt`), `died`, or `gave up` (a leg neither arrived nor
   * drifted within 1000 days: the autopilot failed).
   */
  kind: 'landed' | 'died' | 'gave up';
  /** Last gate reached alive, -1 before the Moon. */
  gate: number;
  cause: DeathCause | null;
  /** Simulated day of the end (death or landing). */
  day: number;
  /** Leg the death came on (the gate it was flying to). */
  leg: number;
  /** Simulated day the ship began to drift, or null. */
  driftDay: number | null;
  /**
   * At each gate reached: the fuel aboard (kg), the delta-v it gives at the ship's mass then
   * (m/s), and whether the flight on from there drifts on the next leg - the gate card's
   * `fuelShort` (plan I7; false at the last gate).
   */
  fuelAtGate: number[];
  dvAtGate: number[];
  fuelShortAtGate: boolean[];
  /** Resources at each gate reached (days; fuel in kg) for the cross-check. */
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
  /** An event's effect took fuel (a leak) and the ship went adrift after it. */
  leakDrift: boolean;
}

/** What `LoadoutFlights.evaluate` flies. */
export interface FastPolicy {
  /** Events on the way (none: an empty registry). */
  events: VoyageEventCatalog;
  seed: number;
  /** Answer by event id (an answer missing or disabled: the first enabled choice). */
  choices?: Readonly<Record<string, string>>;
  /** Stop at this gate (default: Go on to the last). */
  stopAt?: number;
}

/** An event of the leg flown, not rolled yet, and the simulated time it is due (`Voyage`). */
interface PendingEvent {
  id: string;
  def: VoyageEventDef;
  dueS: number;
}

/** A gate reached: what the voyage reads there. */
interface GateEntry {
  kind: 'gate';
  gate: number;
  timeS: number;
  stocks: Record<StockId, number>;
  dvMS: number;
  /** The flight on from here (no events) drifts before the next gate: the card's `fuelShort`. */
  nextLegDrifts: boolean;
}

/** What a flight saw, in the order the game acts on it (death, events due, gate: `Voyage`). */
type Entry =
  | GateEntry
  | {
      kind: 'stop';
      timeS: number;
      leg: number;
      /** Events due now, rolled together (`Voyage.afterStep`). */
      due: PendingEvent[];
      /** The events of the leg still to come after these. */
      rest: PendingEvent[];
      /** The state after the substep that reached them. */
      snapshot: SimulationSnapshot;
      /**
       * The gate docked on the same substep, or null: `Voyage` counts it reached before the
       * cards open, so a death in their answers ends at that gate.
       */
      docked: number | null;
    }
  | {
      kind: 'death';
      cause: DeathCause;
      timeS: number;
      leg: number;
      /** Real seconds from the cause's alarm to the death (a flight with the alarm only). */
      alarmLeadRealS: number | null;
    }
  | { kind: 'drift'; timeS: number; leg: number }
  | { kind: 'gave up'; timeS: number; leg: number };

/** One flight: from a state on to the end of the voyage for every path that does not branch. */
interface Node {
  entries: Entry[];
  /** An answer path taken at a stop (`stop index|id=choice!;...`): what it did, and the flight. */
  children: Map<string, Applied>;
}

/** An answer applied to the state of a stop (and to the answers before it at that stop). */
interface Applied {
  snapshot: SimulationSnapshot;
  /** Death of the crew while it was applied (`Simulation.applyEvent`), or null. */
  cause: DeathCause | null;
  emptied: StockId[];
  fuelLostKg: number;
  drifting: boolean;
  /** The flight on from it (made when the stop's last answer is applied). */
  node: Node | null;
}

/** Wall-clock milliseconds and flights of one loadout's evaluation (the sweep's timing). */
export interface FlightStats {
  /** Flights from the voyage's start (without events, with the events' stops). */
  rootMs: number;
  /** Flights on from an event's answer, and their number. */
  branchMs: number;
  branches: number;
}

/**
 * Every flight one loadout needs (see the file's comment): built lazily, kept while the object
 * lives (the sweep drops it after the loadout's row; the cross-check keeps a few).
 */
export class LoadoutFlights {
  readonly stats: FlightStats = { rootMs: 0, branchMs: 0, branches: 0 };
  private plain: Node | null = null;
  private readonly withEvents = new Map<VoyageEventCatalog, Node>();

  constructor(readonly loadout: Loadout) {}

  /** What the game's `Voyage` does with this loadout and `policy` (the file's comment). */
  evaluate(policy: FastPolicy): FastOutcome {
    const noEvents = Object.keys(policy.events).length === 0;
    let node = noEvents ? this.plainRoot() : this.eventRoot(policy.events);
    const out: FastOutcome = {
      kind: 'died',
      gate: -1,
      cause: null,
      day: 0,
      leg: 0,
      driftDay: null,
      fuelAtGate: [],
      dvAtGate: [],
      fuelShortAtGate: [],
      stocksAtGate: [],
      alarmLeadRealS: null,
      events: [],
      diedInEvent: false,
      leakDrift: false,
    };
    let leaked = false;
    const died = (cause: DeathCause, timeS: number, leg: number): FastOutcome => {
      out.kind = 'died';
      out.cause = cause;
      out.day = timeS / DAY_S;
      out.leg = leg;
      out.leakDrift = leaked && cause === 'drift';
      return out;
    };
    for (let i = 0; ; i++) {
      const entry = node.entries[i];
      if (!entry) throw new Error('LoadoutFlights: a flight ended without an end');
      switch (entry.kind) {
        case 'gate': {
          out.gate = entry.gate;
          out.fuelAtGate.push(entry.stocks.fuel);
          out.dvAtGate.push(entry.dvMS);
          out.fuelShortAtGate.push(entry.nextLegDrifts);
          out.stocksAtGate.push({ ...entry.stocks });
          if (entry.gate === gates.length - 1 || entry.gate === policy.stopAt) {
            out.kind = 'landed';
            out.day = entry.timeS / DAY_S;
            out.leg = entry.gate;
            return out;
          }
          break;
        }
        case 'death':
          out.alarmLeadRealS = entry.alarmLeadRealS;
          return died(entry.cause, entry.timeS, entry.leg);
        case 'drift':
          out.driftDay = entry.timeS / DAY_S;
          break;
        case 'gave up':
          out.kind = 'gave up';
          out.day = entry.timeS / DAY_S;
          out.leg = entry.leg;
          return out;
        case 'stop': {
          const answered = this.answer(node, i, entry, policy);
          if (!answered) break;
          for (const event of answered.events) out.events.push(event);
          leaked ||= answered.leaked;
          if (answered.cause) {
            out.diedInEvent = true;
            if (entry.docked !== null) out.gate = entry.docked;
            return died(answered.cause, entry.timeS, entry.leg);
          }
          node = answered.node;
          i = -1;
          break;
        }
      }
    }
  }

  /** The voyage without events, with the alarm (as `flyVoyage` flies it). */
  private plainRoot(): Node {
    this.plain ??= this.timed('root', () =>
      fly(new Simulation(system, route, this.loadout).forecastCopy(), null, null, true),
    );
    return this.plain;
  }

  /** The voyage with `events`' stops (as `Voyage` flies it), none of them answered yet. */
  private eventRoot(events: VoyageEventCatalog): Node {
    let node = this.withEvents.get(events);
    if (!node) {
      node = this.timed('root', () =>
        fly(new Simulation(system, route, this.loadout).forecastCopy(), events, null, false),
      );
      this.withEvents.set(events, node);
    }
    return node;
  }

  private timed(kind: 'root' | 'branch', make: () => Node): Node {
    const started = performance.now();
    const node = make();
    const ms = performance.now() - started;
    if (kind === 'root') this.stats.rootMs += ms;
    else {
      this.stats.branchMs += ms;
      this.stats.branches += 1;
    }
    return node;
  }

  /**
   * The events due at stop `entry` (entry `index` of `node`): rolled with the seed, answered by
   * `policy` (the choice asked for when enabled, else the first enabled one, as
   * `runSeededVoyage`), each answer applied with the game's `Simulation.applyEvent` to the state
   * after the ones before it (`Voyage.choose`). Null when none happens; else the answers, the
   * death they brought, or the flight on from them.
   */
  private answer(
    node: Node,
    index: number,
    entry: Extract<Entry, { kind: 'stop' }>,
    policy: FastPolicy,
  ):
    | ({ events: FastOutcome['events']; leaked: boolean } & (
        { cause: DeathCause; node?: undefined } | { cause?: undefined; node: Node }
      ))
    | null {
    const ctxOf = (snapshot: SimulationSnapshot) =>
      eventContext(
        this.loadout,
        snapshot.life.offline,
        (id: StockId) => snapshot.resources[id].value,
        legs[entry.leg].comms,
        entry.leg,
      );
    const rolled = ctxOf(entry.snapshot);
    const happened = entry.due.filter(
      (event) => rollEvent(event.def, event.id, policy.seed, rolled).happened,
    );
    if (happened.length === 0) return null;
    const events: FastOutcome['events'] = [];
    let leaked = false;
    let key = `${index}|`;
    let state = null as Applied | null;
    for (const event of happened) {
      const snapshot: SimulationSnapshot = state?.snapshot ?? entry.snapshot;
      const ctx = ctxOf(snapshot);
      const enabled = enabledChoices(event.def, ctx);
      const wanted = event.def.choices.find((choice) => choice.id === policy.choices?.[event.id]);
      const choice = wanted && enabled.includes(wanted) ? wanted : enabled[0];
      const { hit } = rollRisk(choice, event.id, policy.seed, ctx);
      key += `${event.id}=${choice.id}${hit ? '!' : ''};`;
      let applied = node.children.get(key);
      if (!applied) {
        const simulation: Simulation = new Simulation(system, route, snapshot);
        simulation.applyEvent(event.id, choice.effect);
        if (hit) simulation.applyEvent(event.id, choice.onHit);
        const after: SimulationSnapshot = simulation.snapshot();
        applied = {
          snapshot: after,
          cause: simulation.lifeState.cause,
          emptied: STOCK_IDS.filter(
            (id) => snapshot.resources[id].value > 0 && after.resources[id].value <= 0,
          ),
          fuelLostKg: snapshot.resources.fuel.value - after.resources.fuel.value,
          drifting: after.autopilot.phase === 'drifting',
          node: null,
        };
        node.children.set(key, applied);
      }
      state = applied;
      events.push({
        id: event.id,
        choice: choice.id,
        hit,
        day: entry.timeS / DAY_S,
        emptied: applied.emptied,
      });
      leaked ||= applied.fuelLostKg > 0;
      if (applied.cause) return { events, leaked, cause: applied.cause };
      // An answer that left the ship adrift drops the cards still queued (`Voyage.afterEvents`).
      if (applied.drifting) break;
    }
    const last = state as Applied;
    last.node ??= this.timed('branch', () =>
      fly(
        new Simulation(system, route, last.snapshot).forecastCopy(),
        policy.events,
        last.drifting ? [] : entry.rest,
        false,
      ),
    );
    return { events, leaked, node: last.node };
  }
}

/** `flightsOf`'s flights by loadout. */
const flightsByLoadout = new Map<string, LoadoutFlights>();

/**
 * The flights of `loadout`, kept for the next call (the cross-check evaluates a set many times;
 * the sweep makes its own and drops them).
 */
export function flightsOf(loadout: Loadout): LoadoutFlights {
  const key = Object.entries(loadout.counts)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([id, n]) => `${id}:${n}`)
    .join(',');
  let flights = flightsByLoadout.get(key);
  if (!flights) {
    flights = new LoadoutFlights(loadout);
    flightsByLoadout.set(key, flights);
  }
  return flights;
}

/** The events of the leg `simulation` begins now, by the time they are due (`Voyage.beginLeg`). */
function legPending(simulation: Simulation, events: VoyageEventCatalog): PendingEvent[] {
  const pilot = simulation.autopilot;
  const planS = Math.max(0, pilot.arrivalS - pilot.legStartS);
  return Object.entries(events)
    .filter(([, def]) => def.leg === pilot.legIndex)
    .map(([id, def]) => ({ id, def, dueS: pilot.legStartS + def.at * planS }))
    .sort((a, b) => a.dueS - b.dueS);
}

/** The stocks now (days; fuel in kg). */
function stocksOf(snapshot: SimulationSnapshot): Record<StockId, number> {
  return Object.fromEntries(STOCK_IDS.map((id) => [id, snapshot.resources[id].value])) as Record<
    StockId,
    number
  >;
}

/**
 * The first death the forecast copy `simulation`'s stocks brought (`depletions`: the time each
 * stock first ran out), as the game's `resourceDeath` would name it on that substep, or null.
 */
function stockDeath(simulation: Simulation): { cause: DeathCause; timeS: number } | null {
  const depletions = simulation.depletions;
  const times = FLOW_IDS.map((id) => depletions[id]?.timeS ?? Infinity)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const resources = simulation.snapshot().resources;
  for (const timeS of times) {
    for (const id of FLOW_IDS) {
      const at = depletions[id]?.timeS ?? Infinity;
      resources[id].value = at <= timeS ? 0 : 1;
    }
    const cause = resourceDeath(resources);
    if (cause) return { cause, timeS };
  }
  return null;
}

/**
 * Flies the forecast copy `simulation` frame by frame (`FRAME_S`, Go on at every gate) and
 * records what the voyage acts on (`Entry`). `events`: stop where they are due on every leg it
 * begins (`Voyage.advance`); `pending`: the events still due on the leg it is on (a branch);
 * `alarm`: read the alarm before every frame (`flyVoyage`) for the death's lead. Flies on after
 * a death only to the end of that leg (the gate card at the gate before it reads that).
 */
function fly(
  simulation: Simulation,
  events: VoyageEventCatalog | null,
  pending: PendingEvent[] | null,
  alarm: boolean,
): Node {
  const entries: Entry[] = [];
  let due = pending ?? (events ? legPending(simulation, events) : []);
  const alarmOn = new Map<DeathCause, number>();
  let realS = 0;
  let driftRealS = 0;
  let drifting = simulation.autopilot.phase === 'drifting';
  let dead = false;
  let depletionsSeen = 0;
  /** The last gate reached: its next leg is being flown (`nextLegDrifts`). */
  let open = null as GateEntry | null;
  /** Gate `gate` reached: its entry; Go on. False at the last gate (the flight ends). */
  const arrive = (gate: number): boolean => {
    open = {
      kind: 'gate',
      gate,
      timeS: simulation.time,
      stocks: stocksOf(simulation.snapshot()),
      dvMS: simulation.dvAvailable,
      nextLegDrifts: false,
    };
    entries.push(open);
    if (!simulation.departToNextGate()) return false;
    due = events ? legPending(simulation, events) : [];
    return true;
  };
  if (drifting) {
    entries.push({ kind: 'drift', timeS: simulation.time, leg: simulation.autopilot.legIndex });
  }
  // A branch from an answer given at a gate (its event fell due on the substep that docked):
  // the gate's decision comes after the events (`Voyage.afterEvents`).
  const phase = simulation.autopilot.phase;
  if ((phase === 'arrived' || phase === 'finished') && !arrive(simulation.autopilot.legIndex)) {
    return { entries, children: new Map() };
  }
  for (;;) {
    if (alarm && !dead) {
      for (const forecast of simulation.forecastLife()) {
        if (!forecast.alarm) alarmOn.delete(forecast.cause);
        else if (!alarmOn.has(forecast.cause)) alarmOn.set(forecast.cause, realS);
      }
    }
    simulation.advance(FRAME_S, dead || drifting ? undefined : due[0]?.dueS);
    realS += FRAME_S;
    const leg = simulation.autopilot.legIndex;
    // Death first (`Voyage.afterStep`): the first stock at 0 that kills.
    const depletions = Object.keys(simulation.depletions).length;
    if (!dead && depletions > depletionsSeen) {
      depletionsSeen = depletions;
      const death = stockDeath(simulation);
      if (death) {
        dead = true;
        const onset = alarmOn.get(death.cause);
        entries.push({
          kind: 'death',
          cause: death.cause,
          timeS: death.timeS,
          leg,
          alarmLeadRealS: alarm && onset !== undefined ? realS - onset : null,
        });
      }
    }
    const arrivals = simulation.takeArrivals();
    if (simulation.autopilot.phase === 'drifting') {
      if (!drifting) {
        drifting = true;
        due = [];
        if (open) open.nextLegDrifts = true;
        if (!dead) entries.push({ kind: 'drift', timeS: simulation.time, leg });
      }
      // The drift clock counts every frame from the one the fuel ran out in (`advance`).
      driftRealS += FRAME_S;
      if (!dead && driftRealS >= DRIFT_DEATH_REAL_S) {
        dead = true;
        const onset = alarmOn.get('drift');
        entries.push({
          kind: 'death',
          cause: 'drift',
          timeS: simulation.time,
          leg,
          alarmLeadRealS: alarm && onset !== undefined ? realS - onset : null,
        });
      }
      if (dead) break;
    }
    if (dead && open === null) break;
    if (!dead && due.length > 0 && simulation.time >= due[0].dueS) {
      let n = 0;
      while (n < due.length && simulation.time >= due[n].dueS) n++;
      entries.push({
        kind: 'stop',
        timeS: simulation.time,
        leg,
        due: due.slice(0, n),
        rest: due.slice(n),
        snapshot: simulation.snapshot(),
        docked: arrivals.length > 0 ? arrivals[arrivals.length - 1] : null,
      });
      due = due.slice(n);
    }
    if (arrivals.length > 0) {
      if (dead || !arrive(arrivals[arrivals.length - 1])) break;
      continue;
    }
    if (simulation.time - simulation.autopilot.legStartS > LEG_LIMIT_S) {
      if (!dead) entries.push({ kind: 'gave up', timeS: simulation.time, leg });
      break;
    }
  }
  return { entries, children: new Map() };
}
