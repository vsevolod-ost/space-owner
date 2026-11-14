import { answerAlarm, openNavigation, standAt, standOf } from '../alarm.mjs';

/**
 * Smoke scenario: act 2's events answered at deck stations against the clock (plan
 * act2-stations S8). Seed `SEED` with the crates `fuel`, `oxygen`, `supplies` and `reactor`
 * gives four alarms on the Moon -> Mars leg, one at each kind of station (`npm run
 * voyage-check -- --seed 71 --loadout fuel:1,oxygen:1,supplies:1,reactor:1 --choice 1`):
 * - hull breach (day 84, the airlock): the navigation panel flashes the alarm and closes by
 *   itself; the deck shows the timer bar and the blinking marker over the airlock; the radio
 *   (a wrong station) says in a toast where to go; E at the airlock opens the card, Esc closes
 *   it and the timer runs on; in the last third the bar turns red; with the debug overlay (F3)
 *   on, the bar stays on top just below it; the timer runs out: `timeoutChoice` `patch` is
 *   applied with its bad outcome (`event.hull-breach.hit`, 48 days of oxygen) although this
 *   seed's own roll for it (0.911 against a risk of 0.5) would have been fine;
 * - lost signal (day 115, the radio): answered there with its first choice;
 * - asteroid belt (day 136, the porthole): answered there with "fly" (its roll 0.955: fine);
 * - reactor fault (day 177, the hold's access point over the reactor's bay): answered with
 *   "restart", whose roll on this seed (0.240 against a risk of 0.3) melts it down: the crew
 *   dies at the station, the card closes and the navigation panel opens on LOST with the
 *   world paused under it (D9), then the death loop's debrief.
 * Screenshots: stations-1-alarm-flash .. stations-10-lost.
 * Run: node tools/smoke.mjs --scenario tools/smoke/scenarios/stations.mjs --timeout 300000
 *
 * @param {import('playwright-core').Page} _page
 * @param {any} h helpers, see tools/smoke.mjs
 */
export default async function stations(_page, h) {
  /** Seed with all four kinds of station on one voyage and a reactor that melts on restart. */
  const SEED = 71;
  const SLOW = 10000;
  /** Timer of the hull breach's alarm, ms: room for the looks before its last third. */
  const LONG_TIMER_MS = 30000;
  const faderClear = () => window.nasa.game.scene.getScene('Ui').debugInfo().fader === 0;
  const alarmBar = () => window.nasa.game.scene.getScene('AlarmBar').debugInfo();
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

  // --- Act 2 on the deck with the seed and the four crates.
  await h.goto('/');
  await h.waitReady('MainMenu');
  await h.eval(() => window.nasa.services.save.clear());
  await h.goto(`/?act=act2&seed=${SEED}`);
  await h.waitReady('World', SLOW);
  await h.waitEvent('checkpointSaved', SLOW);
  await h.waitFor(faderClear, SLOW);
  await h.mark();
  await h.eval(() => {
    const { flags } = window.nasa.services.state;
    for (const id of ['fuel', 'oxygen', 'supplies', 'reactor']) flags.set(`cargo.${id}`, 1);
    void window.nasa.services.flow.startAct('act2');
  });
  await h.waitReady('World', SLOW);
  await h.waitEvent('checkpointSaved', SLOW);
  await h.waitFor(faderClear, SLOW);
  const start = await h.eval(() => ({
    seed: window.nasa.services.simulation.voyage?.seed,
    hold: window.nasa.services.voyage.hold(),
  }));
  h.log(`voyage: ${JSON.stringify(start)}`);
  if (start.seed !== SEED || !start.hold.includes('reactor')) {
    throw new Error(`the voyage did not start with seed ${SEED} and a reactor`);
  }

  // --- The panel: time runs while it is open; with the warp to the Moon, Go on, and the ship
  // flies on at once. The hull breach's alarm gets the long timer (set before Go on: with the
  // warp the alarm comes a second or so later); the panel's own clock stops the moment it comes
  // on, so its flash can be looked at (the clock runs again after the shot and the panel closes
  // by itself).
  await openNavigation(h);
  await frames(3);
  await h.eval(() => window.nasa.services.simulation.setDebugWarp(20));
  await h.waitEvent('gateReached', 60000);
  await h.waitFor(() => {
    const card = window.nasa.game.scene.getScene('Navigation').debugInfo().card;
    return card?.kind === 'gate' && card.locked === false && card.disabled[0] === false;
  }, 30000);
  await h.eval((ms) => {
    window.nasa.services.stationAlarm.setDebugTimer(ms);
    const off = window.nasa.services.events.on('stationAlarm', ({ active }) => {
      if (!active) return;
      window.nasa.game.scene.getScene('Navigation').time.paused = true;
      off();
    });
  }, LONG_TIMER_MS);
  await h.mark();
  await h.press('Enter');
  await h.waitFor(() => window.nasa.services.simulation.voyage?.phase !== 'atGate', 3000);
  await h.waitEvent('voyageEvent', 60000);
  await h.eval(() => window.nasa.services.simulation.setDebugWarp(1));
  await frames(2);

  // --- 1. The alarm flash on the panel: the event and where to go, no card, about to close.
  const flash = await h.eval(() => ({
    nav: window.nasa.game.scene.getScene('Navigation').debugInfo(),
    alarm: window.nasa.services.stationAlarm.alarm,
    flag: window.nasa.services.state.flags.get('event.hull-breach'),
  }));
  h.log(
    `flash: ${JSON.stringify({ alarm: flash.alarm, notice: flash.nav.alarm, flag: flash.flag })}`,
  );
  if (
    flash.alarm?.eventId !== 'hull-breach' ||
    flash.alarm.station !== 'airlock' ||
    flash.flag !== 'open' ||
    flash.nav.card !== null ||
    flash.nav.alarm?.closing !== true ||
    flash.nav.alarm.lines[2] !== 'Go to: AIRLOCK'
  ) {
    throw new Error(`no alarm flash for the hull breach: ${JSON.stringify(flash)}`);
  }
  await h.shot('stations-1-alarm-flash');
  // The panel closes by itself (no key pressed).
  await h.eval(() => {
    window.nasa.game.scene.getScene('Navigation').time.paused = false;
  });
  await h.waitFor(() => !window.nasa.game.scene.isActive('Navigation'), 3000);
  h.log('the panel closed by itself');

  // --- 2. The deck: the bar (top right) and the marker over the airlock, caught in its "on"
  // phase: the game loop sleeps for the shot, so the frame shot is the one checked.
  const bar = await h.eval(alarmBar);
  h.log(`bar on the deck: ${JSON.stringify(bar)}`);
  if (
    !bar.visible ||
    !bar.onTop ||
    bar.lines.join('|') !== 'HULL BREACH|AIRLOCK' ||
    bar.color !== 'fill' ||
    !(bar.seconds > LONG_TIMER_MS / 3000)
  ) {
    throw new Error(`the bar on the deck: ${JSON.stringify(bar)}`);
  }
  await standAt(h, 'station-navigation');
  await shotWithMarker('stations-2-deck-bar-marker', 'airlock');

  // --- 3. A wrong station (the radio): a toast with where to go, no card.
  await standAt(h, 'radio');
  await h.press('KeyE');
  await h.waitFor(
    () => /airlock/i.test(window.nasa.game.scene.getScene('Ui').debugInfo().toast ?? ''),
    3000,
  );
  const wrong = await h.eval(() => ({
    toast: window.nasa.game.scene.getScene('Ui').debugInfo().toast,
    card: window.nasa.game.scene.isActive('EventStation'),
  }));
  h.log(`wrong station: ${JSON.stringify(wrong)}`);
  if (wrong.card) throw new Error('the radio opened the hull breach card');
  await h.shot('stations-3-wrong-station');

  // --- 4. The card at the airlock; Esc closes it and the timer runs on (D4).
  await standAt(h, 'airlock');
  await h.press('KeyE');
  await h.waitFor(
    () =>
      window.nasa.game.scene.isActive('EventStation') &&
      window.nasa.game.scene.getScene('EventStation').debugInfo().card?.locked === false,
    3000,
  );
  const airlockCard = await h.eval(() =>
    window.nasa.game.scene.getScene('EventStation').debugInfo(),
  );
  h.log(`card at the airlock: ${JSON.stringify(airlockCard)}`);
  if (airlockCard.eventId !== 'hull-breach') {
    throw new Error(`the airlock card is not the hull breach: ${JSON.stringify(airlockCard)}`);
  }
  await h.shot('stations-4-card-airlock');
  const beforeEsc = await h.eval(() => window.nasa.services.stationAlarm.alarm.remainingMs);
  await h.press('Escape');
  await h.waitFor(() => !window.nasa.game.scene.isActive('EventStation'), 3000);
  await frames(5);
  const afterEsc = await h.eval(() => ({
    alarm: window.nasa.services.stationAlarm.alarm,
    phase: window.nasa.services.simulation.voyage.phase,
  }));
  h.log(`after Esc: ${beforeEsc} -> ${JSON.stringify(afterEsc)}`);
  if (
    afterEsc.phase !== 'event' ||
    afterEsc.alarm?.eventId !== 'hull-breach' ||
    !(afterEsc.alarm.remainingMs < beforeEsc)
  ) {
    throw new Error(`Esc on the card did not leave the alarm running: ${JSON.stringify(afterEsc)}`);
  }

  // --- 5. The last third: the bar turns red. The timer is held (as the pause menu does) for
  // the two shots.
  await h.waitFor(() => window.nasa.services.stationAlarm.alarm.remainingMs < 9000, 30000);
  await h.eval(() => window.nasa.services.simulation.hold('pause'));
  await frames(2);
  const red = await h.eval(alarmBar);
  h.log(`bar in the last third: ${JSON.stringify(red)}`);
  if (!red.visible || red.color !== 'alarm' || !(red.fill <= 1 / 3) || !red.onTop) {
    throw new Error(`the bar is not red in the last third: ${JSON.stringify(red)}`);
  }
  await h.shot('stations-5-red-bar');

  // --- 6. With the debug overlay on (F3) the bar is still drawn, just below it.
  await h.press('F3');
  await h.waitFor(() => window.nasa.game.scene.getScene('Debug').shown === true, 3000);
  await frames(3);
  const underDebug = await h.eval(() => {
    const scenes = window.nasa.game.scene.scenes.map((scene) => scene.sys.settings.key);
    return { bar: window.nasa.game.scene.getScene('AlarmBar').debugInfo(), top: scenes.slice(-2) };
  });
  h.log(`bar under Debug: ${JSON.stringify(underDebug)}`);
  if (
    !underDebug.bar.visible ||
    !underDebug.bar.onTop ||
    underDebug.top.join() !== 'AlarmBar,Debug'
  ) {
    throw new Error(`the bar is not just below the debug overlay: ${JSON.stringify(underDebug)}`);
  }
  await h.shot('stations-6-bar-under-debug');
  await h.press('F3');
  await h.waitFor(() => window.nasa.game.scene.getScene('Debug').shown === false, 3000);
  await h.eval(() => window.nasa.services.simulation.release('pause'));

  // --- 7. The timer runs out: "patch" with its sure tear (D3), "Too late!" on the deck.
  const oxygenBefore = await h.eval(
    () => window.nasa.services.simulation.snapshot().resources.oxygen.value,
  );
  await h.mark();
  await h.eval(() => window.nasa.services.stationAlarm.setDebugTimer(800));
  await h.waitEvent('stationAlarmTimedOut', 5000);
  await h.waitFor(() => window.nasa.services.stationAlarm.alarm === null, 3000);
  await h.waitFor(
    () => /^Too late!/.test(window.nasa.game.scene.getScene('Ui').debugInfo().toast ?? ''),
    3000,
  );
  const timedOut = await h.eval(() => {
    const { simulation, state, stationAlarm } = window.nasa.services;
    return {
      flag: state.flags.get('event.hull-breach'),
      hit: state.flags.get('event.hull-breach.hit'),
      lastTimeout: stationAlarm.debugInfo().lastTimeout,
      oxygen: simulation.snapshot().resources.oxygen.value,
      phase: simulation.voyage.phase,
      toast: window.nasa.game.scene.getScene('Ui').debugInfo().toast,
      bar: window.nasa.game.scene.getScene('AlarmBar').debugInfo(),
    };
  });
  h.log(`timed out: ${JSON.stringify({ ...timedOut, oxygenBefore })}`);
  if (
    timedOut.flag !== 'patch' ||
    timedOut.hit !== true ||
    timedOut.lastTimeout?.choiceId !== 'patch' ||
    !(oxygenBefore - timedOut.oxygen >= 47.9) ||
    timedOut.bar.visible ||
    timedOut.bar.color !== 'fill'
  ) {
    throw new Error(`the timeout did not apply patch with its tear: ${JSON.stringify(timedOut)}`);
  }
  await h.eval(() => window.nasa.services.stationAlarm.setDebugTimer(60000));

  // --- 7-8. Lost signal at the radio, the asteroid belt at the porthole: answered there.
  const answered = [];
  const expected = [
    { eventId: 'lost-signal', station: 'radio', choice: 0, shot: 'stations-7-card-radio' },
    { eventId: 'asteroid-belt', station: 'porthole', choice: 1, shot: 'stations-8-card-porthole' },
  ];
  for (const next of expected) {
    await flyToAlarm();
    const alarm = await h.eval(() => window.nasa.services.stationAlarm.alarm);
    if (alarm.eventId !== next.eventId || alarm.station !== next.station) {
      throw new Error(`expected ${next.eventId} at ${next.station}, got ${JSON.stringify(alarm)}`);
    }
    const answer = await answerAlarm(h, { choice: next.choice, shot: next.shot });
    const flag = await h.eval(
      (id) => window.nasa.services.state.flags.get(`event.${id}`),
      alarm.eventId,
    );
    h.log(`answered ${answer.eventId} at ${answer.station}: ${answer.choiceId} (flag ${flag})`);
    if (flag !== answer.choiceId) throw new Error(`${answer.eventId} flag is ${flag}`);
    answered.push(answer);
  }

  // --- 9-10. The reactor fault at the access point over the reactor's bay: "restart" melts
  // it down; the card closes, the panel opens on LOST over the paused world.
  await flyToAlarm();
  const reactor = await h.eval(() => ({
    alarm: window.nasa.services.stationAlarm.alarm,
    bay: window.nasa.services.voyage.hold().indexOf('reactor') + 1,
  }));
  h.log(`reactor alarm: ${JSON.stringify(reactor)}`);
  if (
    reactor.alarm.eventId !== 'reactor-failure' ||
    reactor.alarm.station !== `bay-access-${reactor.bay}`
  ) {
    throw new Error(`the reactor fault is not at its bay: ${JSON.stringify(reactor)}`);
  }
  // Another bay's access point is not there during this alarm: standing over it, nothing is
  // focused.
  const otherBay = reactor.bay === 1 ? 2 : 1;
  await h.waitFor(() => !window.nasa.game.scene.isActive('Navigation'), 5000);
  const otherStand = standOf(`bay-access-${otherBay}`);
  await h.teleport(otherStand.x, otherStand.y);
  await frames(5);
  const otherFocus = await h.eval(
    () => window.nasa.game.scene.getScene('World').debugInfo().focused,
  );
  h.log(`over bay ${otherBay}: focused ${otherFocus}`);
  if (otherFocus !== null) throw new Error(`bay ${otherBay} offers ${otherFocus} during the alarm`);
  await h.mark();
  await answerAlarm(h, { choice: 1, shot: 'stations-9-card-reactor-bay' });
  await h.waitEvent('voyageEnded', 5000);
  await h.waitFor(() => window.nasa.game.scene.isActive('Navigation'), 3000);
  await frames(3);
  const lost = await h.eval(() => {
    const { simulation, state } = window.nasa.services;
    return {
      nav: window.nasa.game.scene.getScene('Navigation').debugInfo(),
      outcome: simulation.voyage.outcome,
      flag: state.flags.get('event.reactor-failure'),
      hit: state.flags.get('event.reactor-failure.hit'),
      station: window.nasa.game.scene.isActive('EventStation'),
      worldPaused: window.nasa.game.scene.isPaused('World'),
    };
  });
  h.log(`death at the reactor: ${JSON.stringify({ ...lost, nav: lost.nav.status })}`);
  if (
    lost.nav.status !== 'LOST' ||
    lost.outcome?.kind !== 'died' ||
    lost.flag !== 'restart' ||
    lost.hit !== true ||
    lost.station ||
    !lost.worldPaused
  ) {
    throw new Error(`no LOST panel over a paused world: ${JSON.stringify(lost)}`);
  }
  await h.shot('stations-10-lost');
  await h.waitEvent('flightLost', SLOW);
  await h.waitFor(() => window.nasa.services.cutscenes.current === 'debrief', SLOW);
  h.log(`debrief reached; answered ${JSON.stringify(answered.map((a) => a.eventId))}`);

  /**
   * Flies on until the next alarm is on: opens the panel at the navigation station (time runs
   * while it is open; with the debug warp), waits for the alarm.
   */
  async function flyToAlarm() {
    await openNavigation(h);
    await frames(2);
    await h.eval(() => window.nasa.services.simulation.setDebugWarp(20));
    await h.waitFor(
      () =>
        window.nasa.services.stationAlarm.alarm !== null ||
        window.__nasaEvents.some((e) => e.name === 'voyageEnded'),
      90000,
    );
    await h.eval(() => window.nasa.services.simulation.setDebugWarp(1));
    if (await h.eval(() => window.nasa.services.stationAlarm.alarm === null)) {
      throw new Error('the voyage ended before the next alarm');
    }
  }

  /**
   * A screenshot with the station marker drawn over `station`: waits for its "on" phase, stops
   * the game loop (the canvas keeps the last frame), checks it is still on, shoots, wakes it.
   */
  async function shotWithMarker(name, station) {
    for (let attempt = 0; attempt < 5; attempt++) {
      await h.waitFor(
        () => window.nasa.game.scene.getScene('World').debugInfo().marker?.visible === true,
        3000,
      );
      const marker = await h.eval(() => {
        window.nasa.game.loop.sleep();
        return window.nasa.game.scene.getScene('World').debugInfo().marker;
      });
      if (marker?.visible && marker.station === station) {
        h.log(`marker: ${JSON.stringify(marker)}`);
        await h.shot(name);
        await h.eval(() => window.nasa.game.loop.wake());
        return;
      }
      await h.eval(() => window.nasa.game.loop.wake());
    }
    throw new Error(`no marker over ${station} in its "on" phase`);
  }
}
