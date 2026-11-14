import type { Language } from '@/core/locale/text';
import { isLanguage } from '@/core/locale/text';

/**
 * Player settings; volumes go from 0 (silent) to 1 (full). `language`: the one chosen in the
 * settings, or null while never chosen (then the browser's languages decide, `LocaleService`).
 */
export interface Settings {
  music: number;
  sfx: number;
  language: Language | null;
}

/** localStorage key of the settings; kept apart from the saved game. */
export const SETTINGS_KEY = 'space-owner.settings';

const DEFAULTS: Settings = { music: 0.7, sfx: 0.8, language: null };

/**
 * How each setting is checked, from storage and in `set`: the value to keep, or undefined to
 * drop it (the default or the previous value stays). Volumes are clamped to 0..1; an unknown
 * language counts as none chosen.
 */
const PARSERS: { [K in keyof Settings]: (value: unknown) => Settings[K] | undefined } = {
  music: parseVolume,
  sfx: parseVolume,
  language: (value) => (isLanguage(value) ? value : null),
};

/**
 * Player settings (music and sound volume, language), stored in localStorage on every change.
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
    const parsed = PARSERS[key](value);
    if (parsed === undefined) return;
    this.values[key] = parsed;
    this.storage.setItem(SETTINGS_KEY, JSON.stringify(this.values));
  }

  private read(): Partial<Settings> {
    try {
      const data: unknown = JSON.parse(this.storage.getItem(SETTINGS_KEY) ?? '{}');
      if (typeof data !== 'object' || data === null) return {};
      const stored: Partial<Record<keyof Settings, unknown>> = {};
      for (const key of Object.keys(DEFAULTS) as (keyof Settings)[]) {
        const value = PARSERS[key]((data as Record<string, unknown>)[key]);
        if (value !== undefined) stored[key] = value;
      }
      return stored as Partial<Settings>;
    } catch {
      console.warn(`SettingsService: '${SETTINGS_KEY}' is not valid JSON, defaults used`);
      return {};
    }
  }
}

function parseVolume(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(1, Math.max(0, value));
}
