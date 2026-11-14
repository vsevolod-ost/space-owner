/**
 * Registry of Tiled maps (`.tmj`, Tiled JSON). The object key is the map key (`MapKey`).
 * A map holds only markup - collisions, spawns, doors, NPCs, triggers; the background image
 * is drawn by code (see docs/HOWTO-location.md).
 */
export const maps = {
  home: { path: 'assets/maps/home.tmj' },
  warehouse: { path: 'assets/maps/warehouse.tmj' },
  'ship-deck': { path: 'assets/maps/ship-deck.tmj' },
  colony: { path: 'assets/maps/colony.tmj' },
} as const satisfies Record<string, MapEntry>;

/** One entry of the map registry. */
export interface MapEntry {
  /** File path relative to `public/`. */
  path: string;
}
