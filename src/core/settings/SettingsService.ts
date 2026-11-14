/** Player settings; volumes go from 0 (silent) to 1 (full). */
export interface Settings {
  music: number;
  sfx: number;
}

/** localStorage key of the settings; kept apart from the saved game. */
export const SETTINGS_KEY = 'space-owner.settings';

const DEFAULTS: Settings = { music: 0.7, sfx: 0.8 };

/**
 * Player settings (music and sound volume), stored in localStorage on every change.
 * Values missing or broken in storage fall back to the defaults.
 */
export class SettingsService {
  private values: Settings;

  constructor(private readonly storage: Storage = window.localStorage) {
    this.values = { ...DEFAULTS, ...this.read() };
  }

  /** Current value of one setting. */
  get<K extends keyof Settings>(key: K): Settings[K] {
    return this.values[key];
  }

  /** Changes one setting (volumes are clamped to 0..1) and stores all settings. */
  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.values[key] = clampVolume(value);
    this.storage.setItem(SETTINGS_KEY, JSON.stringify(this.values));
  }

  private read(): Partial<Settings> {
    try {
      const data: unknown = JSON.parse(this.storage.getItem(SETTINGS_KEY) ?? '{}');
      if (typeof data !== 'object' || data === null) return {};
      const stored: Partial<Settings> = {};
      for (const key of Object.keys(DEFAULTS) as (keyof Settings)[]) {
        const value = (data as Record<string, unknown>)[key];
        if (typeof value === 'number' && Number.isFinite(value)) stored[key] = clampVolume(value);
      }
      return stored;
    } catch {
      console.warn(`SettingsService: '${SETTINGS_KEY}' is not valid JSON, defaults used`);
      return {};
    }
  }
}

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, value));
}
