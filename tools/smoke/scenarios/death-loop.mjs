import { answerAlarm, openNavigation } from '../alarm.mjs';
import { VOYAGE_SEED } from '../voyage-seed.mjs';

/**
 * Smoke scenario: the death loop (plan S10, D18; GDD D7). From the warehouse's hatch with
 * `fuel:1,supplies:1,reactor:1` (no oxygen crate, no greenhouse) and the smoke seed, the voyage
 * is flown on the navigation panel with the debug warp (time runs while it is open): Go on at
 * the Moon, every event's alarm answered with its first choice at its deck station
 * (tools/smoke/alarm.mjs), back to the panel - until the crew dies of hypoxia between the Moon
 * and Mars.
 * No end screen: the hero stands before the scientists' booth in the warehouse (act 1, a
 * checkpoint there without a voyage), `run.lastCause` is `hypoxia`, `run.attempt` 2, the
 * scientists stand at `post-1` and `post-2` and speak three lines; then the hero is at the
 * hatch with the cargo still aboard. Boarding again starts a voyage; "Return to warehouse" in
 * the pause menu (only during a voyage) runs the debrief with cause `abort`.
 * Screenshots: death-loop-debrief-1..3, death-loop-hatch, death-loop-pause, death-loop-abort.
 * Run: node tools/smoke.mjs --scenario tools/smoke/scenarios/death-loop.mjs --timeout 600000
 *
 * @param {import('playwright-core').Page} page
 * @param {any} h helpers, see tools/smoke.mjs
 */
export default async function deathLoop(page, h) {
  const world = () => window.nasa.game.scene.getScene('World').debugInfo();
  const faderClear = () => window.nasa.game.scene.getScene('Ui').debugInfo().fader === 0;
  const runFlags = () =>
    Object.fromEntries(
      Object.entries(window.nasa.services.state.flags.toRecord()).filter(
        ([key]) => key.startsWith('run.') || key.startsWith('cargo.'),
      ),
    );
  const savedGame = () => JSON.parse(localStorage.getItem('space-owner.save') ?? 'null');
  const SLOW = 10000;
  /** Simulated time per real second on top of the time scale while flying. */
  const WARP = 20;
  const wait = (ms) => page.waitForTimeout(ms);
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

  /** Walks to the hatch's E, opens its check and chooses "Board" (act 2 starts). */
  async function board() {
    await h.teleport(596, 184);
    await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().hint === 'hatch');
    await h.press('KeyE');
    await h.waitFor(
      () => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue?.id === 'hatch',
    );
    for (let i = 0; i < 10; i++) {
      const line = await h.eval(() => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue);
      if (line?.choices) break;
      // Enter while typing shows the whole line; the choices follow.
      if (line?.typing) await h.press('Enter');
      await wait(150);
    }
    await h.press('ArrowDown'); // "Board", after "Wait"
    await h.waitFor(
      () => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue?.choices?.selected === 1,
    );
    await h.mark();
    await h.press('Enter');
    await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().title === 'Act 2');
    await h.waitReady('World', SLOW);
    await h.waitEvent('checkpointSaved', SLOW);
    await h.waitFor(faderClear, SLOW);
  }

  /**
   * Waits for each line of the running debrief, checks the speaker, takes a shot, closes it;
   * returns the lines. Ends when the cutscene does.
   */
  async function closeDebrief(shots) {
    const lines = [];
    for (let i = 0; i < 400; i++) {
      if (!(await h.eval(() => window.nasa.services.cutscenes.isPlaying))) break;
      const line = await h.eval(() => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue);
      if (line && !line.typing) {
        lines.push(`${line.speaker}: ${line.text}`);
        if (shots) await h.shot(`${shots}-${lines.length}`);
        await h.press('Enter');
        await page.waitForFunction(
          (prev) => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue?.text !== prev,
          line.text,
          { timeout: 5000 },
        );
      }
      await wait(100);
    }
    await h.waitFor(() => !window.nasa.services.cutscenes.isPlaying, SLOW);
    await h.waitFor(faderClear, SLOW);
    return lines;
  }

  // --- The warehouse with the set aboard, by the hatch; board.
  await h.goto('/');
  await h.waitReady('MainMenu');
  await h.eval(() => window.nasa.services.save.clear());
  await h.goto(`/?location=warehouse&spawn=spawn-hatch&seed=${VOYAGE_SEED}`);
  await h.waitReady('World');
  await h.waitFor(faderClear);
  await h.eval(() => {
    const { flags } = window.nasa.services.state;
    flags.set('cargo.fuel', 1);
    flags.set('cargo.supplies', 1);
    flags.set('cargo.reactor', 1);
  });
  await board();
  const started = await h.eval(() => ({
    location: window.nasa.game.scene.getScene('World').debugInfo().locationId,
    seed: window.nasa.services.simulation.voyage?.seed,
  }));
  h.log(`boarded: ${JSON.stringify(started)}`);
  if (started.location !== 'ship-deck' || started.seed !== VOYAGE_SEED) {
    throw new Error(`the hatch did not start the voyage with the smoke seed`);
  }

  // --- The navigation panel; fly with the warp until the voyage is lost.
  await h.holdUntil(
    'ArrowRight',
    () => window.nasa.game.scene.getScene('World').debugInfo().focused === 'station-navigation',
    20000,
  );
  await h.press('KeyE');
  await h.waitReady('Navigation');
  await frames(3);
  await h.eval((warp) => window.nasa.services.simulation.setDebugWarp(warp), WARP);
  // The alarm's timer bar must be gone before any fade (the death loop's): count the frames it
  // is shown while the UI's fader is not clear (plan act2-stations S5); `barFrames`: frames it
  // was shown at all (the events on the way).
  await h.eval(() => {
    const game = window.nasa.game;
    window.__smokeBarOverFade = { frames: 0, sample: null, barFrames: 0 };
    game.events.on('poststep', () => {
      const bar = game.scene.getScene('AlarmBar').debugInfo();
      if (bar.visible) window.__smokeBarOverFade.barFrames += 1;
      const fader = game.scene.getScene('Ui').debugInfo().fader;
      if (fader > 0 && bar.visible) {
        window.__smokeBarOverFade.frames += 1;
        window.__smokeBarOverFade.sample = { fader, bar };
      }
    });
  });
  await h.mark();
  const lostEvents = () => window.__nasaEvents.filter((e) => e.name === 'flightLost').length;
  const startedAt = Date.now();
  const answered = [];
  while (!(await h.eval(lostEvents))) {
    if (Date.now() - startedAt > 480000) throw new Error('the voyage was not lost in 8 minutes');
    const voyageOn = await h.eval(
      () =>
        window.nasa.services.simulation.voyage?.phase !== 'ended' &&
        !window.nasa.services.flow.isTransitioning,
    );
    // An event: its alarm closes the panel; the first choice at its deck station
    // (tools/smoke/alarm.mjs), then back to the panel.
    if (voyageOn && (await h.eval(() => window.nasa.services.stationAlarm.alarm !== null))) {
      const answer = await answerAlarm(h);
      answered.push(`event ${answer.eventId}: ${answer.choiceId} at ${answer.station}`);
      h.log(`event ${answer.eventId}: ${answer.choiceId} at ${answer.station}`);
      continue;
    }
    const info = await h.eval(() =>
      window.nasa.game.scene.isActive('Navigation')
        ? window.nasa.game.scene.getScene('Navigation').debugInfo()
        : null,
    );
    if (!info && voyageOn && (await h.eval(() => window.nasa.game.scene.isActive('World')))) {
      await openNavigation(h);
      continue;
    }
    if (info?.card) {
      const { card } = info;
      // Go on at the gate, once the card takes input and it is enabled.
      if (!card.locked && !card.disabled[card.selected]) {
        answered.push(`${card.kind}: ${card.choices[card.selected]}`);
        h.log(`card ${card.kind}: ${card.choices[card.selected]} (day ${info.day})`);
        await h.press('Enter');
        await h.waitFor(
          () => window.nasa.game.scene.getScene('Navigation').debugInfo()?.card === null,
          5000,
        );
      }
    }
    await wait(250);
  }
  await h.eval(() => window.nasa.services.simulation.setDebugWarp(1));
  const lost = await h.eval(() => {
    const events = window.__nasaEvents;
    return {
      died: events.find((e) => e.name === 'shipDied')?.payload,
      summary: events.find((e) => e.name === 'flightLost')?.payload.summary,
    };
  });
  h.log(`lost after ${Math.round((Date.now() - startedAt) / 1000)} s: ${JSON.stringify(lost)}`);
  h.log(`answered: ${JSON.stringify(answered)}`);

  // --- The debrief: warehouse, act 1, a checkpoint without a voyage, run.* flags; no end
  // screen.
  await h.waitFor(() => window.nasa.services.cutscenes.current === 'debrief', SLOW);
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue !== null, SLOW);
  const debrief = await h.eval(() => {
    const scene = window.nasa.game.scene.getScene('World');
    const at = (name) => {
      const actor = scene.actor(name);
      return actor ? { x: actor.x, y: actor.y } : null;
    };
    return {
      location: scene.debugInfo().locationId,
      player: scene.debugInfo().player,
      engineer: at('npc-engineer'),
      astronomer: at('npc-astronomer'),
      act: window.nasa.services.state.current?.actId,
      ending: window.nasa.game.scene.isActive('Ending'),
      simulation: window.nasa.services.simulation.isStarted,
      holds: window.nasa.services.simulation.heldReasons,
    };
  });
  const flags = await h.eval(runFlags);
  const save = await h.eval(savedGame);
  h.log(`debrief: ${JSON.stringify(debrief)}`);
  h.log(`flags: ${JSON.stringify(flags)}`);
  h.log(`save: ${JSON.stringify({ ...save, flags: undefined })}`);
  const barOverFade = await h.eval(() => window.__smokeBarOverFade);
  h.log(`alarm bar over the fade: ${JSON.stringify(barOverFade)}`);
  if (barOverFade.frames > 0) {
    throw new Error(`the alarm bar drew over the fade: ${JSON.stringify(barOverFade)}`);
  }
  if (flags['run.lastCause'] !== 'hypoxia') {
    throw new Error(`run.lastCause is ${flags['run.lastCause']}, want hypoxia`);
  }
  if (flags['run.attempt'] !== 2 || flags['run.lastGate'] !== 0 || flags['run.bestGate'] !== 0) {
    throw new Error(`unexpected run flags ${JSON.stringify(flags)}`);
  }
  if (debrief.location !== 'warehouse' || debrief.act !== 'act1' || debrief.ending) {
    throw new Error(`the death did not lead to the warehouse debrief: ${JSON.stringify(debrief)}`);
  }
  if (debrief.simulation || JSON.stringify(debrief.holds) !== '["panel"]') {
    throw new Error(`the voyage outlived the death: ${JSON.stringify(debrief)}`);
  }
  const near = (p, x, y) => p && Math.abs(p.x - x) <= 2 && Math.abs(p.y - y) <= 2;
  if (
    !near(debrief.player, 96, 136) ||
    !near(debrief.engineer, 56, 96) ||
    !near(debrief.astronomer, 136, 96)
  ) {
    throw new Error(`the debrief is not at the booth: ${JSON.stringify(debrief)}`);
  }
  if (
    save?.actId !== 'act1' ||
    save.locationId !== 'warehouse' ||
    save.spawn !== 'debrief' ||
    save.voyage !== undefined ||
    save.flags['run.lastCause'] !== 'hypoxia'
  ) {
    throw new Error(`unexpected checkpoint after the death: ${JSON.stringify(save)}`);
  }
  const lines = await closeDebrief('death-loop-debrief');
  h.log(`lines: ${JSON.stringify(lines)}`);
  if (lines.length !== 3 || !/air ran out/.test(lines[0]) || /\{/.test(lines.join(' '))) {
    throw new Error(`unexpected debrief lines ${JSON.stringify(lines)}`);
  }

  // --- After it: the hero at the hatch, the cargo still aboard (flags, HOLD strip).
  const back = await h.eval(world);
  const cargo = await h.eval(runFlags);
  h.log(
    `after the debrief: player ${JSON.stringify(back.player)}, hold ${JSON.stringify(back.hold)}`,
  );
  if (!near(back.player, 588, 184)) throw new Error('the hero is not at the hatch');
  const homes = await h.eval(() => {
    const scene = window.nasa.game.scene.getScene('World');
    return ['npc-engineer', 'npc-astronomer'].map((id) => ({
      id,
      at: { x: scene.actor(id)?.x, y: scene.actor(id)?.y },
      home: scene.npcHomeOf(id),
    }));
  });
  h.log(`scientists after the debrief: ${JSON.stringify(homes)}`);
  if (!homes.every((n) => n.home && near(n.at, n.home.x, n.home.y))) {
    throw new Error(`the scientists are not back at their map points: ${JSON.stringify(homes)}`);
  }
  if (cargo['cargo.fuel'] !== 1 || cargo['cargo.supplies'] !== 1 || cargo['cargo.reactor'] !== 1) {
    throw new Error(`the cargo did not survive the death: ${JSON.stringify(cargo)}`);
  }
  if (!/3\/7/.test(back.hold?.text ?? '')) throw new Error('the HOLD strip lost the cargo');
  await h.shot('death-loop-hatch');

  // --- Board again; "Return to warehouse" from the pause menu: the debrief with `abort`.
  await board();
  await h.press('Escape');
  await h.waitReady('Pause');
  await frames(3);
  const pause = await h.eval(() => window.nasa.game.scene.getScene('Pause').debugInfo());
  h.log(`pause in act 2: ${JSON.stringify(pause)}`);
  const index = pause.choices.items.indexOf('Return to warehouse');
  if (index < 0) throw new Error('no "Return to warehouse" in the pause menu during a voyage');
  await h.shot('death-loop-pause');
  const center = await h.eval(
    (i) => window.nasa.game.scene.getScene('Pause').debugChoiceCenter(i),
    index,
  );
  await h.mark();
  await h.click(center.x, center.y);
  await h.waitEvent('flightLost', SLOW);
  await h.waitFor(() => window.nasa.services.cutscenes.current === 'debrief', SLOW);
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue !== null, SLOW);
  const aborted = await h.eval(runFlags);
  h.log(`abort flags: ${JSON.stringify(aborted)}`);
  if (aborted['run.lastCause'] !== 'abort' || aborted['run.attempt'] !== 3) {
    throw new Error(`unexpected flags after "Return to warehouse": ${JSON.stringify(aborted)}`);
  }
  if (aborted['run.bestGate'] !== 0 || aborted['run.lastGate'] !== -1) {
    throw new Error(`unexpected gates after "Return to warehouse": ${JSON.stringify(aborted)}`);
  }
  if (await h.eval(() => window.nasa.game.scene.isActive('Pause'))) {
    throw new Error('the pause menu stayed open over the debrief');
  }
  const abortLines = await closeDebrief('death-loop-abort');
  h.log(`abort lines: ${JSON.stringify(abortLines)}`);
  if (abortLines.length !== 3 || !/turned back/.test(abortLines[0])) {
    throw new Error(`unexpected abort lines ${JSON.stringify(abortLines)}`);
  }
  if (!near((await h.eval(world)).player, 588, 184))
    throw new Error('not at the hatch after abort');
}
