import type { Workspace } from '@/core/simulation/dynamics';
import type { ShipState } from '@/core/simulation/types';

/**
 * The ship's flight data the navigation panel shows (plan variable-mass D12): mass, its rate,
 * the engine's acceleration, the local gravity and the escape speed from the body that pulls
 * hardest. Shown only: nothing in the game reads it.
 */
export interface Telemetry {
  /** Mass now, kg (M(t), `ShipState.massKg`). */
  massKg: number;
  /** How fast the mass changes, kg per simulated s (negative: lighter; `shipMassRateKgPerS`). */
  massRateKgPerS: number;
  /** The engine's acceleration now, m/s^2: its thrust over the mass (0 while it is off). */
  accelMS2: number;
  /** Local gravity, m/s^2: the size of `Workspace.gravity` at the ship. */
  gravityMS2: number;
  /**
   * The body that pulls the ship hardest (its id, '' when none; the view names it with
   * `bodyName`, plan uk-localization D16) and the escape speed from it, m/s.
   */
  escapeBody: string;
  escapeMS: number;
}

/**
 * `Telemetry` of `ship` at `timeS` (plan variable-mass S7). `work` is a workspace of the ship's
 * solar system that this call may overwrite (not the integrator's own, so it can run between
 * substeps); `massRateKgPerS` comes from `shipMassRateKgPerS`. The escape speed is
 * sqrt(2 G M / r) from the body with the largest G M / r^2, r at least the body's radius (as in
 * `Workspace.gravity`).
 */
export function computeTelemetry(
  work: Workspace,
  ship: ShipState,
  timeS: number,
  massRateKgPerS: number,
): Telemetry {
  work.gravity(ship.x, ship.y, timeS);
  const { system, positions } = work;
  let best = -1;
  let bestPull = 0;
  let bestR = 0;
  for (let i = 0; i < system.gm.length; i++) {
    const r = Math.max(
      Math.hypot(positions[i * 2] - ship.x, positions[i * 2 + 1] - ship.y),
      system.radii[i],
    );
    const pull = r > 0 ? system.gm[i] / (r * r) : 0;
    if (pull > bestPull) {
      best = i;
      bestPull = pull;
      bestR = r;
    }
  }
  return {
    massKg: ship.massKg,
    massRateKgPerS,
    accelMS2: ship.massKg > 0 ? ship.thrustN / ship.massKg : 0,
    gravityMS2: Math.hypot(work.ax, work.ay),
    escapeBody: best < 0 ? '' : system.bodies[best].id,
    escapeMS: best < 0 ? 0 : Math.sqrt((2 * system.gm[best]) / bestR),
  };
}
