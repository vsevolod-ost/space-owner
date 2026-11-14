/**
 * Registry of sprite sheets: images cut into equal frames, left to right, top to bottom.
 * The object key is the texture key (`SpritesheetKey`). Characters reference these keys in
 * src/content/characters.ts, which also says which rows hold which direction.
 * OWNER: art - every sheet listed here is a placeholder to draw (frame layout in
 * docs/HOWTO-art.md).
 */
export const spritesheets = {
  hero: { path: 'assets/sprites/hero.png', frameWidth: 32, frameHeight: 48 },
  'npc-engineer': { path: 'assets/sprites/npc-engineer.png', frameWidth: 32, frameHeight: 48 },
  'npc-astronomer': { path: 'assets/sprites/npc-astronomer.png', frameWidth: 32, frameHeight: 48 },
  /**
   * Cargo item icons 16x16 in one row, frame = item: fuel, oxygen, supplies, battery, solar,
   * reactor, greenhouse, regolith-kit, ice-kit, thermal-kit.
   */
  items: { path: 'assets/ui/items.png', frameWidth: 16, frameHeight: 16 },
  /** Navigation panel row icons 8x8: oxygen, supplies, power, fuel, heat, comms. */
  'panel-icons': { path: 'assets/ui/panel-icons.png', frameWidth: 8, frameHeight: 8 },
} as const satisfies Record<string, SpritesheetEntry>;

/** One entry of the sprite sheet registry. */
export interface SpritesheetEntry {
  /** File path relative to `public/`. */
  path: string;
  /** Width of one frame in pixels. */
  frameWidth: number;
  /** Height of one frame in pixels. */
  frameHeight: number;
}
