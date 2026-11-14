import type { ShipConfig } from '@/core/simulation/types';

/** Earth's radius, m: the start distance below counts in it. */
const EARTH_RADIUS_M = 6.371e6;

/**
 * The ship of act 2 at the start of the voyage: a circular parking orbit thirty Earth
 * radii from the Earth's centre, engine off. The autopilot fires the engine
 * (src/core/simulation/autopilot.ts). Its resources (fuel charges, days of oxygen, water,
 * food and power) come from the cargo aboard: the built-in base and the crates
 * (src/content/voyage/cargo).
 * OWNER: physics - every number here (initial conditions, thrust).
 */
export const ship: ShipConfig = {
  massKg: 100_000,
  // 0.02 m/s^2 on 100 t: about 1.7 km/s per simulated day.
  thrustN: 2_000,
  // 30 Earth radii: the Earth pulls with about half the engine's acceleration there, so the
  // autopilot flies straight to the Moon (from 10 radii it had to spiral out first, and the
  // Moon leg took 2-15 days depending on the Moon's phase).
  start: { around: 'earth', distanceM: 30 * EARTH_RADIUS_M, angleRad: 0 },
};
