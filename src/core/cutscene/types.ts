/**
 * The cutscene model: a cutscene is an async function over a small API. No Phaser
 * here - the API is implemented on the world and UI scenes by src/world/WorldCutsceneApi.ts.
 * How to write one: docs/HOWTO-cutscene.md.
 *
 * `AudioKey`, `Direction`, `Speaker`, `DialogueId` and `LocationId` come from src/assets and
 * src/content. src/core may import them with `import type` only: types are erased at build
 * time, so core keeps no runtime dependency on content or assets (and content, which imports
 * these types, cannot form a runtime import cycle with core).
 */
import type { AudioKey } from '@/assets';
import type { Direction } from '@/content/characters';
import type { DialogueId } from '@/content/dialogues';
import type { LocationId } from '@/content/locations';
import type { Speaker } from '@/core/dialogue/types';
import type { FlagValue } from '@/core/state/GameState';
import type { StateText } from '@/core/text/format';

/**
 * Who a cutscene moves: `'player'` (the hero) or the name of an `npc` object of the current
 * location's map (`'npc-engineer'`).
 */
// `string & {}` keeps 'player' in editor completion while still allowing any NPC name.
export type ActorId = 'player' | (string & {});

/** A position in map pixels (feet position for actors). */
export interface MapPoint {
  x: number;
  y: number;
}

/**
 * A place in the current location: the name of a `spawn` or `point` object of its map
 * (`'spawn-hatch'`), an actor id (`'player'`, `'npc-engineer'`: where that actor stands
 * now) or map pixels (`{ x: 320, y: 180 }`). Object names are unique in a map, so one string
 * names one thing.
 */
export type Place = string | MapPoint;

/**
 * What a cutscene script can do. Methods that take time return a promise: `await` them to
 * wait, or start several and `await Promise.all([...])` to run them together. Unknown actor or
 * place names warn in the console and the step is skipped (the cutscene goes on).
 */
export interface CutsceneApi {
  /**
   * Walks an actor to a place in a straight line at its normal speed; resolves on arrival, or
   * early (with a console warning) when something blocks the way for half a second. Walking to
   * an actor stops beside it (left or right, the side it comes from) and turns to face it.
   * NPCs walk through walls;
   * the hero does not.
   */
  walk(actor: ActorId, to: Place): Promise<void>;
  /** Turns an actor to a direction, or towards a place (`face('player', 'npc-engineer')`). */
  face(actor: ActorId, to: Direction | Place): void;
  /**
   * Shows one line in the dialogue window and resolves when the player closes it (Enter,
   * Space or a click). `speaker` is a character id or `'narrator'`; `text` may be a function of
   * the state (`(s) => formatText('Lost at {gate}.', { gate: ... })`).
   */
  say(speaker: Speaker, text: StateText): Promise<void>;
  /** Runs a whole dialogue from src/content/dialogues and resolves when it ends. */
  dialogue(id: DialogueId): Promise<void>;
  /** Waits `ms` of game time (stops while the game is paused). */
  wait(ms: number): Promise<void>;
  /** Fades the screen to black over `ms`; the screen stays black until `fadeIn`. */
  fadeOut(ms: number): Promise<void>;
  /** Fades back from black over `ms`. */
  fadeIn(ms: number): Promise<void>;
  /**
   * Stops the camera following the hero and slides it to centre on a place over `ms` (the
   * camera stays inside the location). Call `cameraFollowPlayer()` to give it back.
   */
  cameraPanTo(to: Place, ms: number): Promise<void>;
  /** The camera follows the hero again (jumps to the hero: pan back first for a smooth move). */
  cameraFollowPlayer(): void;
  /** Sets a story flag (same as `state.flags.set`). */
  setFlag(name: string, value: FlagValue): void;
  /** Plays a sound effect from src/assets/audio.ts. */
  playSfx(key: AudioKey): void;
  /** Puts an actor at a place at once (no walking). */
  teleport(actor: ActorId, to: Place): void;
  /**
   * An NPC's home: the position of its `npc` object in the current location's map (not where
   * it stands now), for walking or teleporting it back (`api.teleport(id, api.homeOf(id))`).
   * Unknown names warn and return the actor's current place (the step then does nothing).
   */
  homeOf(actor: ActorId): Place;
  /**
   * Moves the hero to spawn `spawn` of location `location` (fade out, load, fade in). Resolves
   * in the new location; later steps of the cutscene act there.
   */
  goTo(location: LocationId, spawn: string): Promise<void>;
  /** Shows a large centred title (over a black screen too) for `ms`, then removes it. */
  showTitle(text: string, ms: number): Promise<void>;
}

/**
 * A cutscene: a script over `CutsceneApi`. Its id is its key in the registry
 * src/content/cutscenes/index.ts (`CutsceneId`).
 *
 * ```ts
 * export const warehouseArrival: Cutscene = {
 *   async run(api) {
 *     await api.walk('npc-engineer', 'player');
 *     await api.say('engineer', 'Welcome aboard.');
 *   },
 * };
 * ```
 */
export interface Cutscene {
  run(api: CutsceneApi): Promise<void>;
}
