/**
 * Smoke scenario: the game's language (plan uk-localization S5). Each phase is a function below;
 * helpers live in tools/smoke/locale.mjs.
 *
 * 1. Browser languages: with no saved settings and no `lang` in the URL, the first of
 *    `navigator.languages` that is Ukrainian or English decides (`['uk-UA', 'en']` gives uk,
 *    `['en-US']` en, `['de-DE', 'uk']` uk, `['en-GB', 'uk-UA']` en).
 * 2. From the menu: Settings -> Language row, Right switches to Ukrainian (value "Українська",
 *    the service, `<html lang>`, the stored setting); the selected row stays; the settings and the
 *    menu under them show the Ukrainian labels (`UK`). The choice survives a reload and beats the
 *    browser.
 * 3. `?lang=en` shows English for that load and stores nothing: the next plain load is Ukrainian.
 * 4. From the pause: Esc -> Settings, the "-" button (mouse) back to English; the panels and the
 *    world stay paused, the pause keeps its selected option.
 * 5. Live rebuild: `services.locale.setLanguage('pseudo')` with the settings open over the menu
 *    and over the pause (in the warehouse, with the HOLD strip); in the same task the settings,
 *    the screen under them and the HOLD caption show the new text, the selected rows stay,
 *    nothing is stored; back to English gives the English labels again and input still works
 *    (a rebuilt menu button opens About; the pause keeps its hold on the simulation).
 * 6. Screens (plan S6), on `?lang=en` and then `?lang=pseudo`, each shot as
 *    `locale-<screen>-<lang>`: menu, settings, about, cutscene-say (the warehouse arrival's
 *    first line), world-hint (the E hint and the HOLD strip), dialogue-choice, e1-longest-line
 *    (the engineer's cargo advice, the longest line, plan E1), stand, toast, hatch, pause,
 *    settings-pause, act-title (act 2's title card), checkpoint-toast, nav (the column), gate
 *    (the card with the forecast), alarm-flash, alarm-bar, wrong-station, event-station (seed
 *    71's hull breach), nav-drifting (the tank emptied), nav-lost (an event's death, the
 *    longest cause label), debrief-1..3 (its lines), debrief-hypoxia-1, landing-title ("Moon ·
 *    day 61"), colony-shelter (the tier line), ending (the Moon's settlement). Every look needs
 *    some text of the screen's own scene (else the check would see nothing). On pseudo any
 *    visible text of a scene but the debug overlay with a Latin letter fails (a string not
 *    through `tr`, D12; `LATIN_EXCEPTIONS`); overlapping and off-screen texts are logged. On en
 *    the E hint and the alarm bar are switched to pseudo and back live (they re-resolve on
 *    `languageChanged`).
 *
 * The language choice (1-5) and every group of screens of 6 on each language run side by side,
 * each on a page of its own (`h.parallel`).
 *
 * Run (about 1 min; 30 s with `--gpu`):
 *   node tools/smoke.mjs --scenario tools/smoke/scenarios/locale.mjs
 *
 * @param {import('playwright-core').Page} page
 * @param {any} h helpers, see tools/smoke.mjs
 */
import { openNavigation, standAt } from '../alarm.mjs';
import {
  allTexts,
  closePanels,
  fakeBrowserLanguages,
  frames,
  installScreenText,
  languageState,
  layoutHints,
  openSettingsFromMenu,
  openSettingsFromPause,
  screenText,
  selectSettingsRow,
  SETTINGS_ROW,
  startFresh,
} from '../locale.mjs';

/** The English labels the screens show (plan D8: English output unchanged). */
const EN = {
  settingsRows: [
    ['Music', null],
    ['SFX', null],
    ['Language', 'English'],
  ],
  menu: ['Continue', 'New Game', 'Settings', 'About'],
  pause: ['Resume', 'Settings', 'Main menu'],
};
/**
 * The same labels in Ukrainian, as the `uk` slots of their pairs (SettingsScene, StubScene,
 * MainMenuScene); a changed translation changes them here too.
 */
const UK = {
  title: 'Налаштування',
  back: 'Назад',
  settingsRows: [
    ['Музика', null],
    ['Ефекти', null],
    ['Мова', 'Українська'],
  ],
  menu: ['Продовжити', 'Нова гра', 'Налаштування', 'Про гру'],
};
/** The English panel title and Back button, beside `EN`. */
const EN_PANEL = { title: 'Settings', back: 'Back' };
const UK_NAME = 'Українська';
const WAREHOUSE = '/?location=warehouse&spawn=spawn-default';

/** Pages this scenario can use at once (`h.parallel`; tools/smoke-all.mjs reads it). */
export const pages = 11;

export default async function locale(_page, root) {
  // Independent parts side by side, each on a page with its own storage: the language choice
  // (1-5, in order: each phase starts from what the one before stored) and every group of
  // screens on en and on pseudo. The longest first.
  const failures = [];
  const choice = async (page, h) => {
    await browserLanguages(page, h);
    await switchFromMenu(page, h);
    await langParamNotStored(h);
    await switchFromPause(h);
    await liveRebuildOverMenu(h);
    await liveRebuildOverPause(h);
  };
  const groups = [navigationScreens, lossScreens, warehouseScreens, endingScreen, menuScreens];
  const screens = groups.flatMap((group) =>
    ['en', 'pseudo'].map((lang) => async (page, h) => {
      const url = (path) => `${path}${path.includes('?') ? '&' : '?'}lang=${lang}`;
      await group(page, h, url, lookWith(h, lang, failures), lang);
    }),
  );
  await root.parallel([...screens, choice]);
  if (failures.length > 0) {
    throw new Error(`Latin letters under pseudo (strings not through tr):\n${failures.join('\n')}`);
  }
}

// --- 1. Browser languages -------------------------------------------------------------------

async function browserLanguages(page, h) {
  const cases = [
    { languages: ['uk-UA', 'en'], expected: 'uk' },
    { languages: ['en-US'], expected: 'en' },
    { languages: ['de-DE', 'uk'], expected: 'uk' },
    { languages: ['en-GB', 'uk-UA'], expected: 'en' },
  ];
  for (const { languages, expected } of cases) {
    await fakeBrowserLanguages(page, languages);
    await startFresh(h);
    const state = await languageState(h);
    h.log(`browser ${JSON.stringify(languages)}: ${JSON.stringify(state)}`);
    expectLanguage(state, expected, null);
  }
  // The rest of the scenario starts from an English browser.
  await fakeBrowserLanguages(page, ['en-US']);
}

// --- 2. From the menu ------------------------------------------------------------------------

async function switchFromMenu(page, h) {
  await startFresh(h);
  await openSettingsFromMenu(h);
  const before = await screenText(h);
  expectEnglishSettings(before.settings, 'settings over the menu');
  await selectSettingsRow(h, SETTINGS_ROW.language);
  await h.press('ArrowRight');
  await h.waitFor(() => window.nasa.services.locale.language === 'uk');
  const after = await screenText(h);
  const state = await languageState(h);
  h.log(`menu -> Right on Language: ${JSON.stringify(state)}; ${JSON.stringify(after.settings)}`);
  expectLanguage(state, 'uk', 'uk');
  expectValue(after.settings, UK_NAME);
  if (after.settings.selected !== SETTINGS_ROW.language) {
    throw new Error(`selected row ${after.settings.selected} after the change, not Language`);
  }
  expectSettings(after.settings, UK, 'uk');
  expectSame(after.menu, UK.menu, 'menu labels in uk');
  await h.shot('locale-settings-uk');
  await closePanels(h, 'Settings');
  if (!(await h.eval(() => window.nasa.game.scene.isActive('MainMenu')))) {
    throw new Error('the menu did not resume after the settings closed');
  }

  // The choice survives a reload and wins over the (English) browser.
  await h.goto('/', { lang: false });
  await h.waitReady('MainMenu');
  const reloaded = await languageState(h);
  h.log(`reload: ${JSON.stringify(reloaded)}`);
  expectLanguage(reloaded, 'uk', 'uk');
  await openSettingsFromMenu(h);
  expectValue((await screenText(h)).settings, UK_NAME);
  await closePanels(h, 'Settings');
}

// --- 3. ?lang= is not stored -------------------------------------------------------------------

async function langParamNotStored(h) {
  await h.goto('/?lang=en');
  await h.waitReady('MainMenu');
  const withParam = await languageState(h);
  h.log(`?lang=en over a stored uk: ${JSON.stringify(withParam)}`);
  expectLanguage(withParam, 'en', 'uk');
  await h.goto('/', { lang: false });
  await h.waitReady('MainMenu');
  const after = await languageState(h);
  h.log(`plain load after ?lang=en: ${JSON.stringify(after)}`);
  expectLanguage(after, 'uk', 'uk');
}

// --- 4. From the pause -----------------------------------------------------------------------

async function switchFromPause(h) {
  await h.goto(WAREHOUSE, { lang: false });
  await h.waitReady('World');
  await h.waitFor(() => !window.nasa.services.flow.isTransitioning);
  await openSettingsFromPause(h);
  await selectSettingsRow(h, SETTINGS_ROW.language);
  const { buttons } = await h.eval(() => window.nasa.game.scene.getScene('Settings').debugInfo());
  await h.click(buttons.languageDown.x, buttons.languageDown.y);
  await h.waitFor(() => window.nasa.services.locale.language === 'en');
  const state = await languageState(h);
  const text = await screenText(h);
  h.log(`pause -> "-" on Language: ${JSON.stringify(state)}; ${JSON.stringify(text)}`);
  expectLanguage(state, 'en', 'en');
  expectValue(text.settings, 'English');
  expectEnglishSettings(text.settings, 'settings over the pause');
  expectSame(text.pause.items, EN.pause, 'pause options');
  if (text.pause.selected !== 1) throw new Error(`pause selection ${text.pause.selected}, not 1`);
  const stack = await h.eval(() => ({
    pause: window.nasa.game.scene.isPaused('Pause'),
    world: window.nasa.game.scene.isPaused('World'),
  }));
  if (!stack.pause || !stack.world) throw new Error(`panels unpaused: ${JSON.stringify(stack)}`);
  await closePanels(h, 'Settings', 'Pause');
}

// --- 5. Live rebuild -------------------------------------------------------------------------

async function liveRebuildOverMenu(h) {
  await h.goto('/', { lang: false });
  await h.waitReady('MainMenu');
  await openSettingsFromMenu(h);
  await selectSettingsRow(h, SETTINGS_ROW.sfx);
  const { before, after } = await switchLive(h, 'pseudo');
  h.log(`pseudo over the menu: ${JSON.stringify(after)}`);
  expectRebuilt(before.settings, after.settings, 'settings over the menu');
  expectRebuilt(before.menu, after.menu, 'menu');
  if (after.settings.selected !== SETTINGS_ROW.sfx) {
    throw new Error(`selected row ${after.settings.selected} after the rebuild, not SFX`);
  }
  await expectNotStored(h, 'en');
  await h.shot('locale-pseudo-settings-over-menu');

  const back = (await switchLive(h, 'en')).after;
  expectEnglishSettings(back.settings, 'settings back in en');
  expectSame(back.menu, EN.menu, 'menu back in en');
  // Input still works on the rebuilt panel and the menu resumes when it closes.
  await h.press('ArrowDown');
  await h.waitFor(
    `window.nasa.game.scene.getScene('Settings').debugInfo().selected === ${SETTINGS_ROW.language}`,
  );
  await closePanels(h, 'Settings');
  if (!(await h.eval(() => window.nasa.game.scene.isActive('MainMenu')))) {
    throw new Error('the menu did not resume after a rebuild under the settings');
  }
  // A rebuilt menu button still works: About opens the stub panel.
  const menu = await h.eval(() => window.nasa.game.scene.getScene('MainMenu').debugInfo());
  await h.click(menu.buttons[3].x, menu.buttons[3].y);
  await h.waitReady('Stub');
  await closePanels(h, 'Stub');
}

async function liveRebuildOverPause(h) {
  await h.goto(WAREHOUSE, { lang: false });
  await h.waitReady('World');
  await h.waitFor(() => !window.nasa.services.flow.isTransitioning);
  await openSettingsFromPause(h);
  await selectSettingsRow(h, SETTINGS_ROW.music);
  const { before, after } = await switchLive(h, 'pseudo');
  h.log(`pseudo over the pause: ${JSON.stringify(after)}`);
  expectRebuilt(before.settings, after.settings, 'settings over the pause');
  expectRebuilt(before.pause.items, after.pause.items, 'pause');
  expectRebuilt(before.hold, after.hold, 'HOLD strip');
  if (after.settings.selected !== SETTINGS_ROW.music || after.pause.selected !== 1) {
    throw new Error(
      `selection lost: settings ${after.settings.selected}, pause ${after.pause.selected}`,
    );
  }
  await expectNotStored(h, 'en');
  // The rebuild re-ran no open/close of the pause: its hold on the simulation stays.
  if (!(await h.eval(() => window.nasa.services.simulation.isHeld('pause')))) {
    throw new Error('the pause hold was released by the rebuild under the settings');
  }
  await h.shot('locale-pseudo-settings-over-pause');

  const back = (await switchLive(h, 'en')).after;
  expectEnglishSettings(back.settings, 'settings over the pause back in en');
  expectSame(back.pause.items, EN.pause, 'pause back in en');
  if (back.hold !== before.hold) throw new Error(`HOLD caption "${back.hold}" not back in en`);
  await closePanels(h, 'Settings');
  // The rebuilt pause menu still takes keys: Resume (Up from Settings, Enter) closes it.
  await h.press('ArrowUp');
  await h.waitFor(
    () => window.nasa.game.scene.getScene('Pause').debugInfo().choices.selected === 0,
  );
  await h.press('Enter');
  await h.waitFor(
    () => !window.nasa.game.scene.isActive('Pause') && window.nasa.game.scene.isActive('World'),
  );
  const held = await h.eval(() => window.nasa.services.simulation.isHeld('pause'));
  h.log(`after the pause closed: held by the pause ${held}`);
  if (held) throw new Error('the simulation stays held by the pause after it was rebuilt');
}

/**
 * Switches to `language` through the service and reads the screens in the same page task, so
 * what `after` shows was rebuilt at once, not on a later frame.
 */
async function switchLive(h, language) {
  await installScreenText(h);
  const result = await h.eval((lang) => {
    const before = window.__smokeScreenText();
    window.nasa.services.locale.setLanguage(lang);
    return { before, after: window.__smokeScreenText() };
  }, language);
  if (result.after.language !== language) {
    throw new Error(`language ${result.after.language} after setLanguage('${language}')`);
  }
  // A frame later nothing has thrown and the screens are still there.
  await frames(h, 2);
  return result;
}

// --- Checks ----------------------------------------------------------------------------------

function expectLanguage(state, language, saved) {
  const htmlLang = { en: 'en', uk: 'uk', pseudo: 'en-XA' }[language];
  if (
    state.language !== language ||
    state.htmlLang !== htmlLang ||
    state.saved !== saved ||
    state.stored !== saved
  ) {
    throw new Error(
      `expected ${language} (html ${htmlLang}, saved ${saved}), got ${JSON.stringify(state)}`,
    );
  }
}

function expectValue(settings, value) {
  const row = settings?.rows[SETTINGS_ROW.language];
  if (row?.[1] !== value)
    throw new Error(`Language row shows ${JSON.stringify(row)}, not ${value}`);
}

function expectEnglishSettings(settings, where) {
  expectSettings(settings, { ...EN_PANEL, settingsRows: EN.settingsRows }, where);
}

/** The settings panel shows `labels`: its title, Back button and rows (null: any value). */
function expectSettings(settings, labels, where) {
  if (!settings) throw new Error(`${where}: the settings panel is not open`);
  if (settings.title !== labels.title || settings.back !== labels.back) {
    throw new Error(`${where}: title/back ${settings.title}/${settings.back}`);
  }
  settings.rows.forEach(([label, value], i) => {
    const [wantLabel, wantValue] = labels.settingsRows[i];
    if (label !== wantLabel || (wantValue !== null && value !== wantValue)) {
      throw new Error(`${where}: row ${i} is ${JSON.stringify([label, value])}`);
    }
  });
}

function expectSame(actual, expected, where) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${where}: ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

/** Every string in `after` differs from `before`'s and has Cyrillic letters (pseudo). */
function expectRebuilt(before, after, where) {
  const strings = (value) =>
    typeof value === 'string'
      ? [value]
      : Array.isArray(value)
        ? value.flatMap(strings)
        : value && typeof value === 'object'
          ? Object.entries(value)
              .filter(([key]) => key !== 'selected')
              .flatMap(([, v]) => strings(v))
          : [];
  const was = strings(before);
  const now = strings(after);
  if (was.length === 0 || was.length !== now.length) {
    throw new Error(`${where}: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  }
  // Values without letters ("70%") stay as they are.
  const stale = now.filter(
    (text, i) => /[A-Za-z]/.test(was[i]) && (text === was[i] || !/[а-яіїєґ]/i.test(text)),
  );
  if (stale.length > 0) throw new Error(`${where}: not rebuilt: ${JSON.stringify(stale)}`);
}

async function expectNotStored(h, stored) {
  const state = await languageState(h);
  if (state.language !== 'pseudo' || state.htmlLang !== 'en-XA' || state.stored !== stored) {
    throw new Error(`pseudo: ${JSON.stringify(state)} (stored should stay ${stored})`);
  }
}

// --- 6. Screens on en and pseudo (plan S6) ----------------------------------------------------

/** Seed with the hull breach as the first alarm of the Moon -> Mars leg (stations.mjs). */
const ALARM_SEED = 71;
/** The hull breach's timer, ms: room for the shots before it runs out. */
const LONG_TIMER_MS = 60000;
const SLOW = 10000;
/** How long the panel shows LOST in `lossScreens`, ms: room for the look on a loaded machine. */
const LOSS_BEAT_MS = 5000;
/**
 * Strings that may keep Latin letters under pseudo, with the reason. Empty: the settings row
 * names the pseudo language with `pseudo('Pseudo')`, so even the language name is Cyrillic.
 */
const LATIN_EXCEPTIONS = new Map();

/**
 * The `look(screen, scene)` of page `h` for the S6 screens on `lang` (`en` or `pseudo`, through
 * `?lang=`): shoots `screen` as `locale-<screen>-<lang>` and reads its texts; `scene` is the
 * scene key whose text the screen is about: no text at all, or none of `scene`, fails at once
 * (the check would see nothing). On pseudo every visible text but the debug overlay's must be
 * free of Latin letters (a string not through `tr`, D12): offenders go to `failures`.
 * Overlapping and off-screen texts are logged as hints for the eye.
 */
function lookWith(h, lang, failures) {
  return async (screen, scene) => {
    await frames(h, 2);
    // The UI's clock stands still for the look: a toast's two seconds must not run out during
    // a slow screenshot (a loaded machine, several scenarios at once).
    const wasPaused = await h.eval(() => {
      const { time } = window.nasa.game.scene.getScene('Ui');
      const paused = time.paused;
      time.paused = true;
      return paused;
    });
    await h.shot(`locale-${screen}-${lang}`);
    const texts = await allTexts(h);
    await h.eval((paused) => {
      window.nasa.game.scene.getScene('Ui').time.paused = paused;
    }, wasPaused);
    for (const hint of layoutHints(texts)) h.log(`${screen}/${lang} ${hint}`);
    if (texts.length === 0 || !texts.some((t) => t.scene === scene)) {
      throw new Error(
        `${screen}/${lang}: no text of scene ${scene} on screen: ${JSON.stringify(texts)}`,
      );
    }
    if (lang !== 'pseudo') return texts;
    for (const t of texts) {
      if (/[A-Za-z]/.test(t.text) && !LATIN_EXCEPTIONS.has(t.text)) {
        failures.push(`  ${screen} (${t.scene}): ${JSON.stringify(t.text)}`);
      }
    }
    return texts;
  };
}

/**
 * Waits for UiScene's title (`showTitle`: act title cards, the landing's) to be fully shown and
 * stops the UI's tweens and clock there, so the look sees it whole and a toast shown under it
 * (the checkpoint's) keeps its time; `resumeTitle` lets them go on.
 */
async function holdTitle(h) {
  await h.waitFor(() => {
    const ui = window.nasa.game.scene.getScene('Ui');
    if (ui.title?.alpha !== 1) return false;
    ui.tweens.pauseAll();
    ui.time.paused = true;
    return true;
  }, SLOW);
}

async function resumeTitle(h) {
  await h.eval(() => {
    const ui = window.nasa.game.scene.getScene('Ui');
    ui.time.paused = false;
    ui.tweens.resumeAll();
  });
}

async function menuScreens(_page, h, url, look) {
  // No saved game on either language: Continue is shown disabled on both shots.
  await h.goto(url('/'));
  await h.waitReady('MainMenu');
  await h.eval(() => window.nasa.services.save.clear());
  await h.goto(url('/'));
  await h.waitReady('MainMenu');
  await look('menu', 'MainMenu');
  await openSettingsFromMenu(h);
  await selectSettingsRow(h, SETTINGS_ROW.language);
  await look('settings', 'Settings');
  await closePanels(h, 'Settings');
  const menu = await h.eval(() => window.nasa.game.scene.getScene('MainMenu').debugInfo());
  await h.click(menu.buttons[3].x, menu.buttons[3].y);
  await h.waitReady('Stub');
  await look('about', 'Stub');
  await closePanels(h, 'Stub');
}

/** Waits until the open dialogue's line is typed out (Enter finishes the typing). */
async function typedOut(h) {
  if ((await h.eval(() => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue))?.typing) {
    await h.press('Enter');
  }
  await h.waitFor(
    () => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue?.typing === false,
    SLOW,
  );
}

/** Picks row `index` of the open dialogue's choices (Down, then Enter). */
async function pick(page, h, index) {
  for (let i = 0; i < index; i++) await h.press('ArrowDown');
  await page.waitForFunction(
    (n) => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue?.choices?.selected === n,
    index,
    { timeout: 5000 },
  );
  await h.press('Enter');
}

/** Enter until the open dialogue has closed. */
async function toEnd(page, h) {
  for (let i = 0; i < 30; i++) {
    if ((await h.eval(() => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue)) === null)
      return;
    await h.press('Enter');
    await page.waitForTimeout(150);
  }
  throw new Error('the dialogue did not end');
}

/** E at map object `name` from (x, y) in the warehouse; resolves once the line is typed out. */
async function talkTo(page, h, name, x, y) {
  await h.teleport(x, y);
  await page.waitForFunction(
    (n) => window.nasa.game.scene.getScene('World').debugInfo().focused === n,
    name,
    { timeout: 5000 },
  );
  await h.press('KeyE');
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue !== null);
  await typedOut(h);
}

/** Waits until the open dialogue shows its choices. */
async function choicesShown(h) {
  await h.waitFor(
    () => Boolean(window.nasa.game.scene.getScene('Ui').debugInfo().dialogue?.choices),
    SLOW,
  );
}

async function warehouseScreens(page, h, url, look, lang) {
  await h.goto(url('/?location=warehouse&spawn=spawn-default'));
  await h.waitReady('World');
  await h.waitFor(() => !window.nasa.services.flow.isTransitioning);

  // The arrival cutscene (cutscene.mjs): walk right into its trigger; its first `say` line.
  await h.teleport(48, 170);
  await h.holdUntil('ArrowRight', () => window.nasa.services.cutscenes.isPlaying, 15000);
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue !== null, SLOW);
  await typedOut(h);
  await look('cutscene-say', 'Ui');
  for (let i = 0; i < 60 && (await h.eval(() => window.nasa.services.cutscenes.isPlaying)); i++) {
    if ((await h.eval(() => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue)) !== null) {
      await h.press('Enter');
    }
    await page.waitForTimeout(250);
  }
  await h.waitFor(() => !window.nasa.services.cutscenes.isPlaying, SLOW);

  // The E hint over the engineer and the HOLD strip.
  await h.teleport(262, 168);
  await h.waitFor(
    () => window.nasa.game.scene.getScene('World').debugInfo().focused === 'npc-engineer',
  );
  const hinted = await look('world-hint', 'Ui');
  if (lang === 'en') await liveHint(h, hinted);

  // The engineer: the line before the choices, the choices, then the cargo advice, the longest
  // line of the dialogues (E1).
  await h.press('KeyE');
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue !== null);
  await typedOut(h);
  await h.press('Enter');
  await h.waitFor(
    () => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue?.nodeId === 'question',
  );
  await typedOut(h);
  await choicesShown(h);
  await look('dialogue-choice', 'Ui');
  await pick(page, h, 1);
  await h.waitFor(
    () => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue?.nodeId === 'cargo',
  );
  await typedOut(h);
  await look('e1-longest-line', 'Ui');
  await toEnd(page, h);

  // A crate's stand, the toast of a take, the hatch.
  await talkTo(page, h, 'crate-oxygen', 256, 312);
  await choicesShown(h);
  await look('stand', 'Ui');
  await pick(page, h, 0);
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().toast !== null, 5000);
  await look('toast', 'Ui');
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().toast === null, 5000);
  await talkTo(page, h, 'hatch', 596, 184);
  await choicesShown(h);
  await look('hatch', 'Ui');
  await pick(page, h, 0);
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue === null);
  await frames(h, 3);

  // The pause and the settings over it.
  await h.press('Escape');
  await h.waitReady('Pause');
  await frames(h, 3);
  await look('pause', 'Pause');
  await h.press('ArrowDown');
  await h.waitFor(
    () => window.nasa.game.scene.getScene('Pause').debugInfo().choices.selected === 1,
  );
  await h.press('Enter');
  await h.waitReady('Settings');
  await look('settings-pause', 'Settings');
  await closePanels(h, 'Settings', 'Pause');
}

/**
 * On English with the E hint shown: pseudo through the service re-resolves the hint at once
 * (UiScene on `languageChanged`), English brings it back.
 */
async function liveHint(h, before) {
  const hint = before.find((t) => t.scene === 'Ui' && t.text === 'E');
  if (!hint) throw new Error(`no E hint on screen: ${JSON.stringify(before)}`);
  await h.eval(() => window.nasa.services.locale.setLanguage('pseudo'));
  const after = (await allTexts(h)).filter((t) => t.scene === 'Ui');
  h.log(`E hint on pseudo: ${JSON.stringify(after)}`);
  if (after.some((t) => /[A-Za-z]/.test(t.text)) || !after.some((t) => /^Е+$/.test(t.text))) {
    throw new Error(`the E hint was not re-resolved: ${JSON.stringify(after)}`);
  }
  await h.eval(() => window.nasa.services.locale.setLanguage('en'));
  const back = (await allTexts(h)).filter((t) => t.scene === 'Ui');
  if (!back.some((t) => t.text === 'E'))
    throw new Error(`E hint not back: ${JSON.stringify(back)}`);
}

async function navigationScreens(_page, h, url, look, lang) {
  const faderClear = () => window.nasa.game.scene.getScene('Ui').debugInfo().fader === 0;
  await h.goto(url('/'));
  await h.waitReady('MainMenu');
  await h.eval(() => window.nasa.services.save.clear());
  await h.goto(url(`/?act=act2&seed=${ALARM_SEED}`));
  await h.waitReady('World', SLOW);
  await h.waitEvent('checkpointSaved', SLOW);
  await h.waitFor(faderClear, SLOW);
  await h.mark();
  await h.eval(() => {
    const { flags } = window.nasa.services.state;
    for (const id of ['fuel', 'oxygen', 'supplies', 'reactor']) flags.set(`cargo.${id}`, 1);
    void window.nasa.services.flow.startAct('act2');
  });
  // The act's title card on black, then the checkpoint's toast on the deck.
  await holdTitle(h);
  await look('act-title', 'Ui');
  await resumeTitle(h);
  await h.waitReady('World', SLOW);
  await h.waitEvent('checkpointSaved', SLOW);
  await h.waitFor(faderClear, SLOW);
  if ((await h.eval(() => window.nasa.game.scene.getScene('Ui').debugInfo().toast)) === null) {
    throw new Error('no checkpoint toast after the act started');
  }
  await look('checkpoint-toast', 'Ui');

  // The panel: the column (rows, telemetry, log) while time runs.
  await openNavigation(h);
  await frames(h, 3);
  await h.eval(() => window.nasa.services.simulation.setDebugWarp(20));
  await h.waitFor(() => window.nasa.services.simulation.snapshot().timeS > 86400, 30000);
  await h.eval(() => window.nasa.services.simulation.hold('pause'));
  await look('nav', 'Navigation');
  await h.eval(() => window.nasa.services.simulation.release('pause'));

  // The gate card with the forecast of the next leg.
  await h.waitEvent('gateReached', 60000);
  await h.waitFor(() => {
    const card = window.nasa.game.scene.getScene('Navigation').debugInfo().card;
    return card?.kind === 'gate' && card.locked === false && card.disabled[0] === false;
  }, 30000);
  await look('gate', 'Navigation');

  // Go on: the hull breach's alarm flashes on the panel (its clock stopped for the shot).
  await h.eval((ms) => {
    window.nasa.services.stationAlarm.setDebugTimer(ms);
    const off = window.nasa.services.events.on('stationAlarm', ({ active }) => {
      if (!active) return;
      window.nasa.game.scene.getScene('Navigation').time.paused = true;
      off();
    });
  }, LONG_TIMER_MS);
  await h.mark();
  await h.press('Enter');
  await h.waitFor(() => window.nasa.services.simulation.voyage?.phase !== 'atGate', 3000);
  await h.waitEvent('voyageEvent', 60000);
  await h.eval(() => window.nasa.services.simulation.setDebugWarp(1));
  await h.waitFor(() => window.nasa.game.scene.getScene('Navigation').debugInfo().alarm !== null);
  await look('alarm-flash', 'Navigation');
  await h.eval(() => {
    window.nasa.game.scene.getScene('Navigation').time.paused = false;
  });
  await h.waitFor(() => !window.nasa.game.scene.isActive('Navigation'), 5000);

  // The deck with the timer bar; a wrong station's toast; the card at the airlock.
  await frames(h, 3);
  await look('alarm-bar', 'AlarmBar');
  if (lang === 'en') await liveAlarmBar(h);
  await standAt(h, 'radio');
  await h.press('KeyE');
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().toast !== null, 5000);
  await look('wrong-station', 'Ui');
  await standAt(h, 'airlock');
  await h.press('KeyE');
  await h.waitFor(() => {
    const scene = window.nasa.game.scene;
    return (
      scene.isActive('EventStation') &&
      scene.getScene('EventStation').debugInfo().card?.locked === false
    );
  }, 5000);
  // The panel hides the wrong station's toast instead of half covering it.
  const toast = await h.eval(() => window.nasa.game.scene.getScene('Ui').debugInfo().toast);
  if (toast !== null) throw new Error(`toast under the station card: ${toast}`);
  await look('event-station', 'EventStation');
}

/**
 * On English with the alarm on: pseudo through the service redraws the timer bar's lines at
 * once (AlarmBarScene on `languageChanged`), English brings them back.
 */
async function liveAlarmBar(h) {
  const lines = () => window.nasa.game.scene.getScene('AlarmBar').debugInfo().lines;
  const before = await h.eval(lines);
  await h.eval(() => window.nasa.services.locale.setLanguage('pseudo'));
  await frames(h, 2);
  const after = await h.eval(lines);
  const drawn = (await allTexts(h)).filter((t) => t.scene === 'AlarmBar').map((t) => t.text);
  h.log(`alarm bar on pseudo: ${JSON.stringify(after)}, drawn ${JSON.stringify(drawn)}`);
  if (
    after.length !== before.length ||
    after.some((line) => /[A-Za-z]/.test(line)) ||
    drawn.some((text) => /[A-Za-z]/.test(text))
  ) {
    throw new Error(`the alarm bar was not redrawn: ${JSON.stringify({ before, after, drawn })}`);
  }
  await h.eval(() => window.nasa.services.locale.setLanguage('en'));
  await frames(h, 2);
  const back = await h.eval(lines);
  if (JSON.stringify(back) !== JSON.stringify(before)) {
    throw new Error(`the alarm bar not back in en: ${JSON.stringify(back)}`);
  }
}

/**
 * Waits for each line of the running debrief, looks at it as `<screen>-<n>` (only the first
 * `count` lines), closes it; returns when the cutscene has ended.
 */
async function debriefLines(page, h, look, screen, count) {
  let seen = 0;
  for (let i = 0; i < 200; i++) {
    if (!(await h.eval(() => window.nasa.services.cutscenes.isPlaying))) break;
    const line = await h.eval(() => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue);
    if (line && !line.typing) {
      seen += 1;
      if (seen <= count) await look(`${screen}-${seen}`, 'Ui');
      await h.press('Enter');
      await page.waitForFunction(
        (prev) => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue?.text !== prev,
        line.text,
        { timeout: 5000 },
      );
    }
    await page.waitForTimeout(100);
  }
  await h.waitFor(() => !window.nasa.services.cutscenes.isPlaying, SLOW);
  if (seen < count) throw new Error(`${screen}: ${seen} debrief lines, want ${count}`);
}

/**
 * A lost voyage: the panel's column in DRIFTING (the drift alarm's toast) and LOST (`Lost:
 * {cause}, day {day}` with the longest cause label), the debrief that follows (an event's
 * death: the GENERIC lines with `{cause}` words, `{gate}`, `{next}`, `{day}`), then the first
 * line of a debrief by cause (`flow.die('hypoxia')`).
 */
async function lossScreens(page, h, url, look) {
  const faderClear = () => window.nasa.game.scene.getScene('Ui').debugInfo().fader === 0;
  await h.goto(url('/'));
  await h.waitReady('MainMenu');
  await h.eval(() => window.nasa.services.save.clear());
  await h.goto(url(`/?act=act2&seed=${ALARM_SEED}`));
  await h.waitReady('World', SLOW);
  await h.waitEvent('checkpointSaved', SLOW);
  await h.waitFor(faderClear, SLOW);

  // On the panel, flying to the Moon: the tank emptied (ship.mjs drains it the same way).
  await openNavigation(h);
  await h.waitFor(
    () =>
      window.nasa.services.simulation.isRunning &&
      window.nasa.services.simulation.autopilot?.phase === 'flying',
    5000,
  );
  await h.mark();
  await h.eval(() => {
    const simulation = window.nasa.services.simulation.voyage.simulation;
    const fuel = simulation.snapshot().resources.fuel.value;
    simulation.applyEvent('smoke', { stocks: { fuel: -fuel } });
  });
  await h.waitFor(() => window.nasa.services.simulation.voyage?.phase === 'drifting', 5000);
  await h.waitFor(() => {
    const info = window.nasa.game.scene.getScene('Navigation').debugInfo();
    return info.status === 'DRIFTING' && info.alarms.includes('drift') && info.toast !== null;
  }, 5000);
  await h.eval(() => window.nasa.services.simulation.hold('pause'));
  await look('nav-drifting', 'Navigation');
  // Lost to an event with the longest cause label (`greenhouse-leak`, 15 chars) rather than
  // the drift: the longest "Lost: {cause}, day {day}" line. The panel shows LOST for a second
  // before the death loop (ship.mjs).
  // The beat is longer here: the look's screenshot must come before the death loop.
  await h.eval((beatMs) => {
    window.nasa.services.flow.setDebugLossBeat(beatMs);
    window.nasa.services.simulation.voyage.simulation.applyEvent('greenhouse-leak', { die: true });
    window.nasa.services.simulation.release('pause');
  }, LOSS_BEAT_MS);
  await h.waitEvent('voyageEnded', 20000);
  const lost = await look('nav-lost', 'Navigation');
  const status = await h.eval(() => window.nasa.game.scene.getScene('Navigation').debugInfo());
  h.log(`lost: ${status.status}, ${status.next}`);
  if (status.status !== 'LOST' || !lost.some((t) => t.text === status.next)) {
    throw new Error(`the panel does not show the loss: ${status.status}, ${status.next}`);
  }

  // The debrief in the warehouse, then one for an event's death.
  await h.waitEvent('flightLost', SLOW);
  await h.waitFor(() => window.nasa.services.cutscenes.current === 'debrief', SLOW);
  await debriefLines(page, h, look, 'debrief', 3);
  await h.waitFor(faderClear, SLOW);
  await h.eval(() => void window.nasa.services.flow.die('hypoxia'));
  await h.waitFor(() => window.nasa.services.cutscenes.current === 'debrief', SLOW);
  await debriefLines(page, h, look, 'debrief-hypoxia', 1);
  await h.waitFor(faderClear, SLOW);
}

async function endingScreen(page, h, url, look) {
  const faderClear = () => window.nasa.game.scene.getScene('Ui').debugInfo().fader === 0;
  await h.goto(url('/'));
  await h.waitReady('MainMenu');
  await h.eval(() => window.nasa.services.save.clear());
  await h.goto(url('/?act=act3'));
  await h.waitReady('World', SLOW);
  await h.waitEvent('checkpointSaved', SLOW);
  await h.waitFor(faderClear, SLOW);
  // A Stop on the Moon (colony.mjs): a settlement, the tier line under the ending's text.
  await h.eval(() => {
    const flags = window.nasa.services.state.flags;
    flags.deletePrefix('cargo.');
    for (const id of ['fuel', 'solar', 'reactor', 'regolith-kit']) flags.set(`cargo.${id}`, 1);
    flags.set('voyage.stopGate', 0);
    flags.set('voyage.day', 60);
    flags.set('voyage.stopBody', 'moon');
  });
  // Act 3 again with those flags: the landing's title ("Moon · day 61"), then the colony.
  await h.mark();
  await h.eval(() => void window.nasa.services.flow.startAct('act3'));
  await holdTitle(h);
  await look('landing-title', 'Ui');
  await resumeTitle(h);
  await h.waitReady('World', SLOW);
  await h.waitEvent('checkpointSaved', SLOW);
  await h.waitFor(faderClear, SLOW);
  // The shelter tells the settlement's tier (colony.mjs); the checkpoint's toast gone first.
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().toast === null, 5000);
  await talkTo(page, h, 'shelter', 248, 180);
  await look('colony-shelter', 'Ui');
  await toEnd(page, h);
  await talkTo(page, h, 'overlook', 560, 180);
  await h.press('Enter');
  await h.waitReady('Ending', SLOW);
  await h.waitFor(faderClear, SLOW);
  await look('ending', 'Ending');
}
