/**
 * `npm run balance`: the balance invariants I1-I8 (plan D30) over the loadout sweep
 * (`voyageSweep.ts`) and its cross-check against the game (`voyageCrossCheck.ts`). Prints one
 * line per invariant - "I3 failed: 80 loadouts reach mars (5.0 %, need 10.0 %..50.0 %)" with an example set -
 * and exits non-zero if any fails or the sweep does not match the game. Run it after changing
 * any balance number (cargo, legs, colony needs, events, time scale); it is not part of
 * `npm run check` (it takes about a minute). If an invariant fails, change the numbers, not the
 * invariant. docs/CONTRIBUTING.md.
 *
 * Must not import `@/config`, `@/core/services` or the event bus: they read `window` on load.
 */
import { cargo } from '@/content/voyage/cargo';
import { gates } from '@/content/voyage/gates';
import { COLONY_TIERS } from '@/core/voyage/colony';
import { ALARM_REAL_S } from '@/core/voyage/flows';
import { crossCheck, crossCheckText, type CrossCheck } from '@/devtools/voyageCrossCheck';
import { FRAME_S } from '@/devtools/voyageFlight';
import {
  loadoutSpec,
  metrics,
  preflight,
  runSweep,
  type Sweep,
  type SweepRow,
} from '@/devtools/voyageSweep';

/**
 * I3: the share of all sets that reach the last gate (Mars) lies between these: it takes the
 * right cargo, but more than one set gets there. OWNER: design
 */
export const I3_MIN_LAST_SHARE = 0.1;
export const I3_MAX_LAST_SHARE = 0.5;
/**
 * I8: with events (the sweep's 20 seeds), the best set for each gate reaches it at most this
 * much less often than without events (where it always does): luck tests, it does not decide.
 * OWNER: design
 */
export const I8_MAX_EVENT_DROP = 0.4;
/** I5: the share of the best sets by a metric a cargo kind must count in. OWNER: design */
export const I5_TOP_SHARE = 0.1;
/**
 * I6: the alarm is read once a frame, so a death 3 real seconds after the alarm may come one
 * frame short of it.
 */
const I6_TOLERANCE_S = FRAME_S;

/** One invariant's verdict. */
export interface InvariantResult {
  id: string;
  ok: boolean;
  /** The line to print: what was measured against what is needed, with an example set. */
  line: string;
}

const pct = (x: number) => `${(x * 100).toFixed(1)} %`;
const bodyOf = (gate: number) => (gate < 0 ? 'none' : gates[gate].body);

/** Checks I1-I8 on `sweep` (and I7 also on the cross-check's game voyages). */
export function checkInvariants(sweep: Sweep, cross: CrossCheck): InvariantResult[] {
  const rows = sweep.rows;
  const results: InvariantResult[] = [];
  const add = (id: string, ok: boolean, okLine: string, failLine: string) =>
    results.push({ id, ok, line: `${id} ${ok ? 'ok' : 'failed'}: ${ok ? okLine : failLine}` });

  // I1: the Moon with any set, the empty hold included.
  const noMoon = rows.filter((r) => r.range < 0);
  add(
    'I1',
    noMoon.length === 0,
    `all ${rows.length} loadouts reach the Moon, the empty hold included`,
    `${noMoon.length} loadouts do not reach the Moon (need all), e.g. ${noMoon[0]?.spec}`,
  );

  // I2: the base alone dies before the last gate.
  const lastGate = gates.length - 1;
  const lastBody = gates[lastGate].body;
  const base = rows.find((r) => r.spec === 'base') as SweepRow;
  add(
    'I2',
    base.outcome.kind === 'died' && base.range < lastGate,
    `the base alone dies of ${base.outcome.cause} on day ${base.outcome.day.toFixed(1)}, ` +
      `last gate ${bodyOf(base.range)}`,
    `the base alone reaches ${bodyOf(base.range)} (need to die before ${lastBody})`,
  );

  // I3: the last gate with a share of the sets between I3_MIN_LAST_SHARE and I3_MAX_LAST_SHARE.
  const last = rows.filter((r) => r.range === lastGate);
  const share = last.length / rows.length;
  add(
    'I3',
    share >= I3_MIN_LAST_SHARE && share <= I3_MAX_LAST_SHARE,
    `${last.length} loadouts reach ${lastBody} (${pct(share)}, need ` +
      `${pct(I3_MIN_LAST_SHARE)}..${pct(I3_MAX_LAST_SHARE)}), e.g. ${last[0]?.spec}`,
    `${last.length} loadouts reach ${lastBody} (${pct(share)}, need ` +
      `${pct(I3_MIN_LAST_SHARE)}..${pct(I3_MAX_LAST_SHARE)} of ${rows.length})` +
      (last[0] ? `, e.g. ${last[0].spec}` : ''),
  );

  // I4: no set at least as good as every other on range and the tier on every body.
  const top = [...rows].sort((a, b) => b.dominates - a.dominates)[0];
  const dominant = rows.filter((r) => r.dominates >= 1);
  add(
    'I4',
    dominant.length === 0,
    `no dominant loadout; the closest, ${top.spec}, is at least as good as ` +
      `${pct(top.dominates)} of the others (${describeMetrics(top)})`,
    `${dominant.length} dominant loadouts (need 0), e.g. ${dominant[0]?.spec} ` +
      `(${describeMetrics(dominant[0] ?? top)})`,
  );

  // I5: every kind of cargo counts in a top set by some metric (no dead cargo).
  const i5 = deadCargo(rows);
  const tops = i5.tops
    .map((t) => `${t.name} ${t.size}${t.size > 0 ? ` (above ${metricValue(t.name, t.cut)})` : ''}`)
    .join(', ');
  add(
    'I5',
    i5.dead.length === 0,
    `every kind counts in a top set (top: the sets strictly above a metric's cut, the cut ` +
      `the lowest value with <=${pct(I5_TOP_SHARE)} of the ${rows.length} sets above it; ` +
      `top sizes: ${tops}): ${i5.examples.join('; ')}`,
    `${i5.dead.length} kinds count in no top set by any metric (need 0): ` +
      `${i5.dead.join(', ')} (top sizes: ${tops})`,
  );

  // I6: every death without events comes at least ALARM_REAL_S real seconds after its alarm.
  const deaths = rows.filter((r) => r.outcome.kind === 'died');
  const worst = [...deaths].sort(
    (a, b) => (a.outcome.alarmLeadRealS ?? -1) - (b.outcome.alarmLeadRealS ?? -1),
  )[0];
  const lead = worst?.outcome.alarmLeadRealS ?? Infinity;
  const late = deaths.filter(
    (r) => (r.outcome.alarmLeadRealS ?? -1) < ALARM_REAL_S - I6_TOLERANCE_S,
  );
  add(
    'I6',
    late.length === 0,
    `every death of ${deaths.length} comes >=${ALARM_REAL_S} real s after its alarm; the ` +
      `shortest ${lead.toFixed(2)} s (${worst?.spec}, ${worst?.outcome.cause})`,
    `${late.length} deaths come less than ${ALARM_REAL_S} real s after the alarm (need 0), ` +
      `e.g. ${late[0]?.spec}: ${late[0]?.outcome.cause}, ` +
      `${late[0]?.outcome.alarmLeadRealS?.toFixed(2) ?? 'no alarm'} s`,
  );

  // I7: Go on with too few charges never reaches the next gate, and the gate card warns.
  let shortGates = 0;
  const reachedShort: string[] = [];
  for (const row of rows) {
    row.outcome.fuelShortAtGate.forEach((short, gate) => {
      if (!short) return;
      shortGates++;
      if (row.range > gate) reachedShort.push(`${row.spec} at ${gates[gate].body}`);
    });
  }
  const gameVoyages = cross.lines.filter((l) => l.seed !== null).length;
  const gameShort = cross.lines.flatMap((l) => l.fuelShortGates.map((g) => ({ ...g, l })));
  const gameBad = gameShort.filter((g) => g.reachedNext || !g.flagged);
  const forecastMismatch = cross.lines.filter((l) => /fuelShort/.test(l.diff));
  add(
    'I7',
    reachedShort.length === 0 && gameBad.length === 0 && forecastMismatch.length === 0,
    `the game's gate card was checked on the ${gameVoyages} cross-checked voyages with ` +
      `events: it said FUEL SHORT at ${gameShort.length} gates, exactly where the sweep did ` +
      `(and at no other gate), and Go on from them never reached the next gate. The sweep ` +
      `marks ${shortGates} gates fuel-short and passes none (by construction: its drift ` +
      `reads the same pre-flown burn)`,
    reachedShort.length > 0
      ? `${reachedShort.length} fuel-short gates passed (need 0), e.g. ${reachedShort[0]}`
      : gameBad.length > 0
        ? `in the game ${gameBad[0]?.l.spec} at ${gates[gameBad[0].gate].body}: ` +
          `${gameBad[0].reachedNext ? 'reached the next gate' : 'not flagged by the sweep'}`
        : `the gate card's fuelShort differs from the sweep: ${forecastMismatch[0]?.spec} ` +
          `(${forecastMismatch[0]?.diff})`,
  );

  // I8: with events the best set for each gate reaches it at most I8_MAX_EVENT_DROP less often.
  const i8: string[] = [];
  const i8bad: string[] = [];
  gates.forEach((gate, g) => {
    const candidates = rows.filter((r) => r.range >= g);
    if (candidates.length === 0) return;
    const best = [...candidates].sort((a, b) => b.eventSurvival[g] - a.eventSurvival[g])[0];
    const p = best.eventSurvival[g];
    const policy = Object.entries(best.bestPolicy[g] ?? {})
      .map(([id, choice]) => `${id}=${choice}`)
      .join(' ');
    const text = `${gate.body} ${pct(p)} (${best.spec}${policy ? `; ${policy}` : ''})`;
    i8.push(text);
    if (p < 1 - I8_MAX_EVENT_DROP) i8bad.push(text);
  });
  add(
    'I8',
    i8bad.length === 0,
    `with events the best loadout reaches each gate in >=${pct(1 - I8_MAX_EVENT_DROP)} of ` +
      `seeds: ${i8.join('; ')}`,
    `with events the best loadout reaches ${i8bad.join('; ')} (need >=${pct(1 - I8_MAX_EVENT_DROP)})`,
  );

  results.push({
    id: 'sweep',
    ok: cross.ok,
    line: sweepLine(cross),
  });
  return results;
}

/** The verdict on the cross-check: agreement and coverage. */
function sweepLine(cross: CrossCheck): string {
  const bad = cross.lines.filter((l) => !l.ok);
  const missing = cross.coverage.filter((c) => c.required && c.compared === 0);
  const covered = cross.coverage.filter((c) => c.compared > 0).length;
  if (bad.length === 0 && missing.length === 0) {
    return (
      `sweep ok: the fast evaluator agrees with the game on ${cross.lines.length} voyages, ` +
      `covering ${covered} of ${cross.coverage.length} event paths`
    );
  }
  if (bad.length > 0) {
    return (
      `sweep failed: the fast evaluator disagrees with the game (${bad.length} of ` +
      `${cross.lines.length} voyages), e.g. ${bad[0].spec} seed ${bad[0].seed}: ${bad[0].diff}`
    );
  }
  return `sweep failed: coverage: ${missing.map((c) => c.key).join(', ')} never compared`;
}

/** A value of I5's metric `name` as text: a gate body for the range, a tier for a body. */
function metricValue(name: string, value: number): string {
  if (name === 'range') return bodyOf(value);
  return value < 0 ? 'not reached' : COLONY_TIERS[value];
}

/** A set's metrics as text: the range and the tier on every body it gets to. */
function describeMetrics(row: SweepRow): string {
  const tiers = row.tiers
    .map((t, i) => (t < 0 ? null : `${gates[i].body} ${COLONY_TIERS[t]}`))
    .filter(Boolean);
  return `range ${bodyOf(row.range)}; ${tiers.join(', ')}`;
}

/** I5's top set of one metric: the sets strictly above its cut. */
interface TopSet {
  name: string;
  /** Sets with a value above this are the top (ties at the cut are out). */
  cut: number;
  size: number;
}

/**
 * I5's tie rule: the cut of a metric is the lowest value with at most `I5_TOP_SHARE` of all
 * sets strictly above it, and the top is the sets strictly above the cut. So the top is never
 * more than 10 % of the sets, whatever the ties; a metric where too many sets tie at the best
 * value has an empty top (70 % of the sets build a full colony on the Moon: no top by it).
 */
function topSets(rows: SweepRow[]): TopSet[] {
  const names = ['range', ...gates.map((g) => `${g.body} tier`)];
  const all = rows.map(metrics);
  const limit = I5_TOP_SHARE * rows.length;
  return names.map((name, k) => {
    const values = all.map((m) => m[k]);
    const distinct = [...new Set(values)].sort((a, b) => a - b);
    const above = (v: number) => values.filter((x) => x > v).length;
    const cut = distinct.find((v) => above(v) <= limit) ?? distinct[distinct.length - 1];
    return { name, cut, size: above(cut) };
  });
}

/**
 * I5: for every kind of cargo, a set in the top of some metric (range, the tier on a body;
 * `topSets`) that holds it and does worse on that metric without one copy of it - the kind
 * counts there, it does not just fill a bay. Returns the kinds with no such set, one example
 * per kind, and the top sets.
 */
function deadCargo(rows: SweepRow[]): { dead: string[]; examples: string[]; tops: TopSet[] } {
  const bySpec = new Map(rows.map((r) => [r.spec, r]));
  const tops = topSets(rows);
  const dead: string[] = [];
  const examples: string[] = [];
  for (const id of Object.keys(cargo.items)) {
    let example: string | null = null;
    for (let k = 0; k < tops.length && !example; k++) {
      for (const row of rows) {
        const n = row.counts[id] ?? 0;
        const value = metrics(row)[k];
        if (n === 0 || value <= tops[k].cut) continue;
        const without = bySpec.get(loadoutSpec({ ...row.counts, [id]: n - 1 }));
        if (without && metrics(without)[k] < value) {
          example = `${id} (${tops[k].name}: ${row.spec})`;
          break;
        }
      }
    }
    if (example) examples.push(example);
    else dead.push(id);
  }
  return { dead, examples, tops };
}

/** Runs the sweep, the cross-check and the invariants; prints them. Returns whether all hold. */
export function runBalance(write: (line?: string) => void): boolean {
  const flight = preflight();
  if (flight.failure) {
    write(`flight failed: ${flight.failure} - the sweep needs a reference flight to every gate`);
    write();
    write('BALANCE: 1 failed (flight) - change the numbers, not the invariants');
    return false;
  }
  const sweep = runSweep(flight);
  write(
    `Sweep: ${sweep.rows.length} loadouts, ${(sweep.wallMs / 1000).toFixed(1)} s ` +
      `(pre-flight ${(sweep.flight.wallMs / 1000).toFixed(1)} s)`,
  );
  const cross = crossCheck(sweep);
  const results = checkInvariants(sweep, cross);
  for (const result of results) write(result.line);
  if (!cross.ok) for (const line of crossCheckText(cross)) write(line);
  const failed = results.filter((r) => !r.ok);
  write();
  write(
    failed.length === 0
      ? 'BALANCE: all invariants hold'
      : `BALANCE: ${failed.length} failed (${failed.map((r) => r.id).join(', ')}) - change the ` +
          `numbers, not the invariants (docs/CONTRIBUTING.md)`,
  );
  return failed.length === 0;
}

if (process.argv[1]?.endsWith('balance.ts')) {
  const ok = runBalance((line = '') => process.stdout.write(`${line}\n`));
  process.exitCode = ok ? 0 : 1;
}
