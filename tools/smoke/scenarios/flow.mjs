/**
 * Smoke scenario: the story flow. New Game shows the prologue title on black, opens the
 * corridor and saves a checkpoint; `?act=act3` ends on the demo ending; the broken vent in the
 * room kills the hero and "Retry from checkpoint" goes back to the saved place; `door-ship`
 * starts act 2; Esc pauses the world and "Main menu" leaves it; "Continue" loads the save.
 * Run: node tools/smoke.mjs --scenario tools/smoke/scenarios/flow.mjs
 *
 * @param {import('playwright-core').Page} _page
 * @param {any} h helpers, see tools/smoke.mjs
 */
export default async function flow(_page, h) {
  const ui = () => window.nasa.game.scene.getScene('Ui').debugInfo();
  const world = () => window.nasa.game.scene.getScene('World').debugInfo();
  const ending = () => window.nasa.game.scene.getScene('Ending').debugInfo();
  const current = () => window.nasa.services.state.current;
  const savedGame = () => JSON.parse(localStorage.getItem('space-owner.save') ?? 'null');
  const faderClear = () => window.nasa.game.scene.getScene('Ui').debugInfo().fader === 0;
  // Act title (1.5 s) and fades take about 2 s; leave room on a slow software renderer.
  const SLOW = 10000;

  // --- New Game: prologue title on black, corridor, checkpoint in localStorage.
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
    firstSave.locationId !== 'demo-corridor' ||
    firstSave.spawn !== 'spawn-default'
  ) {
    throw new Error(`unexpected save after the prologue: ${JSON.stringify(firstSave)}`);
  }
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().toast === 'Checkpoint');
  await h.waitFor(faderClear);

  // --- ?act=act3: title, then the demo ending.
  await h.goto('/?act=act3');
  await h.waitReady('Ending', SLOW);
  await h.waitFor(faderClear);
  const demoEnding = await h.eval(ending);
  h.log(`act3 -> ${JSON.stringify(demoEnding)}`);
  if (demoEnding.endingId !== 'demo-ending') throw new Error('act3 did not show demo-ending');
  if (await h.eval(() => window.nasa.game.scene.isActive('World'))) {
    throw new Error('World runs behind the end screen');
  }
  await h.shot('flow-ending');

  // --- Death: the broken vent straight up from the room's spawn.
  await h.goto('/?location=demo-room');
  await h.waitReady('World');
  await h.waitFor(faderClear);
  await h.holdUntil(
    'ArrowUp',
    () => window.nasa.game.scene.getScene('World').debugInfo().focused === 'broken-vent',
  );
  await h.mark();
  await h.press('KeyE');
  await h.waitEvent('gameOver');
  await h.waitReady('Ending', SLOW);
  await h.waitFor(faderClear);
  const death = await h.eval(ending);
  h.log(`broken-vent -> ${JSON.stringify(death)}`);
  if (death.endingId !== 'death-generic') throw new Error('the vent did not show death-generic');
  if (death.choices.items[0] !== 'Retry from checkpoint' || death.choices.selected !== 0) {
    throw new Error(`unexpected end screen options ${JSON.stringify(death.choices)}`);
  }
  if ((await h.eval(ui)).hint !== null) throw new Error('the E hint stayed over the end screen');
  await h.shot('flow-death');

  // "Retry from checkpoint" (selected first; Enter chooses it) -> the saved corridor.
  await h.press('Enter');
  await h.waitReady('World', SLOW);
  await h.waitFor(faderClear);
  const retried = { world: await h.eval(world), current: await h.eval(current) };
  h.log(`retry -> ${JSON.stringify(retried)}`);
  if (retried.world.locationId !== 'demo-corridor' || retried.current?.actId !== 'prologue') {
    throw new Error('retry did not return to the prologue checkpoint');
  }
  if (await h.eval(() => window.nasa.game.scene.isActive('Ending'))) {
    throw new Error('the end screen still runs after retry');
  }

  // --- door-ship starts act 2 on the ship deck with its checkpoint (and the simulation).
  await h.goto('/?location=demo-room');
  await h.waitReady('World');
  await h.waitFor(faderClear);
  // Just below the door (feet y 240, the door spans y 150..210), then walk up into it.
  await h.teleport(612, 240);
  await h.mark();
  await h.holdUntil('ArrowUp', () => window.nasa.services.state.current?.actId === 'act2', 5000);
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().title === 'Act 2');
  await h.waitReady('World', SLOW);
  await h.waitEvent('checkpointSaved', SLOW);
  const act2Save = await h.eval(savedGame);
  h.log(`door-ship -> save ${JSON.stringify(act2Save)}`);
  if (
    act2Save?.actId !== 'act2' ||
    act2Save.locationId !== 'ship-deck' ||
    typeof act2Save.simulation?.timeS !== 'number'
  ) {
    throw new Error('door-ship did not start act 2 on the ship deck with the simulation');
  }

  // --- Pause: Esc in the corridor; the world is paused under the panel.
  await h.goto('/?location=demo-corridor');
  await h.waitReady('World');
  await h.waitFor(faderClear);
  await h.press('Escape');
  await h.waitReady('Pause');
  const paused = await h.eval(() => window.nasa.game.scene.isPaused('World'));
  if (!paused) throw new Error('the world is not paused under the pause menu');
  const pause = await h.eval(() => window.nasa.game.scene.getScene('Pause').debugInfo());
  h.log(`pause -> ${JSON.stringify(pause)}`);
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
  // The act 2 save holds the simulation: Continue restores it, from the saved time on.
  const restored = await h.eval(() => ({
    running: window.nasa.services.simulation.isRunning,
    timeS: window.nasa.services.simulation.snapshot()?.timeS,
  }));
  h.log(
    `continue -> simulation ${JSON.stringify(restored)}, saved at ${act2Save.simulation.timeS}`,
  );
  if (!restored.running || !(restored.timeS >= act2Save.simulation.timeS)) {
    throw new Error('continueGame did not restore the saved simulation');
  }
}
