import type { FlagValue, GameSave } from '@/core/state/GameState';

/**
 * Every game event and its payload. To add an event, add a line here: `services.events.emit`
 * and `services.events.on` pick it up with full typing.
 *
 * Location, act, dialogue and cutscene ids are plain strings in src/core: the registries that
 * narrow them (`LocationId`, `DialogueId`, ...) live in src/content.
 */
export interface GameEvents {
  /** A flag got a new value (`GameState.flags.set`); `previous` is undefined for a new flag. */
  flagChanged: { key: string; value: FlagValue; previous: FlagValue | undefined };
  /** The hero appeared in a location (WorldScene, after loading it). */
  locationEntered: { locationId: string; spawn: string };
  /**
   * The object the hero would interact with changed (`name` of the map object), or the hero
   * moved away from all of them (`null`). UiScene shows the "E" hint from this.
   */
  interactableFocused: { name: string | null };
  /** A dialogue window opened. */
  dialogueStarted: { dialogueId: string };
  /** A dialogue window closed. */
  dialogueEnded: { dialogueId: string };
  /** A cutscene began; player input is off until it ends. */
  cutsceneStarted: { cutsceneId: string };
  /** A cutscene finished. */
  cutsceneEnded: { cutsceneId: string };
  /** The game was saved at a checkpoint. */
  checkpointSaved: { save: GameSave };
  /** The hero died or the mission failed; `reason` is an ending id. */
  gameOver: { reason: string };
  /**
   * The ship simulation advanced (about four times per real second, not every frame); `dt` is
   * the simulated time since the previous `simulationTick`, seconds. Not recorded in
   * `window.__nasaEvents`.
   */
  simulationTick: { dt: number };
}
