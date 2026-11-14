import type { EventBus } from '@/core/events/EventBus';
import type { GameEvents } from '@/core/events/events';
import type { DisplayLanguage, Language } from '@/core/locale/text';
import { setTextLanguage, textLanguage } from '@/core/locale/text';
import type { SettingsService } from '@/core/settings/SettingsService';

/** Where the service writes the page language: `document.documentElement` in the browser. */
export interface LanguageRoot {
  lang: string;
}

/** The `lang` attribute of each display language; `pseudo` gets the usual pseudo-locale tag. */
const ROOT_LANG: Readonly<Record<DisplayLanguage, string>> = {
  en: 'en',
  uk: 'uk',
  pseudo: 'en-XA',
};

/**
 * The language of the game (plan uk-localization D4): `?lang=` (main.ts, not stored) wins over
 * the language chosen in the settings, which wins over the browser's languages (the first one
 * starting with `uk` gives `uk`), and `en` is the last resort. Sets what `tr` shows
 * (src/core/locale/text.ts) and the page's `lang` attribute; emits `languageChanged` so open
 * screens rebuild their text.
 */
export class LocaleService {
  /**
   * @param browserLanguages the browser's languages in preference order (`navigator.languages`)
   * @param root where the page language goes (`document.documentElement`), or undefined
   */
  constructor(
    private readonly settings: SettingsService,
    private readonly events: EventBus<GameEvents>,
    browserLanguages: readonly string[] = [],
    private readonly root?: LanguageRoot,
  ) {
    this.apply(settings.get('language') ?? languageOfBrowser(browserLanguages));
  }

  /** The language shown now (`en`, `uk` or `pseudo`). */
  get language(): DisplayLanguage {
    return textLanguage();
  }

  /**
   * Shows `language` from now on and emits `languageChanged` when it differs from the current
   * one. `en`/`uk` are also stored in the settings unless `persist` is false (`?lang=`, main.ts);
   * `pseudo` is never stored.
   */
  setLanguage(language: DisplayLanguage, options: { persist?: boolean } = {}): void {
    if (language !== 'pseudo' && options.persist !== false) {
      this.settings.set('language', language);
    }
    const previous = textLanguage();
    if (language === previous) return;
    this.apply(language);
    this.events.emit('languageChanged', { language, previous });
  }

  /** State for the smoke tool and the console: `window.nasa.services.locale.debugInfo()`. */
  debugInfo(): { language: DisplayLanguage; saved: Language | null } {
    return { language: textLanguage(), saved: this.settings.get('language') };
  }

  private apply(language: DisplayLanguage): void {
    setTextLanguage(language);
    if (this.root) this.root.lang = ROOT_LANG[language];
  }
}

/**
 * The browser's most preferred language the game has: walks `languages` in order and returns the
 * first that is Ukrainian (`uk`, `uk-UA`) or English; `en` when neither appears (D4).
 */
export function languageOfBrowser(languages: readonly string[]): Language {
  for (const tag of languages) {
    if (/^uk(-|$)/i.test(tag)) return 'uk';
    if (/^en(-|$)/i.test(tag)) return 'en';
  }
  return 'en';
}
