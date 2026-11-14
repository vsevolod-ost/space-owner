/**
 * Mass of the ship (plan variable-mass D4, D15): the dry mass of the base and of every copy of
 * cargo aboard, plus the stocks at their mass per day (`CargoCatalog.kgPerDay`), plus the fuel
 * (kilograms of propellant, plan S3). Pure functions of the catalog, the loadout and the
 * resources; the simulation keeps the result in `ShipState.massKg` on every substep, the
 * warehouse shows a crate's mass with `cargoMassKg`. No Phaser, run by the Node tools too.
 */
import type { Resources } from '@/core/simulation/types';
import { startResources } from '@/core/voyage/loadout';
import type { CargoCatalog, CargoDef, FlowId, Loadout, StockId } from '@/core/voyage/types';

/**
 * Mass of what a ship or a crate holds, kg: the stocks (days times kg per day) and the fuel
 * (kg). `amount` reads a stock's amount (days; fuel in kg).
 */
function contentsMassKg(catalog: CargoCatalog, amount: (id: StockId) => number): number {
  let kg = amount('fuel');
  for (const [id, perDay] of Object.entries(catalog.kgPerDay) as [FlowId, number][]) {
    kg += amount(id) * perDay;
  }
  return kg;
}

/** Dry mass of everything aboard (the base and every copy of cargo), kg. */
export function dryMassKg(loadout: Loadout): number {
  return loadout.entries.reduce((sum, entry) => sum + entry.def.dryMassKg * entry.count, 0);
}

/**
 * The ship's mass now, kg: the dry mass of `loadout`, the stocks of `resources` at
 * `catalog.kgPerDay`, the fuel. M(t) of the simulation (`ShipState.massKg`).
 */
export function shipMassKg(catalog: CargoCatalog, loadout: Loadout, resources: Resources): number {
  return dryMassKg(loadout) + contentsMassKg(catalog, (id) => resources[id].value);
}

/**
 * How fast the ship's mass changes now, kg per simulated second (negative: it gets lighter):
 * the stocks at their current flows (a stock at its 0 or `max` counts at its rate all the same)
 * and the engine's burn (`resources.fuel.ratePerS`, kg/s, set by the simulation while the
 * engine fires).
 */
export function shipMassRateKgPerS(catalog: CargoCatalog, resources: Resources): number {
  return contentsMassKg(catalog, (id) => resources[id].ratePerS);
}

/** The ship's mass at the start of a voyage with `loadout` (`startResources`), kg. */
export function startMassKg(catalog: CargoCatalog, loadout: Loadout): number {
  return shipMassKg(catalog, loadout, startResources(loadout));
}

/**
 * Mass of one copy of `def` as it leaves the warehouse, kg: its dry mass, its `start` stocks
 * and its `start` fuel (plan variable-mass S8 shows it on the crate's stand).
 */
export function cargoMassKg(catalog: CargoCatalog, def: CargoDef): number {
  return def.dryMassKg + contentsMassKg(catalog, (id) => def.start?.[id] ?? 0);
}
