import { cargoItems } from '@/content/voyage/cargo';
import { DAY_S } from '@/core/simulation/constants';
import type { Simulation } from '@/core/simulation/Simulation';
import type { LegDef, ResourceId } from '@/core/simulation/types';
import { evaluateFlows } from '@/core/voyage/flows';
import type { FlowId } from '@/core/voyage/types';
import { FRAME_S } from '@/devtools/voyageFlight';

/** A voyage that has not ended after this much real Run is given up, s. */
const VOYAGE_LIMIT_REAL_S = 3600;

/**
 * Copy counts from a `--loadout` value: `fuel:1,supplies:1,battery:1` (`id` alone = 1 copy;
 * `base` or an empty value = nothing but the base). Throws on an unknown id.
 */
export function parseLoadout(spec: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const part of spec.split(',').map((item) => item.trim())) {
    if (part === '' || part === 'base') continue;
    const [id, count = '1'] = part.split(':');
    if (!Object.hasOwn(cargoItems, id)) {
      throw new Error(`--loadout: unknown cargo "${id}" (known: ${Object.keys(cargoItems)})`);
    }
    const n = Number(count);
    if (!Number.isInteger(n) || n < 0) throw new Error(`--loadout: bad count "${count}" for ${id}`);
    const total = (counts[id] ?? 0) + n;
    const max = cargoItems[id as keyof typeof cargoItems].maxCopies;
    if (total > max) throw new Error(`--loadout: ${id} allows at most ${max} (got ${total})`);
    counts[id] = total;
  }
  return counts;
}

/** The ship's state at one gate of a voyage (`flyVoyage`). */
export interface GateRow {
  gate: number;
  day: number;
  /** Resource values at the arrival (fuel in kg). */
  values: Record<ResourceId, number>;
  /** Delta-v the fuel gives the ship at its mass at the arrival, m/s. */
  dvMS: number;
  /** Days of stock at the flows of the next leg (Infinity: not running down). */
  daysLeft: Partial<Record<ResourceId, number>>;
  offline: string[];
}

/** How a voyage with Go on at every gate ended (`flyVoyage`). */
export interface VoyageOutcome {
  gates: GateRow[];
  /** `landed` at the last gate, or died. */
  result: 'landed' | 'died' | 'gave up';
  cause: string | null;
  deathDay: number | null;
  /** Leg the death happened on and how far along it (distance flown / distance at its start). */
  leg: number;
  legFraction: number;
  /** Real seconds of Run from the alarm of the death's cause coming on to the death. */
  alarmLeadRealS: number | null;
  /** Simulated days from that alarm to the death. */
  alarmLeadDays: number | null;
  realS: number;
}

const STOCKS: readonly FlowId[] = ['oxygen', 'water', 'food', 'power'];

/**
 * Flies a voyage from its start frame by frame as the game would (60 frames a real second,
 * no debug warp), pressing Go on at every gate, until the crew dies or the ship parks at the
 * last gate. Records the resources at each gate and when the alarm of the death's cause came on.
 */
export function flyVoyage(simulation: Simulation, legs: readonly LegDef[]): VoyageOutcome {
  const rows: GateRow[] = [];
  /** Real time each cause's alarm came on (cleared when it goes off). */
  const alarmOn = new Map<string, { realS: number; timeS: number }>();
  let realS = 0;
  let legStartDistance = simulation.distanceToGate();
  for (;;) {
    for (const forecast of simulation.forecastLife()) {
      if (!forecast.alarm) alarmOn.delete(forecast.cause);
      else if (!alarmOn.has(forecast.cause)) {
        alarmOn.set(forecast.cause, { realS, timeS: simulation.time });
      }
    }
    simulation.advance(FRAME_S);
    realS += FRAME_S;
    // Death wins over an arrival in the same substep (`Voyage.afterStep`, D14): no gate row.
    const arrivals = simulation.dead ? [] : simulation.takeArrivals();
    for (const gate of arrivals) {
      const snapshot = simulation.snapshot();
      const dvMS = simulation.dvAvailable;
      if (simulation.departToNextGate()) legStartDistance = simulation.distanceToGate();
      // Days of stock at the flows of the leg ahead (the last gate: of the leg that ended).
      const rates = evaluateFlows(simulation.cargo, legs[Math.min(gate + 1, legs.length - 1)], {
        powered: snapshot.resources.power.value > 0,
        offline: snapshot.life.offline,
      });
      const daysLeft: Partial<Record<ResourceId, number>> = {};
      for (const id of STOCKS) {
        const perDay = rates[id];
        daysLeft[id] = perDay < 0 ? snapshot.resources[id].value / -perDay : Infinity;
      }
      rows.push({
        gate,
        day: snapshot.timeS / DAY_S,
        values: Object.fromEntries(
          Object.entries(snapshot.resources).map(([id, r]) => [id, r.value]),
        ) as Record<ResourceId, number>,
        dvMS,
        daysLeft,
        offline: [...snapshot.life.offline],
      });
    }
    const pilot = simulation.autopilot;
    const life = simulation.lifeState;
    const base = {
      gates: rows,
      leg: pilot.legIndex,
      legFraction: Math.max(0, 1 - simulation.distanceToGate() / legStartDistance),
      realS,
    };
    if (life.cause !== null) {
      const onset = alarmOn.get(life.cause);
      return {
        ...base,
        result: 'died',
        cause: life.cause,
        deathDay: life.deathDay,
        alarmLeadRealS: onset ? realS - onset.realS : null,
        alarmLeadDays: onset ? (simulation.time - onset.timeS) / DAY_S : null,
      };
    }
    if (pilot.phase === 'finished' || realS > VOYAGE_LIMIT_REAL_S) {
      return {
        ...base,
        result: pilot.phase === 'finished' ? 'landed' : 'gave up',
        cause: null,
        deathDay: null,
        alarmLeadRealS: null,
        alarmLeadDays: null,
      };
    }
  }
}
