import type { ImageKey, SpritesheetKey } from '@/assets';

/** Facing direction of a character; also the name of a row in its sprite sheet. */
export type Direction = 'down' | 'left' | 'right' | 'up';

/** Everything the game needs to animate and move one character. */
export interface CharacterDef {
  /** Name shown to the player (dialogue speaker, messages). */
  name: string;
  /** Portrait shown in the dialogue window when this character speaks (48x48). */
  portrait?: ImageKey;
  /** Sprite sheet with the frames; frame size is set in src/assets/spritesheets.ts. */
  spritesheet: SpritesheetKey;
  /** Sheet row (0-based) for each direction. */
  rows: Record<Direction, number>;
  /** Frames per row in the sheet. */
  framesPerRow: number;
  /** Column (0-based) of the standing frame within a row. */
  idleFrame: number;
  /** Columns (0-based) of the walk cycle within a row, in play order. */
  walkFrames: readonly number[];
  /** Walk animation speed, frames per second. */
  walkFrameRate: number;
  /** Walking speed in pixels per second. */
  speed: number;
}

/** Default walking speed, pixels per second. */
const DEFAULT_SPEED = 80;

/** Default layout of a 4x4 character sheet: rows down, left, right, up; frame 0 stands. */
const STANDARD_SHEET = {
  rows: { down: 0, left: 1, right: 2, up: 3 },
  framesPerRow: 4,
  idleFrame: 0,
  walkFrames: [1, 2, 3],
  walkFrameRate: 8,
} as const;

/** Registry of characters. BootScene creates walk and idle animations for each one. */
export const characters = {
  hero: {
    name: 'Hero',
    portrait: 'portrait-hero',
    spritesheet: 'hero',
    ...STANDARD_SHEET,
    speed: DEFAULT_SPEED,
  },
  engineer: {
    name: 'Engineer',
    portrait: 'portrait-engineer',
    spritesheet: 'npc-engineer',
    ...STANDARD_SHEET,
    speed: DEFAULT_SPEED,
  },
  captain: {
    name: 'Captain',
    portrait: 'portrait-captain',
    spritesheet: 'npc-captain',
    ...STANDARD_SHEET,
    speed: DEFAULT_SPEED,
  },
} as const satisfies Record<string, CharacterDef>;

/** Key of a registered character. */
export type CharacterId = keyof typeof characters;

/** Animation key for a character, e.g. `hero-walk-left`. */
export function animationKey(
  character: CharacterId,
  kind: 'idle' | 'walk',
  direction: Direction,
): string {
  return `${character}-${kind}-${direction}`;
}
