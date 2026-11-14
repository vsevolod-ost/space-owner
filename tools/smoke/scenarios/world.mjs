/**
 * Smoke scenario: the world scene. The corridor opens from the URL with the hero and the
 * engineer, the hero walks right at about 80 px/s, and the left wall stops him.
 * Run: node tools/smoke.mjs --scenario tools/smoke/scenarios/world.mjs
 *
 * @param {import('playwright-core').Page} page
 * @param {any} h helpers, see tools/smoke.mjs
 */
export default async function world(page, h) {
  const info = () => window.nasa.game.scene.getScene('World').debugInfo();

  await h.goto('/?location=demo-corridor');
  await h.waitReady('World');
  const start = await h.eval(info);
  h.log(`start ${JSON.stringify(start)}`);
  if (start.locationId !== 'demo-corridor' || start.spawn !== 'spawn-default') {
    throw new Error(`unexpected start ${JSON.stringify(start)}`);
  }
  if (start.player.x !== 48 || start.player.y !== 270) {
    throw new Error(`hero not at spawn-default (48, 270): ${JSON.stringify(start.player)}`);
  }
  const scene = await h.eval(() => {
    const world = window.nasa.game.scene.getScene('World');
    const visible = (name) =>
      world.children.list.filter((o) => o.texture?.key === name && o.visible).length;
    const { current } = window.nasa.services.state;
    const entered = window.__nasaEvents.filter((e) => e.name === 'locationEntered');
    return {
      hero: visible('hero'),
      engineer: visible('npc-engineer'),
      background: visible('location-demo-corridor'),
      current,
      entered: entered.map((e) => e.payload),
    };
  });
  h.log(`scene ${JSON.stringify(scene)}`);
  if (scene.hero !== 1 || scene.engineer !== 1 || scene.background !== 1) {
    throw new Error('expected one hero, one engineer and the corridor background');
  }
  if (scene.current?.locationId !== 'demo-corridor' || scene.entered.length !== 1) {
    throw new Error('state.current or locationEntered not set');
  }
  // The debug overlay stays off without ?overlay=1 (smoke always adds ?debug=1).
  const overlay = await h.eval(() => window.nasa.game.scene.getScene('Debug').debugInfo());
  if (overlay.enabled !== false) throw new Error('debug overlay is on without ?overlay=1');
  await h.shot('world-corridor');

  // About 80 px in one second; the spawn line y=270 is free of collisions up to the door.
  await h.hold('ArrowRight', 1000);
  const moved = await h.eval(info);
  const dx = moved.player.x - start.player.x;
  h.log(`ArrowRight 1000 ms: x ${start.player.x} -> ${moved.player.x} (dx ${dx.toFixed(1)})`);
  if (dx < 60 || dx > 100) throw new Error(`expected dx about 80, got ${dx}`);
  if (Math.abs(moved.player.y - start.player.y) > 0.5) throw new Error('hero drifted vertically');
  await h.shot('world-walked');

  // The left wall ends at x=16; the 20 px feet body stops the centre at 16 + 10.
  await h.teleport(40, 270);
  await h.hold('ArrowLeft', 2000);
  const blocked = await h.eval(info);
  h.log(`after ArrowLeft 2000 ms from x=40: x ${blocked.player.x}`);
  if (blocked.player.x < 26 - 0.5)
    throw new Error(`hero went into the wall: x ${blocked.player.x}`);
  if (blocked.player.x > 27)
    throw new Error(`hero stopped short of the wall: x ${blocked.player.x}`);

  // Diagonal speed is normalised: about 80 px/s along the diagonal, not 113.
  await h.teleport(200, 270);
  await h.eval(() => {
    window.__diag = window.nasa.game.scene.getScene('World').debugInfo().player;
  });
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('ArrowDown');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('ArrowDown');
  const diag = await h.eval(() => {
    const now = window.nasa.game.scene.getScene('World').debugInfo().player;
    return { dx: now.x - window.__diag.x, dy: now.y - window.__diag.y };
  });
  const length = Math.hypot(diag.dx, diag.dy);
  h.log(
    `diagonal 500 ms: dx ${diag.dx.toFixed(1)} dy ${diag.dy.toFixed(1)} length ${length.toFixed(1)}`,
  );
  if (length > 50 || Math.abs(diag.dx - diag.dy) > 4) {
    throw new Error(`diagonal not normalised: ${JSON.stringify(diag)}`);
  }

  // An unknown location in the URL falls back to the menu with a warning.
  await h.goto('/?location=nowhere');
  await h.waitReady('MainMenu');
}
