/**
 * Smoke scenario: cutscene. In the warehouse the hero walks right into the `arrival` trigger:
 * the `warehouse-arrival` cutscene locks the input, the engineer walks up to the hero and says
 * two lines in the dialogue window (Enter closes each; the window never leaves a frame empty
 * between them), both look at the hatch and the engineer returns to his post; the camera stays
 * still all along, also with the hero off the middle line. Afterwards `warehouse.arrivalSeen` is set, the
 * hero walks again, and crossing the trigger once more does not replay the cutscene.
 * Run: node tools/smoke.mjs --scenario tools/smoke/scenarios/cutscene.mjs
 *
 * @param {import('playwright-core').Page} page
 * @param {any} h helpers, see tools/smoke.mjs
 */
export default async function cutscene(page, h) {
  // Page-side functions see only `window`.
  const dialogueInfo = () => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue;
  const hero = () => window.nasa.game.scene.getScene('World').debugInfo().player;
  const eventCount = (name) => window.__nasaEvents.filter((e) => e.name === name).length;
  const locked = () => window.nasa.game.scene.getScene('World').controls.isLocked();

  /** Waits for the current `say` line to be typed out, checks it, then closes it with Enter. */
  async function closeLine(index) {
    await h.waitFor(() => {
      const info = window.nasa.game.scene.getScene('Ui').debugInfo().dialogue;
      return info && !info.typing;
    }, 10000);
    const line = await h.eval(dialogueInfo);
    h.log(`line ${index}: ${line.speaker}: ${line.text}`);
    if (line.id !== 'say' || line.speaker !== 'engineer') {
      throw new Error(
        `line ${index}: want a "say" line by the engineer, got ${JSON.stringify(line)}`,
      );
    }
    await h.press('Enter');
    await page.waitForFunction(
      (prev) => {
        const info = window.nasa.game.scene.getScene('Ui').debugInfo().dialogue;
        return info === null || info.text !== prev;
      },
      line.text,
      { timeout: 5000 },
    );
  }

  await h.goto('/?location=warehouse&spawn=spawn-default');
  await h.waitReady('World');
  await h.waitFor(() => !window.nasa.services.flow.isTransitioning);
  // Off the middle line (y=184): the warehouse is 8 px taller than the screen, so a camera move
  // during the cutscene would show as the map nudging up and down.
  await h.teleport(48, 170);
  // Every rendered frame from now on: the camera scroll and whether a dialogue window is shown.
  await h.eval(() => {
    const world = window.nasa.game.scene.getScene('World');
    const ui = window.nasa.game.scene.getScene('Ui');
    window.__smokeFrames = [];
    window.nasa.game.events.on('postrender', () => {
      if (!window.nasa.services.cutscenes.isPlaying) return;
      const camera = world.cameras.main;
      window.__smokeFrames.push({
        scroll: [camera.scrollX, camera.scrollY],
        shown: ui.debugInfo().dialogueShown,
      });
    });
  });
  await h.mark();

  // Walk right along y=170 into the arrival trigger (x 96..128, y 160..208).
  await h.holdUntil('ArrowRight', () => window.nasa.services.cutscenes.isPlaying, 15000);
  await h.waitEvent('cutsceneStarted', 5000);
  if (!(await h.eval(locked))) throw new Error('world controls not locked during the cutscene');
  const current = await h.eval(() => window.nasa.services.cutscenes.current);
  if (current !== 'warehouse-arrival') {
    throw new Error(`playing ${current}, want warehouse-arrival`);
  }

  // The engineer walks up to the hero, then the first `say` opens the dialogue window.
  await h.waitEvent('dialogueStarted', 10000);
  const positions = await h.eval(() => {
    const world = window.nasa.game.scene.getScene('World');
    const engineer = world.actor('npc-engineer');
    return { hero: world.debugInfo().player, engineer: { x: engineer.x, y: engineer.y } };
  });
  h.log(`positions at the first line: ${JSON.stringify(positions)}`);
  const gap = Math.hypot(
    positions.engineer.x - positions.hero.x,
    positions.engineer.y - positions.hero.y,
  );
  if (gap > 40) throw new Error(`engineer stopped ${gap.toFixed(1)} px from the hero, want <= 40`);
  // Press nothing: the typewriter runs out on its own, then the screenshot shows the line.
  await h.waitFor(() => !window.nasa.game.scene.getScene('Ui').debugInfo().dialogue?.typing, 5000);
  await h.shot('cutscene-say');

  await closeLine(1);
  await closeLine(2);

  // Both look at the hatch, the engineer walks back, then the end.
  await h.waitEvent('cutsceneEnded', 30000);
  await h.waitFor(() => !window.nasa.services.cutscenes.isPlaying);
  const frames = await h.eval(() => window.__smokeFrames);
  const scrolls = [...new Set(frames.map((frame) => frame.scroll.join(',')))];
  h.log(`cutscene: ${frames.length} frames, camera scroll ${JSON.stringify(scrolls)}`);
  if (scrolls.length !== 1) throw new Error(`the camera moved during the cutscene: ${scrolls}`);
  // From the first frame with the window to the last: no frame without it between the lines.
  const shown = frames.map((frame) => frame.shown);
  const gaps = shown
    .slice(shown.indexOf(true), shown.lastIndexOf(true))
    .filter((value) => !value).length;
  if (gaps > 0) throw new Error(`the dialogue window vanished for ${gaps} frame(s) between lines`);
  const flags = await h.eval(() => ({
    seen: window.nasa.services.state.flags.get('warehouse.arrivalSeen'),
    trigger: window.nasa.services.state.flags.get('trigger:warehouse:arrival'),
  }));
  h.log(`flags: ${JSON.stringify(flags)}`);
  if (flags.seen !== true) throw new Error('warehouse.arrivalSeen not set');
  if (flags.trigger !== true) throw new Error('trigger flag not set');
  if (await h.eval(locked)) throw new Error('world controls still locked after the cutscene');
  const said = await h.eval(() =>
    window.__nasaEvents.filter((e) => e.name === 'dialogueStarted').map((e) => e.payload),
  );
  if (said.length !== 2 || said.some((p) => p.dialogueId !== 'say')) {
    throw new Error(`dialogueStarted: ${JSON.stringify(said)}, want two "say"`);
  }

  const post = await h.eval(() => {
    const engineer = window.nasa.game.scene.getScene('World').actor('npc-engineer');
    return { x: engineer.x, y: engineer.y };
  });
  if (Math.hypot(post.x - 288, post.y - 168) > 1) {
    throw new Error(`engineer not back at his post: ${JSON.stringify(post)}`);
  }

  // The hero walks again.
  const before = await h.eval(hero);
  await h.hold('ArrowLeft', 500);
  const after = await h.eval(hero);
  h.log(`ArrowLeft 500 ms: x ${before.x.toFixed(1)} -> ${after.x.toFixed(1)}`);
  if (before.x - after.x < 20) throw new Error('hero did not move left after the cutscene');

  // Back across the trigger: it is `once`, so the cutscene does not replay.
  await h.holdUntil(
    'ArrowRight',
    () => window.nasa.game.scene.getScene('World').debugInfo().player.x > 150,
    10000,
  );
  await page.waitForTimeout(300);
  const started = await h.eval(eventCount, 'cutsceneStarted');
  if (started !== 1) throw new Error(`cutsceneStarted ${started} times, want 1`);
  if (await h.eval(() => window.nasa.services.cutscenes.isPlaying)) {
    throw new Error('cutscene replayed on crossing the trigger again');
  }
  await h.shot('cutscene-after');

  // api.showTitle goes through UiScene.showTitle: a centred title, gone after its time.
  await h.eval(() => {
    void window.nasa.game.scene.getScene('Ui').showTitle('Act I: Departure', 1500);
  });
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().title !== null);
  await page.waitForTimeout(700);
  await h.shot('cutscene-title');
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().title === null, 4000);
}
