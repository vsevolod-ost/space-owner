import type { Resources } from '@/core/simulation/types';
import { RESOURCE_IDS } from '@/core/simulation/types';
import { COMMS_VALUE } from '@/core/voyage/flows';
import type { CargoCatalog, Loadout, LoadoutEntry, StockId } from '@/core/voyage/types';

/** Id of the built-in base in `Loadout.entries`. */
export const BASE_ID = 'base';

/**
 * Reads flags: `Flags` of the game state, or a plain stand-in in tools. Values are `unknown`
 * here so this module (run by the Node tools, src/devtools) does not pull in the game state.
 */
export interface FlagReader {
  get(key: string): unknown;
}

/** Flag that counts the copies of cargo `id` aboard: `cargo.<id>`. */
export function cargoFlag(id: string): string {
  return `cargo.${id}`;
}

/**
 * Copies of cargo `id` aboard by its flag, a whole number within 0..`maxCopies` (0 when unset
 * or not a number).
 */
export function cargoCount(catalog: CargoCatalog, flags: FlagReader, id: string): number {
  const def = catalog.items[id];
  const value = flags.get(cargoFlag(id));
  if (!def || typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(def.maxCopies, Math.max(0, Math.floor(value)));
}

/**
 * What the ship carries by the `cargo.<id>` flags (plan S6, GDD `cargo-catalog`): the base and
 * every item with a count above 0, copies capped at `maxCopies`. Pure. The hold's bay limit is
 * the warehouse's rule (plan S9); here more than `catalog.bays` is carried as it is.
 */
export function buildLoadout(catalog: CargoCatalog, flags: FlagReader): Loadout {
  const counts: Record<string, number> = {};
  for (const id of Object.keys(catalog.items)) {
    const count = cargoCount(catalog, flags, id);
    if (count > 0) counts[id] = count;
  }
  return loadoutOf(catalog, counts);
}

/** The loadout of `counts` copies by cargo id (a snapshot's `cargo`); unknown ids drop. */
export function loadoutOf(
  catalog: CargoCatalog,
  counts: Readonly<Record<string, number>>,
): Loadout {
  const entries: LoadoutEntry[] = [{ id: BASE_ID, def: catalog.base, count: 1 }];
  const kept: Record<string, number> = {};
  for (const [id, def] of Object.entries(catalog.items)) {
    const count = Math.min(def.maxCopies, Math.max(0, Math.floor(counts[id] ?? 0)));
    if (count <= 0) continue;
    entries.push({ id, def, count });
    kept[id] = count;
  }
  return { entries, counts: kept };
}

/**
 * The ship's resources at the start of a voyage with `loadout`: every `start` amount times
 * copies (fuel in kg, the rest in days). The bars' `max` is the start amount (the fuel's too:
 * the bar shows the share of this loadout's tank left, plan variable-mass S3), 2 for comms.
 * Rates are 0 until the first step.
 */
export function startResources(loadout: Loadout): Resources {
  const value = (id: StockId) =>
    loadout.entries.reduce((sum, entry) => sum + (entry.def.start?.[id] ?? 0) * entry.count, 0);
  const resources = {} as Resources;
  for (const id of RESOURCE_IDS) {
    if (id === 'comms') {
      resources.comms = { value: COMMS_VALUE.ok, max: COMMS_VALUE.ok, ratePerS: 0 };
      continue;
    }
    const amount = value(id);
    resources[id] = { value: amount, max: amount > 0 ? amount : 1, ratePerS: 0 };
  }
  return resources;
}

/**
 * Cargo ids as they stand in the hold, one per copy: fuel (items that add fuel) first,
 * then the other items in registry order (plan D21). The ship deck's bays show this list.
 */
export function holdOrder(catalog: CargoCatalog, flags: FlagReader): string[] {
  const ids = Object.keys(catalog.items);
  const isFuel = (id: string) => (catalog.items[id].start?.fuel ?? 0) > 0;
  const order = [...ids.filter(isFuel), ...ids.filter((id) => !isFuel(id))];
  return order.flatMap((id) => Array.from({ length: cargoCount(catalog, flags, id) }, () => id));
}
