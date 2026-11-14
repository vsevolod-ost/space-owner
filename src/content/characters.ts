import type { ImageKey, SpritesheetKey } from '@/assets';

/** Facing direction of a character; also the name of a row in its sprite sheet. */
export type Direction = 'down' | 'left' | 'right' | 'up';

/**
 * A character: a name and a portrait for the dialogue window, and, for one that stands in
 * locations, its sprite sheet (`ActorDef`). A character without a sheet only speaks (the
 * ship's computer); it cannot be an NPC in a map.
 */
export type CharacterDef = SpeakerDef | ActorDef;

/** A character that only speaks: no sprite sheet. */
export interface SpeakerDef {
  /** Name shown to the player (dialogue speaker, messages). */
  name: string;
  /** Portrait shown in the dialogue window when this character speaks (48x48). */
  portrait?: ImageKey;
  spritesheet?: never;
}

/** A character that stands and walks in locations: everything needed to animate and move it. */
export interface ActorDef {
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

/** Default walking speed, pixels per second. OWNER: design */
const DEFAULT_SPEED = 80;

/** Default layout of a 4x4 character sheet: rows down, left, right, up; frame 0 stands. */
const STANDARD_SHEET = {
  rows: { down: 0, left: 1, right: 2, up: 3 },
  framesPerRow: 4,
  idleFrame: 0,
  walkFrames: [1, 2, 3],
  walkFrameRate: 8,
} as const;

/**
 * Layout of a standing sheet in 1 column (32x192): one standing frame per direction, rows
 * down, left, right, up; the "walk" shows the standing frame.
 */
const STANDING_SHEET = {
  rows: { down: 0, left: 1, right: 2, up: 3 },
  framesPerRow: 1,
  idleFrame: 0,
  walkFrames: [0],
  walkFrameRate: 1,
} as const;

/**
 * Registry of characters. BootScene creates walk and idle animations for each one with a
 * sprite sheet. The captain of the demo is gone (GDD D16): the voice of Earth is the scientists.
 * OWNER: script - the `name`s (shown over dialogue lines and on event cards).
 */
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
    ...STANDING_SHEET,
    speed: DEFAULT_SPEED,
  },
  astronomer: {
    name: 'Astronomer',
    portrait: 'portrait-astronomer',
    spritesheet: 'npc-astronomer',
    ...STANDING_SHEET,
    speed: DEFAULT_SPEED,
  },
  /** The ship's computer: speaks on the deck and the panel, has no body. */
  computer: {
    name: 'Computer',
    portrait: 'portrait-computer',
  },
} as const satisfies Record<string, CharacterDef>;

/** Key of a registered character. */
export type CharacterId = keyof typeof characters;

/** Key of a character with a sprite sheet: the hero or an NPC that can stand in a map. */
export type ActorCharacterId = {
  [K in CharacterId]: (typeof characters)[K] extends { spritesheet: SpritesheetKey } ? K : never;
}[CharacterId];

/** Animation key for a character, e.g. `hero-walk-left`. */
export function animationKey(
  character: CharacterId,
  kind: 'idle' | 'walk',
  direction: Direction,
): string {
  return `${character}-${kind}-${direction}`;
}
