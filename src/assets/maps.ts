/**
 * Registry of Tiled maps (`.tmj`, Tiled JSON). The object key is the map key (`MapKey`).
 * A map holds only markup - collisions, spawns, doors, NPCs, triggers; the background image
 * is drawn by code (see docs/HOWTO-location.md).
 */
export const maps = {
  'demo-corridor': { path: 'assets/maps/demo-corridor.tmj' },
  'demo-room': { path: 'assets/maps/demo-room.tmj' },
  'ship-deck': { path: 'assets/maps/ship-deck.tmj' },
} as const satisfies Record<string, MapEntry>;

/** One entry of the map registry. */
export interface MapEntry {
  /** File path relative to `public/`. */
  path: string;
}
