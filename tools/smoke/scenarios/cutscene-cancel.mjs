/**
 * Smoke scenario: a cutscene cancelled by a death. In the demo room the hero walks
 * into `trigger-center`; while the captain walks up in `demo-arrival`, `flow.gameOver` kills
 * the hero. The cutscene ends at once and quietly (no console error, `isPlaying` false within
 * 1 s, its final flag unset), the end screen shows, and "Retry from checkpoint" returns to a
 * world whose controls are not locked.
 * Run: node tools/smoke.mjs --scenario tools/smoke/scenarios/cutscene-cancel.mjs
 *
 * @param {import('playwright-core').Page} _page
 * @param {any} h helpers, see tools/smoke.mjs
 */
export default async function cutsceneCancel(_page, h) {
  const faderClear = () => window.nasa.game.scene.getScene('Ui').debugInfo().fader === 0;
  const hero = () => window.nasa.game.scene.getScene('World').debugInfo().player;
  const SLOW = 10000;

  await h.goto('/?location=demo-room&spawn=spawn-from-corridor');
  await h.waitReady('World');
  await h.waitFor(faderClear);
  // A checkpoint at the room's entrance, so "Retry" comes back here.
  await h.eval(() => {
    window.nasa.services.save.clear();
    window.nasa.services.flow.checkpoint();
  });
  await h.mark();

  // Walk right along y=180 into trigger-center; wait for the captain's walk.
  await h.holdUntil('ArrowRight', () => window.nasa.services.cutscenes.isPlaying, 15000);
  await h.waitFor(
    () => window.nasa.game.scene.getScene('World').actor('npc-captain')?.isMoving() === true,
    5000,
  );
  await h.eval(() => window.nasa.services.flow.gameOver('death-generic'));
  await h.waitFor(() => !window.nasa.services.cutscenes.isPlaying, 1000);
  const ended = await h.eval(() =>
    window.__nasaEvents.filter((e) => e.name === 'cutsceneEnded').map((e) => e.payload),
  );
  h.log(`cutsceneEnded: ${JSON.stringify(ended)}`);
  if (ended.length !== 1 || ended[0].cutsceneId !== 'demo-arrival') {
    throw new Error(`want one cutsceneEnded for demo-arrival, got ${JSON.stringify(ended)}`);
  }

  await h.waitReady('Ending', SLOW);
  await h.waitFor(faderClear);
  const ending = await h.eval(() => window.nasa.game.scene.getScene('Ending').debugInfo());
  if (ending.endingId !== 'death-generic') throw new Error(`ending ${ending.endingId}`);
  const after = await h.eval(() => ({
    playing: window.nasa.services.cutscenes.isPlaying,
    current: window.nasa.services.cutscenes.current,
    seen: window.nasa.services.state.flags.get('demo.arrivalSeen'),
    dialogue: window.nasa.game.scene.getScene('Ui').debugInfo().dialogue,
  }));
  h.log(`on the end screen: ${JSON.stringify(after)}`);
  if (after.playing || after.current !== null) throw new Error('cutscene still marked playing');
  if (after.seen === true) throw new Error('the cancelled script went on and set its flag');
  if (after.dialogue !== null) throw new Error('a dialogue window stayed over the end screen');
  await h.shot('cutscene-cancel-ending');

  // "Retry from checkpoint" (selected first) -> the room, input free.
  await h.press('Enter');
  await h.waitReady('World', SLOW);
  await h.waitFor(faderClear);
  const retried = await h.eval(() => ({
    location: window.nasa.game.scene.getScene('World').debugInfo().locationId,
    locked: window.nasa.game.scene.getScene('World').controls.isLocked(),
    playing: window.nasa.services.cutscenes.isPlaying,
  }));
  h.log(`retry -> ${JSON.stringify(retried)}`);
  if (retried.location !== 'demo-room') throw new Error('retry did not return to demo-room');
  if (retried.locked || retried.playing) throw new Error('controls locked after retry');
  const before = await h.eval(hero);
  await h.hold('ArrowDown', 400);
  const moved = await h.eval(hero);
  h.log(`ArrowDown 400 ms: y ${before.y.toFixed(1)} -> ${moved.y.toFixed(1)}`);
  if (moved.y - before.y < 15) throw new Error('hero did not move after retry');
}
