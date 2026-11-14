import { TODO } from '@/core/locale/text';
import { DAY_S } from '@/core/simulation/constants';
import type { Body } from '@/core/simulation/types';

/**
 * The solar system of act 2: real masses, radii, orbit radii (mean distances) and orbital
 * periods; orbits are circles in one plane. Display scale belongs to the navigation panel, not
 * here. A parent must come before its moons. `role` says what a body is for in the voyage
 * (`BodyRole`): the gates are in src/content/voyage/gates.ts. To add a body, add a line
 * (docs/HOWTO-simulation.md).
 * OWNER: physics - the starting angles (`phaseRad`, one canonical date, frozen: GDD
 * `act2-physics`) are chosen so that every leg of the voyage flies outwards on the same side of
 * the Sun, never across it; `npm run voyage-check` after changing any of them.
 * OWNER: script - the `name`s (shown on the panel, the cards, the landing title).
 */
export const solarSystem: readonly Body[] = [
  {
    id: 'sun',
    name: { en: 'Sun', uk: TODO },
    role: 'scenery',
    massKg: 1.989e30,
    radiusM: 6.957e8,
    orbitRadiusM: 0,
    periodS: 0,
    color: 0xffd34d,
  },
  {
    id: 'mercury',
    name: { en: 'Mercury', uk: TODO },
    role: 'scenery',
    massKg: 3.301e23,
    radiusM: 2.4397e6,
    orbitRadiusM: 5.791e10,
    periodS: 87.969 * DAY_S,
    color: 0xb0a89c,
    phaseRad: 2.1,
  },
  {
    id: 'venus',
    name: { en: 'Venus', uk: TODO },
    role: 'scenery',
    massKg: 4.867e24,
    radiusM: 6.0518e6,
    orbitRadiusM: 1.0821e11,
    periodS: 224.701 * DAY_S,
    color: 0xe8c98a,
    phaseRad: 4.0,
  },
  {
    id: 'earth',
    name: { en: 'Earth', uk: TODO },
    role: 'home',
    massKg: 5.972e24,
    radiusM: 6.371e6,
    orbitRadiusM: 1.496e11,
    periodS: 365.256 * DAY_S,
    color: 0x4f8fe8,
    phaseRad: 0,
  },
  {
    id: 'moon',
    name: { en: 'Moon', uk: TODO },
    role: 'gate',
    massKg: 7.342e22,
    radiusM: 1.7374e6,
    orbitRadiusM: 3.844e8,
    periodS: 27.3217 * DAY_S,
    parent: 'earth',
    color: 0xd8d8d8,
    phaseRad: 0.26,
  },
  {
    id: 'mars',
    name: { en: 'Mars', uk: TODO },
    role: 'gate',
    massKg: 6.417e23,
    radiusM: 3.3895e6,
    orbitRadiusM: 2.2794e11,
    periodS: 686.98 * DAY_S,
    color: 0xd8613c,
    // OWNER: physics - Mars about 0.85 rad ahead of the Earth when the ship leaves the Moon
    // (day 2-3): the slowest transfer then is about a Hohmann one (250 days, 5.6 km/s), and 0.3
    // rad either way costs about the same (6.9 km/s; plan variable-mass S4, K11).
    phaseRad: 0.87,
  },
];
