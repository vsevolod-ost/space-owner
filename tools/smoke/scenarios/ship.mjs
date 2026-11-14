/**
 * Smoke scenario: act 2 on the ship. `?act=act2` opens the ship deck with the simulation
 * running and saves it in the checkpoint; the navigation station opens the panel; in 3 s the
 * ship moves and oxygen drops; "Thrust on/off" turns the engine on; Esc closes the panel and
 * the hero walks again.
 * Run: node tools/smoke.mjs --scenario tools/smoke/scenarios/ship.mjs
 *
 * @param {import('playwright-core').Page} _page
 * @param {any} h helpers, see tools/smoke.mjs
 */
export default async function ship(_page, h) {
  const world = () => window.nasa.game.scene.getScene('World').debugInfo();
  const nav = () => window.nasa.game.scene.getScene('Navigation').debugInfo();
  const snapshot = () => window.nasa.services.simulation.snapshot();
  const faderClear = () => window.nasa.game.scene.getScene('Ui').debugInfo().fader === 0;
  // A click in a panel's first frames is lost; presses two frames apart.
  const frames = (n) =>
    h.eval(
      (count) =>
        new Promise((resolve) => {
          const loop = window.nasa.game.loop;
          const until = loop.frame + count;
          const tick = () => (loop.frame > until ? resolve() : requestAnimationFrame(tick));
          tick();
        }),
      n,
    );
  // Act title (1.5 s) and fades take about 2 s; leave room on a slow software renderer.
  const SLOW = 10000;

  // --- ?act=act2: title, the ship deck, simulation started and saved in the checkpoint.
  await h.goto('/');
  await h.waitReady('MainMenu');
  await h.eval(() => window.nasa.services.save.clear());
  await h.goto('/?act=act2');
  await h.waitReady('World', SLOW);
  await h.waitEvent('checkpointSaved', SLOW);
  await h.waitFor(faderClear, SLOW);
  const deck = await h.eval(world);
  h.log(`act2 -> ${JSON.stringify({ location: deck.locationId, player: deck.player })}`);
  if (deck.locationId !== 'ship-deck') throw new Error(`act 2 opened ${deck.locationId}`);
  if (!(await h.eval(() => window.nasa.services.simulation.isRunning))) {
    throw new Error('the simulation is not running in act 2');
  }
  const save = await h.eval(() => JSON.parse(localStorage.getItem('space-owner.save') ?? 'null'));
  h.log(`checkpoint: act ${save?.actId}, simulation ${JSON.stringify(save?.simulation?.ship)}`);
  if (save?.actId !== 'act2' || typeof save.simulation?.ship?.x !== 'number') {
    throw new Error('the act 2 checkpoint has no simulation');
  }
  await h.shot('ship-deck');

  // --- Walk right to the navigation station and open the panel.
  await h.holdUntil(
    'ArrowRight',
    () => window.nasa.game.scene.getScene('World').debugInfo().focused === 'station-navigation',
    20000,
  );
  await h.press('KeyE');
  await h.waitReady('Navigation');
  await frames(3);
  if (!(await h.eval(() => window.nasa.game.scene.isPaused('World')))) {
    throw new Error('the world is not paused under the navigation panel');
  }
  const before = await h.eval(snapshot);
  await h.shot('ship-navigation');

  // --- The simulation keeps running under the panel: 3 s later the ship moved, oxygen dropped.
  await h.eval(() => new Promise((resolve) => setTimeout(resolve, 3000)));
  const after = await h.eval(snapshot);
  const panel = await h.eval(nav);
  h.log(
    `3 s: day ${(before.timeS / 86400).toFixed(2)} -> ${(after.timeS / 86400).toFixed(2)}, ` +
      `ship.x ${before.ship.x.toExponential(4)} -> ${after.ship.x.toExponential(4)}, ` +
      `oxygen ${before.resources.oxygen.value.toFixed(3)} -> ${after.resources.oxygen.value.toFixed(3)}, ` +
      `panel ${JSON.stringify(panel)}`,
  );
  if (after.ship.x === before.ship.x) throw new Error('ship.x did not change in 3 s');
  if (!(after.resources.oxygen.value < before.resources.oxygen.value)) {
    throw new Error('oxygen did not decrease in 3 s');
  }
  if (panel.thrust || panel.trail < 5 || panel.timeScale <= 0 || panel.day < 1) {
    throw new Error(`unexpected panel state ${JSON.stringify(panel)}`);
  }
  const recorded = await h.eval(
    () => window.__nasaEvents.filter((event) => event.name === 'simulationTick').length,
  );
  if (recorded !== 0) throw new Error(`simulationTick recorded ${recorded} times in __nasaEvents`);

  // --- "Thrust on/off" turns the engine on.
  await h.click(panel.buttons.thrust.x, panel.buttons.thrust.y);
  await h.waitFor(() => window.nasa.game.scene.getScene('Navigation').debugInfo().thrust, 2000);
  const thrustN = await h.eval(() => window.nasa.services.simulation.snapshot().ship.thrustN);
  h.log(`thrust on: thrustN ${thrustN}`);
  if (!(thrustN > 0)) throw new Error('thrust is on but ship.thrustN is 0');
  await h.eval(() => new Promise((resolve) => setTimeout(resolve, 2000)));
  await h.shot('ship-navigation-thrust');

  // --- Esc closes the panel; the hero walks again.
  await h.press('Escape');
  await h.waitFor(
    () =>
      !window.nasa.game.scene.isActive('Navigation') && window.nasa.game.scene.isActive('World'),
  );
  await frames(2);
  const start = (await h.eval(world)).player;
  await h.hold('ArrowLeft', 300);
  const end = (await h.eval(world)).player;
  h.log(`walk left: x ${start.x.toFixed(1)} -> ${end.x.toFixed(1)}`);
  if (!(end.x < start.x - 5)) throw new Error('the hero did not walk after the panel closed');
}
