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
 * Saved game as stored in localStorage (SaveService). Bump `version` and teach
 * `SaveService.load` to convert old saves when this shape changes.
 */
export interface GameSave extends GamePosition {
  version: 1;
  flags: Record<string, FlagValue>;
  /** State of the ship simulation (src/core/simulation), if the act runs one. */
  simulation?: unknown;
  /** Time of saving, `Date.now()` ms. */
  savedAt: number;
}

/** Current version of the save shape. */
export const SAVE_VERSION = 1;

/**
 * The model of the running game: story flags, current position and simulation data.
 * Scenes read and change it through `services.state`; the save is a snapshot of it.
 */
export class GameState {
  /** Story flags; `flags.set` emits `flagChanged`. */
  readonly flags: Flags;
  /** Current act, location and spawn; null when no game is in progress (main menu). */
  current: GamePosition | null = null;
  /**
   * Ship simulation state to keep in the save: `FlowService.checkpoint` puts
   * `services.simulation.snapshot()` here before saving (undefined when none runs).
   */
  simulation: unknown = undefined;

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
    if (this.simulation !== undefined) save.simulation = this.simulation;
    return save;
  }

  /** Restores the state from a save. Does not emit `flagChanged`. */
  loadFrom(save: GameSave): void {
    this.current = { actId: save.actId, locationId: save.locationId, spawn: save.spawn };
    this.flags.replaceAll(save.flags);
    this.simulation = save.simulation;
  }

  /** Clears everything: no position, no flags, no simulation. Does not emit `flagChanged`. */
  reset(): void {
    this.current = null;
    this.flags.replaceAll({});
    this.simulation = undefined;
  }
}
