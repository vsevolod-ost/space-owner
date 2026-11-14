import { G0 } from '@/core/simulation/constants';

/**
 * The rocket equation (plan variable-mass D3, D16): the engine throws propellant out at
 * `ispS * G0`, so the ship's delta-v depends on how much of its mass is fuel (Tsiolkovsky).
 * Pure functions: the simulation burns the fuel with them, the panel and the gate card show
 * the delta-v, the Node tools run them too.
 */

/** Exhaust speed of an engine of specific impulse `ispS` (s), m/s. */
export function exhaustSpeedMS(ispS: number): number {
  return ispS * G0;
}

/** Propellant an engine of thrust `thrustN` and specific impulse `ispS` burns, kg/s (F / ve). */
export function fuelFlowKgPerS(thrustN: number, ispS: number): number {
  return thrustN / exhaustSpeedMS(ispS);
}

/**
 * Delta-v of a ship of `massKg` (fuel included) that holds `fuelKg` of fuel, m/s:
 * ve * ln(M / (M - m_fuel)). 0 without fuel.
 */
export function deltaVMS(ispS: number, massKg: number, fuelKg: number): number {
  const fuel = Math.min(Math.max(0, fuelKg), massKg);
  if (fuel <= 0) return 0;
  if (fuel >= massKg) return Number.POSITIVE_INFINITY;
  return exhaustSpeedMS(ispS) * Math.log(massKg / (massKg - fuel));
}

/** Fuel a ship of `massKg` burns for `dvMS` of delta-v, kg: M * (1 - e^(-dv / ve)). */
export function fuelForDvKg(ispS: number, massKg: number, dvMS: number): number {
  if (dvMS <= 0) return 0;
  return massKg * (1 - Math.exp(-dvMS / exhaustSpeedMS(ispS)));
}
