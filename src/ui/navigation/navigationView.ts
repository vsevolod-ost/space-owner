import { bodyName } from '@/core/locale/names';
import { TODO, tr, type LocalText } from '@/core/locale/text';
import { DAY_S } from '@/core/simulation/constants';
import type { Telemetry } from '@/core/simulation/telemetry';
import type { Resource, SimulationSnapshot } from '@/core/simulation/types';
import { formatText } from '@/core/text/format';
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
 *
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

/**
 * Row names as shown; also the forecast rows' names (`forecastRows`), except fuel's. Max 8: the
 * room between the icon and the bar (9 glyphs) and the forecast's name column (`NAME_CHARS`),
 * less one for the gap before the bar or the amount. OWNER: script
 */
export const ROW_LABELS: Readonly<Record<RowId, LocalText>> = {
  oxygen: { en: 'OXYGEN', uk: TODO, max: 8 },
  supplies: { en: 'SUPPLIES', uk: TODO, max: 8 },
  power: { en: 'POWER', uk: TODO, max: 8 },
  fuel: { en: 'FUEL', uk: TODO, max: 8 },
  heat: { en: 'HEAT', uk: TODO, max: 8 },
  comms: { en: 'COMMS', uk: TODO, max: 8 },
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

/**
 * Names of the link levels (GDD `res-comms`). Max 10: the row's value (12 characters) holds the
 * name, a space and the trend arrow. OWNER: script
 */
const COMMS_NAMES: Readonly<Record<CommsLevel, LocalText>> = {
  ok: { en: 'OK', uk: TODO, max: 10 },
  weak: { en: 'Weak', uk: TODO, max: 10 },
  lost: { en: 'Lost', uk: TODO, max: 10 },
};
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

  const days = (id: RowId, resources: readonly Resource[], stocks: readonly FlowId[]): RowView => {
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
  let heatLevel: Level = heat === 'cold' ? 'low' : 'normal';
  if (heat === 'freezing' || (alarmed('heat') && cooling)) heatLevel = 'critical';
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
      value: formatText(tr(STATE_VALUE), {
        state: tr(HEAT_NAMES[heat]),
        arrow: trendArrow(heatTrend),
      }),
      fraction: fractionOf(r.heat),
      level: heatLevel,
    },
    comms: {
      value: formatText(tr(STATE_VALUE), {
        state: tr(COMMS_NAMES[now]),
        arrow: next === null ? '→' : trendArrow(COMMS_RANK[next] - COMMS_RANK[now]),
      }),
      fraction: COMMS_RANK[now] / 2,
      // The link is never critical (GDD `ux-alerts`): Weak and Lost are only low.
      level: now === 'ok' ? 'normal' : 'low',
    },
  };
}

/**
 * The status at the top of the column, an id (smoke compares it; `debugInfo().status`); the
 * word shown is `STATUS_LABELS`.
 */
export type Status = 'RUN' | 'HOLD' | 'DRIFTING' | 'LOST' | 'LANDED' | 'OFFLINE';

/**
 * The status words as shown. Max 12: title glyphs (16 px) on the column's first row, which
 * also holds the day at its right. OWNER: script
 */
export const STATUS_LABELS: Readonly<Record<Status, LocalText>> = {
  RUN: { en: 'RUN', uk: TODO, max: 12 },
  HOLD: { en: 'HOLD', uk: TODO, max: 12 },
  DRIFTING: { en: 'DRIFTING', uk: TODO, max: 12 },
  LOST: { en: 'LOST', uk: TODO, max: 12 },
  LANDED: { en: 'LANDED', uk: TODO, max: 12 },
  OFFLINE: { en: 'OFFLINE', uk: TODO, max: 12 },
};

/**
 * The status word: OFFLINE before the voyage, LANDED or LOST after it, DRIFTING out of fuel,
 * RUN while time runs on a leg (the navigation panel open, nothing else holding it), HOLD
 * otherwise (a gate, an event, the pause menu, a hidden tab).
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

/** Text colour of a status word (`theme.ship`: the ship art's palette). */
export function statusColor(status: Status): string {
  return theme.ship.status[status];
}

/** Text colour of a level. */
export function levelColor(level: Level): string {
  return theme.ship.levelText[level];
}

/**
 * Bar colour of a resource: always its icon's colour. The state (low / critical) is shown by
 * `levelFrame` and the value's text colour, so a bar never changes into another resource's hue.
 */
export function resourceBarColor(id: RowId): number {
  return theme.ship.resourceBar[id];
}

/** Frame colour of a bar: hull steel when normal, amber when low, alarm red when critical. */
export function levelFrame(level: Level): number {
  return theme.ship.levelFrame[level];
}

/** Day of the voyage as shown (from 1) for simulated day `day` (from 0). */
export function shownDay(day: number): number {
  return Math.floor(day) + 1;
}

/** Simulated seconds to the shown day number. */
export function dayOfTime(timeS: number): number {
  return shownDay(timeS / DAY_S);
}

/**
 * Days of stock: `{days}` the number. Shown in a row's value (12 characters) and a forecast
 * amount (`AMOUNT_CHARS`, 6). OWNER: script
 */
// budget: 6 chars with the number ("123 d")
const DAYS: LocalText = { en: '{days} d', uk: TODO };

/** Days of stock, rounded down (GDD `ux-panel-layout`: stock down, ETA up). */
export function daysText(days: number): string {
  return formatText(tr(DAYS), { days: Math.max(0, Math.floor(days)) });
}

/** A state row's value: `{state}` the state's name, `{arrow}` its trend. OWNER: script */
// budget: 12 chars, the row's value ("Freezing ↓")
const STATE_VALUE: LocalText = { en: '{state} {arrow}', uk: TODO };

/**
 * The telemetry lines (`telemetryLines`): `{mass}` tonnes, `{arrow}` the trend of `{rate}`
 * kg/s, `{accel}` m/s²; `{g}` m/s², `{body}` the body escaped from, `{escape}` km/s.
 * OWNER: script - the words and units.
 */
// budget: 37 chars each, the column's width ("Mass 160.6t ↓0.07kg/s · a 0.012m/s²"); no room to
// grow: keep units as short as in English (pseudo, which doubles their letters, runs over here)
const TELEMETRY: Readonly<Record<'mass' | 'gravity', LocalText>> = {
  mass: { en: 'Mass {mass}t {arrow}{rate}kg/s · a {accel}m/s²', uk: TODO },
  gravity: { en: 'g {g}m/s² · v_esc {body} {escape}km/s', uk: TODO },
};

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
  const escape = bodyName(t.escapeBody);
  const escapeName = escape ? tr(escape) : t.escapeBody;
  return [
    formatText(tr(TELEMETRY.mass), {
      mass: tonnesText(t.massKg),
      arrow: trendArrow(rate),
      rate: Math.abs(rate).toFixed(2),
      accel: t.accelMS2.toFixed(3),
    }),
    formatText(tr(TELEMETRY.gravity), {
      g,
      body: escapeName,
      escape: kmPerSText(t.escapeMS),
    }),
  ];
}

/** The FUEL row's value: `{tonnes}` of fuel, `{dv}` km/s they give. OWNER: script */
// budget: 12 chars, the row's room (plan variable-mass K14): "31.9t Δv8.6"
const FUEL_VALUE: LocalText = { en: '{tonnes}t Δv{dv}', uk: TODO };

/**
 * The FUEL row's value (plan variable-mass D6): tonnes of fuel and the delta-v they give at
 * the ship's mass now, "31.9t Δv8.6".
 */
export function fuelText(kg: number, dvMS: number): string {
  return formatText(tr(FUEL_VALUE), { tonnes: tonnesText(kg), dv: kmPerSText(dvMS) });
}

/** Cabin warmth as a state, an id (`HEAT_NAMES` are the words). */
export type HeatState = 'normal' | 'cold' | 'freezing';

/**
 * Names of the cabin warmth's states: in the HEAT row with the trend arrow and as the forecast's
 * amounts. Max 8: a forecast row with both amounts and a verdict fills the card's 37 (9 + 8 +
 * 3 + 8 + 1 + `VERDICT_WORD` 8). OWNER: script
 */
const HEAT_NAMES: Readonly<Record<HeatState, LocalText>> = {
  normal: { en: 'Normal', uk: TODO, max: 8 },
  cold: { en: 'Cold', uk: TODO, max: 8 },
  freezing: { en: 'Freezing', uk: TODO, max: 8 },
};

/** Cabin warmth as a state: full normal, at least half cold, under half freezing. */
export function heatState(heat: Resource | { value: number; max: number }): HeatState {
  if (heat.value >= heat.max) return 'normal';
  return heat.value >= heat.max / 2 ? 'cold' : 'freezing';
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

/** Names of the forecast's stocks in warnings (`{stock}`, nominative). OWNER: script */
const STOCK_NAMES: Readonly<Record<FlowId, LocalText>> = {
  oxygen: { en: 'Oxygen', uk: TODO },
  water: { en: 'Water', uk: TODO },
  food: { en: 'Food', uk: TODO },
  power: { en: 'Power', uk: TODO },
  heat: { en: 'Cabin warmth', uk: TODO },
};

/**
 * The verdict after a forecast row (none when ok). Max 8: what the card's width (37) leaves
 * after the name and both amounts of the heat row (`HEAT_NAMES`). OWNER: script
 */
const VERDICT_WORD: Readonly<Record<ForecastVerdict, LocalText | null>> = {
  ok: null,
  tight: { en: 'TIGHT', uk: TODO, max: 8 },
  short: { en: 'SHORT', uk: TODO, max: 8 },
};

const VERDICT_LEVEL: Readonly<Record<ForecastVerdict, Level>> = {
  ok: 'normal',
  tight: 'low',
  short: 'critical',
};

/** Width of a forecast row's name and of its amounts, characters. */
const NAME_CHARS = 9;
const AMOUNT_CHARS = 6;

/** The forecast block's column names, each over an amount (`AMOUNT_CHARS`). OWNER: script */
const FORECAST_COLUMNS: Readonly<Record<'now' | 'arrive', LocalText>> = {
  now: { en: 'NOW', uk: TODO, max: AMOUNT_CHARS },
  arrive: { en: 'ARRIVE', uk: TODO, max: AMOUNT_CHARS },
};

/** The fuel row's name in the forecast (the others are `ROW_LABELS`). OWNER: script */
// max 8: the name column less the gap before the amount, as `ROW_LABELS`
const FORECAST_FUEL: LocalText = { en: 'FUEL t', uk: TODO, max: 8 };

/** The forecast block's heading: column names over `forecastRows`. */
export function forecastHeading(): string {
  const now = tr(FORECAST_COLUMNS.now).padStart(AMOUNT_CHARS);
  const arrive = tr(FORECAST_COLUMNS.arrive).padStart(AMOUNT_CHARS);
  return `${''.padEnd(NAME_CHARS)}${now}   ${arrive}`;
}

/**
 * The forecast rows of the gate card (GDD D15: exact amounts now and on arrival): fuel in
 * tonnes, oxygen, supplies, power in days, heat as a state; each with its verdict.
 * `heatMax`: the cabin warmth's full amount (for the state names).
 */
export function forecastRows(f: LegForecast, heatMax: number): ForecastLine[] {
  const row = (name: LocalText, now: string, then: string, verdict: ForecastVerdict) => {
    const word = VERDICT_WORD[verdict];
    return {
      text:
        `${tr(name).padEnd(NAME_CHARS)}${now.padStart(AMOUNT_CHARS)} → ` +
        `${then.padStart(AMOUNT_CHARS)}${word ? ` ${tr(word)}` : ''}`,
      level: VERDICT_LEVEL[verdict],
    };
  };
  const s = f.stocks;
  const supplies = worseVerdict(s.water.verdict, s.food.verdict);
  const d = (value: number) => daysText(value);
  const warmth = (value: number) => tr(HEAT_NAMES[heatState({ value, max: heatMax })]);
  return [
    row(FORECAST_FUEL, tonnesText(f.fuelNowKg), tonnesText(f.fuelOnArrivalKg), f.fuelVerdict),
    row(ROW_LABELS.oxygen, d(s.oxygen.now), d(s.oxygen.onArrival), s.oxygen.verdict),
    row(
      ROW_LABELS.supplies,
      d(Math.min(s.water.now, s.food.now)),
      d(Math.min(s.water.onArrival, s.food.onArrival)),
      supplies,
    ),
    row(ROW_LABELS.power, d(s.power.now), d(s.power.onArrival), s.power.verdict),
    row(ROW_LABELS.heat, warmth(s.heat.now), warmth(s.heat.onArrival), s.heat.verdict),
  ];
}

/**
 * Delta-v the leg needs against what the fuel gives (plan variable-mass D6, D21):
 * "Δv need 6.5, have 8.3 km/s" (need: the slowest allowed transfer with the autopilot's
 * reserve, `LegForecast.dvNeedMS`); "need >5.7" when the forecast has no number (a leg other
 * than a transfer that would drift). Need over have is tight or short: the flight decides which
 * (the line takes the fuel verdict's colour).
 */
export function dvLine(f: LegForecast): ForecastLine {
  const have = kmPerSText(f.dvNowMS);
  const need = f.dvNeedMS === null ? `>${have}` : kmPerSText(f.dvNeedMS);
  return {
    text: formatText(tr(DV_LINE), { need, have }),
    level: VERDICT_LEVEL[f.fuelVerdict],
  };
}

/** The delta-v line: `{need}` km/s ("6.5" or ">5.7"), `{have}` km/s. OWNER: script */
// budget: 37 chars, the card's width ("Δv need 6.5, have 8.3 km/s")
const DV_LINE: LocalText = { en: 'Δv need {need}, have {have} km/s', uk: TODO };

/**
 * The leg line: `{days}` the leg's length, `{day}` the shown arrival day; `planned` when the
 * forecast does not arrive. OWNER: script
 */
// budget: 37 chars, the card's width ("Leg 41 d, arrive day 53")
const LEG_LINE: Readonly<Record<'arrives' | 'planned', LocalText>> = {
  arrives: { en: 'Leg {days} d, arrive day {day}', uk: TODO },
  planned: { en: 'Leg {days} d planned', uk: TODO },
};

/** The leg's length and arrival day: "Leg 41 d, arrive day 53". */
export function legLine(f: LegForecast): string {
  const days = Math.ceil(f.legDays);
  if (!f.arrives) return formatText(tr(LEG_LINE.planned), { days });
  return formatText(tr(LEG_LINE.arrives), { days, day: shownDay(f.startDay + f.legDays) });
}

/**
 * The gate card's warnings (`forecastWarning`): `{target}` the next gate's name, `{day}` a shown
 * day, `{stock}` a `STOCK_NAMES` entry. They wrap. OWNER: script
 */
const WARNINGS: Readonly<
  Record<'gaveUp' | 'driftOnDay' | 'drift' | 'runsOut' | 'tight', LocalText>
> = {
  gaveUp: { en: 'The autopilot finds no way to {target}.', uk: TODO },
  driftOnDay: {
    en: 'NOT ENOUGH FUEL: the ship drifts on day {day} and the crew is lost.',
    uk: TODO,
  },
  drift: { en: 'NOT ENOUGH FUEL: the ship drifts and the crew is lost.', uk: TODO },
  runsOut: { en: '{stock} runs out on day {day} (x on the map).', uk: TODO },
  tight: { en: 'Tight: little is left on arrival.', uk: TODO },
};

/**
 * The gate card's warning (D6: the fuel shortage must be explicit): the drift, else the first
 * stock to run out, else a tight forecast; null when all is well.
 */
export function forecastWarning(f: LegForecast, target: string): ForecastLine | null {
  if (f.gaveUp) return { text: formatText(tr(WARNINGS.gaveUp), { target }), level: 'critical' };
  if (f.fuelShort) {
    return {
      text:
        f.driftDay === null
          ? tr(WARNINGS.drift)
          : formatText(tr(WARNINGS.driftOnDay), { day: shownDay(f.driftDay) }),
      level: 'critical',
    };
  }
  if (f.firstDepletion) {
    const { stock, day } = f.firstDepletion;
    return {
      text: formatText(tr(WARNINGS.runsOut), { stock: tr(STOCK_NAMES[stock]), day: shownDay(day) }),
      level: 'critical',
    };
  }
  if (f.verdict === 'tight') return { text: tr(WARNINGS.tight), level: 'low' };
  return null;
}

/**
 * The alarms' toast and log lines by death cause: `{days}` the time left (`daysText`); an
 * unknown cause shows `UNKNOWN_ALARM` with its id. They wrap. OWNER: script
 */
const ALARMS: Readonly<Record<string, LocalText>> = {
  hypoxia: { en: 'ALARM: oxygen ends in {days}', uk: TODO },
  dehydration: { en: 'ALARM: water ends in {days}', uk: TODO },
  starvation: { en: 'ALARM: food ends in {days}', uk: TODO },
  frozen: { en: 'ALARM: cabin freezes in {days}', uk: TODO },
  drift: { en: 'ALARM: out of fuel, drifting', uk: TODO },
};

/** The alarm of a cause without an `ALARMS` line: `{cause}` its id. OWNER: script */
const UNKNOWN_ALARM: LocalText = { en: 'ALARM: {cause}', uk: TODO };

/** The toast and log line of an alarm (plan D14) for death `cause`, `days` simulated days away. */
export function alarmText(cause: string, days: number): string {
  if (Object.hasOwn(ALARMS, cause)) return formatText(tr(ALARMS[cause]), { days: daysText(days) });
  return formatText(tr(UNKNOWN_ALARM), { cause });
}

/**
 * Death causes as the panel shows them (plan uk-localization D17: the same words as before the
 * pairs; the debrief has its own table). Nominative. OWNER: script
 */
// max 16 chars: the column's "Lost: {cause}, day {day}" (NavigationScene, 37 chars) keeps about
// 21 for the rest of a translated line with a 3-digit day
const CAUSE_LABELS: Readonly<Record<string, LocalText>> = {
  hypoxia: { en: 'hypoxia', uk: TODO, max: 16 },
  dehydration: { en: 'dehydration', uk: TODO, max: 16 },
  starvation: { en: 'starvation', uk: TODO, max: 16 },
  frozen: { en: 'frozen', uk: TODO, max: 16 },
  drift: { en: 'drift', uk: TODO, max: 16 },
  'event:hull-breach': { en: 'hull-breach', uk: TODO, max: 16 },
  'event:asteroid-belt': { en: 'asteroid-belt', uk: TODO, max: 16 },
  'event:reactor-failure': { en: 'reactor-failure', uk: TODO, max: 16 },
  'event:dusty-panels': { en: 'dusty-panels', uk: TODO, max: 16 },
  'event:lost-signal': { en: 'lost-signal', uk: TODO, max: 16 },
  'event:solar-flare': { en: 'solar-flare', uk: TODO, max: 16 },
  'event:greenhouse-leak': { en: 'greenhouse-leak', uk: TODO, max: 16 },
};

/** A death cause as shown: its `CAUSE_LABELS` entry, else the id ("event:x" without "event:"). */
export function causeText(cause: string): string {
  if (Object.hasOwn(CAUSE_LABELS, cause)) return tr(CAUSE_LABELS[cause]);
  return cause.startsWith('event:') ? cause.slice('event:'.length) : cause;
}
