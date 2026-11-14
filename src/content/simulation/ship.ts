import type { ShipConfig } from '@/core/simulation/types';

/** Earth's radius, m: the start distance below counts in it. */
const EARTH_RADIUS_M = 6.371e6;

/**
 * The ship of act 2 at the start of the voyage: a circular parking orbit thirty Earth
 * radii from the Earth's centre, engine off. The autopilot fires the engine
 * (src/core/simulation/autopilot.ts). Its resources (kilograms of fuel, days of oxygen, water,
 * food and power) and its mass come from the cargo aboard: the built-in base and the crates
 * (src/content/voyage/cargo, `dryMassKg`; `shipMassKg` in src/core/voyage/mass.ts).
 * OWNER: physics - every number here (initial conditions, thrust, specific impulse).
 */
export const ship: ShipConfig = {
  // 0.02 m/s^2 on 100 t: about 1.7 km/s per simulated day; 0.019 m/s^2 on the lightest ship
  // (the base with its fuel and stocks, 104 t), 0.012 on the heaviest 7-bay hold (166 t with
  // three fuel crates) - still above the Earth's pull at the start (0.011, see `start`; plan
  // variable-mass D16). The engine has its own reactor in the base's dry mass: at 3000 s 2 kN
  // is about 29 MW of jet power (F * ve / 2), more than the ship's `power` stock could ever
  // give (plan D2).
  thrustN: 2_000,
  // Specific impulse, s: exhaust speed ispS * 9.81 m/s (29.4 km/s), the fuel flow F / ve
  // (68 g/s). A high-power electric engine of the 2070s (plan variable-mass D5: 2000-5000 s,
  // E2): the voyage's 6-10 km/s (the Moon, then a Lambert transfer to Mars) take a fifth to two
  // fifths of the ship's start mass in fuel (the base 23 t of 104 t, the table hold 59 t of
  // 161 t; plan S9 kept Isp and thrust: they fly the table hold in about 49 s of Run).
  ispS: 3_000,
  // 30 Earth radii: the Earth pulls with about half the engine's acceleration there, so the
  // autopilot flies straight to the Moon (from 10 radii it had to spiral out first, and the
  // Moon leg took 2-15 days depending on the Moon's phase).
  start: { around: 'earth', distanceM: 30 * EARTH_RADIUS_M, angleRad: 0 },
};
