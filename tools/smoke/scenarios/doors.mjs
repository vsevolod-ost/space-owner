/**
 * Smoke scenario: doors, interactables and triggers. The hero walks from the corridor
 * through its door into the room, across the middle to the terminal, presses E for a toast,
 * walks back through the room's door to the corridor, and returns. The room's `trigger-center`
 * plays a cutscene (covered by cutscene.mjs): its once-flag is set up front, so here the
 * trigger stays quiet and the walk is not interrupted.
 * Run: node tools/smoke.mjs --scenario tools/smoke/scenarios/doors.mjs
 *
 * @param {import('playwright-core').Page} page
 * @param {any} h helpers, see tools/smoke.mjs
 */
export default async function doors(page, h) {
  // Page-side predicates see only `window`: these run in the page and use no closure.
  const info = () => window.nasa.game.scene.getScene('World').debugInfo();
  const settled = () => !window.nasa.services.flow.isTransitioning;
  const inRoom = () =>
    window.nasa.game.scene.getScene('World').debugInfo().locationId === 'demo-room';
  const inCorridor = () =>
    window.nasa.game.scene.getScene('World').debugInfo().locationId === 'demo-corridor';
  const TRIGGER_FLAG = 'trigger:demo-room:trigger-center';
  const cutscenesStarted = () =>
    window.__nasaEvents.filter((e) => e.name === 'cutsceneStarted').length;

  await h.goto('/?location=demo-corridor&spawn=spawn-default');
  await h.waitReady('World');
  await h.waitFor(settled);
  // The demo-arrival cutscene counts as seen: crossing the trigger does nothing.
  await h.eval((flag) => window.nasa.services.state.flags.set(flag, true), TRIGGER_FLAG);

  // Corridor -> room: the door on the corridor's right wall.
  await h.holdUntil('ArrowRight', inRoom, 20000);
  await h.waitReady('World');
  await h.waitFor(settled);
  const room = await h.eval(info);
  h.log(`in the room: ${JSON.stringify(room)}`);
  if (room.spawn !== 'spawn-from-corridor') throw new Error(`wrong spawn ${room.spawn}`);
  const current = await h.eval(() => window.nasa.services.state.current);
  if (current?.locationId !== 'demo-room' || current.spawn !== 'spawn-from-corridor') {
    throw new Error(`state.current not updated: ${JSON.stringify(current)}`);
  }
  // Arriving next to the door must not bounce the hero back.
  await page.waitForTimeout(500);
  if ((await h.eval(info)).locationId !== 'demo-room') throw new Error('bounced back');
  await h.shot('doors-room');

  // Walk right along y=180: through trigger-center (quiet), up to the terminal.
  await h.mark();
  await h.holdUntil(
    'ArrowRight',
    () => window.nasa.game.scene.getScene('World').debugInfo().focused === 'terminal',
    15000,
  );
  await h.waitEvent('interactableFocused');
  const focusEvents = await h.eval(() =>
    window.__nasaEvents.filter((e) => e.name === 'interactableFocused').map((e) => e.payload.name),
  );
  h.log(`interactableFocused: ${JSON.stringify(focusEvents)}`);
  if ((await h.eval(cutscenesStarted)) !== 0) throw new Error('a seen once-trigger fired');
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().hint === 'terminal');

  await h.press('KeyE');
  await h.waitFor(
    () => window.nasa.game.scene.getScene('Ui').debugInfo().toast === 'A dusty terminal.',
  );
  const ui = await h.eval(() => window.nasa.game.scene.getScene('Ui').debugInfo());
  h.log(`ui: ${JSON.stringify(ui)}`);
  await h.shot('doors-toast');
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().toast === null, 4000);

  // Room -> corridor: back along y=180 (through the quiet trigger again) to the door.
  await h.holdUntil('ArrowLeft', inCorridor, 20000);
  await h.waitReady('World');
  await h.waitFor(settled);
  const back = await h.eval(info);
  h.log(`back in the corridor: ${JSON.stringify(back)}`);
  if (back.spawn !== 'spawn-from-room') throw new Error(`wrong spawn ${back.spawn}`);
  await page.waitForTimeout(500);
  if ((await h.eval(info)).locationId !== 'demo-corridor') throw new Error('bounced back');
  const hidden = await h.eval(() => window.nasa.game.scene.getScene('Ui').debugInfo().hint);
  if (hidden !== null) throw new Error(`hint still shown after leaving: ${hidden}`);

  // Into the room once more and across the trigger: it stays quiet.
  await h.holdUntil('ArrowRight', inRoom, 10000);
  await h.waitReady('World');
  await h.waitFor(settled);
  await h.holdUntil(
    'ArrowRight',
    () => window.nasa.game.scene.getScene('World').debugInfo().player.x > 360,
    10000,
  );
  if ((await h.eval(cutscenesStarted)) !== 0) throw new Error('a seen once-trigger fired');
  const entered = await h.eval(() =>
    window.__nasaEvents.filter((e) => e.name === 'locationEntered').map((e) => e.payload),
  );
  h.log(`locationEntered: ${JSON.stringify(entered)}`);
  if (entered.length !== 4) throw new Error(`expected 4 locationEntered, got ${entered.length}`);

  // E next to an NPC without a dialogue: the fallback toast.
  await h.teleport(320, 108);
  await h.waitFor(
    () => window.nasa.game.scene.getScene('World').debugInfo().focused === 'npc-captain',
  );
  await h.press('KeyE');
  await h.waitFor(
    () =>
      window.nasa.game.scene.getScene('Ui').debugInfo().toast === 'Captain has nothing to say yet.',
  );
}
