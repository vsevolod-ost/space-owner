/**
 * The loadout sweep (plan S12, D30; plan variable-mass S6): every set of cargo the hold can
 * take, each flown on its own voyage - the ship's mass, its fuel and the transfer it affords
 * differ from set to set (plan variable-mass D20) - without events and with the sweep's seeds
 * and every fixed set of answers (`LoadoutFlights` in `voyageEvaluator.ts`: one flight per
 * loadout and answer path, shared by the seeds). The sets are spread over worker threads
 * (`voyageSweepWorker.ts`); `npm run balance` checks the invariants I1-I8 on the result and
 * `voyageCrossCheck.ts` checks the evaluator against the real `Voyage`.
 *
 * Cost: about 10.5 CPU-minutes (plan variable-mass S6); `npm run balance` fits in 5 min wall
 * (plan D9) only from about 3 cores, a single core takes about 12 min.
 *
 * Must not import `@/config`, `@/core/services` or the event bus: they read `window` on load.
 */
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';

import { ship } from '@/content/simulation/ship';
import { cargo } from '@/content/voyage/cargo';
import { colony } from '@/content/voyage/colony';
import { voyageEvents } from '@/content/voyage/events';
import { gates } from '@/content/voyage/gates';
import { legs } from '@/content/voyage/legs';
import { deltaVMS } from '@/core/simulation/rocket';
import { COLONY_TIERS, colonyFit } from '@/core/voyage/colony';
import { DRIFT_DEATH_REAL_S } from '@/core/voyage/flows';
import { loadoutOf, startResources } from '@/core/voyage/loadout';
import { startMassKg } from '@/core/voyage/mass';
import type { Loadout } from '@/core/voyage/types';
import { clampChance, enabledChoices, eventContext } from '@/core/voyage/voyageEvents';
import { type FastOutcome, type FlightStats, LoadoutFlights } from '@/devtools/voyageEvaluator';

/** Seeds of the sweep's Monte Carlo with events (plan S12: 20; I8 reads them). OWNER: design */
export const SWEEP_SEEDS: readonly number[] = Array.from({ length: 20 }, (_, i) => i + 1);
/** Loadouts a worker thread is handed at a time (small: the slow ones do not pile up). */
const CHUNK = 4;

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
  /** The ship's mass at the start, kg, and the delta-v its fuel gives it then, m/s. */
  startKg: number;
  startDvMS: number;
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
  /** What its flights cost (`FlightStats`). */
  flights: FlightStats;
  /**
   * The cross-check's search over this set (`searchHits` in `voyageCrossCheck.ts`), when the
   * sweep ran on worker threads.
   */
  searchHits?: Record<string, (number | null)[]>;
}

/** The whole sweep. */
export interface Sweep {
  rows: SweepRow[];
  /** Wall-clock milliseconds of the sweep, and the worker threads it ran on (0: this one). */
  wallMs: number;
  workers: number;
  /** Its flights summed over the sets (CPU time, every thread). */
  flights: FlightStats;
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
 * One set's row (without the dominance, which compares it with the others): its voyage without
 * events (with the alarm), then with events for every seed and answer policy, on `flights`.
 */
export function sweepRow(
  counts: Record<string, number>,
  flights = new LoadoutFlights(loadoutOf(cargo, counts)),
): SweepRow {
  const loadout = flights.loadout;
  const outcome = flights.evaluate({ events: {}, seed: 0 });
  const range = outcome.gate;
  const tiers = gates.map((gate, i) =>
    i <= range ? (COLONY_TIERS.indexOf(colonyFit(gate.body, loadout, colony)) as TierRank) : -1,
  ) as TierRank[];
  // With events: for every answer policy, the deepest gate each seed reaches.
  const policies = answerPolicies(loadout);
  const reachedBy = policies.map((choices) =>
    SWEEP_SEEDS.map((seed) => flights.evaluate({ events: voyageEvents, seed, choices }).gate),
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
  const startKg = startMassKg(cargo, loadout);
  return {
    spec: loadoutSpec(counts),
    counts,
    bays: Object.entries(counts).reduce((sum, [id, n]) => sum + cargo.items[id].bays * n, 0),
    startKg,
    startDvMS: deltaVMS(ship.ispS, startKg, startResources(loadout).fuel.value),
    outcome,
    range,
    tiers,
    eventSurvival,
    bestPolicy,
    dominates: 0,
    dominatedBy: 0,
    flights: flights.stats,
  };
}

/**
 * Runs the sweep: every set's row (`sweepRow`) on `workers` worker threads (default: one per
 * CPU; 0: on this thread), then the dominance over all of them.
 */
export async function runSweep(workers = availableParallelism()): Promise<Sweep> {
  const started = performance.now();
  const sets = allLoadouts();
  const rows: SweepRow[] = new Array(sets.length);
  const threads = Math.max(0, Math.min(workers, Math.ceil(sets.length / CHUNK)));
  if (threads === 0) sets.forEach((counts, i) => (rows[i] = sweepRow(counts)));
  else await rowsOnWorkers(sets.length, threads, rows);
  markDominance(rows);
  const flights: FlightStats = { rootMs: 0, branchMs: 0, branches: 0 };
  for (const row of rows) {
    flights.rootMs += row.flights.rootMs;
    flights.branchMs += row.flights.branchMs;
    flights.branches += row.flights.branches;
  }
  return { rows, wallMs: performance.now() - started, workers: threads, flights };
}

/**
 * Fills `rows` (every set of `allLoadouts`, by index) on `threads` worker threads
 * (`voyageSweepWorker.ts`), handing each `CHUNK` sets at a time.
 */
function rowsOnWorkers(count: number, threads: number, rows: SweepRow[]): Promise<void> {
  return new Promise((resolve, reject) => {
    let next = 0;
    let done = 0;
    const pool: Worker[] = [];
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      for (const worker of pool) void worker.terminate();
      if (error) reject(error instanceof Error ? error : new Error(String(error)));
      else resolve();
    };
    const hand = (worker: Worker) => {
      if (next >= count) return;
      const indices = Array.from({ length: Math.min(CHUNK, count - next) }, (_, k) => next + k);
      next += indices.length;
      worker.postMessage(indices);
    };
    for (let t = 0; t < threads; t++) {
      const worker = new Worker(new URL('./voyageSweepWorker.ts', import.meta.url));
      pool.push(worker);
      worker.on('message', (reply: { indices: number[]; rows: SweepRow[] }) => {
        reply.indices.forEach((index, k) => (rows[index] = reply.rows[k]));
        done += reply.indices.length;
        if (done === count) finish();
        else hand(worker);
      });
      worker.on('error', finish);
      worker.on('messageerror', finish);
      // A worker gone before the sweep is done (crash, exit, out of memory) fails it, not hangs.
      worker.on('exit', (code) =>
        finish(new Error(`sweep worker exited with code ${code} before the sweep was done`)),
      );
      hand(worker);
    }
  });
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
    'start_mass_t',
    'start_dv_km_s',
    'range_gate',
    'range_body',
    'result',
    'death_cause',
    'death_day',
    'death_leg_to',
    'drift_day',
    'alarm_lead_real_s',
    'end_day',
    ...gates.map((gate) => `fuel_t_${gate.body}`),
    ...gates.map((gate) => `fuel_short_${gate.body}`),
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
        num(row.startKg / 1000, 1),
        num(row.startDvMS / 1000),
        row.range,
        row.range >= 0 ? gates[row.range].body : 'none',
        o.kind,
        o.cause ?? '',
        o.kind === 'died' ? num(o.day, 1) : '',
        o.kind === 'died' ? gates[o.leg].body : '',
        num(o.driftDay, 1),
        num(o.alarmLeadRealS),
        num(o.day, 1),
        ...gates.map((_, g) => num(o.fuelAtGate[g] === undefined ? null : o.fuelAtGate[g] / 1000)),
        ...gates.map((_, g) =>
          o.fuelShortAtGate[g] === undefined ? '' : String(o.fuelShortAtGate[g]),
        ),
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
      `each on its own flight, ${SWEEP_SEEDS.length} seeds with events: ${sweepTiming(sweep)}`,
    ...massLines(rows),
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
      row.outcome.kind === 'died'
        ? String(row.outcome.cause)
        : row.outcome.kind === 'landed'
          ? `landed at ${gates[gates.length - 1].body}`
          : 'gave up (the flight neither arrived nor drifted)';
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
  const shortestLead = (drift: boolean) =>
    rows
      .filter((r) => r.outcome.alarmLeadRealS !== null && (r.outcome.cause === 'drift') === drift)
      .sort((a, b) => (a.outcome.alarmLeadRealS ?? 0) - (b.outcome.alarmLeadRealS ?? 0))[0];
  const leadText = (row: SweepRow | undefined) =>
    row
      ? `${row.outcome.alarmLeadRealS?.toFixed(2)} real s (${row.spec}, ${row.outcome.cause})`
      : 'none';
  out.push(
    `Shortest alarm before a resource death: ${leadText(shortestLead(false))}; before a drift ` +
      `(${DRIFT_DEATH_REAL_S} s of Run): ${leadText(shortestLead(true))}`,
  );
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

/** The sweep's time: wall clock, threads, and the CPU time of its flights. */
export function sweepTiming(sweep: Sweep): string {
  const f = sweep.flights;
  return (
    `${(sweep.wallMs / 1000).toFixed(1)} s on ${sweep.workers || 'no'} worker threads ` +
    `(flights from the start ${(f.rootMs / 1000).toFixed(0)} s CPU, ${f.branches} flights on ` +
    `from an answer ${(f.branchMs / 1000).toFixed(0)} s CPU)`
  );
}

/**
 * The ship's mass across the sets (plan variable-mass D20: heavier is slower, more fuel is
 * faster): the lightest, the median and the heaviest at the start, with their delta-v and the
 * day they land at the last gate (without events), and the range of landing days.
 */
function massLines(rows: SweepRow[]): string[] {
  const byMass = [...rows].sort((a, b) => a.startKg - b.startKg);
  const describe = (row: SweepRow) =>
    `${row.spec} ${(row.startKg / 1000).toFixed(1)} t, ${(row.startDvMS / 1000).toFixed(1)} km/s, ` +
    (row.outcome.kind === 'landed'
      ? `lands day ${row.outcome.day.toFixed(0)}`
      : row.outcome.kind === 'died'
        ? `dies day ${row.outcome.day.toFixed(0)} (${row.outcome.cause})`
        : 'gave up');
  const landed = rows.filter((r) => r.outcome.kind === 'landed').map((r) => r.outcome.day);
  return [
    `Start mass: lightest ${describe(byMass[0])}; median ` +
      `${describe(byMass[Math.floor(byMass.length / 2)])}; heaviest ${describe(byMass[byMass.length - 1])}`,
    landed.length > 0
      ? `Landing at ${gates[gates.length - 1].body} (no events): day ` +
        `${Math.min(...landed).toFixed(0)}..${Math.max(...landed).toFixed(0)}`
      : `Landing at ${gates[gates.length - 1].body}: none`,
  ];
}
