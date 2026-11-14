/**
 * Smoke scenario: the debug overlay. `?overlay=1` turns it on at start; it shows the
 * location and the hero's position; F3 turns it off and on again.
 * Run: node tools/smoke.mjs --scenario tools/smoke/scenarios/debug.mjs
 *
 * @param {import('playwright-core').Page} page
 * @param {any} h helpers, see tools/smoke.mjs
 */
export default async function debug(page, h) {
  const overlay = () => window.nasa.game.scene.getScene('Debug').debugInfo();

  await h.goto('/?location=home&overlay=1');
  await h.waitReady('World');
  await h.hold('ArrowRight', 500);
  // The text is rebuilt every 250 ms, and the hero may still glide a frame after the key is
  // released: wait until it shows where the hero stands now.
  await h.waitFor(() => {
    const { x, y } = window.nasa.game.scene.getScene('World').debugInfo().player;
    const text = window.nasa.game.scene.getScene('Debug').debugInfo().text;
    return text.includes(`hero ${Math.round(x)},${Math.round(y)}`);
  }, 2000);
  await h.shot('debug-overlay');

  const state = await h.eval(() => ({
    active: window.nasa.game.scene.isActive('Debug'),
    top: window.nasa.game.scene.scenes.at(-1).sys.settings.key,
    hero: window.nasa.game.scene.getScene('World').debugInfo().player,
  }));
  const on = await h.eval(overlay);
  h.log(`overlay ${JSON.stringify(on)} scene ${JSON.stringify(state)}`);
  if (!state.active) throw new Error('the Debug scene is not active');
  if (state.top !== 'Debug') throw new Error(`top scene is ${state.top}, not Debug`);
  if (on.enabled !== true) throw new Error('overlay not enabled with ?overlay=1');
  if (!on.text.includes('loc home') || !on.text.includes('hero')) {
    throw new Error(`overlay text lacks the location or the hero: ${JSON.stringify(on.text)}`);
  }
  const shown = `hero ${Math.round(state.hero.x)},${Math.round(state.hero.y)}`;
  if (!on.text.includes(shown)) {
    // The hero stands still after the key is released, so the last refresh shows his position.
    throw new Error(`overlay does not show "${shown}": ${JSON.stringify(on.text)}`);
  }

  // Phaser handles queued key events on the next game step, so wait for the change.
  await h.press('F3');
  await h.waitFor(() => !window.nasa.game.scene.getScene('Debug').debugInfo().enabled, 2000);
  h.log('F3: overlay off');
  await h.shot('debug-overlay-off');
  await h.press('F3');
  await h.waitFor(() => window.nasa.game.scene.getScene('Debug').debugInfo().enabled, 2000);
  h.log('second F3: overlay on');

  // Changed flags are listed, newest first, with the total count.
  await h.eval(() => {
    window.nasa.services.state.flags.set('smoke:a', true);
    window.nasa.services.state.flags.set('smoke:b', 3);
  });
  await h.waitFor(
    () =>
      window.nasa.game.scene
        .getScene('Debug')
        .debugInfo()
        .text.includes('flags 2, last:\n smoke:b=3\n smoke:a=true'),
    2000,
  );
  h.log('flags listed');

  // Over a panel: the pause menu raises itself, the overlay takes the top back.
  await h.press('Escape');
  await h.waitReady('Pause');
  await h.waitFor(() => window.nasa.game.scene.scenes.at(-1).sys.settings.key === 'Debug', 2000);
  const paused = await h.eval(() => ({
    pause: window.nasa.game.scene.isActive('Pause'),
    debugActive: window.nasa.game.scene.isActive('Debug'),
  }));
  h.log(`with the pause menu open: ${JSON.stringify(paused)}`);
  if (!paused.pause || !paused.debugActive) {
    throw new Error(`pause menu open and overlay running expected: ${JSON.stringify(paused)}`);
  }
  await h.shot('debug-overlay-pause');

  // In act 2 the simulation runs: the overlay adds its time scale and day.
  await h.goto('/?act=act2&overlay=1');
  await h.waitReady('World', 10000);
  await h.waitFor(
    () => /T×\d+ Day \d+/.test(window.nasa.game.scene.getScene('Debug').debugInfo().text),
    10000,
  );
  h.log(`act 2: ${JSON.stringify((await h.eval(overlay)).text)}`);
  await h.shot('debug-overlay-ship');
}
