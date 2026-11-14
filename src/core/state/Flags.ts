import type { EventBus } from '@/core/events/EventBus';
import type { GameEvents } from '@/core/events/events';
import type { FlagValue } from '@/core/state/GameState';

/**
 * Story flags: named values that dialogues, cutscenes and the story check and change
 * (`metEngineer: true`, `fuelChecks: 2`, `chosenRoute: 'north'`). Part of the save.
 */
export class Flags {
  private values: Record<string, FlagValue> = {};

  constructor(private readonly events: EventBus<GameEvents>) {}

  /** Value of the flag, or undefined if it was never set. */
  get(key: string): FlagValue | undefined {
    return this.values[key];
  }

  /** Whether the flag was ever set. */
  has(key: string): boolean {
    return Object.hasOwn(this.values, key);
  }

  /** Sets the flag. Emits `flagChanged` only when the value actually changes. */
  set(key: string, value: FlagValue): void {
    const previous = this.values[key];
    if (this.has(key) && previous === value) return;
    this.values[key] = value;
    this.events.emit('flagChanged', { key, value, previous });
  }

  /**
   * Deletes every flag whose key starts with `prefix` (`voyage.`, plan D17), emitting
   * `flagChanged` with `value` undefined for each.
   */
  deletePrefix(prefix: string): void {
    for (const key of Object.keys(this.values)) {
      if (!key.startsWith(prefix)) continue;
      const previous = this.values[key];
      delete this.values[key];
      this.events.emit('flagChanged', { key, value: undefined, previous });
    }
  }

  /** Copy of all flags (for the save and the debug overlay). */
  toRecord(): Record<string, FlagValue> {
    return { ...this.values };
  }

  /** Replaces all flags without emitting events (loading a save, starting a new game). */
  replaceAll(values: Record<string, FlagValue>): void {
    this.values = { ...values };
  }
}
