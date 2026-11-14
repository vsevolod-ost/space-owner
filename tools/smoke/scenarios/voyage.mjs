import { answerAlarm, openNavigation } from '../alarm.mjs';
import { VOYAGE_SEED } from '../voyage-seed.mjs';

/**
 * Smoke scenario: the whole game end to end (plan S13). New Game from the menu (with the smoke
 * seed) -> the prologue at home -> walk out of the door: act 1 in the warehouse, the arrival
 * cutscene -> take `fuel`, `oxygen`, `supplies` and `solar` at their stands -> the hatch, "Board" -> act 2
 * on the deck -> the navigation panel, time running while it is open (with the debug warp; every event's alarm closes the
 * panel and is answered with its first choice at its deck station, then back to the panel,
 * tools/smoke/alarm.mjs) -> the Moon's gate card: "Go on" -> Mars's gate card: "Stop here" -> LANDED,
 * the title "Mars · day N" -> act 3 in the colony on Mars, its checkpoint without the `voyage`
 * mark -> the overlook -> the end screen of Mars. Seed 1 with these four crates reaches Mars
 * on day 202.4 (`npm run voyage-check`, tools/smoke/voyage-seed.mjs).
 * Screenshots: voyage-1-home .. voyage-10-ending (voyage-7-event: the first event's card at its station).
 * Run: node tools/smoke.mjs --scenario tools/smoke/scenarios/voyage.mjs --timeout 600000
 *
 * @param {import('playwright-core').Page} page
 * @param {any} h helpers, see tools/smoke.mjs
 */
export default async function voyage(page, h) {
  const world = () => window.nasa.game.scene.getScene('World').debugInfo();
  const ui = () => window.nasa.game.scene.getScene('Ui').debugInfo();
  const navigation = () =>
    window.nasa.game.scene.isActive('Navigation')
      ? window.nasa.game.scene.getScene('Navigation').debugInfo()
      : null;
  const faderClear = () => window.nasa.game.scene.getScene('Ui').debugInfo().fader === 0;
  const settled = () => !window.nasa.services.flow.isTransitioning;
  const savedGame = () => JSON.parse(localStorage.getItem('space-owner.save') ?? 'null');
  const SLOW = 10000;
  /** Simulated time per real second on top of the time scale while flying. */
  const WARP = 20;
  const wait = (ms) => page.waitForTimeout(ms);
  /** `h.waitFor` with an argument for `fn` (page-side functions see no closure). */
  const waitArg = (fn, arg, timeout = 5000) => page.waitForFunction(fn, arg, { timeout });
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

  /** Presses Enter until the open dialogue `id` shows its choices; returns the dialogue info. */
  async function choicesOf(id) {
    await waitArg((d) => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue?.id === d, id);
    for (let i = 0; i < 10; i++) {
      const info = (await h.eval(ui)).dialogue;
      if (info?.choices) return info;
      await h.press('Enter');
      await wait(150);
    }
    throw new Error(`no choices in dialogue ${id}`);
  }

  /** Picks the choice `label` of the open dialogue and waits until the dialogue has closed. */
  async function choose(info, label) {
    const index = info.choices.items.indexOf(label);
    if (index < 0) throw new Error(`no "${label}" in ${JSON.stringify(info.choices.items)}`);
    for (let i = 0; i < index; i++) await h.press('ArrowDown');
    await waitArg(
      (n) => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue?.choices?.selected === n,
      index,
    );
    await h.press('Enter');
    await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue === null);
  }

  /** Stands the hero at (x, y), waits until `name` has the focus and presses E. */
  async function use(name, x, y) {
    await h.teleport(x, y);
    await waitArg((n) => window.nasa.game.scene.getScene('World').debugInfo().focused === n, name);
    await h.press('KeyE');
  }

  // --- New Game from the menu: the prologue at home, its checkpoint.
  await h.goto('/');
  await h.waitReady('MainMenu');
  await h.eval(() => window.nasa.services.save.clear());
  await h.goto(`/?seed=${VOYAGE_SEED}`);
  await h.waitReady('MainMenu');
  const menu = await h.eval(() => window.nasa.game.scene.getScene('MainMenu').debugInfo());
  const newGame = menu.buttons.find((button) => button.label === 'New Game');
  await h.mark();
  await h.click(newGame.x, newGame.y);
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().title === 'Prologue');
  await h.waitReady('World', SLOW);
  await h.waitEvent('checkpointSaved', SLOW);
  await h.waitFor(faderClear, SLOW);
  const home = await h.eval(world);
  h.log(`prologue: ${home.locationId} at ${JSON.stringify(home.player)}`);
  if (home.locationId !== 'home') throw new Error('New Game did not open home');
  await h.shot('voyage-1-home');

  // --- Out of the door: act 1 in the warehouse; walking on plays the arrival cutscene.
  await h.mark();
  await h.holdUntil(
    'ArrowRight',
    () => window.nasa.game.scene.getScene('World').debugInfo().locationId === 'warehouse',
    20000,
  );
  await h.waitReady('World', SLOW);
  await h.waitEvent('checkpointSaved', SLOW);
  await h.waitFor(settled, SLOW);
  await h.waitFor(faderClear, SLOW);
  if ((await h.eval(() => window.nasa.services.state.current?.actId)) !== 'act1') {
    throw new Error('the door did not start act 1');
  }
  await h.holdUntil('ArrowRight', () => window.nasa.services.cutscenes.isPlaying, 10000);
  const arrival = [];
  for (let i = 0; i < 400; i++) {
    if (!(await h.eval(() => window.nasa.services.cutscenes.isPlaying))) break;
    const line = (await h.eval(ui)).dialogue;
    if (line && !line.typing) {
      arrival.push(`${line.speaker}: ${line.text}`);
      await h.press('Enter');
      await waitArg(
        (prev) => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue?.text !== prev,
        line.text,
      );
    }
    await wait(100);
  }
  await h.waitFor(() => !window.nasa.services.cutscenes.isPlaying, SLOW);
  await h.waitFor(faderClear, SLOW);
  h.log(`arrival: ${JSON.stringify(arrival)}`);
  if (arrival.length !== 2) throw new Error('the arrival cutscene should speak two lines');
  await h.shot('voyage-2-warehouse');

  // --- Take fuel, oxygen, supplies and solar at their stands (above a top-row crate, below a bottom-row
  // one).
  const crates = [
    ['crate-fuel-1', 224, 222],
    ['crate-oxygen', 256, 312],
    ['crate-supplies', 352, 222],
    ['crate-solar', 352, 312],
  ];
  for (const [name, x, y] of crates) {
    await use(name, x, y);
    await choose(await choicesOf('cargo-stand'), 'Take it');
    await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().toast === null, 5000);
  }
  await h.waitFor(() => !window.nasa.game.scene.getScene('World').debugInfo().rebuildPending);
  const loaded = await h.eval(() => ({
    hold: window.nasa.game.scene.getScene('World').debugInfo().hold,
    flags: Object.fromEntries(
      Object.entries(window.nasa.services.state.flags.toRecord()).filter(([key]) =>
        key.startsWith('cargo.'),
      ),
    ),
  }));
  h.log(`loaded: ${JSON.stringify(loaded)}`);
  if (
    loaded.flags['cargo.fuel'] !== 1 ||
    loaded.flags['cargo.oxygen'] !== 1 ||
    loaded.flags['cargo.supplies'] !== 1 ||
    loaded.flags['cargo.solar'] !== 1 ||
    loaded.hold?.text !== 'HOLD 4/7'
  ) {
    throw new Error(`unexpected cargo after the stands: ${JSON.stringify(loaded)}`);
  }
  await h.shot('voyage-3-loaded');

  // --- The hatch: "Board" starts act 2 on the deck with the smoke seed and the four crates.
  await use('hatch', 596, 184);
  const check = await choicesOf('hatch');
  h.log(`hatch: ${JSON.stringify(check.text)}`);
  await h.shot('voyage-4-hatch');
  await h.mark();
  await choose(check, 'Board');
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().title === 'Act 2', SLOW);
  await h.waitReady('World', SLOW);
  await h.waitEvent('checkpointSaved', SLOW);
  await h.waitFor(settled, SLOW);
  await h.waitFor(faderClear, SLOW);
  const boarded = await h.eval(() => ({
    location: window.nasa.game.scene.getScene('World').debugInfo().locationId,
    seed: window.nasa.services.simulation.voyage?.seed,
    cargo: window.nasa.services.simulation.voyage?.simulation.snapshot().cargo,
    save: JSON.parse(localStorage.getItem('space-owner.save') ?? 'null'),
  }));
  h.log(
    `boarded: ${boarded.location}, seed ${boarded.seed}, cargo ${JSON.stringify(boarded.cargo)}, ` +
      `save ${boarded.save?.actId} voyage ${boarded.save?.voyage}`,
  );
  if (boarded.location !== 'ship-deck' || boarded.seed !== VOYAGE_SEED) {
    throw new Error('the hatch did not start the voyage with the smoke seed');
  }
  if (boarded.save?.actId !== 'act2' || boarded.save.voyage !== true) {
    throw new Error('the act 2 checkpoint should carry the voyage mark');
  }
  await h.shot('voyage-5-deck');

  // --- The navigation panel: time runs while it is open (with the warp); Go on at the Moon,
  // Stop at Mars, the first choice on every event card.
  await h.holdUntil(
    'ArrowRight',
    () => window.nasa.game.scene.getScene('World').debugInfo().focused === 'station-navigation',
    20000,
  );
  await h.press('KeyE');
  await h.waitReady('Navigation');
  await frames(3);
  await h.eval((warp) => window.nasa.services.simulation.setDebugWarp(warp), WARP);
  await h.mark();
  const ended = () => window.__nasaEvents.some((e) => e.name === 'voyageEnded');
  const startedAt = Date.now();
  const answered = [];
  let shotRun = false;
  let shotEvent = false;
  while (!(await h.eval(ended))) {
    if (Date.now() - startedAt > 480000) throw new Error('the voyage did not end in 8 minutes');
    // An event: the panel flashes its alarm and closes; the first choice at its deck station
    // (tools/smoke/alarm.mjs), then back to the panel.
    if (await h.eval(() => window.nasa.services.stationAlarm.alarm !== null)) {
      const day = await h.eval(() => Math.floor(window.nasa.services.simulation.voyage.day) + 1);
      const shot = shotEvent ? null : 'voyage-7-event';
      shotEvent = true;
      const answer = await answerAlarm(h, { shot });
      answered.push(
        `event ${answer.eventId}: ${answer.choiceId} at ${answer.station} (day ${day})`,
      );
      h.log(`event ${answer.eventId}: ${answer.choiceId} at ${answer.station} (day ${day})`);
      continue;
    }
    const info = await h.eval(navigation);
    if (!info) {
      await openNavigation(h);
      continue;
    }
    if (info.status === 'LOST' || info.status === 'DRIFTING') {
      throw new Error(`the voyage failed: ${info.status} on day ${info.day}`);
    }
    const { card } = info;
    // A gate card takes input once unlocked and its rows are enabled (Stop waits for the
    // forecast).
    const ready = card && !card.locked && !card.disabled[0] && !card.disabled[1];
    if (ready) {
      let pick = 0;
      if (info.gateIndex === 0) {
        await h.shot('voyage-7-moon-gate');
      } else if (info.gateIndex === 1) {
        pick = card.choices.findIndex((choice) => choice.startsWith('Stop here'));
        if (pick < 0) throw new Error(`no Stop on Mars's card: ${JSON.stringify(card)}`);
        await h.shot('voyage-8-mars-gate');
      } else {
        throw new Error(`passed Mars: a gate card at gate ${info.gateIndex}`);
      }
      answered.push(`${card.kind} ${info.gateIndex}: ${card.choices[pick]} (day ${info.day})`);
      h.log(`card ${card.kind} at gate ${info.gateIndex}: ${card.choices[pick]} (day ${info.day})`);
      for (let i = card.selected; i < pick; i++) await h.press('ArrowDown');
      await waitArg(
        (n) => window.nasa.game.scene.getScene('Navigation').debugInfo().card?.selected === n,
        pick,
      );
      await h.press('Enter');
      if (info.gateIndex === 1) {
        await h.waitFor(() => window.__nasaEvents.some((e) => e.name === 'voyageEnded'), 5000);
        break;
      }
      await h.waitFor(
        () => window.nasa.game.scene.getScene('Navigation').debugInfo()?.card === null,
        5000,
      );
    } else if (!card && info.run && !shotRun && info.legIndex === 0) {
      shotRun = true;
      await h.shot('voyage-6-run');
    }
    await wait(250);
  }
  await h.eval(() => window.nasa.services.simulation.setDebugWarp(1));
  const landed = await h.eval(() => ({
    status: window.nasa.game.scene.getScene('Navigation').debugInfo().status,
    stopBody: window.nasa.services.state.flags.get('voyage.stopBody'),
    day: window.nasa.services.state.flags.get('voyage.day'),
  }));
  h.log(`landed after ${Math.round((Date.now() - startedAt) / 1000)} s: ${JSON.stringify(landed)}`);
  h.log(`answered: ${JSON.stringify(answered)}`);
  if (landed.status !== 'LANDED' || landed.stopBody !== 'mars') {
    throw new Error(`Stop did not land on Mars: ${JSON.stringify(landed)}`);
  }
  if (!answered.some((a) => a.startsWith('gate 0: Go on'))) {
    throw new Error(`no Go on at the Moon: ${JSON.stringify(answered)}`);
  }

  // --- Act 3: the title "Mars · day N", the colony on Mars, a checkpoint without the voyage.
  await h.mark();
  await waitArg(
    (t) => window.nasa.game.scene.getScene('Ui').debugInfo().title === t,
    `Mars · day ${landed.day + 1}`,
    SLOW,
  );
  await h.waitEvent('checkpointSaved', SLOW);
  await h.waitFor(settled, SLOW);
  await h.waitFor(faderClear, SLOW);
  const colony = await h.eval(() => ({
    world: window.nasa.game.scene.getScene('World').debugInfo(),
    current: window.nasa.services.state.current,
    navigation: window.nasa.game.scene.isActive('Navigation'),
    under: window.nasa.services.simulation.isUnderWay,
    // Mars's sky as the colony table has it (an artist may change the colour).
    marsSky: window.nasa.services.voyage.colony.bodies.mars.sky,
  }));
  const save = await h.eval(savedGame);
  h.log(
    `act 3: ${colony.world.locationId}, act ${colony.current?.actId}, sky ` +
      `${colony.world.props.background['location-colony-sky']}, save ` +
      `${JSON.stringify({ ...save, flags: undefined })}`,
  );
  if (
    colony.world.locationId !== 'colony' ||
    colony.current?.actId !== 'act3' ||
    colony.navigation ||
    colony.under ||
    colony.world.props.background['location-colony-sky'] !== colony.marsSky
  ) {
    throw new Error(`Stop did not open the colony on Mars: ${JSON.stringify(colony)}`);
  }
  if (save?.actId !== 'act3' || save.locationId !== 'colony' || 'voyage' in save) {
    throw new Error(`the save after Stop is not a colony one without a voyage mark`);
  }
  await h.shot('voyage-9-colony');

  // --- The overlook: its line, then the end screen of Mars.
  await use('overlook', 560, 180);
  await h.waitFor(
    () => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue?.typing === false,
    SLOW,
  );
  h.log(`overlook: ${JSON.stringify((await h.eval(ui)).dialogue?.text)}`);
  await h.press('Enter');
  await h.waitReady('Ending', SLOW);
  await h.waitFor(faderClear, SLOW);
  const end = await h.eval(() => window.nasa.game.scene.getScene('Ending').debugInfo());
  h.log(`ending: ${JSON.stringify(end)}`);
  if (
    end.endingId !== 'colony-mars' ||
    !end.tier ||
    JSON.stringify(end.choices.items) !== '["Fly again","Main menu"]'
  ) {
    throw new Error(`unexpected end screen ${JSON.stringify(end)}`);
  }
  await h.shot('voyage-10-ending');
}
