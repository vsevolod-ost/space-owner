import { DAY_S } from '@/core/simulation/constants';
import type { Body } from '@/core/simulation/types';

/**
 * The solar system of act 2: real masses, orbit radii (mean distances) and orbital
 * periods; orbits are circles in one plane. Display scale belongs to the navigation panel, not
 * here. A parent must come before its moons. To add a body, add a line (docs/HOWTO-simulation.md).
 * OWNER: physics - the starting angles (`phaseRad`) are arbitrary, set them for the story's date.
 */
export const solarSystem: readonly Body[] = [
  { id: 'sun', name: 'Sun', massKg: 1.989e30, orbitRadiusM: 0, periodS: 0, color: 0xffd34d },
  {
    id: 'mercury',
    name: 'Mercury',
    massKg: 3.301e23,
    orbitRadiusM: 5.791e10,
    periodS: 87.969 * DAY_S,
    color: 0xb0a89c,
    phaseRad: 2.1,
  },
  {
    id: 'venus',
    name: 'Venus',
    massKg: 4.867e24,
    orbitRadiusM: 1.0821e11,
    periodS: 224.701 * DAY_S,
    color: 0xe8c98a,
    phaseRad: 4.0,
  },
  {
    id: 'earth',
    name: 'Earth',
    massKg: 5.972e24,
    orbitRadiusM: 1.496e11,
    periodS: 365.256 * DAY_S,
    color: 0x4f8fe8,
    phaseRad: 0,
  },
  {
    id: 'moon',
    name: 'Moon',
    massKg: 7.342e22,
    orbitRadiusM: 3.844e8,
    periodS: 27.3217 * DAY_S,
    parent: 'earth',
    color: 0xd8d8d8,
    phaseRad: 1.0,
  },
  {
    id: 'mars',
    name: 'Mars',
    massKg: 6.417e23,
    orbitRadiusM: 2.2794e11,
    periodS: 686.98 * DAY_S,
    color: 0xd8613c,
    phaseRad: 0.8,
  },
];
