/**
 * Smoke helpers for the game's language (plan uk-localization S5): the browser's languages, a
 * start with no saved settings, the settings panel's Language row over the main menu and over
 * the pause menu, and what each screen shows. `page` is the Playwright page and `h` the
 * scenario's helper object (tools/smoke.mjs).
 *
 *   await fakeBrowserLanguages(page, ['uk-UA', 'en'])  navigator.languages from the next load on
 *   await startFresh(h, path)            no saved settings or game, no lang param: path loaded
 *   await languageState(h)               { language, saved, htmlLang, stored }
 *   await openSettingsFromMenu(h)        the menu's Settings button: the panel is open
 *   await openSettingsFromPause(h)       Esc in the world, then Settings: the panel is open
 *   await selectSettingsRow(h, row)      Up/Down until row (0 Music .. 3 Back) is selected
 *   await closePanels(h, ...keys)        Esc once per panel, top first, until each is gone
 *   await screenText(h)                  labels of the settings, menu, pause and HOLD strip
 *   await installScreenText(h)           the same reader as window.__smokeScreenText() (per load)
 *   await allTexts(h)                    every visible text object on screen but the debug overlay
 *   layoutHints(texts)                   overlapping and off-screen texts, for the log
 *   await frames(h, n)                   wait n animation frames
 *   SETTINGS_ROW                         row indexes of the settings panel
 */

/** Row indexes of the settings panel (`SettingsScene.debugInfo().selected`). */
export const SETTINGS_ROW = { music: 0, sfx: 1, language: 2, back: 3 };

/** localStorage keys the game writes: the settings and the saved game. */
const STORAGE_KEYS = ['space-owner.settings', 'space-owner.save'];

/**
 * Makes `navigator.languages` (and `navigator.language`, its first entry) report `languages`
 * from the next page load on. Init scripts cannot be removed: a later call wins over an earlier
 * one, since its script runs after theirs.
 */
export async function fakeBrowserLanguages(page, languages) {
  await page.addInitScript((list) => {
    Object.defineProperty(navigator, 'languages', { get: () => [...list], configurable: true });
    Object.defineProperty(navigator, 'language', { get: () => list[0], configurable: true });
  }, languages);
}

/**
 * Loads `path` as on a first visit: the stored settings and save are removed first (on a page
 * of the same origin), and the URL gets no `lang` (the browser's languages decide). Waits for
 * the main menu, or for the World when `path` names a location.
 */
export async function startFresh(h, path = '/') {
  await h.goto('/');
  await h.waitReady('MainMenu');
  await h.eval((keys) => keys.forEach((key) => localStorage.removeItem(key)), STORAGE_KEYS);
  await h.goto(path, { lang: false });
  await h.waitReady(path.includes('location=') ? 'World' : 'MainMenu');
}

/**
 * The language as the game holds it: the service's language and saved choice, the page's
 * `lang` attribute and the language in localStorage (null when none is stored).
 */
export async function languageState(h) {
  return h.eval(() => {
    const info = window.nasa.services.locale.debugInfo();
    const stored = JSON.parse(localStorage.getItem('space-owner.settings') ?? '{}');
    return {
      language: info.language,
      saved: info.saved,
      htmlLang: document.documentElement.lang,
      stored: stored.language ?? null,
    };
  });
}

/** Waits `count` animation frames in the page. */
export async function frames(h, count) {
  await h.eval(
    (n) =>
      new Promise((resolve) => {
        const step = (left) =>
          left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1));
        step(n);
      }),
    count,
  );
}

/** Clicks the main menu's Settings button (the third) and waits until the panel takes input. */
export async function openSettingsFromMenu(h) {
  const menu = await h.eval(() => window.nasa.game.scene.getScene('MainMenu').debugInfo());
  const button = menu.buttons[2];
  await h.click(button.x, button.y);
  await h.waitReady('Settings');
  // Clicks and keys in a new panel's first frames are lost: let its input register.
  await frames(h, 3);
}

/** Esc in the running world opens the pause menu; its Settings option (the second) opens the panel. */
export async function openSettingsFromPause(h) {
  await h.waitFor(() => window.nasa.game.scene.isActive('World'), 5000);
  await h.press('Escape');
  await h.waitReady('Pause');
  await frames(h, 3);
  // One key per frame: two presses within a frame would both reach the list in one update.
  await h.press('ArrowDown');
  await h.waitFor(
    () => window.nasa.game.scene.getScene('Pause').debugInfo().choices.selected === 1,
  );
  await h.press('Enter');
  await h.waitReady('Settings');
  await frames(h, 3);
}

/** Presses Up/Down in the open settings panel until row `row` is selected. */
export async function selectSettingsRow(h, row) {
  for (let i = 0; i < 4; i++) {
    const { selected } = await h.eval(() =>
      window.nasa.game.scene.getScene('Settings').debugInfo(),
    );
    if (selected === row) return;
    await h.press(selected < row ? 'ArrowDown' : 'ArrowUp');
    // h.waitFor takes no argument: the value goes into the expression's source.
    await h.waitFor(
      `window.nasa.game.scene.getScene('Settings').debugInfo().selected !== ${selected}`,
    );
  }
  throw new Error(`settings row ${row} could not be selected`);
}

/** Presses Esc once per panel in `keys` (top first), waiting until each one is closed. */
export async function closePanels(h, ...keys) {
  for (const key of keys) {
    await h.press('Escape');
    await h.waitFor(`!window.nasa.game.scene.isActive('${key}')`);
    await frames(h, 2);
  }
}

/**
 * Text of the screens a language change rebuilds, read in one go (null for a screen not
 * shown): the settings panel (`SettingsScene.debugInfo`), the main menu's button labels, the
 * pause menu's options and the HOLD strip's caption.
 */
export async function screenText(h) {
  return h.eval(readScreenText);
}

/** Page-side reader of `screenText` and `window.__smokeScreenText` (`installScreenText`). */
function readScreenText() {
  const scenes = window.nasa.game.scene;
  const shown = (key) => scenes.isActive(key) || scenes.isPaused(key);
  const settings = shown('Settings') ? scenes.getScene('Settings').debugInfo() : null;
  const world = shown('World') ? scenes.getScene('World').debugInfo() : null;
  return {
    language: window.nasa.services.locale.language,
    settings: settings && {
      title: settings.title,
      rows: settings.rows.map((row) => [row.label, row.value]),
      back: settings.back,
      selected: settings.selected,
    },
    menu: shown('MainMenu')
      ? scenes
          .getScene('MainMenu')
          .debugInfo()
          .buttons.map((button) => button.label)
      : null,
    pause: shown('Pause') ? scenes.getScene('Pause').debugInfo().choices : null,
    hold: world?.hold?.text ?? null,
  };
}

/**
 * Every visible text object of the scenes on screen (running or paused, visible), except the
 * English-only debug overlay (plan D10): `{ scene, text, x, y, w, h }` with the bounds in game
 * pixels. Objects in containers count when every container up the chain is visible.
 */
export async function allTexts(h) {
  return h.eval(() => {
    const manager = window.nasa.game.scene;
    const out = [];
    for (const scene of manager.getScenes(false)) {
      const key = scene.sys.settings.key;
      if (key === 'Debug') continue;
      if (!(manager.isActive(key) || manager.isPaused(key)) || !manager.isVisible(key)) continue;
      const visit = (object, shown) => {
        const visible = shown && object.visible !== false && object.alpha !== 0;
        if (object.type === 'Text' && visible && object.text.trim() !== '') {
          const b = object.getBounds();
          out.push({
            scene: key,
            text: object.text,
            x: Math.round(b.x),
            y: Math.round(b.y),
            w: Math.round(b.width),
            h: Math.round(b.height),
          });
        }
        if (Array.isArray(object.list)) object.list.forEach((child) => visit(child, visible));
      };
      scene.sys.displayList.list.forEach((object) => visit(object, true));
    }
    return out;
  });
}

/**
 * Layout hints over `texts` (from `allTexts`), for the log: texts of the same scene whose
 * bounds overlap by more than a pixel, and texts reaching past the `width` x `height` screen.
 */
export function layoutHints(texts, width = 640, height = 360) {
  const hints = [];
  for (const t of texts) {
    if (t.x < 0 || t.y < 0 || t.x + t.w > width || t.y + t.h > height) {
      hints.push(`off screen: ${JSON.stringify(t)}`);
    }
  }
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i];
      const b = texts[j];
      if (a.scene !== b.scene) continue;
      const dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const dy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (dx > 1 && dy > 1) hints.push(`overlap ${dx}x${dy}: ${JSON.stringify([a, b])}`);
    }
  }
  return hints;
}

/**
 * Makes `window.__smokeScreenText()` available in the page (the same reader as `screenText`),
 * so one `h.eval` can change the language and read the screens in the same task: what it reads
 * was rebuilt synchronously, without waiting for a frame.
 */
export async function installScreenText(h) {
  await h.eval((source) => {
    window.__smokeScreenText = new Function(`return (${source})();`);
  }, readScreenText.toString());
}
