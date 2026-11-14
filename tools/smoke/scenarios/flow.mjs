/**
 * Smoke scenario: the story flow. New Game shows the prologue title on black, opens home and
 * saves a checkpoint; `flow.die` (the death loop) shows no end screen but takes the hero to the
 * warehouse's debrief spot in act 1, saves there, sets `run.*`, plays the scientists' debrief
 * and leaves him at the hatch; `?act=act3` opens the colony (on the Moon without a landing),
 * whose overlook says its line and ends on `colony-moon` (colony.mjs covers the colony); the warehouse hatch starts act 2; Esc pauses the
 * world and "Main menu" leaves it; "Continue" loads the save.
 * Run: node tools/smoke.mjs --scenario tools/smoke/scenarios/flow.mjs
 *
 * @param {import('playwright-core').Page} page
 * @param {any} h helpers, see tools/smoke.mjs
 */
export default async function flow(page, h) {
  const world = () => window.nasa.game.scene.getScene('World').debugInfo();
  const ending = () => window.nasa.game.scene.getScene('Ending').debugInfo();
  const pauseItems = () => window.nasa.game.scene.getScene('Pause').debugInfo().choices.items;
  const current = () => window.nasa.services.state.current;
  const savedGame = () => JSON.parse(localStorage.getItem('space-owner.save') ?? 'null');
  const faderClear = () => window.nasa.game.scene.getScene('Ui').debugInfo().fader === 0;
  // Act title (1.5 s) and fades take about 2 s; leave room on a slow software renderer.
  const SLOW = 10000;

  // --- New Game: prologue title on black, home, checkpoint in localStorage.
  await h.goto('/');
  await h.waitReady('MainMenu');
  await h.eval(() => window.nasa.services.save.clear());
  await h.goto('/');
  await h.waitReady('MainMenu');
  const menu = await h.eval(() => window.nasa.game.scene.getScene('MainMenu').debugInfo());
  const newGame = menu.buttons.find((button) => button.label === 'New Game');
  const about = menu.buttons.find((button) => button.label === 'About');
  await h.mark();
  await h.click(newGame.x, newGame.y);
  await h.waitFor(() => {
    const info = window.nasa.game.scene.getScene('Ui').debugInfo();
    return info.title === 'Prologue' && info.fader === 1;
  });
  // The menu sits under the black fader during the title: a click on "About" must not reach it.
  await h.click(about.x, about.y);
  // Let the title fade in fully (300 ms) before the shot.
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').title?.alpha === 1);
  await h.shot('flow-title');
  if ((await h.eval(current)) !== null) throw new Error('state.current set during the title');
  if (await h.eval(() => window.nasa.game.scene.isActive('Stub'))) {
    throw new Error('a click on "About" under the act title opened the stub panel');
  }

  await h.waitReady('World', SLOW);
  // Started = running, paused or asleep (Phaser.Scenes.RUNNING 5 .. SLEEPING 7): a menu or
  // panel left paused under the world would count too.
  const runningScenes = await h.eval(() =>
    window.nasa.game.scene
      .getScenes(false)
      .filter((scene) => scene.sys.settings.status >= 5 && scene.sys.settings.status <= 7)
      .map((scene) => scene.sys.settings.key)
      .sort(),
  );
  h.log(`started scenes after the prologue goTo: ${JSON.stringify(runningScenes)}`);
  if (JSON.stringify(runningScenes) !== JSON.stringify(['Debug', 'Ui', 'World'])) {
    throw new Error(`want only World, Ui and Debug running, got ${JSON.stringify(runningScenes)}`);
  }
  await h.waitEvent('checkpointSaved', SLOW);
  const firstSave = await h.eval(savedGame);
  h.log(`checkpoint save: ${JSON.stringify(firstSave)}`);
  if (
    firstSave?.actId !== 'prologue' ||
    firstSave.locationId !== 'home' ||
    firstSave.spawn !== 'spawn-default'
  ) {
    throw new Error(`unexpected save after the prologue: ${JSON.stringify(firstSave)}`);
  }
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().toast === 'Checkpoint');
  await h.waitFor(faderClear);

  // --- The death loop (`flow.die`, here from the console without a voyage: cause `abort`),
  // with the E hint showing at a crate of the warehouse: no end screen; the warehouse's
  // `debrief` spawn in act 1 with a checkpoint, the `run.*` flags, the scientists' debrief, the
  // hero at the hatch.
  await h.goto('/?location=warehouse');
  await h.waitReady('World');
  await h.waitFor(faderClear);
  await h.teleport(224, 222);
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().hint === 'crate-fuel-1');
  await h.mark();
  await h.eval(() => {
    void window.nasa.services.flow.die('abort');
  });
  await h.waitEvent('flightLost');
  await h.waitEvent('checkpointSaved', SLOW);
  await h.waitFor(() => window.nasa.services.cutscenes.current === 'debrief', SLOW);
  const lost = await h.eval(() => ({
    save: JSON.parse(localStorage.getItem('space-owner.save') ?? 'null'),
    current: window.nasa.services.state.current,
    attempt: window.nasa.services.state.flags.get('run.attempt'),
    cause: window.nasa.services.state.flags.get('run.lastCause'),
    gate: window.nasa.services.state.flags.get('run.lastGate'),
    ending: window.nasa.game.scene.isActive('Ending'),
    hint: window.nasa.game.scene.getScene('Ui').debugInfo().hint,
  }));
  h.log(
    `die -> ${JSON.stringify({ ...lost, save: undefined })}, save ${JSON.stringify(lost.save)}`,
  );
  if (
    lost.save?.actId !== 'act1' ||
    lost.save.locationId !== 'warehouse' ||
    lost.save.spawn !== 'debrief' ||
    lost.save.voyage !== undefined
  ) {
    throw new Error('die did not save a checkpoint at the debrief spot in act 1');
  }
  if (lost.current?.actId !== 'act1') throw new Error('die did not switch to act 1');
  if (lost.attempt !== 2 || lost.cause !== 'abort' || lost.gate !== -1) {
    throw new Error(`unexpected run flags after die: ${JSON.stringify(lost)}`);
  }
  if (lost.ending) throw new Error('a death showed the end screen');
  if (lost.hint !== null) throw new Error('the E hint stayed over the debrief');
  // Close the scientists' lines; the debrief ends with the hero at the hatch.
  for (let i = 0; i < 40; i++) {
    if (!(await h.eval(() => window.nasa.services.cutscenes.isPlaying))) break;
    const line = await h.eval(() => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue);
    if (line && !line.typing) await h.press('Enter');
    await page.waitForTimeout(200);
  }
  await h.waitFor(() => !window.nasa.services.cutscenes.isPlaying, SLOW);
  await h.waitFor(faderClear);
  const afterDebrief = await h.eval(world);
  h.log(`after the debrief: ${JSON.stringify(afterDebrief.player)}`);
  if (Math.abs(afterDebrief.player.x - 588) > 2 || Math.abs(afterDebrief.player.y - 184) > 2) {
    throw new Error('the debrief did not leave the hero at the hatch');
  }

  // --- ?act=act3: title, the colony with its checkpoint; its overlook says its line, then
  // shows the Moon's ending (no landing: the colony stands on the first site).
  await h.goto('/?act=act3');
  await h.waitReady('World', SLOW);
  await h.waitEvent('checkpointSaved', SLOW);
  await h.waitFor(faderClear);
  const colony = { world: await h.eval(world), save: await h.eval(savedGame) };
  h.log(`act3 -> ${JSON.stringify(colony)}`);
  if (colony.world.locationId !== 'colony' || colony.save?.actId !== 'act3') {
    throw new Error('act3 did not open the colony with a checkpoint');
  }
  await h.shot('flow-colony');
  // Left of the overlook (576..608, 148..180), on the middle line.
  await h.teleport(560, 180);
  await h.waitFor(
    () => window.nasa.game.scene.getScene('World').debugInfo().focused === 'overlook',
  );
  await h.press('KeyE');
  await h.waitFor(
    () => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue?.typing === false,
    SLOW,
  );
  await h.press('Enter');
  await h.waitReady('Ending', SLOW);
  await h.waitFor(faderClear);
  const moonEnding = await h.eval(ending);
  h.log(`overlook -> ${JSON.stringify(moonEnding)}`);
  if (moonEnding.endingId !== 'colony-moon') throw new Error('overlook did not show colony-moon');
  if (JSON.stringify(moonEnding.choices.items) !== '["Fly again","Main menu"]') {
    throw new Error(`unexpected end screen options ${JSON.stringify(moonEnding.choices)}`);
  }
  if (await h.eval(() => window.nasa.game.scene.isActive('World'))) {
    throw new Error('World runs behind the end screen');
  }
  await h.shot('flow-ending');

  // --- The warehouse hatch ("Board" at its check, warehouse.mjs covers "Wait") starts act 2
  // on the ship deck with its checkpoint (and the voyage); the E hint goes with the warehouse.
  await h.goto('/?location=warehouse&spawn=spawn-hatch');
  await h.waitReady('World');
  await h.waitFor(faderClear);
  // Left of the hatch (608..624, 160..208), on the walking line.
  await h.teleport(596, 184);
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().hint === 'hatch');
  await h.mark();
  await h.press('KeyE');
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue?.id === 'hatch');
  for (let i = 0; i < 10; i++) {
    if (await h.eval(() => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue?.choices))
      break;
    await h.press('Enter');
    await page.waitForTimeout(150);
  }
  await h.press('ArrowDown'); // "Board", after "Wait"
  await h.waitFor(
    () => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue?.choices?.selected === 1,
  );
  await h.press('Enter');
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().title === 'Act 2');
  await h.waitReady('World', SLOW);
  await h.waitEvent('checkpointSaved', SLOW);
  const act2Save = await h.eval(savedGame);
  h.log(`hatch -> save ${JSON.stringify(act2Save)}`);
  if (
    act2Save?.actId !== 'act2' ||
    act2Save.locationId !== 'ship-deck' ||
    act2Save.voyage !== true ||
    typeof act2Save.flags?.['run.seed'] !== 'number' ||
    act2Save.simulation !== undefined
  ) {
    throw new Error('the hatch did not start act 2 on the ship deck with a voyage and its seed');
  }
  const deckHint = await h.eval(() => window.nasa.game.scene.getScene('Ui').debugInfo().hint);
  if (deckHint !== null) throw new Error(`hint still shown after leaving: ${deckHint}`);

  // --- Pause: Esc at home; the world is paused under the panel.
  await h.goto('/?location=home');
  await h.waitReady('World');
  await h.waitFor(faderClear);
  await h.press('Escape');
  await h.waitReady('Pause');
  const paused = await h.eval(() => window.nasa.game.scene.isPaused('World'));
  if (!paused) throw new Error('the world is not paused under the pause menu');
  const pause = await h.eval(() => window.nasa.game.scene.getScene('Pause').debugInfo());
  h.log(`pause -> ${JSON.stringify(pause)}`);
  // "Return to warehouse" is offered only during a voyage (act 2; death-loop.mjs uses it).
  if (JSON.stringify(await h.eval(pauseItems)) !== '["Resume","Settings","Main menu"]') {
    throw new Error(`unexpected pause options outside a voyage: ${JSON.stringify(pause)}`);
  }
  await h.shot('flow-pause');

  // Esc resumes; Esc again and "Main menu" (third option) leaves for the menu.
  await h.press('Escape');
  await h.waitFor(
    () => !window.nasa.game.scene.isActive('Pause') && window.nasa.game.scene.isActive('World'),
  );
  await h.press('Escape');
  await h.waitReady('Pause');
  // A click in the panel's first frames is lost (its buttons are not yet interactive):
  // wait a few frames first.
  await h.eval(
    () =>
      new Promise((resolve) => {
        const loop = window.nasa.game.loop;
        const until = loop.frame + 3;
        const tick = () => (loop.frame > until ? resolve() : requestAnimationFrame(tick));
        tick();
      }),
  );
  const mainMenu = await h.eval(() =>
    window.nasa.game.scene.getScene('Pause').debugChoiceCenter(2),
  );
  await h.click(mainMenu.x, mainMenu.y);
  await h.waitReady('MainMenu', SLOW);
  await h.waitFor(faderClear);
  const left = await h.eval(() => ({
    world: window.nasa.game.scene.isActive('World') || window.nasa.game.scene.isPaused('World'),
    pause: window.nasa.game.scene.isActive('Pause'),
    current: window.nasa.services.state.current,
  }));
  if (left.world || left.pause || left.current !== null) {
    throw new Error(`"Main menu" left the game running: ${JSON.stringify(left)}`);
  }

  // --- Continue from a fresh menu: back to the saved location and act.
  await h.goto('/');
  await h.waitReady('MainMenu');
  const menuAgain = await h.eval(() => window.nasa.game.scene.getScene('MainMenu').debugInfo());
  if (!menuAgain.continueEnabled) throw new Error('"Continue" is disabled with a save');
  await h.eval(() => window.nasa.services.flow.continueGame());
  await h.waitFor(faderClear);
  const continued = { world: await h.eval(world), current: await h.eval(current) };
  h.log(`continue -> ${JSON.stringify(continued)}`);
  if (
    continued.world.locationId !== act2Save.locationId ||
    continued.current?.actId !== act2Save.actId
  ) {
    throw new Error('continueGame did not return to the saved location and act');
  }
  // The act 2 save marks the voyage (plan D17): Continue starts it again from its start, with
  // the same seed.
  const restored = await h.eval(() => ({
    started: window.nasa.services.simulation.isStarted,
    timeS: window.nasa.services.simulation.snapshot()?.timeS,
    seed: window.nasa.services.simulation.voyage?.seed,
    flag: window.nasa.services.state.flags.get('run.seed'),
  }));
  h.log(`continue -> voyage ${JSON.stringify(restored)}, saved seed ${act2Save.flags['run.seed']}`);
  if (
    !restored.started ||
    restored.timeS !== 0 ||
    restored.seed !== act2Save.flags['run.seed'] ||
    restored.flag !== restored.seed
  ) {
    throw new Error('continueGame did not start the voyage again with the saved seed');
  }
}
