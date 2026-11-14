/**
 * Smoke scenario: the UI kit. 1) Fade probe: during a door transition every rendered frame
 * records the fader's opacity; the new location must never show unfaded before its fade in.
 * 2) ChoiceList: opened through `UiScene.debugShowChoices`, ArrowDown + Enter chooses index 1,
 * a mouse click on the third row chooses index 2.
 * Run: node tools/smoke.mjs --scenario tools/smoke/scenarios/ui.mjs
 *
 * @param {import('playwright-core').Page} _page
 * @param {any} h helpers, see tools/smoke.mjs
 */
export default async function ui(_page, h) {
  const settled = () => !window.nasa.services.flow.isTransitioning;
  const uiInfo = () => window.nasa.game.scene.getScene('Ui').debugInfo();

  await h.goto('/?location=demo-room&spawn=spawn-default');
  await h.waitReady('World');
  await h.waitFor(settled);

  // 1) Fade probe. Records, after every rendered frame, the fader alpha and whether the new
  // World has been created yet, from the first frame of the transition until it settles.
  await h.eval(() => {
    const game = window.nasa.game;
    const world = game.scene.getScene('World');
    const fader = game.scene.getScene('Ui').fader;
    window.__fadeFrames = [];
    let created = false;
    let started = false;
    world.events.once('create', () => {
      created = true;
    });
    const record = () => {
      const transitioning = window.nasa.services.flow.isTransitioning;
      if (transitioning) started = true;
      if (started) window.__fadeFrames.push({ alpha: fader.alpha, created });
      if (!started || transitioning) game.events.once('postrender', record);
    };
    game.events.once('postrender', record);
  });
  await h.holdUntil(
    'ArrowLeft',
    () => window.nasa.game.scene.getScene('World').debugInfo().locationId === 'demo-corridor',
    20000,
  );
  await h.waitFor(settled);
  await h.waitFor(() => window.__fadeFrames.length > 0 && window.__fadeFrames.at(-1).alpha === 0);
  const frames = await h.eval(() => window.__fadeFrames);
  const round = (value) => Math.round(value * 100) / 100;
  h.log(
    `fade frames (${frames.length}): ${frames.map((f) => `${round(f.alpha)}${f.created ? '*' : ''}`).join(' ')}`,
  );
  const peak = frames.findIndex((frame) => frame.alpha === 1);
  if (peak < 0) throw new Error('the fader never reached black');
  const firstNew = frames.findIndex((frame) => frame.created);
  if (firstNew < 0) throw new Error('the new World was never created during the probe');
  if (firstNew < peak) throw new Error(`new location rendered at frame ${firstNew} before black`);
  for (let i = 1; i < frames.length; i += 1) {
    const rising = i <= peak;
    const ok = rising
      ? frames[i].alpha >= frames[i - 1].alpha
      : frames[i].alpha <= frames[i - 1].alpha;
    if (!ok) throw new Error(`fader alpha not monotonic at frame ${i}: ${JSON.stringify(frames)}`);
  }
  // The darkest frame of the new location is the first one; it must be (nearly) black.
  if (frames[firstNew].alpha < 0.9) {
    throw new Error(`first frame of the new location too bright: alpha ${frames[firstNew].alpha}`);
  }
  for (const frame of frames.slice(peak, firstNew)) {
    if (frame.alpha !== 1) throw new Error('fader lifted before the new World was created');
  }
  h.log(
    `fade ok: ${peak} frames out, ${firstNew - peak} black frames before create, ` +
      `first new-location alpha ${round(frames[firstNew].alpha)}`,
  );

  // 2) ChoiceList by keyboard.
  await h.eval(() => {
    window.__choice = undefined;
    window.nasa.game.scene
      .getScene('Ui')
      .debugShowChoices(['A', 'B', 'C'])
      .then((index) => {
        window.__choice = index;
      });
  });
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().choices !== null);
  await h.press('ArrowDown');
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().choices.selected === 1);
  await h.shot('ui-choices');
  await h.press('Enter');
  await h.waitFor(() => window.__choice !== undefined);
  const byKeys = await h.eval(() => window.__choice);
  h.log(`keyboard choice: ${byKeys}`);
  if (byKeys !== 1) throw new Error(`ArrowDown + Enter chose ${byKeys}, want 1`);
  if ((await h.eval(uiInfo)).choices !== null) throw new Error('choice list still shown');

  // ChoiceList by mouse: a click on the third row.
  await h.eval(() => {
    window.__choice = undefined;
    window.nasa.game.scene
      .getScene('Ui')
      .debugShowChoices(['Yes', 'No', 'Maybe'])
      .then((index) => {
        window.__choice = index;
      });
  });
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().choices !== null);
  const third = await h.eval(() => window.nasa.game.scene.getScene('Ui').debugChoiceCenter(2));
  await h.click(third.x, third.y);
  await h.waitFor(() => window.__choice !== undefined);
  const byMouse = await h.eval(() => window.__choice);
  h.log(`mouse choice at ${third.x},${third.y}: ${byMouse}`);
  if (byMouse !== 2) throw new Error(`click on the third row chose ${byMouse}, want 2`);
}
