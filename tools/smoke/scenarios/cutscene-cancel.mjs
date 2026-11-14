/**
 * Smoke scenario: a cutscene cancelled by the death loop. In the warehouse the hero walks into
 * the `arrival` trigger; while the engineer walks up in `warehouse-arrival`, `flow.die('abort')`
 * ends the voyage that is not there (from the console: no place in the warehouse dies). The
 * cutscene ends at once and quietly (no console error, one `cutsceneEnded` within 1 s, its
 * final flag unset), the scientists' debrief plays instead (no end screen),
 * and after it the world's controls are free.
 * Run: node tools/smoke.mjs --scenario tools/smoke/scenarios/cutscene-cancel.mjs
 *
 * @param {import('playwright-core').Page} page
 * @param {any} h helpers, see tools/smoke.mjs
 */
export default async function cutsceneCancel(page, h) {
  const faderClear = () => window.nasa.game.scene.getScene('Ui').debugInfo().fader === 0;
  const hero = () => window.nasa.game.scene.getScene('World').debugInfo().player;
  const SLOW = 10000;

  await h.goto('/?location=warehouse&spawn=spawn-default');
  await h.waitReady('World');
  await h.waitFor(faderClear);
  await h.eval(() => window.nasa.services.save.clear());
  await h.mark();

  // Walk right along y=184 into the arrival trigger; wait for the engineer's walk.
  await h.holdUntil('ArrowRight', () => window.nasa.services.cutscenes.isPlaying, 15000);
  await h.waitFor(
    () => window.nasa.game.scene.getScene('World').actor('npc-engineer')?.isMoving() === true,
    5000,
  );
  await h.eval(() => {
    void window.nasa.services.flow.die('abort');
  });
  await h.waitFor(() => window.nasa.services.cutscenes.current !== 'warehouse-arrival', 1000);
  const ended = await h.eval(() =>
    window.__nasaEvents.filter((e) => e.name === 'cutsceneEnded').map((e) => e.payload),
  );
  h.log(`cutsceneEnded: ${JSON.stringify(ended)}`);
  if (ended.length !== 1 || ended[0].cutsceneId !== 'warehouse-arrival') {
    throw new Error(`want one cutsceneEnded for warehouse-arrival, got ${JSON.stringify(ended)}`);
  }

  // The death loop goes on: the debrief cutscene in the warehouse, not an end screen.
  await h.waitFor(() => window.nasa.services.cutscenes.current === 'debrief', SLOW);
  const after = await h.eval(() => ({
    ending: window.nasa.game.scene.isActive('Ending'),
    seen: window.nasa.services.state.flags.get('warehouse.arrivalSeen'),
  }));
  h.log(`in the debrief: ${JSON.stringify(after)}`);
  if (after.ending) throw new Error('a death showed the end screen');
  if (after.seen === true) throw new Error('the cancelled script went on and set its flag');
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue !== null, SLOW);
  await h.shot('cutscene-cancel-debrief');

  // Close the debrief's lines: the hero at the hatch, input free.
  for (let i = 0; i < 40; i++) {
    if (!(await h.eval(() => window.nasa.services.cutscenes.isPlaying))) break;
    const line = await h.eval(() => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue);
    if (line && !line.typing) await h.press('Enter');
    await page.waitForTimeout(200);
  }
  await h.waitFor(() => !window.nasa.services.cutscenes.isPlaying, SLOW);
  await h.waitFor(faderClear);
  const freed = await h.eval(() => ({
    location: window.nasa.game.scene.getScene('World').debugInfo().locationId,
    locked: window.nasa.game.scene.getScene('World').controls.isLocked(),
    playing: window.nasa.services.cutscenes.isPlaying,
    dialogue: window.nasa.game.scene.getScene('Ui').debugInfo().dialogue,
  }));
  h.log(`after the debrief -> ${JSON.stringify(freed)}`);
  if (freed.location !== 'warehouse') throw new Error('the debrief did not end in the warehouse');
  if (freed.locked || freed.playing || freed.dialogue !== null) {
    throw new Error('controls locked after the debrief');
  }
  const before = await h.eval(hero);
  await h.hold('ArrowDown', 400);
  const moved = await h.eval(hero);
  h.log(`ArrowDown 400 ms: y ${before.y.toFixed(1)} -> ${moved.y.toFixed(1)}`);
  if (moved.y - before.y < 15) throw new Error('hero did not move after the debrief');
}
