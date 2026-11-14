/**
 * Smoke scenario: doors, interactables and triggers. The hero walks from home through its
 * door, which starts act 1 (title card) in the warehouse; walks right along the middle line
 * across the arrival trigger to the hatch (focus and hint, no E: the hatch's boarding check is
 * covered by warehouse.mjs and flow.mjs); presses E at a crate for its stand (left with "Leave
 * it"); walks back left across the trigger and right again. The warehouse's `arrival` trigger plays a cutscene (covered by cutscene.mjs): its
 * once-flag is set up front, so here the trigger stays quiet and the walk is not interrupted.
 * Last, E next to the astronomer opens the astronomer's dialogue. Not checked since plan S9:
 * the "has nothing to say yet" toast of an NPC without a dialogue (every NPC has one now).
 * Not checked: a location-to-location door (`LocationDoorBinding`) - the game has none since
 * the demo rooms went (plan mechanics S3); add a check when a location gets one.
 * Run: node tools/smoke.mjs --scenario tools/smoke/scenarios/doors.mjs
 *
 * @param {import('playwright-core').Page} page
 * @param {any} h helpers, see tools/smoke.mjs
 */
export default async function doors(page, h) {
  // Page-side predicates see only `window`: these run in the page and use no closure.
  const info = () => window.nasa.game.scene.getScene('World').debugInfo();
  const settled = () => !window.nasa.services.flow.isTransitioning;
  const inWarehouse = () =>
    window.nasa.game.scene.getScene('World').debugInfo().locationId === 'warehouse';
  const TRIGGER_FLAG = 'trigger:warehouse:arrival';
  const cutscenesStarted = () =>
    window.__nasaEvents.filter((e) => e.name === 'cutsceneStarted').length;

  await h.goto('/?location=home&spawn=spawn-default');
  await h.waitReady('World');
  await h.waitFor(settled);
  // The warehouse-arrival cutscene counts as seen: crossing the trigger does nothing.
  await h.eval((flag) => window.nasa.services.state.flags.set(flag, true), TRIGGER_FLAG);

  // Home -> warehouse: the door on the right wall starts act 1 (its title, then the warehouse).
  await h.mark();
  await h.holdUntil('ArrowRight', inWarehouse, 20000);
  await h.waitReady('World');
  await h.waitFor(settled);
  const arrived = await h.eval(info);
  h.log(`in the warehouse: ${JSON.stringify(arrived)}`);
  if (arrived.spawn !== 'spawn-default') throw new Error(`wrong spawn ${arrived.spawn}`);
  const current = await h.eval(() => window.nasa.services.state.current);
  if (
    current?.actId !== 'act1' ||
    current.locationId !== 'warehouse' ||
    current.spawn !== 'spawn-default'
  ) {
    throw new Error(`state.current not updated: ${JSON.stringify(current)}`);
  }
  // The act's start script saves a checkpoint.
  await h.waitEvent('checkpointSaved', 10000);
  // Arriving must not send the hero anywhere else.
  await page.waitForTimeout(500);
  if ((await h.eval(info)).locationId !== 'warehouse') throw new Error('left the warehouse');
  const hint = await h.eval(() => window.nasa.game.scene.getScene('Ui').debugInfo().hint);
  if (hint !== null) throw new Error(`hint shown on arrival: ${hint}`);
  await h.shot('doors-warehouse');

  // Walk right along y=184: through the arrival trigger (quiet), past the NPCs, to the hatch.
  await h.mark();
  await h.holdUntil(
    'ArrowRight',
    () => window.nasa.game.scene.getScene('World').debugInfo().focused === 'hatch',
    15000,
  );
  await h.waitEvent('interactableFocused');
  const focusEvents = await h.eval(() =>
    window.__nasaEvents.filter((e) => e.name === 'interactableFocused').map((e) => e.payload.name),
  );
  h.log(`interactableFocused: ${JSON.stringify(focusEvents)}`);
  if ((await h.eval(cutscenesStarted)) !== 0) throw new Error('a seen once-trigger fired');
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().hint === 'hatch');

  // E at a crate place: its stand. Above the first crate of island 1 (208..240, 232..264).
  await h.teleport(224, 222);
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().hint === 'crate-fuel-1');
  await h.press('KeyE');
  await h.waitFor(
    () => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue?.id === 'cargo-stand',
    5000,
  );
  // Enter finishes the typing; then the choices: Take it, Leave it.
  for (let i = 0; i < 10; i++) {
    if (await h.eval(() => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue?.choices))
      break;
    await h.press('Enter');
    await page.waitForTimeout(150);
  }
  const ui = await h.eval(() => window.nasa.game.scene.getScene('Ui').debugInfo());
  h.log(`ui: ${JSON.stringify(ui)}`);
  await h.shot('doors-stand');
  await h.press('ArrowDown');
  await h.waitFor(
    () => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue?.choices?.selected === 1,
  );
  await h.press('Enter');
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue === null);
  if ((await h.eval(() => window.nasa.services.state.flags.get('cargo.fuel'))) !== undefined) {
    throw new Error('Leave it took the crate');
  }

  // Back left along y=184 across the trigger, then right across it again: it stays quiet.
  await h.teleport(200, 184);
  await h.holdUntil(
    'ArrowLeft',
    () => window.nasa.game.scene.getScene('World').debugInfo().player.x < 60,
    10000,
  );
  await h.holdUntil(
    'ArrowRight',
    () => window.nasa.game.scene.getScene('World').debugInfo().player.x > 160,
    10000,
  );
  if ((await h.eval(cutscenesStarted)) !== 0) throw new Error('a seen once-trigger fired');
  const entered = await h.eval(() =>
    window.__nasaEvents.filter((e) => e.name === 'locationEntered').map((e) => e.payload),
  );
  h.log(`locationEntered: ${JSON.stringify(entered)}`);
  if (entered.length !== 2) throw new Error(`expected 2 locationEntered, got ${entered.length}`);

  // E next to the astronomer: the astronomer's dialogue.
  await h.teleport(416, 180);
  await h.waitFor(
    () => window.nasa.game.scene.getScene('World').debugInfo().focused === 'npc-astronomer',
  );
  await h.press('KeyE');
  await h.waitFor(
    () => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue?.id === 'astronomer-advice',
  );
}
