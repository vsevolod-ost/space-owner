import { DAY_S } from '@/core/simulation/constants';
import type { ShipConfig } from '@/core/simulation/types';

/** Earth's radius, m: the start distance below counts in it. */
const EARTH_RADIUS_M = 6.371e6;

/**
 * The ship of act 2 at the start of the voyage: a circular parking orbit ten Earth
 * radii from the Earth's centre, engine off, tanks full. Rates are per simulated second; at the
 * default time scale one real second is roughly 10 hours near the Earth and a day in open space.
 * OWNER: physics - every number here (initial conditions, thrust, resource amounts and rates).
 */
export const ship: ShipConfig = {
  massKg: 100_000,
  // 0.02 m/s^2 on 100 t: about 1.7 km/s per simulated day.
  thrustN: 2_000,
  start: { around: 'earth', distanceM: 10 * EARTH_RADIUS_M, angleRad: 0 },
  resources: {
    // Values are percent of a full tank (max 100); the rate empties a full tank in N days.
    oxygen: { value: 100, max: 100, ratePerS: -100 / (400 * DAY_S) },
    fuel: { value: 100, max: 100, ratePerS: 0 },
    heat: { value: 20, max: 100, ratePerS: 50 / (300 * DAY_S) },
    power: { value: 100, max: 100, ratePerS: -100 / (600 * DAY_S) },
    water: { value: 100, max: 100, ratePerS: -100 / (300 * DAY_S) },
    food: { value: 100, max: 100, ratePerS: -100 / (500 * DAY_S) },
    comms: { value: 100, max: 100, ratePerS: 0 },
  },
};
