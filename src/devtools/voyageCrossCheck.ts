/**
 * The sweep's cross-check (plan S12): the evaluator (`LoadoutFlights` in `voyageEvaluator.ts`)
 * against the game's own `Voyage` flown frame by frame (`runSeededVoyage`, `flyVoyage`). The
 * sweep is only worth something if they agree: the same outcome, last gate and cause, the day
 * within `DAY_TOLERANCE`, every stock at every gate within `STOCK_TOLERANCE` (the fuel within
 * `FUEL_TOLERANCE_KG`), the same events and answers, the same fuel shortages at the
 * gates (the gate card's `fuelShort`, plan I7), and the alarm lead within `LEAD_TOLERANCE_S`. Compared: a sample of sets (every range and death
 * cause of the sweep) without events and with two seeds, then, coverage-driven, a voyage for
 * every (event, choice, hit or not) the registry can produce and for the special paths of
 * `applyEventEffect` (drift after a leak, a death during an event, power emptied by an event),
 * its set, seed and answers picked with `rollFor`. A required combination no game voyage
 * showed fails the check.
 *
 * Must not import `@/config`, `@/core/services` or the event bus: they read `window` on load.
 */
import { cargo } from '@/content/voyage/cargo';
import { voyageEvents } from '@/content/voyage/events';
import { gates } from '@/content/voyage/gates';
import { legs } from '@/content/voyage/legs';
import { Simulation } from '@/core/simulation/Simulation';
import { loadoutOf } from '@/core/voyage/loadout';
import { rollFor } from '@/core/voyage/random';
import type { StockId } from '@/core/voyage/types';
import { Voyage } from '@/core/voyage/Voyage';
import {
  clampChance,
  enabledChoices,
  eventContext,
  rollEvent,
  rollRisk,
  type EventEffect,
} from '@/core/voyage/voyageEvents';
import { flyVoyage } from '@/devtools/voyageLoadout';
import { runSeededVoyage, type SeededRun } from '@/devtools/voyageRun';
import {
  type FastOutcome,
  flightsOf,
  type LoadoutFlights,
  route,
  system,
} from '@/devtools/voyageEvaluator';
import { type Sweep, type SweepRow, sweepRow } from '@/devtools/voyageSweep';

/**
 * Days the evaluator's end may differ from the game's. It flies the game's own substeps and
 * frames on the set's own loadout, so it agrees exactly (S6: 0.000); the bar only absorbs
 * float noise in the day.
 */
const DAY_TOLERANCE = 0.001;
/** Real seconds the alarm lead may differ: about one frame (same frames, same alarm reading). */
const LEAD_TOLERANCE_S = 0.02;
/** Seeds every sampled set is also flown with, events on (the first two of the sweep's). */
const CROSS_SEEDS = [1, 2];
/** Sets always in the sample: the smoke scenarios' (plan S10, S13) and nothing aboard. */
const ALWAYS = ['fuel:1,supplies:1,reactor:1', 'fuel:1,oxygen:1,supplies:1,solar:1', ''];

/**
 * Largest difference of a stock at a gate between the evaluator and the game, days: the same
 * flows on the same substeps, so float noise only.
 */
const STOCK_TOLERANCE = 0.001;
/**
 * Largest difference of the fuel at a gate, kg: the same burns on the same substeps (one
 * mass M(t) per substep), so a few kg of float noise at most out of tonnes.
 */
const FUEL_TOLERANCE_KG = 5;
/** Seeds tried per set when searching for a voyage that covers a combination. */
const SEARCH_SEEDS_PER_SET = 4;
/** Seeds scanned with `rollFor` for ones whose rolls give the combination wanted. */
const SEARCH_SEED_LIMIT = 100_000;
const STOCKS: readonly StockId[] = ['oxygen', 'water', 'food', 'power', 'heat'];

/** One compared voyage. */
export interface CrossLine {
  spec: string;
  /** null: no events. */
  seed: number | null;
  /** Answers asked for (event id -> choice id); empty with no events. */
  choices: Readonly<Record<string, string>>;
  fast: string;
  game: string;
  ok: boolean;
  /** What differs (empty when `ok`). */
  diff: string;
  /** |fast day - game day| of the end. */
  dayError: number;
  /** Largest |fast - game| of a stock at a gate, days. */
  stockError: number;
  /** Largest |fast - game| of the fuel at a gate, kg (`FUEL_TOLERANCE_KG`). */
  fuelError: number;
  /** Gates where the game's forecast said fuel short, and whether Go on then failed (I7). */
  fuelShortGates: { gate: number; flagged: boolean; reachedNext: boolean }[];
  /** Coverage targets (`CoverageRow.key`) this voyage showed in the game. */
  covers: string[];
}

/** How one combination the content can produce was covered (`coverageTargets`). */
export interface CoverageRow {
  key: string;
  /** Whether the cross-check fails when nothing covered it. */
  required: boolean;
  /** Compared game voyages that showed it. */
  compared: number;
  /** The first of them: `spec seed N`. */
  example: string | null;
}

/** The cross-check's result. */
export interface CrossCheck {
  lines: CrossLine[];
  coverage: CoverageRow[];
  /** Sample rows whose worker event outcomes were checked against this thread (`compareRow`). */
  rowsCompared: number;
  /** Rows that differ (I8 would read wrong numbers). */
  rowDiffs: string[];
  ok: boolean;
  wallMs: number;
  /**
   * Of it: the game's voyages and the evaluator's flights of them, and the search for voyages
   * that cover a target (`findVoyage`), with the sets it evaluated, wall-clock ms.
   */
  compareMs: number;
  searchMs: number;
  searchSets: number;
}

/** A choice to steer the search with: event, choice, and the risk's outcome (null: no risk). */
interface Hint {
  eventId: string;
  choiceId: string;
  hit: boolean | null;
}

/**
 * Something the cross-check must see the game do at least once: every (event, choice, hit or
 * not) the registry can produce, and the special paths of `applyEventEffect`.
 */
interface CoverageTarget {
  key: string;
  required: boolean;
  /** Choices whose rolls the search picks seeds for. */
  hints: Hint[];
  /** Whether an evaluated voyage shows it (the search), and a game voyage (the coverage). */
  fast: (o: FastOutcome) => boolean;
  game: (run: SeededRun) => boolean;
}

/** Hints for every choice whose effect (sure, or on a hit) matches `part`. */
function hintsWhere(part: (effect: EventEffect) => boolean): Hint[] {
  return Object.entries(voyageEvents).flatMap(([eventId, def]) =>
    def.choices.flatMap((choice) => {
      const hints: Hint[] = [];
      if (choice.effect && part(choice.effect))
        hints.push({ eventId, choiceId: choice.id, hit: null });
      if (choice.onHit && part(choice.onHit))
        hints.push({ eventId, choiceId: choice.id, hit: true });
      return hints;
    }),
  );
}

/** What the cross-check must cover (see `CoverageTarget`), from the event registry. */
export function coverageTargets(): CoverageTarget[] {
  const targets: CoverageTarget[] = [];
  for (const [eventId, def] of Object.entries(voyageEvents)) {
    for (const choice of def.choices) {
      for (const hit of choice.risk ? [true, false] : [null]) {
        const same = (id: string, choiceId: string, h: boolean) =>
          id === eventId && choiceId === choice.id && (hit === null || h === hit);
        targets.push({
          key: `${eventId}/${choice.id}${hit === null ? '' : hit ? '/hit' : '/no hit'}`,
          required: true,
          hints: [{ eventId, choiceId: choice.id, hit }],
          fast: (o) => o.events.some((e) => same(e.id, e.choice, e.hit)),
          game: (run) => run.answers.some((a) => same(a.eventId, a.choiceId, a.hit)),
        });
      }
    }
  }
  const lossOf = (effect: EventEffect, ids: readonly StockId[]) =>
    ids.some((id) => (effect.stocks?.[id] ?? 0) < 0);
  targets.push(
    {
      key: 'drift after a fuel leak',
      required: true,
      hints: hintsWhere((effect) => lossOf(effect, ['fuel'])),
      fast: (o) => o.leakDrift && o.cause === 'drift',
      game: (run) =>
        run.outcome?.kind === 'died' &&
        run.outcome.cause === 'drift' &&
        run.answers.some((a) => a.fuelLost > 0),
    },
    {
      key: 'death during an event',
      required: true,
      hints: hintsWhere((effect) => effect.die === true || (effect.waitDays ?? 0) > 0),
      fast: (o) => o.diedInEvent,
      game: (run) => diedAtAnswer(run, () => true),
    },
    {
      key: 'resource death from an event (a stock emptied, or run out waiting)',
      // Only where the numbers allow it: a stock low enough when the event comes.
      required: false,
      hints: hintsWhere(
        (effect) =>
          (effect.waitDays ?? 0) > 0 || lossOf(effect, ['oxygen', 'water', 'food', 'heat']),
      ),
      fast: (o) => o.diedInEvent && !String(o.cause).startsWith('event:'),
      game: (run) => diedAtAnswer(run, (cause) => !cause.startsWith('event:')),
    },
    {
      key: 'power emptied by an event',
      // Only where the numbers allow it: power low enough when the event comes.
      required: false,
      hints: hintsWhere((effect) => lossOf(effect, ['power'])),
      fast: (o) => o.events.some((e) => e.emptied.includes('power')),
      game: (run) => run.answers.some((a) => a.emptied.includes('power')),
    },
  );
  return targets;
}

/** Whether `run` ended in a death of a `cause` at the moment of an answer (the clock stands). */
function diedAtAnswer(run: SeededRun, cause: (cause: string) => boolean): boolean {
  const end = run.outcome;
  return (
    end?.kind === 'died' &&
    cause(end.cause) &&
    run.answers.some((a) => Math.abs(a.day - end.day) < 1e-6)
  );
}

/** One voyage the search picked: the set, the seed, the answers. */
interface Pick {
  row: SweepRow;
  seed: number;
  choices: Record<string, string>;
}

/**
 * The seeds the search tries on `row` for `hint`, and the answers: none when the set does not
 * reach the event's leg without events, its cargo does not let the event happen or does not
 * offer the choice, or the risk cannot strike (or cannot miss) as the hint wants; else the
 * first `SEARCH_SEEDS_PER_SET` seeds whose `rollFor` rolls make the event happen and its risk
 * strike (or not) as the hint wants. Answers: the hint's, the rest the set's best for its range.
 */
function searchSeeds(
  row: SweepRow,
  hint: Hint,
): { seeds: number[]; choices: Record<string, string> } | null {
  const def = voyageEvents[hint.eventId as keyof typeof voyageEvents];
  const choice = def.choices.find((c) => c.id === hint.choiceId);
  if (!choice || row.range < def.leg - 1) return null;
  const loadout = loadoutOf(cargo, row.counts);
  const ctx = eventContext(loadout, [], () => Infinity, legs[def.leg].comms, def.leg);
  if (!enabledChoices(def, ctx).includes(choice)) return null;
  if (clampChance(def.chance(ctx)) <= 0) return null;
  const risk = rollRisk(choice, hint.eventId, 0, ctx).risk;
  if ((hint.hit === true && risk <= 0) || (hint.hit === false && risk >= 1)) return null;
  const choices = {
    ...(row.bestPolicy[Math.max(0, row.range)] ?? {}),
    [hint.eventId]: choice.id,
  };
  const seeds: number[] = [];
  for (let seed = 1; seed <= SEARCH_SEED_LIMIT && seeds.length < SEARCH_SEEDS_PER_SET; seed++) {
    if (!rollEvent(def, hint.eventId, seed, ctx).happened) continue;
    if (hint.hit !== null && rollRisk(choice, hint.eventId, seed, ctx).hit !== hint.hit) continue;
    seeds.push(seed);
  }
  return { seeds, choices };
}

/**
 * For every coverage target and each of its hints, the first of the search's seeds
 * (`searchSeeds`) on which the evaluator says `row` shows it, or null: the search
 * (`findVoyage`) over one set, run by the sweep's worker threads (`voyageSweepWorker.ts`) on
 * `flights`, the set's own, so the search does not fly every set again on one thread.
 */
export function searchHits(
  row: SweepRow,
  flights: LoadoutFlights,
): Record<string, (number | null)[]> {
  const outcomes = new Map<string, { seed: number; outcome: FastOutcome }[]>();
  const hits: Record<string, (number | null)[]> = {};
  for (const target of coverageTargets()) {
    hits[target.key] = target.hints.map((hint) => {
      const key = `${hint.eventId}/${hint.choiceId}/${hint.hit}`;
      let tried = outcomes.get(key);
      if (!tried) {
        const search = searchSeeds(row, hint);
        tried = (search?.seeds ?? []).map((seed) => ({
          seed,
          outcome: flights.evaluate({ events: voyageEvents, seed, choices: search?.choices }),
        }));
        outcomes.set(key, tried);
      }
      return tried.find((t) => target.fast(t.outcome))?.seed ?? null;
    });
  }
  return hits;
}

/**
 * A voyage the evaluator says shows `target`: for each hint, in sweep order, the sets that can
 * show it with the seeds and answers of `searchSeeds`; the first set and seed that does. Reads
 * the sweep's `SweepRow.searchHits` where it has them; otherwise evaluates (and counts the sets
 * in `searched`).
 */
function findVoyage(sweep: Sweep, target: CoverageTarget, searched: Set<string>): Pick | null {
  for (const [h, hint] of target.hints.entries()) {
    for (const row of sweep.rows) {
      const known = row.searchHits?.[target.key];
      if (known && known[h] === null) continue;
      const search = searchSeeds(row, hint);
      if (!search) continue;
      if (known) return { row, seed: known[h] as number, choices: search.choices };
      for (const seed of search.seeds) {
        searched.add(row.spec);
        const loadout = loadoutOf(cargo, row.counts);
        const fast = flightsOf(loadout).evaluate({
          events: voyageEvents,
          seed,
          choices: search.choices,
        });
        if (target.fast(fast)) return { row, seed, choices: search.choices };
      }
    }
  }
  return null;
}

/**
 * The sample: `ALWAYS`, the sets with the shortest alarm lead before a resource death and
 * before a drift (I6), then one set for every (range, death cause) of the sweep, picked with
 * a fixed hash so the sample is the same from run to run while the numbers stay the same.
 */
export function crossSample(sweep: Sweep): SweepRow[] {
  const picked = new Map<string, SweepRow>();
  for (const spec of ALWAYS) {
    const row = sweep.rows.find((r) => r.spec === (spec === '' ? 'base' : canonical(spec)));
    if (row) picked.set(row.spec, row);
  }
  const groups = new Map<string, SweepRow[]>();
  for (const row of sweep.rows) {
    const key = `${row.range}:${row.outcome.cause ?? 'landed'}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  // The shortest alarm lead before a resource death (I6) and before a drift.
  for (const drift of [false, true]) {
    const deaths = sweep.rows.filter(
      (r) => r.outcome.alarmLeadRealS !== null && (r.outcome.cause === 'drift') === drift,
    );
    deaths.sort((a, b) => (a.outcome.alarmLeadRealS ?? 0) - (b.outcome.alarmLeadRealS ?? 0));
    if (deaths[0]) picked.set(deaths[0].spec, deaths[0]);
  }
  for (const [key, rows] of groups) {
    const row = rows[Math.floor(rollFor(12, key) * rows.length)];
    picked.set(row.spec, row);
  }
  return [...picked.values()];
}

/** A `--loadout` spec in the sweep's own spelling. */
function canonical(spec: string): string {
  const counts: Record<string, number> = {};
  for (const part of spec.split(',')) {
    const [id, n = '1'] = part.split(':');
    counts[id] = Number(n);
  }
  return Object.keys(cargo.items)
    .filter((id) => (counts[id] ?? 0) > 0)
    .map((id) => (counts[id] > 1 ? `${id}:${counts[id]}` : id))
    .join(',');
}

const describe = (o: { kind: string; gate: number; cause: string | null; day: number }): string =>
  `${o.kind === 'died' ? `died of ${o.cause}` : o.kind} day ${o.day.toFixed(1)}, ` +
  `last gate ${o.gate < 0 ? 'none' : gates[o.gate].body}`;

/**
 * Compares the sweep's evaluator with the game (see the file's comment): `sweep`'s sample without
 * events and with `CROSS_SEEDS`, then a voyage found for every coverage target not yet shown
 * by those (`findVoyage`). Fails on any difference, and on a required target no compared game
 * voyage showed ("coverage: asteroid-belt/fly/hit never compared").
 */
export function crossCheck(sweep: Sweep): CrossCheck {
  const started = performance.now();
  const lines: CrossLine[] = [];
  const targets = coverageTargets();
  const rowDiffs: string[] = [];
  let rowsCompared = 0;
  const runEvents = (row: SweepRow, seed: number, choices: Record<string, string>) => {
    const loadout = loadoutOf(cargo, row.counts);
    const voyage = new Voyage(system, route, loadout, voyageEvents, seed);
    const run = runSeededVoyage(voyage, { choice: 'first', choices });
    const fast = flightsOf(loadout).evaluate({ events: voyageEvents, seed, choices });
    lines.push(compareEvents(row.spec, seed, choices, fast, run, targets));
  };
  for (const row of crossSample(sweep)) {
    lines.push(compareNoEvents(row));
    // Events on: the game's Voyage with the set's best answers for its range.
    const choices = row.bestPolicy[Math.max(0, row.range)] ?? {};
    for (const seed of CROSS_SEEDS) runEvents(row, seed, choices);
    rowsCompared++;
    const rowDiff = compareRow(row);
    if (rowDiff) rowDiffs.push(rowDiff);
  }
  let searchMs = 0;
  const searched = new Set<string>();
  for (const target of targets) {
    if (lines.some((line) => line.covers.includes(target.key))) continue;
    const searchStarted = performance.now();
    const pick = findVoyage(sweep, target, searched);
    searchMs += performance.now() - searchStarted;
    if (pick) runEvents(pick.row, pick.seed, pick.choices);
  }
  const coverage: CoverageRow[] = targets.map((target) => {
    const showing = lines.filter((line) => line.covers.includes(target.key));
    const first = showing[0];
    return {
      key: target.key,
      required: target.required,
      compared: showing.length,
      example: first ? `${first.spec} seed ${first.seed}` : null,
    };
  });
  const covered = coverage.every((row) => row.compared > 0 || !row.required);
  return {
    lines,
    coverage,
    rowsCompared,
    rowDiffs,
    ok: covered && rowDiffs.length === 0 && lines.every((l) => l.ok),
    wallMs: performance.now() - started,
    compareMs: performance.now() - started - searchMs,
    searchMs,
    searchSets: searched.size,
  };
}

/** A sample set without events: `flyVoyage` (the game's Simulation, Go on at every gate). */
function compareNoEvents(row: SweepRow): CrossLine {
  const loadout = loadoutOf(cargo, row.counts);
  const flown = flyVoyage(new Simulation(system, route, loadout), legs);
  const fast = row.outcome;
  const game = {
    kind: flown.result === 'landed' ? 'landed' : 'died',
    gate: flown.gates.length - 1,
    cause: flown.cause,
    day: flown.result === 'landed' ? (flown.gates.at(-1)?.day ?? 0) : (flown.deathDay ?? 0),
  };
  const diffs = compare(fast, game);
  const { stockError, fuelError } = compareStocks(
    fast,
    flown.gates.map((g) => g.values),
    diffs,
  );
  const fastLead = fast.alarmLeadRealS;
  const gameLead = flown.alarmLeadRealS;
  if (fast.kind === 'died') {
    if (gameLead === null || fastLead === null) diffs.push('alarm missing');
    else if (Math.abs(gameLead - fastLead) > LEAD_TOLERANCE_S) {
      diffs.push(`alarm lead ${fastLead.toFixed(2)} vs ${gameLead.toFixed(2)} s`);
    }
  }
  return {
    spec: row.spec,
    seed: null,
    choices: {},
    fast: `${describe(fast)}${fastLead === null ? '' : `, alarm ${fastLead.toFixed(2)} s`}`,
    game: `${describe(game)}${gameLead === null ? '' : `, alarm ${gameLead.toFixed(2)} s`}`,
    ok: diffs.length === 0,
    diff: diffs.join('; '),
    dayError: Math.abs(fast.day - game.day),
    stockError,
    fuelError,
    fuelShortGates: [],
    covers: [],
  };
}

/** A voyage with events: the game's `run` against the evaluator's `fast`. */
function compareEvents(
  spec: string,
  seed: number,
  choices: Readonly<Record<string, string>>,
  fast: FastOutcome,
  run: SeededRun,
  targets: readonly CoverageTarget[],
): CrossLine {
  const outcome = run.outcome;
  const game = outcome
    ? {
        kind: outcome.kind,
        gate: outcome.gate,
        cause: outcome.kind === 'died' ? outcome.cause : null,
        day: outcome.day,
      }
    : { kind: 'gave up', gate: -1, cause: null, day: 0 };
  const d = compare(fast, game);
  const { stockError, fuelError } = compareStocks(
    fast,
    run.gates.map((g) => g.values),
    d,
  );
  const fuelShortGates = run.gates
    .filter((g) => g.forecast?.fuelShort)
    .map((g) => ({
      gate: g.gate,
      flagged: fast.fuelShortAtGate[g.gate] === true,
      reachedNext: run.gates.some((later) => later.gate === g.gate + 1),
    }));
  run.gates.forEach((g, i) => {
    const fastShort = fast.fuelShortAtGate[i] === true;
    if (g.forecast && g.forecast.fuelShort !== fastShort) {
      d.push(`fuelShort at ${gates[g.gate].body}: fast ${fastShort}, game ${g.forecast.fuelShort}`);
    }
  });
  const events = run.answers.map((a) => `${a.eventId}=${a.choiceId}${a.hit ? '!' : ''}`);
  const fastEvents = fast.events.map((e) => `${e.id}=${e.choice}${e.hit ? '!' : ''}`);
  if (events.join() !== fastEvents.join()) {
    d.push(`events ${fastEvents.join(' ') || '-'} vs ${events.join(' ') || '-'}`);
  }
  return {
    spec,
    seed,
    choices,
    fast: `${describe(fast)}; events ${fastEvents.join(' ') || '-'}`,
    game: `${describe(game)}; events ${events.join(' ') || '-'}`,
    ok: d.length === 0,
    diff: d.join('; '),
    dayError: Math.abs(fast.day - game.day),
    stockError,
    fuelError,
    fuelShortGates,
    covers: targets.filter((t) => t.game(run)).map((t) => t.key),
  };
}

/**
 * Stocks at every gate both reached, fast against the game (`STOCK_TOLERANCE` days; the fuel
 * `FUEL_TOLERANCE_KG`); differences go to `diffs`. Returns the largest differences.
 */
function compareStocks(
  fast: FastOutcome,
  game: readonly Readonly<Record<string, number>>[],
  diffs: string[],
): { stockError: number; fuelError: number } {
  let worst = 0;
  let fuelError = 0;
  const n = Math.min(fast.stocksAtGate.length, game.length);
  for (let i = 0; i < n; i++) {
    const fastFuel = fast.stocksAtGate[i].fuel;
    const gameFuel = game[i].fuel;
    const errorKg = Math.abs(fastFuel - gameFuel);
    fuelError = Math.max(fuelError, errorKg);
    if (errorKg > FUEL_TOLERANCE_KG) {
      diffs.push(
        `fuel at ${gates[i].body} ${(fastFuel / 1000).toFixed(3)} vs ${(gameFuel / 1000).toFixed(3)} t`,
      );
    }
    for (const id of STOCKS) {
      const error = Math.abs(fast.stocksAtGate[i][id] - game[i][id]);
      worst = Math.max(worst, error);
      if (error > STOCK_TOLERANCE) {
        diffs.push(
          `${id} at ${gates[i].body} ${fast.stocksAtGate[i][id].toFixed(2)} vs ${game[i][id].toFixed(2)}`,
        );
      }
    }
  }
  return { stockError: worst, fuelError };
}

/**
 * The worker's event outcomes of `row` (`eventSurvival`, `bestPolicy`; I8 reads them) against
 * `sweepRow` on this thread (the voyages compare a fresh evaluator, not the row): null when
 * equal, else what differs.
 */
function compareRow(row: SweepRow): string | null {
  const main = sweepRow(row.counts);
  const show = (r: SweepRow) => JSON.stringify([r.eventSurvival, r.bestPolicy]);
  return show(main) === show(row)
    ? null
    : `${row.spec}: worker eventSurvival/bestPolicy ${show(row)} vs this thread ${show(main)}`;
}

/** What differs between the fast outcome and the game's. */
function compare(
  fast: FastOutcome,
  game: { kind: string; gate: number; cause: string | null; day: number },
): string[] {
  const diffs: string[] = [];
  if (fast.kind !== game.kind) diffs.push(`outcome ${fast.kind} vs ${game.kind}`);
  if (fast.gate !== game.gate) diffs.push(`last gate ${fast.gate} vs ${game.gate}`);
  if (fast.cause !== game.cause) diffs.push(`cause ${fast.cause} vs ${game.cause}`);
  if (Math.abs(fast.day - game.day) > DAY_TOLERANCE) {
    diffs.push(`day ${fast.day.toFixed(1)} vs ${game.day.toFixed(1)}`);
  }
  return diffs;
}

/** The cross-check as text lines: the summary, the coverage table, every voyage. */
export function crossCheckText(check: CrossCheck): string[] {
  const missing = check.coverage.filter((row) => row.required && row.compared === 0);
  const out = [
    `Cross-check: the sweep's evaluator vs the game's Voyage, ${check.lines.length} voyages ` +
      `(${(check.wallMs / 1000).toFixed(0)} s: compared ${(check.compareMs / 1000).toFixed(0)} s, ` +
      `searched ${check.searchSets} sets for coverage ${(check.searchMs / 1000).toFixed(0)} s): ` +
      `${check.ok ? 'all agree' : 'DISAGREE'}; ` +
      `largest day error ${Math.max(...check.lines.map((l) => l.dayError)).toFixed(2)} d ` +
      `(tolerance ${DAY_TOLERANCE}), largest stock error at a gate ` +
      `${Math.max(...check.lines.map((l) => l.stockError)).toFixed(3)} d ` +
      `(tolerance ${STOCK_TOLERANCE}), of the fuel ` +
      `${Math.max(...check.lines.map((l) => l.fuelError)).toFixed(3)} kg ` +
      `(tolerance ${FUEL_TOLERANCE_KG} kg), alarm lead tolerance ${LEAD_TOLERANCE_S} s`,
    `Worker rows' event outcomes (eventSurvival, bestPolicy) vs this thread: ` +
      `${check.rowsCompared - check.rowDiffs.length} of ${check.rowsCompared} sets equal`,
    ...check.rowDiffs,
    ...missing.map((row) => `coverage: ${row.key} never compared`),
    'Coverage (game voyages that showed it; the first):',
    ...check.coverage.map(
      (row) =>
        `  ${String(row.compared).padStart(3)}  ${row.key}${row.required ? '' : ' (if reachable)'}` +
        (row.example
          ? `  - ${row.example}`
          : row.required
            ? '  - NEVER COMPARED'
            : '  - none: the search found no voyage where the numbers allow it'),
    ),
  ];
  for (const line of check.lines) {
    const answers = Object.entries(line.choices)
      .map(([id, choice]) => `${id}=${choice}`)
      .join(' ');
    out.push(
      `  ${line.ok ? 'ok  ' : 'DIFF'} ${line.spec} ` +
        `${line.seed === null ? 'no events' : `seed ${line.seed}${answers ? ` (${answers})` : ''}`}`,
    );
    out.push(`       fast: ${line.fast}`);
    out.push(`       game: ${line.game}`);
    if (!line.ok) out.push(`       ${line.diff}`);
  }
  return out;
}
