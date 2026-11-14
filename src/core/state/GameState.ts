import type { EventBus } from '@/core/events/EventBus';
import type { GameEvents } from '@/core/events/events';
import { Flags } from '@/core/state/Flags';

/** Value of a story flag. */
export type FlagValue = boolean | number | string;

/** Where the player is in the story: act, location and the spawn point in it. */
export interface GamePosition {
  actId: string;
  locationId: string;
  /** Name of a spawn object in the location's Tiled map. */
  spawn: string;
}

/**
 * Saved game as stored in localStorage (SaveService). Bump `version` when this shape changes:
 * a save of another version counts as none (`SaveService.load`).
 */
export interface GameSave extends GamePosition {
  version: typeof SAVE_VERSION;
  flags: Record<string, FlagValue>;
  /**
   * A voyage was running when this was saved (act 2): "Continue" starts the voyage again from
   * its start with the same cargo and `run.seed` (plan D17; the save holds no simulation).
   */
  voyage?: true;
  /** Time of saving, `Date.now()` ms. */
  savedAt: number;
}

/**
 * Current version of the save shape. 2: no simulation snapshot, `voyage` instead (plan D17);
 * saves of version 1 are ignored.
 */
export const SAVE_VERSION = 2;

/**
 * The model of the running game: story flags, current position, whether a voyage runs.
 * Scenes read and change it through `services.state`; the save is a snapshot of it.
 */
export class GameState {
  /** Story flags; `flags.set` emits `flagChanged`. */
  readonly flags: Flags;
  /** Current act, location and spawn; null when no game is in progress (main menu). */
  current: GamePosition | null = null;
  /**
   * Whether a voyage runs (act 2), for the save: `FlowService.checkpoint` sets it before
   * saving, `continueGame` reads it back.
   */
  voyage = false;

  constructor(events: EventBus<GameEvents>) {
    this.flags = new Flags(events);
  }

  /** Snapshot for saving. Throws if no game is in progress (`current` is null). */
  toSave(): GameSave {
    if (!this.current) throw new Error('GameState.toSave: no game in progress (current is null)');
    const save: GameSave = {
      version: SAVE_VERSION,
      ...this.current,
      flags: this.flags.toRecord(),
      savedAt: Date.now(),
    };
    if (this.voyage) save.voyage = true;
    return save;
  }

  /** Restores the state from a save. Does not emit `flagChanged`. */
  loadFrom(save: GameSave): void {
    this.current = { actId: save.actId, locationId: save.locationId, spawn: save.spawn };
    this.flags.replaceAll(save.flags);
    this.voyage = save.voyage === true;
  }

  /** Clears everything: no position, no flags, no voyage. Does not emit `flagChanged`. */
  reset(): void {
    this.current = null;
    this.flags.replaceAll({});
    this.voyage = false;
  }
}
