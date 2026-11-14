import { DAY_S } from '@/core/simulation/constants';
import type { Resources } from '@/core/simulation/types';
import type {
  CommsLevel,
  DeathCause,
  DeathForecast,
  FlowId,
  FlowRates,
  LegConditions,
  LifeState,
  Loadout,
} from '@/core/voyage/types';

/**
 * Real seconds of Run a ship drifts out of fuel before the crew is lost (D13: the alarm shows
 * all that time). OWNER: design
 */
export const DRIFT_DEATH_REAL_S = 3;
/**
 * The alarm (D14, GDD `death-catalog`): a death raises it when it is less than
 * `ALARM_SIM_DAYS` simulated days away, or at most `ALARM_REAL_S` real seconds of Run away -
 * whichever comes first, so no death comes without warning on a fast leg. The real seconds
 * are estimated at the pace the ship will have by then (`LifeForecastInput.realSecondsTo`):
 * the pace grows as the ship leaves a body (a death 3 s away at the current pace came 2.4 s
 * after the alarm). OWNER: design
 */
export const ALARM_SIM_DAYS = 10;
export const ALARM_REAL_S = 3;

/** Resources that flow per day, in the order of the death causes they bring. */
export const FLOW_IDS: readonly FlowId[] = ['oxygen', 'water', 'food', 'power', 'heat'];

/** `comms` resource value per link level (its `max` is 2). */
export const COMMS_VALUE: Readonly<Record<CommsLevel, number>> = { ok: 2, weak: 1, lost: 0 };

/** Which resource at 0 kills, in the order of `DeathCause` (power kills through `heat`). */
const DEATH_BY_RESOURCE: readonly { id: FlowId; cause: DeathCause }[] = [
  { id: 'oxygen', cause: 'hypoxia' },
  { id: 'water', cause: 'dehydration' },
  { id: 'food', cause: 'starvation' },
  { id: 'heat', cause: 'frozen' },
];

/** What `evaluateFlows` needs to know of the ship's living state. */
export interface FlowLive {
  /** Power stock above 0. */
  powered: boolean;
  /** Cargo ids that stopped working (`LifeState.offline`). */
  offline: readonly string[];
}

/**
 * The one formula of the resource model (D5): the change per simulated day of every flowing
 * resource, summed over the base and every item aboard (`flows` times copies), on a leg with
 * `leg`'s conditions, skipping items that stopped working. Pure: the simulation's tick, the
 * gate forecast (plan S7) and the balance tools all call it.
 */
export function evaluateFlows(
  loadout: Loadout,
  leg: LegConditions,
  live: FlowLive,
): Record<FlowId, number> {
  const total: Record<FlowId, number> = { oxygen: 0, water: 0, food: 0, power: 0, heat: 0 };
  const ctx = { ...leg, powered: live.powered };
  for (const entry of loadout.entries) {
    if (!entry.def.flows || live.offline.includes(entry.id)) continue;
    const rates: FlowRates = entry.def.flows(ctx);
    for (const id of FLOW_IDS) total[id] += (rates[id] ?? 0) * entry.count;
  }
  return total;
}

/**
 * Advances the ship's resources by `dtS` simulated seconds on a leg with `leg`'s conditions:
 * every flowing resource changes by its `evaluateFlows` rate (kept in `ratePerS`), within
 * 0..max; `comms` follows the leg; once power is at 0 every `needsPower` item goes offline for
 * good (the greenhouse dies). Changes `resources` and `life` in place.
 */
export function stepLife(
  resources: Resources,
  loadout: Loadout,
  leg: LegConditions,
  life: LifeState,
  dtS: number,
): void {
  const rates = evaluateFlows(loadout, leg, {
    powered: resources.power.value > 0,
    offline: life.offline,
  });
  for (const id of FLOW_IDS) {
    const resource = resources[id];
    resource.ratePerS = rates[id] / DAY_S;
    resource.value = Math.min(resource.max, Math.max(0, resource.value + resource.ratePerS * dtS));
  }
  resources.comms.value = COMMS_VALUE[leg.comms];
  resources.comms.ratePerS = 0;
  if (resources.power.value <= 0) {
    for (const entry of loadout.entries) {
      if (entry.def.needsPower && !life.offline.includes(entry.id)) life.offline.push(entry.id);
    }
  }
}

/**
 * Why the crew is dead with these resources (a resource at 0, D14 order), or null. Drift and
 * events are judged elsewhere (`Simulation`, plan S7).
 */
export function resourceDeath(resources: Resources): DeathCause | null {
  for (const { id, cause } of DEATH_BY_RESOURCE) {
    if (resources[id].value <= 0) return cause;
  }
  return null;
}

/**
 * Whether a death `days` simulated days away, `realS` real seconds of Run away, raises the
 * alarm: under `ALARM_SIM_DAYS`, or at most `ALARM_REAL_S` real seconds away.
 */
export function isAlarm(days: number, realS: number): boolean {
  if (!Number.isFinite(days)) return false;
  return days < ALARM_SIM_DAYS || realS <= ALARM_REAL_S;
}

/** What `lifeForecast` needs besides the resources. */
export interface LifeForecastInput {
  resources: Resources;
  loadout: Loadout;
  leg: LegConditions;
  life: LifeState;
  /**
   * Real seconds of Run until `days` simulated days from now (at most: an estimate that errs
   * short, so the alarm comes early rather than late). `Simulation` estimates it from the pace
   * the ship will have by then.
   */
  realSecondsTo: (days: number) => number;
  /** Simulated seconds per real second now (turns the drift's real seconds into days). */
  timeScale: number;
  /** The ship drifts out of fuel (`drift` is coming in real time). */
  drifting: boolean;
}

/**
 * Every way the crew can die and how many simulated days away it is at the current flows
 * (resources running down linearly), each with its alarm. While powered, the forecast follows
 * the power stock to 0 and then the unpowered flows with every `needsPower` item offline - the
 * cascade "power 0 -> the greenhouse dies -> oxygen runs down" - so its alarm comes before the
 * power runs out, not after (plan D30 I6). Days of `frozen`: the power stock, then the cabin's
 * warmth at the unpowered cooling rate. `drift`: the real seconds left of `DRIFT_DEATH_REAL_S`
 * at the current time scale; always an alarm. In `DeathCause` order.
 */
export function lifeForecast(input: LifeForecastInput): DeathForecast[] {
  const { resources, loadout, leg, life, timeScale } = input;
  const powered = resources.power.value > 0;
  const rates = evaluateFlows(loadout, leg, { powered, offline: life.offline });
  const daysOf = (id: FlowId, rate: number) =>
    rate < 0 ? resources[id].value / -rate : Number.POSITIVE_INFINITY;
  // Unpowered: every item that needs power is offline (`stepLife`).
  const dark = [
    ...life.offline,
    ...loadout.entries
      .filter((e) => e.def.needsPower && !life.offline.includes(e.id))
      .map((e) => e.id),
  ];
  const cold = evaluateFlows(loadout, leg, { powered: false, offline: dark });
  const powerDays = powered ? daysOf('power', rates.power) : 0;
  /** Days until stock `id` runs out: at the current rate, then (past the power) at `cold`'s. */
  const stockDays = (id: FlowId) => {
    const now = daysOf(id, rates[id]);
    if (!powered || now <= powerDays || !Number.isFinite(powerDays)) return now;
    const left = Math.min(resources[id].max, resources[id].value + rates[id] * powerDays);
    return cold[id] < 0 ? powerDays + left / -cold[id] : Number.POSITIVE_INFINITY;
  };
  const forecasts: DeathForecast[] = [];
  const add = (cause: DeathCause, days: number, alarm?: boolean) =>
    forecasts.push({
      cause,
      days,
      alarm: alarm ?? (Number.isFinite(days) && isAlarm(days, input.realSecondsTo(days))),
    });
  add('hypoxia', stockDays('oxygen'));
  add('dehydration', stockDays('water'));
  add('starvation', stockDays('food'));
  let frozen: number;
  if (powered) {
    const coolingDays = cold.heat < 0 ? resources.heat.max / -cold.heat : Number.POSITIVE_INFINITY;
    frozen = powerDays + coolingDays;
  } else {
    frozen = daysOf('heat', rates.heat);
  }
  add('frozen', frozen);
  if (input.drifting) {
    const realLeft = Math.max(0, DRIFT_DEATH_REAL_S - life.driftRealS);
    add('drift', (realLeft * timeScale) / DAY_S, true);
  }
  return forecasts;
}

/** A living state at the start of a voyage: everything works, nobody died, no drift. */
export function freshLife(): LifeState {
  return { offline: [], cause: null, deathDay: null, driftRealS: 0 };
}
