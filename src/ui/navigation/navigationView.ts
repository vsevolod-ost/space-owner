import { DAY_S } from '@/core/simulation/constants';
import type { Telemetry } from '@/core/simulation/telemetry';
import type { Resource, SimulationSnapshot } from '@/core/simulation/types';
import { kmPerSText, tonnesText } from '@/core/text/units';
import {
  FORECAST_TIGHT_DAYS,
  worseVerdict,
  type ForecastVerdict,
  type LegForecast,
} from '@/core/voyage/forecast';
import type { CommsLevel, DeathCause, FlowId } from '@/core/voyage/types';
import type { VoyageOutcome, VoyagePhase } from '@/core/voyage/Voyage';
import { theme } from '@/ui/theme';

/**
 * What the navigation panel shows, as plain text and levels (plan S8, GDD `ux-panel-layout` B,
 * D12 `res-list`): the six resource rows, the status word, the forecast block of the gate card,
 * the alarm messages. Pure functions of the voyage's state; `NavigationScene` and its parts
 * draw them.
 * OWNER: script - every word shown from this file (row names, units, states, verdicts,
 * warnings, alarms); each such declaration is marked.
 */

/**
 * The panel's resource rows, top to bottom (GDD D12: four in days, fuel in tonnes with its
 * delta-v, two states).
 */
export const ROW_IDS = ['oxygen', 'supplies', 'power', 'fuel', 'heat', 'comms'] as const;

/** Id of a resource row. `supplies` is water and food together: the lower of the two. */
export type RowId = (typeof ROW_IDS)[number];

/** Row names as shown. OWNER: script */
export const ROW_LABELS: Readonly<Record<RowId, string>> = {
  oxygen: 'OXYGEN',
  supplies: 'SUPPLIES',
  power: 'POWER',
  fuel: 'FUEL',
  heat: 'HEAT',
  comms: 'COMMS',
};

/** Frame of each row's icon in the `panel-icons` sheet (art-order row 27, same order). */
export const ROW_ICONS: Readonly<Record<RowId, number>> = {
  oxygen: 0,
  supplies: 1,
  power: 2,
  fuel: 3,
  heat: 4,
  comms: 5,
};

/** How a row (or a forecast line) is coloured: normal, low (warn), critical (alarm). */
export type Level = 'normal' | 'low' | 'critical';

/** One resource row as shown. */
export interface RowView {
  /** Value text: "57 d", "31.9t Δv8.6", "Cold ↓", "Weak →". */
  value: string;
  /** Filled part of the bar, 0..1. */
  fraction: number;
  level: Level;
}

/** The deaths that turn a row red while their alarm is on (D14). */
const ROW_CAUSES: Readonly<Record<RowId, readonly DeathCause[]>> = {
  oxygen: ['hypoxia'],
  supplies: ['dehydration', 'starvation'],
  power: ['frozen'],
  fuel: ['drift'],
  heat: ['frozen'],
  comms: [],
};

/** Names of the link levels (GDD `res-comms`). OWNER: script */
const COMMS_NAMES: Readonly<Record<CommsLevel, string>> = { ok: 'OK', weak: 'Weak', lost: 'Lost' };
const COMMS_RANK: Readonly<Record<CommsLevel, number>> = { ok: 2, weak: 1, lost: 0 };

/** What `resourceRows` reads. */
export interface RowInputs {
  snapshot: SimulationSnapshot;
  /** The forecast of the leg flown now (its verdicts colour the rows low), or null. */
  forecast: LegForecast | null;
  /** Death causes whose alarm is on (`forecastLife`). */
  alarms: readonly string[];
  /** The ship drifts out of fuel (D13). */
  drifting: boolean;
  /** Delta-v the fuel gives now, m/s (`Simulation.dvAvailable`, plan variable-mass D6). */
  fuelDvMS: number;
  /** The link on this leg and on the next one (null: no next leg), for the trend arrow. */
  comms: { now: CommsLevel; next: CommsLevel | null };
}

/** The six resource rows (GDD D12, `ux-panel-layout` B). */
export function resourceRows(input: RowInputs): Record<RowId, RowView> {
  const { snapshot, forecast, alarms } = input;
  const r = snapshot.resources;
  const alarmed = (id: RowId) => ROW_CAUSES[id].some((cause) => alarms.includes(cause));
  const days = (id: RowId, resources: readonly Resource[], stocks: readonly FlowId[]) => {
    const value = Math.min(...resources.map((resource) => resource.value));
    const fraction = Math.min(...resources.map(fractionOf));
    let verdict: ForecastVerdict = 'ok';
    for (const stock of stocks) {
      verdict = worseVerdict(verdict, forecast?.stocks[stock].verdict ?? 'ok');
    }
    let level: Level = 'normal';
    if (alarmed(id) || value <= 0) level = 'critical';
    else if (verdict !== 'ok' || value < FORECAST_TIGHT_DAYS) level = 'low';
    return { value: daysText(value), fraction, level };
  };

  // Empty as shown ("0.0t"): red also after the voyage, when no alarm or forecast is left.
  const fuelEmpty = tonnesText(r.fuel.value) === '0.0';
  let fuelLevel: Level = 'normal';
  if (alarmed('fuel') || input.drifting || fuelEmpty || forecast?.fuelShort) fuelLevel = 'critical';
  else if (forecast && forecast.fuelVerdict !== 'ok') fuelLevel = 'low';

  const heat = heatState(r.heat);
  // The `frozen` alarm reddens the power row at once; the heat row once the cabin cools.
  const cooling = r.heat.value < r.heat.max;
  let heatLevel: Level = heat === 'Cold' ? 'low' : 'normal';
  if (heat === 'Freezing' || (alarmed('heat') && cooling)) heatLevel = 'critical';
  // A full cabin does not warm any further: steady, whatever the rate says.
  const heatTrend = !cooling && r.heat.ratePerS >= 0 ? 0 : r.heat.ratePerS;

  const { now, next } = input.comms;
  return {
    oxygen: days('oxygen', [r.oxygen], ['oxygen']),
    supplies: days('supplies', [r.water, r.food], ['water', 'food']),
    power: days('power', [r.power], ['power']),
    fuel: {
      value: fuelText(r.fuel.value, input.fuelDvMS),
      fraction: fractionOf(r.fuel),
      level: fuelLevel,
    },
    heat: {
      value: `${heat} ${trendArrow(heatTrend)}`,
      fraction: fractionOf(r.heat),
      level: heatLevel,
    },
    comms: {
      value: `${COMMS_NAMES[now]} ${next === null ? '→' : trendArrow(COMMS_RANK[next] - COMMS_RANK[now])}`,
      fraction: COMMS_RANK[now] / 2,
      // The link is never critical (GDD `ux-alerts`): Weak and Lost are only low.
      level: now === 'ok' ? 'normal' : 'low',
    },
  };
}

/** The status word at the top of the column, shown as is. OWNER: script - the words. */
export type Status = 'RUN' | 'HOLD' | 'DRIFTING' | 'LOST' | 'LANDED' | 'OFFLINE';

/**
 * The status word: OFFLINE before the voyage, LANDED or LOST after it, DRIFTING out of fuel,
 * RUN while time runs on a leg, HOLD otherwise (Hold mode, a gate, an event's card).
 */
export function statusOf(
  phase: VoyagePhase | null,
  run: boolean,
  outcome: VoyageOutcome | null,
): Status {
  if (phase === null) return 'OFFLINE';
  if (outcome) return outcome.kind === 'landed' ? 'LANDED' : 'LOST';
  if (phase === 'drifting') return 'DRIFTING';
  return run && phase === 'flying' ? 'RUN' : 'HOLD';
}

/** Text colour of a status word. */
export function statusColor(status: Status): string {
  switch (status) {
    case 'RUN':
    case 'LANDED':
      return theme.text.good;
    case 'HOLD':
      return theme.text.highlight;
    case 'DRIFTING':
    case 'LOST':
      return theme.text.alarm;
    case 'OFFLINE':
      return theme.text.dim;
  }
}

/** Text colour of a level. */
export function levelColor(level: Level): string {
  if (level === 'critical') return theme.text.alarm;
  return level === 'low' ? theme.text.warn : theme.text.normal;
}

/** Bar colour of a level. */
export function levelBar(level: Level): number {
  if (level === 'critical') return theme.bar.alarm;
  return level === 'low' ? theme.bar.warn : theme.bar.fill;
}

/** Day of the voyage as shown (from 1) for simulated day `day` (from 0). */
export function shownDay(day: number): number {
  return Math.floor(day) + 1;
}

/** Simulated seconds to the shown day number. */
export function dayOfTime(timeS: number): number {
  return shownDay(timeS / DAY_S);
}

/** Days of stock, rounded down (GDD `ux-panel-layout`: stock down, ETA up). OWNER: script */
export function daysText(days: number): string {
  return `${Math.max(0, Math.floor(days))} d`;
}

/**
 * The column's two telemetry lines (plan variable-mass D12, K14: at most 37 characters each,
 * no ṁ in the font): "Mass 160.6t ↓0.07kg/s · a 0.012m/s²" (mass, its rate with the
 * arrow of `trendArrow`, the engine's acceleration) and "g 0.0059m/s² · v_esc Sun 42.1km/s"
 * (local gravity; escape speed from the body that pulls hardest). Rounded so they do not
 * flicker from frame to frame. OWNER: script - the words and units; design - the precision.
 */
export function telemetryLines(t: Telemetry): [string, string] {
  const rate = Math.round(t.massRateKgPerS * 100) / 100;
  const g = t.gravityMS2 >= 1 ? t.gravityMS2.toFixed(2) : t.gravityMS2.toFixed(4);
  return [
    `Mass ${tonnesText(t.massKg)}t ${trendArrow(rate)}${Math.abs(rate).toFixed(2)}kg/s` +
      ` · a ${t.accelMS2.toFixed(3)}m/s²`,
    `g ${g}m/s² · v_esc ${t.escapeBody} ${kmPerSText(t.escapeMS)}km/s`,
  ];
}

/**
 * The FUEL row's value (plan variable-mass D6): tonnes of fuel and the delta-v they give at
 * the ship's mass now, "31.9t Δv8.6" (at most 12 characters: the row's room, K14).
 * OWNER: script
 */
export function fuelText(kg: number, dvMS: number): string {
  return `${tonnesText(kg)}t Δv${kmPerSText(dvMS)}`;
}

/**
 * Cabin warmth as a state: full Normal, at least half Cold, under half Freezing.
 * OWNER: script - the words (`resourceRows` compares them: rename there too).
 */
export function heatState(heat: Resource | { value: number; max: number }): string {
  if (heat.value >= heat.max) return 'Normal';
  return heat.value >= heat.max / 2 ? 'Cold' : 'Freezing';
}

/** ↑ rising, ↓ falling, → steady. */
function trendArrow(change: number): string {
  if (change > 0) return '↑';
  return change < 0 ? '↓' : '→';
}

function fractionOf(resource: Resource): number {
  return resource.max > 0 ? Math.min(1, Math.max(0, resource.value / resource.max)) : 0;
}

/** One line of the gate card's forecast block. */
export interface ForecastLine {
  text: string;
  level: Level;
}

/** Names of the forecast's stocks in warnings. OWNER: script */
const STOCK_NAMES: Readonly<Record<FlowId, string>> = {
  oxygen: 'Oxygen',
  water: 'Water',
  food: 'Food',
  power: 'Power',
  heat: 'Cabin warmth',
};

/** The verdict after a forecast row. OWNER: script */
const VERDICT_WORD: Readonly<Record<ForecastVerdict, string>> = {
  ok: '',
  tight: 'TIGHT',
  short: 'SHORT',
};

const VERDICT_LEVEL: Readonly<Record<ForecastVerdict, Level>> = {
  ok: 'normal',
  tight: 'low',
  short: 'critical',
};

/** Width of a forecast row's name and of its amounts, characters. */
const NAME_CHARS = 9;
const AMOUNT_CHARS = 6;

/** The forecast block's heading: column names over `forecastRows`. OWNER: script */
export function forecastHeading(): string {
  return `${''.padEnd(NAME_CHARS)}${'NOW'.padStart(AMOUNT_CHARS)}   ${'ARRIVE'.padStart(AMOUNT_CHARS)}`;
}

/**
 * The forecast rows of the gate card (GDD D15: exact amounts now and on arrival): fuel in
 * tonnes, oxygen, supplies, power in days, heat as a state; each with its verdict.
 * OWNER: script - the row names.
 * `heatMax`: the cabin warmth's full amount (for the state names).
 */
export function forecastRows(f: LegForecast, heatMax: number): ForecastLine[] {
  const row = (name: string, now: string, then: string, verdict: ForecastVerdict) => ({
    text:
      `${name.padEnd(NAME_CHARS)}${now.padStart(AMOUNT_CHARS)} → ${then.padStart(AMOUNT_CHARS)}` +
      (VERDICT_WORD[verdict] ? ` ${VERDICT_WORD[verdict]}` : ''),
    level: VERDICT_LEVEL[verdict],
  });
  const s = f.stocks;
  const supplies = worseVerdict(s.water.verdict, s.food.verdict);
  const d = (value: number) => daysText(value);
  const warmth = (value: number) => heatState({ value, max: heatMax });
  return [
    row('FUEL t', tonnesText(f.fuelNowKg), tonnesText(f.fuelOnArrivalKg), f.fuelVerdict),
    row('OXYGEN', d(s.oxygen.now), d(s.oxygen.onArrival), s.oxygen.verdict),
    row(
      'SUPPLIES',
      d(Math.min(s.water.now, s.food.now)),
      d(Math.min(s.water.onArrival, s.food.onArrival)),
      supplies,
    ),
    row('POWER', d(s.power.now), d(s.power.onArrival), s.power.verdict),
    row('HEAT', warmth(s.heat.now), warmth(s.heat.onArrival), s.heat.verdict),
  ];
}

/**
 * Delta-v the leg needs against what the fuel gives (plan variable-mass D6, D21):
 * "Δv need 6.5, have 8.3 km/s" (need: the slowest allowed transfer with the autopilot's
 * reserve, `LegForecast.dvNeedMS`); "need >5.7" when the forecast has no number (a leg other
 * than a transfer that would drift). Need over have is tight or short: the flight decides which
 * (the line takes the fuel verdict's colour).
 * OWNER: script
 */
export function dvLine(f: LegForecast): ForecastLine {
  const have = kmPerSText(f.dvNowMS);
  const need = f.dvNeedMS === null ? `>${have}` : kmPerSText(f.dvNeedMS);
  return {
    text: `Δv need ${need}, have ${have} km/s`,
    level: VERDICT_LEVEL[f.fuelVerdict],
  };
}

/** The leg's length and arrival day: "Leg 41 d, arrive day 53". OWNER: script */
export function legLine(f: LegForecast): string {
  const days = Math.ceil(f.legDays);
  if (!f.arrives) return `Leg ${days} d planned`;
  return `Leg ${days} d, arrive day ${shownDay(f.startDay + f.legDays)}`;
}

/**
 * The gate card's warning (D6: the fuel shortage must be explicit): the drift, else the first
 * stock to run out, else a tight forecast; null when all is well.
 * OWNER: script - the texts ("NOT ENOUGH FUEL...", "... runs out on day N", "Tight...").
 */
export function forecastWarning(f: LegForecast, target: string): ForecastLine | null {
  if (f.gaveUp) return { text: `The autopilot finds no way to ${target}.`, level: 'critical' };
  if (f.fuelShort) {
    const day = f.driftDay === null ? '' : ` on day ${shownDay(f.driftDay)}`;
    return {
      text: `NOT ENOUGH FUEL: the ship drifts${day} and the crew is lost.`,
      level: 'critical',
    };
  }
  if (f.firstDepletion) {
    const { stock, day } = f.firstDepletion;
    return {
      text: `${STOCK_NAMES[stock]} runs out on day ${shownDay(day)} (x on the map).`,
      level: 'critical',
    };
  }
  if (f.verdict === 'tight') return { text: 'Tight: little is left on arrival.', level: 'low' };
  return null;
}

/**
 * The toast and log line of an alarm (plan D14) for death `cause`, `days` simulated days away.
 * OWNER: script
 */
export function alarmText(cause: string, days: number): string {
  const d = daysText(days);
  switch (cause) {
    case 'hypoxia':
      return `ALARM: oxygen ends in ${d}`;
    case 'dehydration':
      return `ALARM: water ends in ${d}`;
    case 'starvation':
      return `ALARM: food ends in ${d}`;
    case 'frozen':
      return `ALARM: cabin freezes in ${d}`;
    case 'drift':
      return 'ALARM: out of fuel, drifting';
    default:
      return `ALARM: ${cause}`;
  }
}

/** A death cause as shown: "hypoxia", "drift", an event's id. */
export function causeText(cause: string): string {
  return cause.startsWith('event:') ? cause.slice('event:'.length) : cause;
}
