import type { SolarSystem } from '@/core/simulation/SolarSystem';
import type { GateDef } from '@/core/simulation/types';
import type { Voyage } from '@/core/voyage/Voyage';

/** Cause of a voyage the player gave up from the pause menu ("Return to warehouse"). */
export const ABORT_CAUSE = 'abort';

/**
 * How a voyage ended, taken before the simulation stops (GDD `death-screen-model` E, plan
 * D18): what the scientists' debrief speaks about and what the `run.*` flags keep.
 */
export interface FlightSummary {
  /**
   * `died` - the crew died on the way; `aborted` - the player gave up (pause menu); `landed` -
   * Stop at a gate (the colony, plan S11).
   */
  kind: 'died' | 'aborted' | 'landed';
  /** A `DeathCause` (`hypoxia`, `drift`, `event:<id>`), `ABORT_CAUSE`, or '' when landed. */
  cause: string;
  /** Index of the last gate reached, -1 before the first. */
  gate: number;
  /** Name of that gate's body ('' before the first gate). */
  gateName: string;
  /** Name of the body flown to when it ended, or of the next gate when parked at one ('' when landed). */
  nextName: string;
  /** Index of the leg flown when it ended (at a gate: the leg that ends there). */
  leg: number;
  /** How far along that leg by time, 0..1. */
  legFraction: number;
  /** Simulated day it ended (whole days). */
  day: number;
}

/**
 * The summary of `voyage` now: its outcome if it has ended, else where it is (`cause` given:
 * the player gives up). Null `voyage` (no voyage started) gives a summary at the start.
 */
export function summarizeFlight(
  voyage: Voyage | null,
  cause: string,
  gates: readonly GateDef[],
  system: SolarSystem | null,
): FlightSummary {
  const nameOf = (gate: number): string => {
    const body = gates[gate]?.body;
    if (!body) return '';
    return system?.get(body).name ?? body;
  };
  const outcome = voyage?.outcome ?? null;
  if (outcome?.kind === 'landed') {
    return {
      kind: 'landed',
      cause: '',
      gate: outcome.gate,
      gateName: nameOf(outcome.gate),
      nextName: '',
      leg: outcome.gate,
      legFraction: 1,
      day: Math.floor(outcome.day),
    };
  }
  if (outcome?.kind === 'died') {
    return {
      kind: 'died',
      cause: outcome.cause,
      gate: outcome.gate,
      gateName: nameOf(outcome.gate),
      nextName: nameOf(outcome.leg),
      leg: outcome.leg,
      legFraction: outcome.legFraction,
      day: Math.floor(outcome.day),
    };
  }
  const gate = voyage?.gateIndex ?? -1;
  const leg = voyage?.legIndex ?? 0;
  // Parked at a gate, the next body is the next gate's.
  const next = voyage?.phase === 'atGate' ? gate + 1 : leg;
  return {
    kind: cause === ABORT_CAUSE ? 'aborted' : 'died',
    cause,
    gate,
    gateName: nameOf(gate),
    nextName: nameOf(next),
    leg,
    legFraction: voyage?.legFraction ?? 0,
    day: Math.floor(voyage?.day ?? 0),
  };
}
