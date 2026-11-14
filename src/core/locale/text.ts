/**
 * The text model of the game's two languages (plan uk-localization D6): a visible string is a
 * pair `{ en: 'Main menu', uk: TODO }` where it is written, and `tr(pair)` gives the string of
 * the current language at the moment it is shown.
 *
 * This file has no imports on purpose: content loads it in Node too (src/devtools, no DOM).
 * The current language is module state, `en` until `LocaleService` (src/core/locale/
 * LocaleService.ts, `services.locale`) sets it; game code changes it only through that service.
 *
 * Never call `tr` at module level (a constant of the module): it would run before main.ts sets
 * the language and freeze English. Keep pairs at module level, call `tr` when building or
 * drawing.
 */

/** A language of the game, as stored in the settings. */
export type Language = 'en' | 'uk';

/**
 * A language `tr` can show: a real one or `pseudo` (only `?lang=pseudo` and
 * `services.locale.setLanguage('pseudo')`; never stored): English with every Latin letter made
 * Cyrillic and about 30% longer, to check layout and that every string goes through `tr`.
 */
export type DisplayLanguage = Language | 'pseudo';

/** The game's languages in the order the settings row cycles them. */
export const LANGUAGES: readonly Language[] = ['en', 'uk'];

/** Each language's own name, as the settings row shows it (not translated). */
export const LANGUAGE_NAMES: Readonly<Record<Language, string>> = {
  en: 'English',
  uk: 'Українська',
};

/**
 * Marks a translation nobody has written yet: `{ en: 'Main menu', uk: TODO }`. `tr` shows the
 * English text in its place; `npm run i18n:todo` counts them.
 */
export const TODO = Symbol('TODO');

/**
 * A visible string in every language. `max`: the longest the string may be, in characters, as
 * written here (before `{placeholder}`s are filled), set only where the string alone fills a
 * fixed space (a button, a table column); `tr` warns once when a language exceeds it.
 */
export interface LocalText {
  readonly en: string;
  readonly uk: string | typeof TODO;
  readonly max?: number;
}

/**
 * A `{name}` placeholder: letters, digits, `_`, `.` and `-`, starting with a letter. Shared with
 * `formatText` (src/core/text/format.ts); `pseudo` leaves these intact.
 */
export const PLACEHOLDER = /\{([A-Za-z][\w.-]*)\}/g;

let current: DisplayLanguage = 'en';
const warned = new Set<string>();

/** Whether `value` is a language of the game (`en`, `uk`): for values read from storage. */
export function isLanguage(value: unknown): value is Language {
  return (LANGUAGES as readonly unknown[]).includes(value);
}

/** Whether `value` is a language `tr` can show (`en`, `uk`, `pseudo`): for the URL parameter. */
export function isDisplayLanguage(value: unknown): value is DisplayLanguage {
  return value === 'pseudo' || isLanguage(value);
}

/** The language `tr` shows now. */
export function textLanguage(): DisplayLanguage {
  return current;
}

/**
 * Sets the language `tr` shows. Called only by `LocaleService`; game code calls
 * `services.locale.setLanguage`, which also stores the choice and emits `languageChanged`.
 */
export function setTextLanguage(language: DisplayLanguage): void {
  current = language;
}

/**
 * The string of `text` in the current language: `uk` falls back to `en` while it is `TODO`;
 * `pseudo` is the English text made Cyrillic and longer (never over `max`). A result longer
 * than `max` is reported with `console.warn`, once per string.
 */
export function tr(text: LocalText): string {
  let result: string;
  if (current === 'pseudo') return pseudo(text.en, text.max);
  if (current === 'uk' && text.uk !== TODO) result = text.uk;
  else result = text.en;
  if (text.max !== undefined && result.length > text.max && !warned.has(result)) {
    warned.add(result);
    console.warn(`tr: "${result}" is ${result.length} chars, over its max ${text.max}`);
  }
  return result;
}

/** Cyrillic stand-ins for the Latin letters, all from the Ukrainian alphabet (font: plan K2). */
const PSEUDO_LETTERS: Readonly<Record<string, string>> = {
  a: 'а',
  b: 'б',
  c: 'ц',
  d: 'д',
  e: 'е',
  f: 'ф',
  g: 'ґ',
  h: 'г',
  i: 'і',
  j: 'й',
  k: 'к',
  l: 'л',
  m: 'м',
  n: 'н',
  o: 'о',
  p: 'п',
  q: 'щ',
  r: 'р',
  s: 'с',
  t: 'т',
  u: 'у',
  v: 'в',
  w: 'ш',
  x: 'ж',
  y: 'ї',
  z: 'з',
};

/** How much longer `pseudo` makes a string: Ukrainian runs about 30% longer than English. */
const PSEUDO_GROWTH = 0.3;

/**
 * The `pseudo` form of `en`: every Latin letter outside `{placeholder}`s becomes Cyrillic, and
 * about 30% of the letters are doubled, evenly spread, as long as the result stays within
 * `max`. Other characters (digits, punctuation, spaces, line breaks) stay.
 */
export function pseudo(en: string, max?: number): string {
  const parts = en.split(new RegExp(`(${PLACEHOLDER.source})`));
  // split with a capture group: even indexes are plain text, odd ones a placeholder and then
  // its inner name (the second group); keep placeholders whole, drop the inner names.
  const plain: string[] = [];
  const placeholders: string[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    plain.push(parts[i]);
    if (i + 1 < parts.length) placeholders.push(parts[i + 1]);
  }
  const letters = plain.reduce((n, s) => n + (s.match(/[A-Za-z]/g)?.length ?? 0), 0);
  const room = max === undefined ? Infinity : Math.max(0, max - en.length);
  const extra = Math.min(Math.ceil(letters * PSEUDO_GROWTH), room, letters);
  // Double letter number k when floor(k * extra / letters) steps up: `extra` letters, spread out.
  let seen = 0;
  const convert = (s: string): string =>
    s.replace(/[A-Za-z]/g, (ch) => {
      const lower = PSEUDO_LETTERS[ch.toLowerCase()];
      const out = ch === ch.toLowerCase() ? lower : lower.toUpperCase();
      seen += 1;
      const double =
        Math.floor((seen * extra) / letters) > Math.floor(((seen - 1) * extra) / letters);
      return double ? out + out : out;
    });
  return plain.map((s, i) => convert(s) + (placeholders[i] ?? '')).join('');
}
