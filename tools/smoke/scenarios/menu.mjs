/**
 * Smoke scenario: the main menu renders, the keys move its focus over the enabled buttons and
 * Enter opens the focused one (Settings), "About" opens the stub panel over the paused menu,
 * Esc closes it, "About" again and Back closes it, "New Game" shows the prologue title over
 * its card picture (`card-prologue`, screenshot menu-prologue-card) and opens the hero's home.
 * Run: node tools/smoke.mjs --scenario tools/smoke/scenarios/menu.mjs
 *
 * @param {import('playwright-core').Page} _page
 * @param {any} h helpers, see tools/smoke.mjs
 */
export default async function menu(_page, h) {
  await h.goto('/');
  await h.waitReady('MainMenu');
  const renderer = await h.eval(() => {
    const game = window.nasa.game;
    return {
      type: game.renderer.type,
      zoom: game.scale.zoom,
      font: document.fonts.check('16px "Press Start 2P"'),
    };
  });
  h.log(
    `renderer ${renderer.type === 2 ? 'WebGL' : 'Canvas'}, zoom ${renderer.zoom}, font loaded ${renderer.font}`,
  );
  await h.shot('menu');

  // Button centres come from the menu itself ("Continue" sits above "New Game").
  const menuInfo = await h.eval(() => window.nasa.game.scene.getScene('MainMenu').debugInfo());
  const button = (label) => menuInfo.buttons.find((candidate) => candidate.label === label);
  // Keyboard: no save, so the focus starts on New Game and skips the disabled Continue.
  const focused = () =>
    h.eval(() => window.nasa.game.scene.getScene('MainMenu').debugInfo().focused);
  if ((await focused()) !== 1)
    throw new Error(`the focus starts on ${await focused()}, not New Game`);
  await h.press('ArrowUp');
  await h.waitFor(() => window.nasa.game.scene.getScene('MainMenu').debugInfo().focused === 3);
  await h.press('ArrowDown');
  await h.waitFor(() => window.nasa.game.scene.getScene('MainMenu').debugInfo().focused === 1);
  await h.press('ArrowDown');
  await h.waitFor(() => window.nasa.game.scene.getScene('MainMenu').debugInfo().focused === 2);
  await h.shot('menu-focus');
  await h.press('Enter');
  await h.waitReady('Settings');
  await h.press('Escape');
  await h.waitFor(
    () =>
      !window.nasa.game.scene.isActive('Settings') && window.nasa.game.scene.isActive('MainMenu'),
  );
  if ((await focused()) !== 2) throw new Error('the focus moved while the settings were open');

  await h.click(button('About').x, button('About').y);
  await h.waitReady('Stub');
  const paused = await h.eval(() => window.nasa.game.scene.isPaused('MainMenu'));
  if (!paused) throw new Error('the menu is not paused under the stub panel');
  await h.shot('menu-stub');

  // Esc closes a panel scene; the menu resumes.
  const closed = () =>
    !window.nasa.game.scene.isActive('Stub') && window.nasa.game.scene.isActive('MainMenu');
  await h.press('Escape');
  await h.waitFor(closed);

  // Back button centre: (320, 220).
  await h.click(button('About').x, button('About').y);
  await h.waitReady('Stub');
  await h.click(320, 220);
  await h.waitFor(closed);

  await h.click(button('New Game').x, button('New Game').y);
  // The prologue title over its card picture (4 s) comes first: held still for the shot.
  await h.waitFor(() => {
    const ui = window.nasa.game.scene.getScene('Ui');
    if (ui.debugInfo().card !== 'card-prologue' || ui.title?.alpha !== 1) return false;
    ui.tweens.pauseAll();
    return true;
  }, 10000);
  await h.shot('menu-prologue-card');
  await h.eval(() => window.nasa.game.scene.getScene('Ui').tweens.resumeAll());
  await h.waitReady('World', 10000);
  const world = await h.eval(() => window.nasa.game.scene.getScene('World').debugInfo());
  h.log(`New Game -> ${world.locationId} / ${world.spawn}`);
  if (world.locationId !== 'home') throw new Error('New Game did not open home');
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().fader === 0);
}
