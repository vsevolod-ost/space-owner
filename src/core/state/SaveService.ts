import type { FlagValue, GameSave, GameState } from '@/core/state/GameState';
import { SAVE_VERSION } from '@/core/state/GameState';

/** localStorage key of the saved game. */
export const SAVE_KEY = 'space-owner.save';

/**
 * Keeps one saved game in localStorage (checkpoint autosave). A save that cannot be read
 * (broken JSON, other version, wrong shape) counts as no save and is reported with
 * `console.warn`; it stays in storage until the next `save` or `clear`.
 */
export class SaveService {
  constructor(private readonly storage: Storage = window.localStorage) {}

  /** Writes a snapshot of `state` (see `GameState.toSave`) and returns it. */
  save(state: GameState): GameSave {
    const save = state.toSave();
    this.storage.setItem(SAVE_KEY, JSON.stringify(save));
    return save;
  }

  /** The stored save, or null if there is none or it cannot be used. */
  load(): GameSave | null {
    const raw = this.storage.getItem(SAVE_KEY);
    if (raw === null) return null;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      console.warn(`SaveService: '${SAVE_KEY}' is not valid JSON, ignored`);
      return null;
    }
    if (!isGameSave(data)) {
      console.warn(`SaveService: '${SAVE_KEY}' has an unknown version or shape, ignored`, data);
      return null;
    }
    return data;
  }

  /** Whether a usable save exists ("Continue" in the main menu). */
  hasSave(): boolean {
    return this.load() !== null;
  }

  /** Deletes the save. */
  clear(): void {
    this.storage.removeItem(SAVE_KEY);
  }
}

function isGameSave(data: unknown): data is GameSave {
  if (typeof data !== 'object' || data === null) return false;
  const save = data as Record<string, unknown>;
  return (
    save.version === SAVE_VERSION &&
    typeof save.actId === 'string' &&
    typeof save.locationId === 'string' &&
    typeof save.spawn === 'string' &&
    typeof save.savedAt === 'number' &&
    typeof save.flags === 'object' &&
    save.flags !== null &&
    Object.values(save.flags).every(isFlagValue)
  );
}

function isFlagValue(value: unknown): value is FlagValue {
  return typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string';
}
