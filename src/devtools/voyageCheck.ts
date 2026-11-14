/**
 * `npm run voyage-check`: flies the whole voyage headless (Node, no browser) with the game's own
 * `Simulation` and prints a table per leg - simulated days, real seconds of Run at the current
 * time-scale constants, the miss at capture, delta-v against `dvBudget`, the mode - and checks
 * the autopilot's convergence criteria (docs/HOWTO-simulation.md): every leg arrives within
 * 1.5x its brachistochrone time and 20 % over its `dvBudget`, also with the gate body's phase
 * shifted by +-0.3 rad (physics legs only: a rail leg follows its script whatever the phases,
 * so its rows are n/a). Exits non-zero if a gate is not reached or a criterion fails.
 *
 * The flight table uses `--fuel <n>` fuel crates (default 3: 6 charges with the tank) and
 * enough life support not to die on the way; `--no-robust` skips the phase-shift runs.
 *
 * `--loadout <spec>` (repeatable, `fuel:1,supplies:1,battery:1,solar:1`; `base` for nothing
 * but the built-in base) flies the voyage with that cargo instead, pressing Go on at every
 * gate, and prints the stocks at each gate and how it ended: landed at the last gate, or the
 * cause of death, where, and how long before it the alarm came on (D14). No pass/fail.
 *
 * `--seed <n>` (repeatable) flies voyages with the events on the way (src/content/voyage/events)
 * rolled with that seed, as the game does with `run.seed` (plan D10): for every `--loadout`
 * (default: the two smoke loadouts, `SMOKE_LOADOUTS`) it runs "Go on to the end" and "Stop at
 * <gate>" (`--stop <body>`, default mars), answering every card with its first enabled choice
 * (`--choice <index>` for another). It prints every roll, the stocks and the forecast of the
 * next leg at each gate (and whether the forecast came true on legs without an event), and how
 * the voyage ended; then the same voyage once more to show one seed flies the same.
 *
 * `--all` runs the loadout sweep (plan S12, `voyageSweep.ts`): every hold of at most 7 bays
 * along a voyage flown once, without events and with 20 seeds; writes one CSV line per loadout
 * to `tools/out/voyage-sweep.csv` (range, death cause, colony tier per body, survival with
 * events, dominance), prints how many loadouts reach each gate, and checks the fast evaluator
 * against the game's `Voyage` on a sample (exits non-zero if they disagree). The balance
 * invariants over the same sweep: `npm run balance` (src/devtools/balance.ts).
 *
 * Must not import `@/config`, `@/core/services` or the event bus: they read `window` on load.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { ship } from '@/content/simulation/ship';
import { solarSystem } from '@/content/simulation/solar-system';
import { cargo } from '@/content/voyage/cargo';
import { voyageEvents } from '@/content/voyage/events';
import { gates } from '@/content/voyage/gates';
import { legs } from '@/content/voyage/legs';
import { brachistochroneTime } from '@/core/simulation/autopilot';
import { DAY_S } from '@/core/simulation/constants';
import { Simulation } from '@/core/simulation/Simulation';
import { SolarSystem } from '@/core/simulation/SolarSystem';
import type { Body, SimulationSnapshot } from '@/core/simulation/types';
import { FORECAST_STOCKS, type LegForecast } from '@/core/voyage/forecast';
import { loadoutOf } from '@/core/voyage/loadout';
import { rollFor } from '@/core/voyage/random';
import { Voyage, type VoyageOutcome } from '@/core/voyage/Voyage';
import { flyLeg, type LegResult } from '@/devtools/voyageFlight';
import {
  flyVoyage,
  parseLoadout,
  type VoyageOutcome as FlightOutcome,
} from '@/devtools/voyageLoadout';
import { crossCheck, crossCheckText } from '@/devtools/voyageCrossCheck';
import { runSeededVoyage, type SeededRun, type VoyagePolicy } from '@/devtools/voyageRun';
import { preflight, runSweep, sweepCsv, sweepSummary } from '@/devtools/voyageSweep';

/**
 * Convergence criteria of the autopilot (plan S5, "open experiments"). OWNER: physics - with
 * the autopilot's tuning (docs/HOWTO-simulation.md).
 */
const MAX_TIME_RATIO = 1.5;
const MAX_OVERSPEND = 0.2;
const PHASE_SHIFT_RAD = 0.3;
/** Fuel crates of the flight table (3: the tank's 1 charge and 3 more, D13). */
const FULL_FUEL_CRATES = 3;
/**
 * Loadouts of the smoke scenarios (plan S7, S10): the first dies of hypoxia, the second reaches
 * Mars, with the smoke seed (tools/smoke/voyage-seed.mjs) and the first choice on every card.
 */
const SMOKE_LOADOUTS = ['fuel:1,supplies:1,reactor:1', 'fuel:1,oxygen:1,supplies:1,solar:1'];
/** Life support of the flight table: nothing runs out before Mars. */
const TABLE_LIFE_SUPPORT = { reactor: 1, greenhouse: 1, supplies: 1, oxygen: 1 };

/** Where `--all` writes the sweep (tools/out is not committed). */
const SWEEP_CSV = 'tools/out/voyage-sweep.csv';

const write = (line = '') => process.stdout.write(`${line}\n`);

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

/** Every value of a repeatable option. */
function options(name: string): string[] {
  return process.argv.flatMap((arg, i) => (arg === name ? [process.argv[i + 1] ?? ''] : []));
}

const fuelCrates = Number(option('--fuel') ?? FULL_FUEL_CRATES);
const robust = !process.argv.includes('--no-robust');
const shipConfig = ship;
const route = { ship: shipConfig, gates, legs, cargo };
const tableLoadout = loadoutOf(cargo, { fuel: fuelCrates, ...TABLE_LIFE_SUPPORT });
const charges = tableLoadout.entries.reduce(
  (sum, entry) => sum + (entry.def.start?.fuel ?? 0) * entry.count,
  0,
);
const accel = shipConfig.thrustN / shipConfig.massKg;

/** Brachistochrone time of a leg, s: straight distance seen from the body the leg leaves. */
function brachistochrone(
  system: SolarSystem,
  leg: number,
  start: SimulationSnapshot,
  endS: number,
) {
  const from = system.get(leg === 0 ? shipConfig.start.around : gates[leg - 1].body);
  const to = system.get(gates[leg].body);
  const target = system.positionOf(to, endS);
  const fromEnd = system.positionOf(from, endS);
  const fromStart = system.positionOf(from, start.timeS);
  const distance = Math.hypot(
    target.x - fromEnd.x - (start.ship.x - fromStart.x),
    target.y - fromEnd.y - (start.ship.y - fromStart.y),
  );
  return brachistochroneTime(distance, accel);
}

interface Verdict {
  ratio: number;
  overspend: number;
  ok: boolean;
}

function judge(system: SolarSystem, leg: number, start: SimulationSnapshot, r: LegResult): Verdict {
  if (!r.arrived) return { ratio: Infinity, overspend: Infinity, ok: false };
  const ratio = r.simS / brachistochrone(system, leg, start, start.timeS + r.simS);
  const overspend = r.dv / legs[leg].dvBudget - 1;
  return { ratio, overspend, ok: ratio <= MAX_TIME_RATIO && overspend <= MAX_OVERSPEND };
}

const pad = (text: string | number, width: number) => String(text).padStart(width);
const km = (ms: number) => (ms / 1000).toFixed(1);
const pct = (x: number) =>
  Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${(x * 100).toFixed(0)}%` : '-';

const system = new SolarSystem(solarSystem);

if (process.argv.includes('--all')) {
  process.exitCode = printSweep() ? 0 : 1;
  process.exit();
}
const loadoutSpecs = options('--loadout');
const seeds = options('--seed');
if (seeds.length > 0) {
  printSeeded(seeds.map(Number), loadoutSpecs.length > 0 ? loadoutSpecs : SMOKE_LOADOUTS);
  process.exit(0);
}
if (loadoutSpecs.length > 0) {
  for (const spec of loadoutSpecs) printVoyage(spec);
  process.exit(0);
}

const simulation = new Simulation(system, route, tableLoadout);
write(`Voyage check: ${gates.length} gates, ${charges} fuel charges at the start`);
write(
  `Criteria: arrival <= ${MAX_TIME_RATIO}x brachistochrone time, delta-v <= ` +
    `${100 + MAX_OVERSPEND * 100}% of dvBudget; robustness: gate body phase +-${PHASE_SHIFT_RAD} rad`,
);
write();
write(
  [
    pad('leg', 3),
    pad('gate', 7),
    pad('mode', 7),
    pad('sim d', 6),
    pad('brach', 6),
    pad('x', 5),
    pad('Run s', 6),
    pad('appr s', 6),
    pad('capture m', 10),
    pad('radius m', 9),
    pad('dv km/s', 8),
    pad('budget', 7),
    pad('over', 5),
    pad('fuel', 5),
    '  ok',
  ].join(' '),
);

let failed = false;
let reached = 0;
let totalReal = 0;
let totalSim = 0;
/** Per leg: the state where it was planned (parked at the previous gate, or the voyage start). */
const parked: (SimulationSnapshot | null)[] = [];
let parkedNow: SimulationSnapshot | null = null;
for (let leg = 0; leg < gates.length; leg++) {
  parked.push(parkedNow);
  const start = simulation.snapshot();
  const result = flyLeg(simulation, leg);
  const verdict = judge(system, leg, start, result);
  totalReal += result.realS;
  totalSim += result.simS;
  failed ||= !verdict.ok;
  write(
    [
      pad(leg, 3),
      pad(gates[leg].body, 7),
      pad(legs[leg].mode, 7),
      pad((result.simS / DAY_S).toFixed(1), 6),
      pad((result.simS / DAY_S / verdict.ratio).toFixed(1), 6),
      pad(verdict.ratio.toFixed(2), 5),
      pad(result.realS.toFixed(1), 6),
      pad(result.approachS.toFixed(1), 6),
      pad(result.captureM.toExponential(2), 10),
      pad(simulation.captureRadiusOf(leg).toExponential(1), 9),
      pad(km(result.dv), 8),
      pad(km(legs[leg].dvBudget), 7),
      pad(pct(verdict.overspend), 5),
      pad(result.fuelLeft.toFixed(2), 5),
      verdict.ok ? '  ok' : `  FAIL (${result.phase})`,
    ].join(' '),
  );
  if (!result.arrived) {
    write(`Gate ${leg} (${gates[leg].body}) not reached: autopilot ${result.phase}`);
    break;
  }
  reached++;
  parkedNow = simulation.snapshot();
  if (!simulation.departToNextGate() && leg < gates.length - 1) break;
}
write();
write(
  `Whole voyage: ${(totalSim / DAY_S).toFixed(0)} simulated days, ${totalReal.toFixed(0)} s of ` +
    `real Run (${(totalReal / 60).toFixed(1)} min) at the current time scale`,
);

if (robust && reached === gates.length) {
  write();
  write(`Robustness: each leg planned and flown again from its start, one body's phase shifted`);
  for (let leg = 0; leg < gates.length; leg++) {
    if (legs[leg].mode === 'rail') {
      write(`${pad(leg, 3)} ${pad(gates[leg].body, 7)}  n/a (rail: the phases do not change it)`);
      continue;
    }
    const gate = system.get(gates[leg].body);
    const shifted = [gate.id, ...(gate.parent && gate.parent !== 'earth' ? [gate.parent] : [])];
    const cells: string[] = [];
    for (const id of shifted) {
      for (const shift of [-PHASE_SHIFT_RAD, PHASE_SHIFT_RAD]) {
        const bodies: Body[] = solarSystem.map((body) =>
          body.id === id ? { ...body, phaseRad: (body.phaseRad ?? 0) + shift } : body,
        );
        const shiftedSystem = new SolarSystem(bodies);
        const before = parked[leg];
        const copy = new Simulation(shiftedSystem, route, before ?? tableLoadout);
        if (before) copy.departToNextGate();
        const start = copy.snapshot();
        const result = flyLeg(copy, leg);
        const verdict = judge(shiftedSystem, leg, start, result);
        failed ||= !verdict.ok;
        cells.push(
          `${id} ${shift > 0 ? '+' : ''}${shift}: ${(result.simS / DAY_S).toFixed(1)} d ` +
            `x${verdict.ratio.toFixed(2)} dv ${pct(verdict.overspend)}${verdict.ok ? '' : ' FAIL'}`,
        );
      }
    }
    write(`${pad(leg, 3)} ${pad(gates[leg].body, 7)}  ${cells.join(' | ')}`);
  }
}

write();
write(failed ? 'RESULT: FAILED' : 'RESULT: all gates reached within the criteria');
process.exitCode = failed ? 1 : 0;

/**
 * `--all`: the loadout sweep (`voyageSweep.ts`) - CSV into `SWEEP_CSV`, the summary, the
 * cross-check against the game. False if the sweep does not match the game.
 */
function printSweep(): boolean {
  const flight = preflight();
  if (flight.failure) {
    write(`Sweep failed: ${flight.failure}`);
    return false;
  }
  const sweep = runSweep(flight);
  mkdirSync(dirname(SWEEP_CSV), { recursive: true });
  writeFileSync(SWEEP_CSV, sweepCsv(sweep));
  for (const line of sweepSummary(sweep)) write(line);
  write(`CSV: ${SWEEP_CSV} (one line per loadout)`);
  write();
  const check = crossCheck(sweep);
  for (const line of crossCheckText(check)) write(line);
  return check.ok;
}

/** `--loadout`: flies the voyage with `spec`'s cargo, Go on at every gate, and prints it. */
function printVoyage(spec: string): void {
  const counts = parseLoadout(spec);
  const loadout = loadoutOf(cargo, counts);
  const bays = loadout.entries.reduce((sum, entry) => sum + entry.def.bays * entry.count, 0);
  const outcome = flyVoyage(new Simulation(system, route, loadout), legs);
  write(`Loadout ${spec || 'base'} (${bays}/${cargo.bays} bays), Go on at every gate`);
  write(
    [
      pad('gate', 7),
      pad('day', 6),
      pad('fuel', 5),
      pad('O2', 9),
      pad('water', 9),
      pad('food', 9),
      pad('power', 9),
      pad('heat', 5),
      pad('comms', 5),
      '  offline',
    ].join(' '),
  );
  const stock = (value: number, days: number | undefined) =>
    `${value.toFixed(0)}/${days === undefined || !Number.isFinite(days) ? '+' : days.toFixed(0)}`;
  for (const row of outcome.gates) {
    write(
      [
        pad(gates[row.gate].body, 7),
        pad(row.day.toFixed(1), 6),
        pad(row.values.fuel.toFixed(2), 5),
        pad(stock(row.values.oxygen, row.daysLeft.oxygen), 9),
        pad(stock(row.values.water, row.daysLeft.water), 9),
        pad(stock(row.values.food, row.daysLeft.food), 9),
        pad(stock(row.values.power, row.daysLeft.power), 9),
        pad(row.values.heat.toFixed(1), 5),
        pad(row.values.comms, 5),
        `  ${row.offline.join(',') || '-'}`,
      ].join(' '),
    );
  }
  write(`  (stocks: value / days left at the next leg's flows, + = not running down)`);
  write(`  ${outcomeLine(outcome)}`);
  write();
}

function outcomeLine(outcome: FlightOutcome): string {
  const reached = outcome.gates.length;
  const last = reached > 0 ? gates[outcome.gates[reached - 1].gate].body : 'none';
  if (outcome.result !== 'died') {
    return `RESULT: ${outcome.result} at ${last}, ${outcome.realS.toFixed(0)} s of Run`;
  }
  const from = outcome.leg === 0 ? shipConfig.start.around : gates[outcome.leg - 1].body;
  const lead =
    outcome.alarmLeadRealS === null
      ? 'NO ALARM before it'
      : `alarm ${outcome.alarmLeadRealS.toFixed(1)} real s / ` +
        `${(outcome.alarmLeadDays ?? 0).toFixed(1)} sim d before`;
  return (
    `RESULT: died of ${outcome.cause} on day ${(outcome.deathDay ?? 0).toFixed(1)}, ` +
    `leg ${from}->${gates[outcome.leg].body} at ${(outcome.legFraction * 100).toFixed(0)}%, ` +
    `last gate ${last}; ${lead}`
  );
}

/** `--seed`: every seed, every loadout, Go on to the end and Stop at `--stop`. */
function printSeeded(seedList: number[], specs: string[]): void {
  const stopBody = option('--stop') ?? 'mars';
  const stopAt = gates.findIndex((gate) => gate.body === stopBody);
  if (stopAt < 0) throw new Error(`--stop: no gate at "${stopBody}"`);
  const choiceArg = option('--choice');
  const choice: VoyagePolicy['choice'] = choiceArg === undefined ? 'first' : Number(choiceArg);
  for (const seed of seedList) {
    if (!Number.isInteger(seed) || seed < 0) throw new Error(`--seed: bad seed ${seed}`);
    write(`=== Seed ${seed} ===`);
    const keys = Object.entries(voyageEvents).flatMap(([id, def]) => [
      `happen:${id}`,
      ...def.choices.filter((c) => c.risk).map((c) => `risk:${id}:${c.id}`),
    ]);
    write(
      `Rolls (fixed by the seed, any loadout): ` +
        keys.map((key) => `${key}=${rollFor(seed, key).toFixed(3)}`).join(' '),
    );
    write();
    for (const spec of specs) {
      const counts = parseLoadout(spec);
      for (const policy of [{ choice }, { choice, stopAt }] as VoyagePolicy[]) {
        const mode =
          policy.stopAt === undefined ? 'Go on to the end' : `Stop at ${gates[policy.stopAt].body}`;
        const voyage = new Voyage(system, route, loadoutOf(cargo, counts), voyageEvents, seed);
        const run = runSeededVoyage(voyage, policy);
        write(`Seed ${seed}, loadout ${spec || 'base'}, ${mode}, choice ${choice}`);
        printRun(voyage, run);
        if (policy.stopAt === undefined) {
          const again = new Voyage(system, route, loadoutOf(cargo, counts), voyageEvents, seed);
          const second = runSeededVoyage(again, policy);
          const same = JSON.stringify([run, voyage.log]) === JSON.stringify([second, again.log]);
          write(`  same seed again: ${same ? 'identical' : 'DIFFERENT'}`);
        }
        write();
      }
    }
  }
}

function printRun(voyage: Voyage, run: SeededRun): void {
  for (const entry of voyage.log) {
    const answer = run.answers.find((a) => a.eventId === entry.eventId);
    const what = entry.dropped
      ? entry.happened
        ? 'HAPPENED, dropped unanswered (adrift)'
        : 'dropped (arrived or adrift first)'
      : `roll ${entry.roll.toFixed(3)} ${entry.happened ? '<' : '>='} chance ` +
        `${entry.chance.toFixed(2)}: ${entry.happened ? 'HAPPENED' : 'no'}`;
    const answered = answer
      ? ` -> ${answer.choiceId}` +
        (entry.risk
          ? ` (risk ${entry.risk.toFixed(2)}, roll ${entry.riskRoll?.toFixed(3)}: ` +
            `${answer.hit ? 'HIT' : 'fine'})`
          : '')
      : '';
    write(
      `  event ${entry.eventId} (leg ${entry.leg}, day ${entry.day.toFixed(1)}): ${what}${answered}`,
    );
  }
  write(
    `  ${pad('gate', 7)} ${pad('day', 6)} ${pad('fuel', 5)} ${pad('O2', 6)} ${pad('water', 6)} ` +
      `${pad('food', 6)} ${pad('power', 6)} ${pad('heat', 5)}  forecast of the next leg`,
  );
  let previous: LegForecast | null = null;
  for (const row of run.gates) {
    const v = row.values;
    const check = previous ? forecastCheck(previous, row, voyage) : '';
    write(
      `  ${pad(gates[row.gate].body, 7)} ${pad(row.day.toFixed(1), 6)} ${pad(v.fuel.toFixed(2), 5)} ` +
        `${pad(v.oxygen.toFixed(1), 6)} ${pad(v.water.toFixed(1), 6)} ${pad(v.food.toFixed(1), 6)} ` +
        `${pad(v.power.toFixed(1), 6)} ${pad(v.heat.toFixed(1), 5)}  ${forecastLine(row.forecast)}${check}`,
    );
    previous = row.forecast;
  }
  write(`  ${seededOutcome(run.outcome, run.realS)}`);
}

/** One forecast as the gate card would show it. */
function forecastLine(forecast: LegForecast | null): string {
  if (!forecast) return '(last gate: only Stop)';
  const stocks = FORECAST_STOCKS.map((id) => {
    const s = forecast.stocks[id];
    return `${id} ${s.now.toFixed(0)}->${s.onArrival.toFixed(0)} ${s.verdict.toUpperCase()}`;
  }).join(', ');
  const first = forecast.firstDepletion
    ? `; first out: ${forecast.firstDepletion.stock} day ${forecast.firstDepletion.day.toFixed(1)} ` +
      `(${(forecast.firstDepletion.legFraction * 100).toFixed(0)}% of the leg)`
    : '';
  return (
    `${gates[forecast.leg].body} in ${forecast.legDays.toFixed(1)} d, ` +
    `${forecast.charges.toFixed(2)} charges (${forecast.fuelNow.toFixed(2)}->` +
    `${forecast.fuelOnArrival.toFixed(2)})${notArriving(forecast)}, ` +
    `${forecast.verdict.toUpperCase()}: ${stocks}${first}`
  );
}

/** Why a forecast leg does not arrive: the drift (fuel short) or the give-up; '' if it does. */
function notArriving(forecast: LegForecast): string {
  if (forecast.drifts) {
    return (
      ` FUEL SHORT: drifts from day ${(forecast.driftDay ?? 0).toFixed(1)} ` +
      `(${((forecast.driftLegFraction ?? 0) * 100).toFixed(0)}% of the leg)`
    );
  }
  return forecast.gaveUp ? ' GAVE UP (not arrived after 4 plans)' : '';
}

/** Whether the forecast made at the previous gate came true at this one (no event on the leg). */
function forecastCheck(
  forecast: LegForecast,
  row: { gate: number; day: number; values: Record<string, number> },
  voyage: Voyage,
): string {
  if (forecast.leg !== row.gate) return '';
  const evented = voyage.log.some((e) => e.leg === row.gate && e.happened);
  const dayError = Math.abs(forecast.startDay + forecast.legDays - row.day);
  const o2Error = Math.abs(forecast.stocks.oxygen.onArrival - row.values.oxygen);
  const exact = dayError < 1e-6 && o2Error < 1e-6;
  if (evented) return ' [leg had an event: forecast not comparable]';
  return exact
    ? ' [forecast came true]'
    : ` [forecast OFF: day ${dayError.toExponential(1)}, O2 ${o2Error.toExponential(1)}]`;
}

function seededOutcome(outcome: VoyageOutcome | null, realS: number): string {
  if (!outcome) return `RESULT: gave up after ${realS.toFixed(0)} s of Run`;
  if (outcome.kind === 'landed') {
    return `RESULT: landed at ${outcome.body} (gate ${outcome.gate}) on day ${outcome.day.toFixed(1)}, ${realS.toFixed(0)} s of Run`;
  }
  const from = outcome.leg === 0 ? shipConfig.start.around : gates[outcome.leg - 1].body;
  const last = outcome.gate < 0 ? 'none' : gates[outcome.gate].body;
  return (
    `RESULT: died of ${outcome.cause} on day ${outcome.day.toFixed(1)}, leg ${from}->` +
    `${gates[outcome.leg].body} at ${(outcome.legFraction * 100).toFixed(0)}%, last gate ${last}`
  );
}
