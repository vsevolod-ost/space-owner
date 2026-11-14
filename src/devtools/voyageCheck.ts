/**
 * `npm run voyage-check`: flies the whole voyage headless (Node, no browser) with the game's own
 * `Simulation` and prints a table per leg - simulated days, real seconds of Run at the current
 * time-scale constants, the miss at capture, delta-v against `dvBudget`, the mode - and checks
 * the autopilot's convergence criteria (docs/HOWTO-simulation.md, plan variable-mass D19):
 * every leg arrives within 20 % over its delta-v plan (`dvPlan`: the share of the fuel's
 * delta-v it may spend, at most of `dvBudget`) and in time - a straight leg (the Moon) within
 * 1.5x its brachistochrone time, a transfer leg (a gate body that orbits the Sun: Mars) within
 * 1.1x the transfer time its plan affords by an independent Lambert scan from the leg's start
 * (`transferReference`, D20) - also with the gate body's phase shifted by +-0.3 rad (physics
 * legs only: a rail leg follows its script whatever the phases, so its rows are n/a); and the
 * whole voyage, also with a leg's phase shifted, within 300 simulated days (D8). Exits
 * non-zero if a gate is not reached or a criterion fails. The flights are forecast copies
 * (`Simulation.forecastCopy`): nobody dies, so the check is of the flight, not of survival
 * (the life support of a long transfer is balance, `npm run balance`).
 *
 * The flight table uses `--fuel <n>` fuel crates (default 3, with the base's tank) and the
 * table's life support; `--no-robust` skips the phase-shift runs.
 *
 * `--check` with `--loadout <spec>` (repeatable) runs the same table and criteria for each of
 * those loadouts instead (plan variable-mass S4: the flight depends on the mass, D20) and ends
 * with every loadout's start mass, acceleration, delta-v and day of arrival at each gate, and
 * the D20 order: of two loadouts with the same fuel, the lighter must reach the last gate no
 * later than the heavier (`ARRIVAL_TOLERANCE_D`), and strictly earlier when the heavier one's
 * plan is short of its `dvBudget` on some leg (its fuel, not the budget, sets its speed).
 *
 * `--loadout <spec>` (repeatable, `fuel:1,supplies:1,battery:1,solar:1`; `base` for nothing
 * but the built-in base) without `--check` flies the voyage with that cargo, crew aboard,
 * pressing Go on at every gate, and prints the stocks at each gate and how it ended: landed at
 * the last gate, or the cause of death, where, and how long before it the alarm came on (D14).
 * No pass/fail.
 *
 * `--seed <n>` (repeatable) flies voyages with the events on the way (src/content/voyage/events)
 * rolled with that seed, as the game does with `run.seed` (plan D10): for every `--loadout`
 * (default: the two smoke loadouts, `SMOKE_LOADOUTS`) it runs "Go on to the end" and "Stop at
 * <gate>" (`--stop <body>`, default mars), answering every card with its first enabled choice
 * (`--choice <index>` for another). It prints every roll, the stocks and the forecast of the
 * next leg at each gate (and whether the forecast came true on legs without an event), and how
 * the voyage ended; then the same voyage once more to show one seed flies the same.
 *
 * `--all` runs the loadout sweep (plan S12, `voyageSweep.ts`): every hold of at most 7 bays,
 * each on its own voyage (its mass and fuel set the flight, plan variable-mass S6), without
 * events and with 20 seeds; writes one CSV line per loadout to `tools/out/voyage-sweep.csv`
 * (start mass and delta-v, range, death cause, fuel at each gate, colony tier per body,
 * survival with events, dominance), prints how many loadouts reach each gate, and checks the
 * evaluator against the game's `Voyage` on a sample (exits non-zero if they disagree). The
 * balance invariants over the same sweep: `npm run balance` (src/devtools/balance.ts).
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
import { AUTOPILOT, brachistochroneTime } from '@/core/simulation/autopilot';
import { DAY_S } from '@/core/simulation/constants';
import { solveLambert } from '@/core/simulation/lambert';
import { Simulation } from '@/core/simulation/Simulation';
import { SolarSystem } from '@/core/simulation/SolarSystem';
import type { Body, SimulationSnapshot } from '@/core/simulation/types';
import { FORECAST_STOCKS, type LegForecast } from '@/core/voyage/forecast';
import { loadoutOf } from '@/core/voyage/loadout';
import type { Loadout } from '@/core/voyage/types';
import { startMassKg } from '@/core/voyage/mass';
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
import { runSweep, sweepCsv, sweepSummary } from '@/devtools/voyageSweep';

/**
 * Convergence criteria of the autopilot (plan S5, "open experiments"; plan variable-mass D19).
 * A straight leg's time against its brachistochrone; a transfer leg's against the transfer its
 * delta-v plan affords (`transferReference`: the brachistochrone would say nothing of a coast
 * of months, and the autopilot's own planned arrival would only compare it with itself).
 * Delta-v against the leg's plan (`dvPlan`). OWNER: physics - with the autopilot's tuning
 * (docs/HOWTO-simulation.md).
 */
const MAX_TIME_RATIO = 1.5;
const MAX_TRANSFER_TIME_RATIO = 1.1;
const MAX_OVERSPEND = 0.2;
const PHASE_SHIFT_RAD = 0.3;
/** The whole voyage, simulated days at most (plan variable-mass D8). OWNER: design */
const MAX_VOYAGE_DAYS = 300;
/**
 * `--check`, D20 order: of two loadouts with the same fuel, the lighter may reach the last gate
 * at most this many days after the heavier (both at their `dvBudget`: the same plan, the same
 * transfer; the heavier only burns more fuel).
 */
const ARRIVAL_TOLERANCE_D = 1;
/** Transfer reference scan: step of the arrival times tried, s (then bisection rounds). */
const REFERENCE_STEP_S = DAY_S;
const REFERENCE_ITERATIONS = 20;
/** Fuel crates of the flight table (3, besides the base's tank). */
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
/** Kilograms of fuel a loadout starts with. */
const fuelKgOf = (loadout: Loadout) =>
  loadout.entries.reduce((sum, entry) => sum + (entry.def.start?.fuel ?? 0) * entry.count, 0);
/** Kilograms as tonnes for the tables. */
const tonnes = (kg: number) => (kg / 1000).toFixed(1);

/**
 * Brachistochrone time of a leg, s: straight distance seen from the body the leg leaves, at the
 * engine's acceleration on the ship's mass when the leg begins (the ship gets lighter on the
 * way, so this is a little slower than the best possible).
 */
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
  return brachistochroneTime(distance, shipConfig.thrustN / start.ship.massKg);
}

interface Verdict {
  /** Simulated time of the leg over its reference (`reference`). */
  ratio: number;
  /** Delta-v spent over the leg's plan (`dvPlan` when it began), minus 1. */
  overspend: number;
  ok: boolean;
}

/** Whether leg `leg` is a transfer (its gate body orbits the Sun: a Lambert arc, D20). */
const isTransfer = (system: SolarSystem, leg: number) =>
  system.get(gates[leg].body).parent === undefined;

/**
 * Lambert delta-v of a transfer leaving `start` now and reaching leg `leg`'s gate body
 * `durationS` later, m/s - computed here, apart from the autopilot (D19): impulses on a Lambert
 * arc around the Sun (the system's root), the arrival matching the body's velocity, the
 * departure by patched conics from inside the planet's gravity. Leaving a moon (the Moon),
 * the ship starts with the moon's velocity around the planet (its own parking orbit is left
 * out: the autopilot waits for the side of it that helps); leaving the planet itself, with
 * its own speed against it pointing the right way. Infinity when there is no arc.
 */
function transferDvFrom(
  system: SolarSystem,
  leg: number,
  start: SimulationSnapshot,
  durationS: number,
): number {
  const root = system.bodies[0];
  const target = system.get(gates[leg].body);
  const arrivalS = start.timeS + durationS;
  // Relative to the Sun (it sits at the origin, but this does not lean on it).
  const s0 = system.positionOf(root, start.timeS);
  const sv0 = system.velocityOf(root, start.timeS);
  const s1 = system.positionOf(root, arrivalS);
  const sv1 = system.velocityOf(root, arrivalS);
  const p = system.positionOf(target, arrivalS);
  const v = system.velocityOf(target, arrivalS);
  const arc = solveLambert(
    start.ship.x - s0.x,
    start.ship.y - s0.y,
    p.x - s1.x,
    p.y - s1.y,
    durationS,
    system.gm[0],
    root.radiusM,
  );
  if (!arc) return Number.POSITIVE_INFINITY;
  const arrive = Math.hypot(v.x - sv1.x - arc.v2x, v.y - sv1.y - arc.v2y);
  // The planet (a body around the Sun) the ship leaves from: the start body or its parent.
  const leaving = system.get(leg === 0 ? shipConfig.start.around : gates[leg - 1].body);
  const planet = leaving.parent === undefined ? leaving : system.get(leaving.parent);
  const pp = system.positionOf(planet, start.timeS);
  const pv = system.velocityOf(planet, start.timeS);
  const ex = arc.v1x - (pv.x - sv0.x);
  const ey = arc.v1y - (pv.y - sv0.y);
  const excess = Math.hypot(ex, ey);
  const gm = system.gm[system.indexOf(planet.id)];
  if (leaving === planet) {
    const r = Math.hypot(start.ship.x - pp.x, start.ship.y - pp.y);
    const own = Math.hypot(start.ship.vx - pv.x, start.ship.vy - pv.y);
    return Math.max(0, Math.sqrt(excess * excess + (2 * gm) / r) - own) + arrive;
  }
  const lp = system.positionOf(leaving, start.timeS);
  const lv = system.velocityOf(leaving, start.timeS);
  const speed = Math.sqrt(excess * excess + (2 * gm) / Math.hypot(lp.x - pp.x, lp.y - pp.y));
  if (excess === 0) return speed + arrive;
  const depart = Math.hypot(
    (ex / excess) * speed - (lv.x - pv.x),
    (ey / excess) * speed - (lv.y - pv.y),
  );
  return depart + arrive;
}

/**
 * Reference time of a transfer leg that began at `start`, s (D19, D20): the earliest arrival
 * of the autopilot's window (`AUTOPILOT.minTransferS` .. `maxTransferS`, a design limit, plan
 * D8) whose Lambert delta-v from the leg's start (`transferDvFrom`) fits the leg's plan
 * (`dvPlan`, from the fuel and the budget); with none, the cheapest of the window. Scanned
 * every `REFERENCE_STEP_S`, then bisected - none of the autopilot's own choice goes in.
 */
function transferReference(system: SolarSystem, leg: number, start: SimulationSnapshot) {
  const plan = start.autopilot.dvPlan;
  const dvAt = (t: number) => transferDvFrom(system, leg, start, t);
  let previous = AUTOPILOT.minTransferS;
  let cheapest = { timeS: previous, dv: dvAt(previous) };
  if (cheapest.dv <= plan) return previous;
  for (let t = previous + REFERENCE_STEP_S; t <= AUTOPILOT.maxTransferS; t += REFERENCE_STEP_S) {
    const dv = dvAt(t);
    if (dv <= plan) {
      let low = previous;
      let high = t;
      for (let i = 0; i < REFERENCE_ITERATIONS; i++) {
        const middle = (low + high) / 2;
        if (dvAt(middle) > plan) low = middle;
        else high = middle;
      }
      return high;
    }
    if (dv < cheapest.dv) cheapest = { timeS: t, dv };
    previous = t;
  }
  return cheapest.timeS;
}

/**
 * Reference time of a leg that began at `start`, s (D19): on a transfer leg the transfer its
 * plan affords (`transferReference`), else the brachistochrone.
 */
function reference(system: SolarSystem, leg: number, start: SimulationSnapshot, endS: number) {
  if (isTransfer(system, leg)) return transferReference(system, leg, start);
  return brachistochrone(system, leg, start, endS);
}

function judge(system: SolarSystem, leg: number, start: SimulationSnapshot, r: LegResult): Verdict {
  if (!r.arrived) return { ratio: Infinity, overspend: Infinity, ok: false };
  const ratio = r.simS / reference(system, leg, start, start.timeS + r.simS);
  const maxRatio = isTransfer(system, leg) ? MAX_TRANSFER_TIME_RATIO : MAX_TIME_RATIO;
  const overspend = r.dv / start.autopilot.dvPlan - 1;
  return { ratio, overspend, ok: ratio <= maxRatio && overspend <= MAX_OVERSPEND };
}

const pad = (text: string | number, width: number) => String(text).padStart(width);
const km = (ms: number) => (ms / 1000).toFixed(1);
const pct = (x: number) =>
  Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${(x * 100).toFixed(0)}%` : '-';

const system = new SolarSystem(solarSystem);

if (process.argv.includes('--all')) {
  process.exitCode = (await printSweep()) ? 0 : 1;
  process.exit();
}
const loadoutSpecs = options('--loadout');
const seeds = options('--seed');
if (seeds.length > 0) {
  printSeeded(seeds.map(Number), loadoutSpecs.length > 0 ? loadoutSpecs : SMOKE_LOADOUTS);
  process.exit(0);
}
if (process.argv.includes('--check') && loadoutSpecs.length > 0) {
  const summaries = loadoutSpecs.map((spec) =>
    checkFlight(loadoutOf(cargo, parseLoadout(spec)), `loadout ${spec || 'base'}`),
  );
  write('Loadouts (plan variable-mass D20: a lighter ship or more fuel flies a faster transfer)');
  for (const [i, summary] of summaries.entries()) {
    write(`  ${loadoutSpecs[i] || 'base'}: ${summary.line}${summary.failed ? '  FAILED' : ''}`);
  }
  write();
  const orderOk = checkOrder(summaries, loadoutSpecs);
  const failed = !orderOk || summaries.some((summary) => summary.failed);
  write();
  write(failed ? 'RESULT: FAILED' : 'RESULT: every loadout reached every gate within the criteria');
  process.exit(failed ? 1 : 0);
}
if (loadoutSpecs.length > 0) {
  for (const spec of loadoutSpecs) printVoyage(spec);
  process.exit(0);
}
const table = checkFlight(tableLoadout, `${fuelCrates} fuel crates and the table's life support`);
write(table.failed ? 'RESULT: FAILED' : 'RESULT: all gates reached within the criteria');
process.exitCode = table.failed ? 1 : 0;

/** What `checkFlight` found: whether a criterion failed, a one-line summary, the D20 data. */
interface FlightSummary {
  failed: boolean;
  line: string;
  fuelKg: number;
  startKg: number;
  /** Day of arrival at the last gate, or null if it was not reached. */
  lastDay: number | null;
  /** Whether some leg's delta-v plan was below its `dvBudget` share (the fuel set it). */
  fuelLimited: boolean;
}

/**
 * `--check`, D20 order: for every two loadouts with the same fuel and different masses, the
 * lighter reaches the last gate no later than the heavier (`ARRIVAL_TOLERANCE_D`), strictly
 * earlier if the heavier's plan was set by its fuel. Prints each pair; false if one fails.
 */
function checkOrder(summaries: FlightSummary[], specs: string[]): boolean {
  write(
    `D20 order (same fuel: the lighter arrives earlier, or within ${ARRIVAL_TOLERANCE_D} d ` +
      `when both fly at their dvBudget)`,
  );
  let ok = true;
  let pairs = 0;
  for (let i = 0; i < summaries.length; i++) {
    for (let j = i + 1; j < summaries.length; j++) {
      const [a, b] = [summaries[i], summaries[j]];
      if (Math.abs(a.fuelKg - b.fuelKg) >= 1 || Math.abs(a.startKg - b.startKg) < 1) continue;
      const [light, heavy, lightSpec, heavySpec] =
        a.startKg < b.startKg ? [a, b, specs[i], specs[j]] : [b, a, specs[j], specs[i]];
      pairs++;
      const day = (summary: FlightSummary) =>
        summary.lastDay === null ? 'not reached' : `day ${summary.lastDay.toFixed(1)}`;
      let pass: boolean;
      if (heavy.lastDay === null) pass = true;
      else if (light.lastDay === null) pass = false;
      else if (heavy.fuelLimited) pass = light.lastDay < heavy.lastDay;
      else pass = light.lastDay <= heavy.lastDay + ARRIVAL_TOLERANCE_D;
      ok &&= pass;
      write(
        `  ${lightSpec || 'base'} (${tonnes(light.startKg)} t) ${day(light)} vs ` +
          `${heavySpec || 'base'} (${tonnes(heavy.startKg)} t) ${day(heavy)}` +
          `${heavy.fuelLimited ? ', heavier one short of its budget: strictly earlier' : ''}: ` +
          `${pass ? 'ok' : 'FAIL'}`,
      );
    }
  }
  if (pairs === 0) write('  (no two loadouts with the same fuel)');
  return ok;
}

/**
 * The flight table of `loadout` (a forecast copy: nobody dies), then the robustness runs
 * (each physics leg again from its start with the gate body's phase shifted). Prints both.
 */
function checkFlight(loadout: Loadout, title: string): FlightSummary {
  const simulation = new Simulation(system, route, loadout).forecastCopy();
  const startKg = startMassKg(cargo, loadout);
  const dvStart = simulation.dvAvailable;
  write(
    `Voyage check (${title}): ${gates.length} gates, ${tonnes(fuelKgOf(loadout))} t of fuel ` +
      `(${km(dvStart)} km/s at Isp ${shipConfig.ispS} s), ${tonnes(startKg)} t at the start, ` +
      `${(shipConfig.thrustN / startKg).toFixed(4)} m/s^2; life support not checked`,
  );
  write(
    `Criteria: arrival <= ${MAX_TIME_RATIO}x brachistochrone time (transfer: ` +
      `${MAX_TRANSFER_TIME_RATIO}x the time its plan affords by Lambert from the leg's start), ` +
      `delta-v <= ${100 + MAX_OVERSPEND * 100}% of the plan, whole voyage <= ` +
      `${MAX_VOYAGE_DAYS} d; robustness: gate body phase +-${PHASE_SHIFT_RAD} rad`,
  );
  write();
  write(
    [
      pad('leg', 3),
      pad('gate', 7),
      pad('mode', 7),
      pad('sim d', 6),
      pad('ref d', 6),
      pad('x', 5),
      pad('Run s', 6),
      pad('appr s', 6),
      pad('capture m', 10),
      pad('radius m', 9),
      pad('dv km/s', 8),
      pad('plan', 5),
      pad('budget', 7),
      pad('over', 5),
      pad('fuel t', 6),
      '  ok',
    ].join(' '),
  );

  let failed = false;
  let reached = 0;
  let totalReal = 0;
  let totalSim = 0;
  let fuelLimited = false;
  let lastDay: number | null = null;
  const legSimS: number[] = [];
  const legRealS: number[] = [];
  const arrivals: string[] = [];
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
    legSimS.push(result.simS);
    legRealS.push(result.realS);
    fuelLimited ||= start.autopilot.dvPlan < AUTOPILOT.planFraction * legs[leg].dvBudget - 1;
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
        pad(km(start.autopilot.dvPlan), 5),
        pad(km(legs[leg].dvBudget), 7),
        pad(pct(verdict.overspend), 5),
        pad(tonnes(result.fuelLeft), 6),
        verdict.ok ? '  ok' : `  FAIL (${result.phase})`,
      ].join(' '),
    );
    arrivals.push(
      `${gates[leg].body} ${result.arrived ? `day ${(simulation.time / DAY_S).toFixed(1)}` : result.phase}` +
        ` (${km(result.dv)} km/s)`,
    );
    if (!result.arrived) {
      write(`Gate ${leg} (${gates[leg].body}) not reached: autopilot ${result.phase}`);
      break;
    }
    reached++;
    if (reached === gates.length) lastDay = simulation.time / DAY_S;
    parkedNow = simulation.snapshot();
    if (!simulation.departToNextGate() && leg < gates.length - 1) break;
  }
  write();
  const tooLong = totalSim / DAY_S > MAX_VOYAGE_DAYS;
  failed ||= tooLong;
  write(
    `Whole voyage: ${(totalSim / DAY_S).toFixed(0)} simulated days, ${totalReal.toFixed(0)} s of ` +
      `real Run (${(totalReal / 60).toFixed(1)} min) at the current time scale` +
      `${tooLong ? `  FAIL (over ${MAX_VOYAGE_DAYS} d, D8)` : ''}`,
  );

  if (robust && reached === gates.length) {
    write();
    write(
      `Robustness: each leg planned and flown again from its start, one body's phase shifted ` +
        `(whole: the voyage with that leg so, <= ${MAX_VOYAGE_DAYS} d, and its real Run)`,
    );
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
          const copy = new Simulation(shiftedSystem, route, before ?? loadout).forecastCopy();
          if (before) copy.departToNextGate();
          const start = copy.snapshot();
          const result = flyLeg(copy, leg);
          const verdict = judge(shiftedSystem, leg, start, result);
          const wholeD = (totalSim - legSimS[leg] + result.simS) / DAY_S;
          const wholeRealS = totalReal - legRealS[leg] + result.realS;
          const ok = verdict.ok && wholeD <= MAX_VOYAGE_DAYS;
          failed ||= !ok;
          cells.push(
            `${id} ${shift > 0 ? '+' : ''}${shift}: ${(result.simS / DAY_S).toFixed(1)} d ` +
              `x${verdict.ratio.toFixed(2)} dv ${km(result.dv)} ${pct(verdict.overspend)} ` +
              `whole ${wholeD.toFixed(0)} d ${wholeRealS.toFixed(0)} s${ok ? '' : ` FAIL (${result.phase})`}`,
          );
        }
      }
      write(`${pad(leg, 3)} ${pad(gates[leg].body, 7)}  ${cells.join(' | ')}`);
    }
  }
  write();
  const line =
    `${tonnes(startKg)} t, ${(shipConfig.thrustN / startKg).toFixed(4)} m/s^2, ` +
    `${km(dvStart)} km/s; ${arrivals.join(', ')}`;
  return { failed, line, fuelKg: fuelKgOf(loadout), startKg, lastDay, fuelLimited };
}

/**
 * `--all`: the loadout sweep (`voyageSweep.ts`) - CSV into `SWEEP_CSV`, the summary, the
 * cross-check against the game. False if the sweep does not match the game or a set's flight
 * gave up.
 */
async function printSweep(): Promise<boolean> {
  const sweep = await runSweep();
  mkdirSync(dirname(SWEEP_CSV), { recursive: true });
  writeFileSync(SWEEP_CSV, sweepCsv(sweep));
  for (const line of sweepSummary(sweep)) write(line);
  write(`CSV: ${SWEEP_CSV} (one line per loadout)`);
  write();
  const check = crossCheck(sweep);
  for (const line of crossCheckText(check)) write(line);
  return check.ok && sweep.rows.every((row) => row.outcome.kind !== 'gave up');
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
      pad('fuel t', 6),
      pad('dv km/s', 7),
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
        pad(tonnes(row.values.fuel), 6),
        pad(km(row.dvMS), 7),
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
    `  ${pad('gate', 7)} ${pad('day', 6)} ${pad('fuel t', 6)} ${pad('O2', 6)} ${pad('water', 6)} ` +
      `${pad('food', 6)} ${pad('power', 6)} ${pad('heat', 5)}  forecast of the next leg`,
  );
  let previous: LegForecast | null = null;
  for (const row of run.gates) {
    const v = row.values;
    const check = previous ? forecastCheck(previous, row, voyage) : '';
    write(
      `  ${pad(gates[row.gate].body, 7)} ${pad(row.day.toFixed(1), 6)} ${pad(tonnes(v.fuel), 6)} ` +
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
    `fuel ${tonnes(forecast.fuelBurntKg)} t (${tonnes(forecast.fuelNowKg)}->` +
    `${tonnes(forecast.fuelOnArrivalKg)}), dv need ` +
    `${forecast.dvNeedMS === null ? '-' : km(forecast.dvNeedMS)} have ${km(forecast.dvNowMS)} km/s` +
    `${notArriving(forecast)}, ` +
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
