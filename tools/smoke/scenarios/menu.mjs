/**
 * Smoke scenario: the main menu renders, "About" opens the stub panel over the paused menu,
 * Esc closes it, "About" again and Back closes it, "New Game" shows the prologue title and
 * opens the corridor.
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
  // The prologue title (1.5 s) comes first.
  await h.waitReady('World', 10000);
  const world = await h.eval(() => window.nasa.game.scene.getScene('World').debugInfo());
  h.log(`New Game -> ${world.locationId} / ${world.spawn}`);
  if (world.locationId !== 'demo-corridor') throw new Error('New Game did not open the corridor');
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().fader === 0);
}
