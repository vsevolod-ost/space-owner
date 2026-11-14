# How to write and translate game text

The game speaks English and Ukrainian. There are no string tables and no keys: every string the
player sees is a **pair** written right where it is used, and the Ukrainian half starts as
`TODO`:

```ts
title: { en: 'Hull breach', uk: TODO },
```

While `uk` is `TODO`, the Ukrainian game shows the English text, so a translation can go in one
string at a time without breaking anything. `npm run i18n:todo` tells how many strings are left
and where.

## Where things are

| File                               | What it is                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| `src/core/locale/text.ts`          | `LocalText`, `TODO`, `tr`, the `pseudo` language, `LANGUAGES`, `LANGUAGE_NAMES`.      |
| `src/core/locale/names.ts`         | Body names by id (`bodyName('mars')`), registered by `main.ts` from the solar system. |
| `src/core/locale/LocaleService.ts` | `services.locale`: picks, stores and changes the language; emits `languageChanged`.   |
| `src/core/text/format.ts`          | `StateText` (a pair or a function of the state), `formatText`, `resolveText`.         |
| `src/scenes/SettingsScene.ts`      | The settings panel's Language row.                                                    |
| `tools/i18n-todo.mjs`              | `npm run i18n:todo`: the translation report.                                          |
| `tools/smoke/scenarios/locale.mjs` | The smoke scenario `locale`: language choice, live rebuild, the `pseudo` walk.        |

## A new string

1. Write it as a pair where the old literal would go, with `uk: TODO`, and an `OWNER: script`
   comment (the team's work list):

   ```ts
   import { TODO, tr, type LocalText } from '@/core/locale/text';

   /** Shown when the shelf is searched. OWNER: script */
   const EMPTY_SHELVES: LocalText = { en: 'Empty shelves.', uk: TODO };
   ```

2. Turn it into a string with `tr(pair)` **at the moment it is shown**: in `build()`,
   `create()`, a draw method, an interactable's `run`, a cutscene's `run`, a text function.

   ```ts
   shelf: { kind: 'interactable', run: (ctx) => ctx.ui.toast(tr(EMPTY_SHELVES)) },
   ```

3. Content fields that hold text (a dialogue line, a choice, `say`, an act or location title,
   a character name, an ending, a cargo label, an event's texts) take the pair itself; the game
   calls `tr` when it shows them. A plain string there does not compile.

Rules:

- **Never call `tr` at module level** (`const LABEL = tr({ ... })` at the top of a file). It runs
  when the module loads, before `main.ts` has set the language, and freezes English for good.
  Pairs live at module level; `tr` runs inside functions.
- **Never glue a pair into a string.** `` `${pair}` `` or `'Day ' + pair` is a lint error
  (`restrict-template-expressions`, `restrict-plus-operands`, `no-base-to-string` on `src/`
  in `eslint.config.js`). Put the numbers and names into the pair as placeholders
  and fill them after `tr`:

  ```ts
  const LANDED: LocalText = { en: 'Landed on {body}', uk: TODO }; // budget: 37
  // where it is drawn; `name` is the body's own pair (bodyName(id), src/core/locale/names.ts)
  formatText(tr(LANDED), { body: tr(name) });
  ```

  A whole sentence goes into one pair: no English word order, articles (`a`/`an`) or
  `.toLowerCase()` built in code. Where the sentence changes with a value, write one full
  sentence per value (see `STOP_TEXTS` in `src/ui/navigation/GateCard.ts`).

- **A state-dependent line** (`StateText`) is a function that returns the finished string and
  translates its template inside:
  `text: (s) => formatText(tr({ en: 'Oxygen: {days} d', uk: TODO }), { days: daysOf(s) })`.
- **The UI kit takes strings** (`createText`, `Button`, `Label`, `Toast`, `ChoiceList`,
  `ui.toast`, `showTitle`): a bare English literal passed to them still compiles. The `pseudo`
  check below is what catches it, so run the `locale` scenario after adding a screen.
- Ids stay ids. Never compare a shown text in code: keep an id (`'resume'`, `'cold'`) and a
  table of labels next to it (`CHOICE_LABELS`, `HEAT_NAMES`).
- Text the player never sees stays English and is not a pair: console messages, `debugInfo()`
  ids, the debug overlay (F3, `DebugScene`).
- A line still to be written is `{ en: '[TODO: what it should say]', uk: TODO }`: the writer
  replaces the English bracket, the translator the `TODO`.

## Translating

Replace `TODO` with the Ukrainian text and keep the rest of the pair as it is:

```ts
title: { en: 'Hull breach', uk: 'Пробоїна в корпусі' },
```

The `TODO` import of a file can go once its last `TODO` is gone (lint reports it as unused).
Then check it: `npm run i18n:todo` (the count drops, nothing is over its `max`), `npm run check`,
and play the screen with `?lang=uk`.

### Placeholders are nominative

`{name}` parts stay exactly as in English (do not translate the name inside the braces). Their
values are always in the **nominative** (bodies, gates, causes, stations, cargo names) or plain
numbers; the game has no other case forms. Build the sentence so the nominative fits:

| English                    | Not this                       | But this                       |
| -------------------------- | ------------------------------ | ------------------------------ |
| `Landed on {body}`         | `Сіли на {body}` (needs Марсі) | `Посадка: {body}`              |
| `Route: {from} → {to}`     |                                | `Маршрут: {from} → {to}`       |
| `Next: {gate} in {days} d` |                                | `Далі: {gate}, через {days} д` |

A list (the hatch's `{gaps}`) is a comma-separated list of nominatives.

### Numbers and abbreviations, no plurals

No string picks a word form by number: days are `N d` and `day {day}`. Translate them as an
abbreviation (`{days} д`) or an ordinal form (`день {day}`), never a form that agrees with the
number (`днів`, `дні`). Numbers are formatted by the game with a dot (`2.5`) in every language;
units are written after them in the pair (`km/s`, `t`): a translator may translate a unit or
keep the English abbreviation by repeating it in `uk`. When a string that really needs plural
forms appears, add a helper (`Intl.PluralRules`) then; there is none now on purpose.

### Length budgets

Ukrainian runs about 30 % longer than English, and some places do not grow.

- **`max` in a pair**: the longest the string may be, in characters, **as written in the pair**
  (placeholders count as written). It is set only where the string alone fills a fixed space:
  a button (160 px = 18 characters at 8 px), a settings row label, a table column, a title.
  `tr` warns in the console when a language goes over it, and `npm run i18n:todo` lists such
  pairs. Do not raise a `max` to fit a translation: shorten the text, or ask the UI owner to
  widen the place first.
- **`// budget: N` comment** above a template: the length of the **finished** string after the
  numbers and names are filled in, for example `// budget: 37 chars each` above the navigation
  column's lines ("Next: GANYMEDE in 51 d"). The tool cannot check these; count with the longest
  values in mind (the longest body name, three-digit days).
- **No budget** (text that wraps and the panel grows): dialogue choices, toasts, cards, log
  lines, ending text.

**The dialogue window** splits a long line into pages (about **260 characters** per page under
a speaker's name), so a translation of a dialogue line has no budget. Still, a line that just
spills a few words onto a second page reads badly; if the English fits one page, try to keep the
translation on one page too.

## Checking

- `?lang=uk` shows Ukrainian for one page load without storing it (`?lang=en` too); the
  settings' Language row changes and stores the language for good. Combine with the other
  parameters: `?lang=uk&location=warehouse`.
- `?lang=pseudo` is a test language, never stored and not in the settings (also
  `nasa.services.locale.setLanguage('pseudo')` from the console): every string through `tr` is
  shown as its English text with **every Latin letter replaced by a Cyrillic one** and about 30 %
  longer (never longer than its `max`); `{placeholders}` stay. Look for text that overflows or
  overlaps. Any Latin letter left on screen is a string that did not go through `tr`.
- The smoke scenario `locale` (`node tools/smoke.mjs --scenario
tools/smoke/scenarios/locale.mjs --timeout 300000` after `npm run build`; about 2.5 min)
  checks the language choice (browser languages, the settings row from the menu and the pause,
  reload, `?lang=` not stored), the live rebuild, and then walks the screens on `en` and on
  `pseudo` (screenshots `smoke-out/locale-<screen>-<lang>.png`): menus, dialogues, a cutscene
  line, title cards, toasts, the navigation panel (also DRIFTING and LOST), alarms, the
  debrief, the colony and an ending. Text passed straight to the kit, a toast or a title is
  checked only there: a new screen with such text belongs in the walk. On `pseudo` it reads every visible text
  object of the active scenes but the debug overlay and fails on any text with a Latin letter,
  naming it and its scene. A string that must stay Latin on purpose goes into
  `LATIN_EXCEPTIONS` in the scenario with the reason. A raw id on screen (a body, a cause of
  death) is not an exception: the table of labels is missing an entry.
- `npm run i18n:todo` prints a table of the files with pairs (how many `TODO`, how many
  translated), the total, the pairs whose text is over their `max`, and pairs it could not
  measure. It always exits 0; `--strict` exits 1 when a pair is over its `max`.

## The language at start and when it changes

`services.locale` picks the language when the game loads: `?lang=` wins (not stored), then the
language chosen in the settings, then the browser: the first entry of `navigator.languages`
that is Ukrainian (`uk`, `uk-UA`) or English (`en`, `en-GB`) decides, so `['de-DE', 'uk']` gives
Ukrainian and `['en-GB', 'uk-UA']` English; with neither, English. The page's
`<html lang>` follows.

The Language row of the settings panel (over the main menu or the pause menu) cycles the
languages, each shown by its own name (`English`, `Українська`), and applies the choice at once:
`setLanguage` stores it and emits `languageChanged`, and every screen visible at that moment
redraws its text. **A new screen must do the same** if it can be on screen while the settings
are open:

- A panel extending `PanelScene` sets `protected rebuildOnLanguageChange = true`: on
  `languageChanged` it tears down its content (`onTeardown` callbacks run) and runs `build` again
  with the same data, with `this.rebuilding` true so it can keep the selected row. `rebuild()`
  does not reset `closeOnCancel` (only `open()` does).
- Any other scene subscribes in `create`:
  `const off = services.events.on('languageChanged', () => this.redraw())`, and calls `off()` on
  `Phaser.Scenes.Events.SHUTDOWN` (see `MainMenuScene`, `UiScene`, `AlarmBarScene`, and `WorldScene`, which refreshes the HOLD
  strip).
- A screen that cannot be open under the settings (dialogue, navigation panel, event station)
  needs nothing: it builds its text when it opens.

Lines already written into the navigation panel's voyage log stay in the language they were
written in; new lines use the new one.

## Adding a third language

1. `src/core/locale/text.ts`: add the code to `Language`, `LANGUAGES` (the settings row's
   order) and its own name to `LANGUAGE_NAMES`; add the field to `LocalText`
   (`readonly pl: string | typeof TODO;`) and its branch to `tr`. The type check then lists
   every pair without the field: add `pl: TODO` to all of them (a search and replace of
   `uk: TODO` with `uk: TODO, pl: TODO` covers almost all), and to translated pairs by hand.
2. `src/core/locale/LocaleService.ts`: the `ROOT_LANG` entry and the browser match in
   `languageOfBrowser`. The settings accept any code in `LANGUAGES`.
3. `tools/i18n-todo.mjs`: it recognises pairs as objects with exactly `en`, `uk` and `max`;
   teach it the new key and a column for it.
4. Check that the font (`public/fonts/PressStart2P.ttf`) has the language's letters; it has the
   whole Ukrainian alphabet and `' ’ ʼ « » — – … №`.
5. The settings panel's value column must fit the longest language name.
6. Run `npm run check`, `npm run build` and the `locale` smoke scenario; extend the scenario's
   language checks.
