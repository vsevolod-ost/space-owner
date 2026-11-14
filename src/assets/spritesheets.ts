/**
 * Registry of sprite sheets: images cut into equal frames, left to right, top to bottom.
 * The object key is the texture key (`SpritesheetKey`). Characters reference these keys in
 * src/content/characters.ts, which also says which rows hold which direction.
 */
export const spritesheets = {
  hero: { path: 'assets/sprites/hero.png', frameWidth: 32, frameHeight: 48 },
  'npc-engineer': { path: 'assets/sprites/npc-engineer.png', frameWidth: 32, frameHeight: 48 },
  'npc-captain': { path: 'assets/sprites/npc-captain.png', frameWidth: 32, frameHeight: 48 },
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
