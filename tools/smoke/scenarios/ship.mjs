import { VOYAGE_SEED } from '../voyage-seed.mjs';

/**
 * Smoke scenario: act 2 on the ship and the navigation panel (plan S8). `?act=act2&seed=<smoke
 * seed>` (then act 2 again with a fuel crate, the reactor and the greenhouse aboard) opens the
 * ship deck
 * with the voyage started (its seed in `run.seed`) and saves a
 * checkpoint that marks it (no snapshot). Simulated time runs only on the navigation panel in
 * Run mode (GDD `act2-pause`): it stands on the deck and on the panel in Hold (status HOLD, the
 * column: "Next: MOON", six rows). Enter (`confirm`) switches to Run: in 3 s the ship moves, the
 * autopilot burns fuel (kg), food drops; the rows show days, fuel in tonnes with its delta-v
 * ("21.0t Δv93.1", plan variable-mass D6) and states (GDD D12); two telemetry lines under the
 * rows (mass, its rate, a; g, v_esc; plan variable-mass S7), and by the raw `debugInfo()`
 * numbers the mass falls and the acceleration rises while the engine fires;
 * the debug warp speeds time up; "Run / Hold" holds again. With the warp the autopilot reaches
 * the Moon (`gateReached`, `gate` held, `voyage.*` flags): the gate card replaces the column;
 * while the forecast computes (stalled here) nothing can be chosen and the cursor stays on Go
 * on; Go on is enabled once the forecast of the Mars leg is in (FUEL t, stocks now -> on arrival,
 * the leg's days, "Δv need X, have Y km/s"); Esc does not dismiss it; Enter chooses Go on and holds `panel` (the same
 * press does not switch to Run). Run again: with the smoke seed the hull breach opens its card
 * at 0.4 of the Mars leg (portrait, text, the foam disabled for want of the regolith kit); an
 * Enter at once is ignored (cards lock input for 0.4 s); then Enter answers "seal" (16 days of oxygen, the result in the log and a toast), `panel` held.
 * A new voyage on the open panel starts the trail and the log again; the fuel drained during
 * the Moon's docking makes the gate card warn in red (NOT ENOUGH FUEL, FUEL SHORT, "Δv need X,
 * have Y" with need over have)
 * while Go on
 * stays allowed (D6); Go on and Run: DRIFTING, the drift alarm (toast, FUEL red), no event
 * card while adrift, and the crew is lost (LOST, shown for a moment before the death loop takes
 * the hero to the warehouse's debrief). After the event card, Esc closes the panel: time stands
 * again, the world rebuilds once for the flags changed under the panel, and the hero walks. Screenshots: ship-navigation-hold,
 * ship-navigation (Run), -gate, -event, -fuel-short, -drifting, -lost.
 * Run: node tools/smoke.mjs --scenario tools/smoke/scenarios/ship.mjs
 *
 * @param {import('playwright-core').Page} _page
 * @param {any} h helpers, see tools/smoke.mjs
 */
export default async function ship(_page, h) {
  const world = () => window.nasa.game.scene.getScene('World').debugInfo();
  const nav = () => window.nasa.game.scene.getScene('Navigation').debugInfo();
  const snapshot = () => window.nasa.services.simulation.snapshot();
  const faderClear = () => window.nasa.game.scene.getScene('Ui').debugInfo().fader === 0;
  // A click in a panel's first frames is lost; presses two frames apart.
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
  // Act title (1.5 s) and fades take about 2 s; leave room on a slow software renderer.
  const SLOW = 10000;
  const wait = (ms) => h.eval((t) => new Promise((resolve) => setTimeout(resolve, t)), ms);
  const simTime = () => h.eval(() => window.nasa.services.simulation.snapshot()?.timeS ?? null);
  const holds = () => h.eval(() => window.nasa.services.simulation.heldReasons);
  /** Fails unless simulated time stands still for `ms` real ms (`where` names the moment). */
  const expectStill = async (where, ms = 1000) => {
    const t0 = await simTime();
    await wait(ms);
    const t1 = await simTime();
    const reasons = await holds();
    h.log(`${where}: timeS ${t0} -> ${t1}, holds ${JSON.stringify(reasons)}`);
    if (t1 !== t0) throw new Error(`simulated time moved ${where}: ${t0} -> ${t1}`);
    if (await h.eval(() => window.nasa.services.simulation.isRunning)) {
      throw new Error(`isRunning is true ${where}`);
    }
  };
  /** Waits until the open card stops ignoring input (0.4 s after it opened). */
  const unlocked = () =>
    h.waitFor(
      () => window.nasa.game.scene.getScene('Navigation').debugInfo().card?.locked === false,
      3000,
    );
  /** Simulated seconds per real second over `ms` real ms. */
  const rate = async (ms) => {
    const start = await h.eval(() => ({
      t: performance.now(),
      s: window.nasa.services.simulation.snapshot().timeS,
    }));
    await wait(ms);
    const end = await h.eval(() => ({
      t: performance.now(),
      s: window.nasa.services.simulation.snapshot().timeS,
    }));
    return (end.s - start.s) / ((end.t - start.t) / 1000);
  };

  // --- ?act=act2: title, the ship deck, simulation started and saved in the checkpoint.
  await h.goto('/');
  await h.waitReady('MainMenu');
  await h.eval(() => window.nasa.services.save.clear());
  await h.goto(`/?act=act2&seed=${VOYAGE_SEED}`);
  await h.waitReady('World', SLOW);
  await h.waitEvent('checkpointSaved', SLOW);
  await h.waitFor(faderClear, SLOW);
  // Board again with one fuel crate (the Mars leg then has fuel to spare: the base's tank alone
  // is about what the slowest transfer needs) and the reactor and the greenhouse: the Mars
  // transfer takes about 200 days, the base's stocks alone run out before the hull breach at
  // 0.4 of it (plan variable-mass S4).
  await h.mark();
  await h.eval(() => {
    window.nasa.services.state.flags.set('cargo.fuel', 1);
    window.nasa.services.state.flags.set('cargo.reactor', 1);
    window.nasa.services.state.flags.set('cargo.greenhouse', 1);
    void window.nasa.services.flow.startAct('act2');
  });
  await h.waitReady('World', SLOW);
  await h.waitEvent('checkpointSaved', SLOW);
  await h.waitFor(faderClear, SLOW);
  const deck = await h.eval(world);
  h.log(`act2 -> ${JSON.stringify({ location: deck.locationId, player: deck.player })}`);
  if (deck.locationId !== 'ship-deck') throw new Error(`act 2 opened ${deck.locationId}`);
  if (!(await h.eval(() => window.nasa.services.simulation.isStarted))) {
    throw new Error('the simulation is not started in act 2');
  }
  const save = await h.eval(() => JSON.parse(localStorage.getItem('space-owner.save') ?? 'null'));
  h.log(
    `checkpoint: act ${save?.actId}, version ${save?.version}, voyage ${save?.voyage}, ` +
      `run.seed ${save?.flags?.['run.seed']}, simulation ${JSON.stringify(save?.simulation)}`,
  );
  if (
    save?.actId !== 'act2' ||
    save.version !== 2 ||
    save.voyage !== true ||
    save.flags?.['run.seed'] !== VOYAGE_SEED ||
    save.simulation !== undefined
  ) {
    throw new Error('the act 2 checkpoint does not mark the voyage with the smoke seed');
  }
  const seed = await h.eval(() => window.nasa.services.simulation.voyage?.seed);
  if (seed !== VOYAGE_SEED) throw new Error(`the voyage rolls with seed ${seed}`);
  await h.shot('ship-deck');
  // --- On the deck time stands: the panel is closed (`panel` hold).
  await expectStill('on the deck');

  // --- Walk right to the navigation station and open the panel.
  await h.holdUntil(
    'ArrowRight',
    () => window.nasa.game.scene.getScene('World').debugInfo().focused === 'station-navigation',
    20000,
  );
  await h.press('KeyE');
  await h.waitReady('Navigation');
  await frames(3);
  if (!(await h.eval(() => window.nasa.game.scene.isPaused('World')))) {
    throw new Error('the world is not paused under the navigation panel');
  }
  const opened = await h.eval(nav);
  h.log(`panel opened: ${JSON.stringify(opened)}`);
  // The E that opened the panel must not close it (`interact` closes the panel).
  if (opened.run || opened.status !== 'HOLD' || opened.card !== null) {
    throw new Error(`the panel did not open in Hold on the column: ${JSON.stringify(opened)}`);
  }
  if (!/^Next: MOON/.test(opened.next) || opened.day !== 1 || opened.rows === null) {
    throw new Error(`unexpected column at the start: ${JSON.stringify(opened)}`);
  }
  const rebuildsBefore = (await h.eval(world)).rebuilds;
  // --- The panel opens in Hold: time still stands.
  await expectStill('on the panel in Hold');
  await h.shot('ship-navigation-hold');

  // --- Enter (`confirm`) switches to Run: 3 s later the ship moved under the autopilot
  // (fuel burnt, kg), food dropped (the greenhouse aboard makes all the oxygen).
  await h.press('Enter');
  await h.waitFor(() => window.nasa.services.simulation.isRunning, 2000);
  if (!(await h.eval(nav)).run) throw new Error('Enter did not switch the panel to Run');
  const before = await h.eval(snapshot);
  await wait(2000);
  const mid = await h.eval(nav);
  await wait(1000);
  const after = await h.eval(snapshot);
  const panel = await h.eval(nav);
  // --- "Run / Hold" holds again right after the timed reads (before the checks, evals and the
  // screenshot below, whose real time must not let the ship reach the Moon): time stands.
  await h.click(panel.buttons.run.x, panel.buttons.run.y);
  await h.waitFor(() => !window.nasa.game.scene.getScene('Navigation').debugInfo().run, 2000);
  await expectStill('on the panel after "Run / Hold"');
  if ((await h.eval(nav)).status !== 'HOLD') throw new Error('the status is not HOLD after Hold');
  h.log(
    `3 s: day ${(before.timeS / 86400).toFixed(2)} -> ${(after.timeS / 86400).toFixed(2)}, ` +
      `ship.x ${before.ship.x.toExponential(4)} -> ${after.ship.x.toExponential(4)}, ` +
      `food ${before.resources.food.value.toFixed(3)} -> ${after.resources.food.value.toFixed(3)}, ` +
      `fuel ${before.resources.fuel.value.toFixed(1)} -> ${after.resources.fuel.value.toFixed(1)} kg, ` +
      `mass ${before.ship.massKg.toFixed(1)} -> ${after.ship.massKg.toFixed(1)} kg, ` +
      `panel ${JSON.stringify(panel)}`,
  );
  if (after.ship.x === before.ship.x) throw new Error('ship.x did not change in 3 s');
  if (!(after.resources.food.value < before.resources.food.value)) {
    throw new Error('food did not decrease in 3 s');
  }
  if (!(after.resources.fuel.value < before.resources.fuel.value)) {
    throw new Error('the autopilot burnt no fuel in 3 s');
  }
  if (!(after.ship.massKg < before.ship.massKg)) {
    throw new Error('the ship did not get lighter in 3 s of burning');
  }
  // Telemetry (plan variable-mass S7, D12): two lines under the rows; by the raw numbers the
  // mass falls while the engine fires and the acceleration F / M rises (the rounded line hides
  // a ~2 % change in 3 s). The engine fires from Run's start (the climb out of the Earth's
  // gravity): read at 2 s and at 3 s of Run.
  const t0 = mid.telemetry;
  const t1 = panel.telemetry;
  h.log(`telemetry: ${JSON.stringify(t0)} -> ${JSON.stringify(t1)}`);
  h.log(`telemetry lines: ${JSON.stringify(panel.telemetryLines)}`);
  const [line1, line2] = panel.telemetryLines;
  if (
    panel.telemetryLines.length !== 2 ||
    !/^Mass \d+\.\dt [↑↓→]\d+\.\d\dkg\/s · a \d+\.\d{3}m\/s²$/.test(line1) ||
    !/^g \d+\.\d+m\/s² · v_esc [A-Z][a-z]+ \d+(\.\d)?km\/s$/.test(line2) ||
    line1.length > 37 ||
    line2.length > 37
  ) {
    throw new Error(`telemetry lines: ${JSON.stringify(panel.telemetryLines)}`);
  }
  if (!t0 || !t1 || !(t1.massKg < t0.massKg) || !(t1.massRateKgPerS < 0)) {
    throw new Error('telemetry: the mass should fall while the engine fires');
  }
  if (!mid.autopilot.thrusting || !panel.autopilot.thrusting) {
    throw new Error('telemetry: the engine should fire through the first 3 s of Run');
  }
  if (!(t0.accelMS2 > 0 && t1.accelMS2 > t0.accelMS2)) {
    throw new Error('telemetry: the acceleration should rise as the ship gets lighter');
  }
  const accelText = (lines) => / · a (\S+)m\/s²$/.exec(lines[0] ?? '')?.[1];
  if (!accelText(mid.telemetryLines) || accelText(mid.telemetryLines) !== accelText([line1])) {
    throw new Error(
      `telemetry: the rounded a should not move in 1 s: ${mid.telemetryLines[0]} -> ${line1}`,
    );
  }
  if (!(t1.gravityMS2 > 0 && t1.escapeMS > 0 && t1.escapeBody)) {
    throw new Error('telemetry: local gravity and escape speed');
  }
  if (
    panel.status !== 'RUN' ||
    panel.legIndex !== 0 ||
    panel.trail < 5 ||
    panel.timeScale <= 0 ||
    panel.day < 1
  ) {
    throw new Error(`unexpected panel state ${JSON.stringify(panel)}`);
  }
  // Six rows (GDD D12): oxygen, supplies, power in days, fuel in tonnes with its delta-v (at
  // most 12 characters, plan variable-mass K14), heat and comms as states with a trend arrow.
  const rows = panel.rows;
  if (
    !/^\d+ d$/.test(rows.oxygen.value) ||
    !/^\d+ d$/.test(rows.supplies.value) ||
    !/^\d+ d$/.test(rows.power.value) ||
    !/^\d+\.\dt Δv\d+(\.\d)?$/.test(rows.fuel.value) ||
    rows.fuel.value.length > 12 ||
    !(panel.dvMS > 0) ||
    !/^Normal [↑↓→]$/.test(rows.heat.value) ||
    !/^OK [↑↓→]$/.test(rows.comms.value)
  ) {
    throw new Error(`resource rows not as GDD D12 says: ${JSON.stringify(rows)}`);
  }
  const recorded = await h.eval(
    () => window.__nasaEvents.filter((event) => event.name === 'simulationTick').length,
  );
  if (recorded !== 0) throw new Error(`simulationTick recorded ${recorded} times in __nasaEvents`);
  await h.shot('ship-navigation');

  await h.press('Enter');
  await h.waitFor(() => window.nasa.services.simulation.isRunning, 2000);

  // --- With the warp the autopilot reaches the Moon: `gateReached`, parked at gate 0, `gate`
  // held, the flag mirrors set; the gate card replaces the column and shows the forecast of
  // the Mars leg once it is computed (Go on is disabled until then). The forecast is stalled
  // (`workForecast` stubbed on the voyage) to check the card while it computes.
  await h.eval(() => {
    const { simulation } = window.nasa.services;
    simulation.voyage.workForecast = () => null;
    simulation.setDebugWarp(20);
  });
  await h.waitEvent('gateReached', 60000);
  await h.eval(() => window.nasa.services.simulation.setDebugWarp(1));
  const arrival = await h.eval(() =>
    window.__nasaEvents.find((event) => event.name === 'gateReached'),
  );
  const atGate = await h.eval(() => {
    const { simulation, state } = window.nasa.services;
    return {
      phase: simulation.voyage?.phase,
      holds: simulation.heldReasons,
      gateIndex: state.flags.get('voyage.gateIndex'),
      gate: state.flags.get('voyage.gate'),
    };
  });
  h.log(`arrived: ${JSON.stringify(arrival)}, voyage ${JSON.stringify(atGate)}`);
  if (
    arrival?.payload?.gateIndex !== 0 ||
    atGate.phase !== 'atGate' ||
    !atGate.holds.includes('gate') ||
    atGate.gateIndex !== 0 ||
    atGate.gate !== 'moon'
  ) {
    throw new Error(`unexpected voyage state at the Moon: ${JSON.stringify(atGate)}`);
  }
  await expectStill('parked at the Moon');
  // --- While the forecast computes nothing can be chosen: both rows disabled, the cursor stays
  // on Go on; Enter, and Down then Enter, do nothing (the ship stays parked, no landing).
  await unlocked();
  const computing = (await h.eval(nav)).card;
  h.log(`gate card computing: ${JSON.stringify(computing)}`);
  if (
    computing?.kind !== 'gate' ||
    computing.disabled.join() !== 'true,true' ||
    computing.selected !== 0 ||
    !computing.lines.includes('Computing the forecast...')
  ) {
    throw new Error(`unexpected gate card while computing: ${JSON.stringify(computing)}`);
  }
  await h.press('Enter');
  await frames(2);
  await h.press('ArrowDown');
  await frames(2);
  await h.press('Enter');
  await frames(3);
  const stillParked = await h.eval(() => ({
    phase: window.nasa.services.simulation.voyage?.phase,
    selected: window.nasa.game.scene.getScene('Navigation').debugInfo().card?.selected,
  }));
  if (stillParked.phase !== 'atGate' || stillParked.selected !== 0) {
    throw new Error(`a choice was made while computing: ${JSON.stringify(stillParked)}`);
  }
  await h.eval(() => delete window.nasa.services.simulation.voyage.workForecast);
  await h.waitFor(() => window.nasa.services.simulation.voyage?.forecast !== null, 20000);
  await h.waitFor(() => {
    const card = window.nasa.game.scene.getScene('Navigation').debugInfo().card;
    return card?.kind === 'gate' && card.disabled[0] === false;
  }, 5000);
  const gateCard = (await h.eval(nav)).card;
  h.log(`gate card: ${JSON.stringify(gateCard)}`);
  if (
    gateCard.choices[0] !== 'Go on to MARS' ||
    !/^Stop here: build an outpost$/.test(gateCard.choices[1]) ||
    gateCard.selected !== 0 ||
    gateCard.fuelShort !== false ||
    !gateCard.lines.some((line) => /^FUEL t +\d+\.\d → +\d+\.\d/.test(line)) ||
    !gateCard.lines.some((line) => /^Δv need \d+\.\d, have \d+\.\d km\/s$/.test(line)) ||
    !gateCard.lines.some((line) => /^Leg \d+ d, arrive day \d+$/.test(line))
  ) {
    throw new Error(`unexpected gate card ${JSON.stringify(gateCard)}`);
  }
  await h.shot('ship-navigation-gate');
  // --- Esc does not dismiss a decision: the panel and the card stay.
  await h.press('Escape');
  await frames(3);
  if (
    !(await h.eval(() => window.nasa.game.scene.isActive('Navigation'))) ||
    (await h.eval(nav)).card?.kind !== 'gate'
  ) {
    throw new Error('Esc closed the gate card');
  }

  // --- Enter chooses Go on: the ship leaves for Mars, `gate` released and `panel` held (after
  // a card the player presses Run himself, GDD `evt-presentation` A); the same Enter does not
  // switch to Run.
  await unlocked();
  await h.press('Enter');
  await h.waitFor(() => window.nasa.services.simulation.voyage?.phase === 'flying', 2000);
  await frames(2);
  const departed = await h.eval(() => {
    const { simulation, state } = window.nasa.services;
    return {
      phase: simulation.voyage?.phase,
      leg: simulation.voyage?.legIndex,
      holds: simulation.heldReasons,
      nextGate: state.flags.get('voyage.nextGate'),
      legProgress: state.flags.get('voyage.legProgress'),
    };
  });
  const afterGo = await h.eval(nav);
  h.log(`go on: ${JSON.stringify(departed)}, panel ${afterGo.status}, ${afterGo.next}`);
  if (
    departed.phase !== 'flying' ||
    departed.leg !== 1 ||
    departed.holds.includes('gate') ||
    !departed.holds.includes('panel') ||
    departed.nextGate !== 'mars' ||
    departed.legProgress !== 0
  ) {
    throw new Error(`Go on did not leave the Moon on hold: ${JSON.stringify(departed)}`);
  }
  if (afterGo.run || afterGo.card !== null || afterGo.status !== 'HOLD') {
    throw new Error(`the panel after Go on: ${JSON.stringify(afterGo)}`);
  }
  await expectStill('after Go on');

  // --- Run again: with the smoke seed the hull breach opens its card at 0.4 of the leg.
  await h.mark();
  await h.press('Enter');
  await h.waitFor(() => window.nasa.services.simulation.isRunning, 2000);
  // --- The debug warp (?debug=1) multiplies simulated time on top of the time scale (measured at
  // the start of the long Mars leg, far from its gate and its events).
  const plain = await rate(1000);
  await h.eval(() => window.nasa.services.simulation.setDebugWarp(10));
  const warped = await rate(1000);
  await h.eval(() => window.nasa.services.simulation.setDebugWarp(1));
  h.log(`warp: ${plain.toFixed(0)} -> ${warped.toFixed(0)} simulated s per real s`);
  if (!(warped > plain * 4)) throw new Error('setDebugWarp(10) did not speed up simulated time');

  await h.eval(() => window.nasa.services.simulation.setDebugWarp(20));
  await h.waitEvent('voyageEvent', 60000);
  await h.eval(() => window.nasa.services.simulation.setDebugWarp(1));
  // --- The card ignores input for 0.4 s after it opens (GDD `gate-stop-go-ui`: Enter or Space
  // pressed for Run must not choose): Enter at once does nothing.
  await h.waitFor(
    () => window.nasa.game.scene.getScene('Navigation').debugInfo().card?.kind === 'event',
    2000,
  );
  const lockedAtOpen = (await h.eval(nav)).card.locked;
  await h.press('Enter');
  await frames(3);
  const afterEarly = await h.eval(() => window.nasa.services.simulation.voyage?.phase);
  h.log(`event card locked at open: ${lockedAtOpen}, phase after an early Enter: ${afterEarly}`);
  if (lockedAtOpen !== true || afterEarly !== 'event') {
    throw new Error(`the event card took input at once: ${lockedAtOpen}, ${afterEarly}`);
  }
  const card = await h.eval(() => {
    const { simulation, state } = window.nasa.services;
    const open = simulation.voyage?.openEvent;
    return {
      phase: simulation.voyage?.phase,
      holds: simulation.heldReasons,
      id: open?.id,
      choices: open?.choices.map((choice) => `${choice.id}:${choice.enabled}`),
      flag: state.flags.get('event.hull-breach'),
      legProgress: state.flags.get('voyage.legProgress'),
      oxygen: simulation.snapshot().resources.oxygen.value,
    };
  });
  h.log(`event: ${JSON.stringify(card)}`);
  if (
    card.phase !== 'event' ||
    card.id !== 'hull-breach' ||
    !card.holds.includes('event') ||
    card.flag !== 'open' ||
    !(card.legProgress >= 30 && card.legProgress <= 45)
  ) {
    throw new Error(`unexpected state at the hull breach: ${JSON.stringify(card)}`);
  }
  await frames(2);
  const eventCard = (await h.eval(nav)).card;
  h.log(`event card: ${JSON.stringify(eventCard)}`);
  // The foam needs the regolith kit: shown, disabled, with what it needs.
  if (
    eventCard?.kind !== 'event' ||
    eventCard.choices.length !== 3 ||
    eventCard.disabled.join() !== 'false,false,true' ||
    !/needs: Regolith kit/.test(eventCard.choices[2]) ||
    eventCard.selected !== 0
  ) {
    throw new Error(`unexpected event card ${JSON.stringify(eventCard)}`);
  }
  await expectStill('on the event card');
  await h.shot('ship-navigation-event');

  // --- Enter answers "seal" (the first row): 16 days of oxygen lost, `event` released, `panel`
  // held: time stands until Run is pressed again; the result goes to the log and a toast.
  await unlocked();
  await h.press('Enter');
  await h.waitFor(() => window.nasa.services.simulation.voyage?.phase === 'flying', 2000);
  await frames(2);
  const answered = await h.eval(() => {
    const { simulation, state } = window.nasa.services;
    return {
      phase: simulation.voyage?.phase,
      holds: simulation.heldReasons,
      flag: state.flags.get('event.hull-breach'),
      hit: state.flags.get('event.hull-breach.hit'),
      oxygen: simulation.snapshot().resources.oxygen.value,
      resolved: window.__nasaEvents.filter((event) => event.name === 'voyageEventResolved').length,
    };
  });
  const afterCard = await h.eval(nav);
  h.log(`answered: ${JSON.stringify(answered)}, log ${JSON.stringify(afterCard.log)}`);
  if (
    answered.phase !== 'flying' ||
    answered.holds.includes('event') ||
    !answered.holds.includes('panel') ||
    answered.flag !== 'seal' ||
    answered.hit !== false ||
    answered.resolved !== 1 ||
    Math.abs(card.oxygen - answered.oxygen - 16) > 1e-6
  ) {
    throw new Error(`answering the hull breach went wrong: ${JSON.stringify(answered)}`);
  }
  if (afterCard.run || afterCard.card !== null || afterCard.toast === null) {
    throw new Error(`the panel after the event card: ${JSON.stringify(afterCard)}`);
  }
  await expectStill('after the event card');

  // --- Esc closes the panel; time stands; the flags changed under the panel (it pauses the
  // world) rebuild the world once, not once per change; the hero walks; back to the panel.
  await h.press('Escape');
  await h.waitFor(
    () =>
      !window.nasa.game.scene.isActive('Navigation') && window.nasa.game.scene.isActive('World'),
  );
  await frames(2);
  await expectStill('after Esc');
  const rebuilds = (await h.eval(world)).rebuilds - rebuildsBefore;
  h.log(`world rebuilds while the panel was open and after: ${rebuilds}`);
  if (rebuilds > 1) throw new Error(`the world rebuilt ${rebuilds} times for the voyage flags`);
  const start = (await h.eval(world)).player;
  await h.hold('ArrowLeft', 300);
  const end = (await h.eval(world)).player;
  h.log(`walk left: x ${start.x.toFixed(1)} -> ${end.x.toFixed(1)}`);
  if (!(end.x < start.x - 5)) throw new Error('the hero did not walk after the panel closed');
  await h.holdUntil(
    'ArrowRight',
    () => window.nasa.game.scene.getScene('World').debugInfo().focused === 'station-navigation',
    20000,
  );
  await h.press('KeyE');
  await h.waitReady('Navigation');
  await frames(3);

  // --- A new voyage on the open panel (base cargo, smoke seed): the trail and the log start
  // again. Fly to the Moon and drain the fuel during the docking (no fuel is burnt there) to
  // 400 kg (about 0.1 km/s of delta-v at Isp 3000 s on the ~100 t base ship), so the Mars leg
  // is short of fuel: the gate card warns in red (D6) and Go on stays allowed.
  await h.eval((s) => {
    const simulation = window.nasa.services.simulation;
    simulation.start(s);
    simulation.hold('panel');
  }, VOYAGE_SEED);
  await frames(2);
  const fresh = await h.eval(nav);
  if (fresh.trail > 1 || fresh.log.length !== 1 || fresh.status !== 'HOLD' || fresh.card) {
    throw new Error(`the panel did not start the new voyage afresh: ${JSON.stringify(fresh)}`);
  }
  await h.mark();
  await h.press('Enter');
  await h.waitFor(() => window.nasa.services.simulation.isRunning, 2000);
  await h.eval(() => window.nasa.services.simulation.setDebugWarp(20));
  await h.waitFor(() => window.nasa.services.simulation.autopilot?.phase === 'docking', 60000);
  await h.eval(() => {
    const simulation = window.nasa.services.simulation.voyage.simulation;
    const fuel = simulation.snapshot().resources.fuel.value;
    simulation.applyEvent('smoke', { stocks: { fuel: 400 - fuel } });
  });
  await h.waitEvent('gateReached', 30000);
  await h.eval(() => window.nasa.services.simulation.setDebugWarp(1));
  await h.waitFor(() => window.nasa.services.simulation.voyage?.forecast !== null, 20000);
  await h.waitFor(() => {
    const info = window.nasa.game.scene.getScene('Navigation').debugInfo().card;
    return info?.kind === 'gate' && info.disabled[0] === false;
  }, 5000);
  const shortCard = (await h.eval(nav)).card;
  h.log(`fuel-short gate card: ${JSON.stringify(shortCard)}`);
  if (
    shortCard.fuelShort !== true ||
    !shortCard.lines.some((line) => line.startsWith('NOT ENOUGH FUEL')) ||
    !shortCard.lines.some((line) => /^FUEL t .* SHORT$/.test(line)) ||
    !shortCard.lines.some((line) => /^Δv need \d+\.\d, have \d+\.\d km\/s$/.test(line)) ||
    shortCard.choices[0] !== 'Go on to MARS'
  ) {
    throw new Error(
      `the gate card does not warn of the fuel shortage: ${JSON.stringify(shortCard)}`,
    );
  }
  await h.shot('ship-navigation-fuel-short');

  // --- Go on anyway (D6), Run: the fuel runs out on the way: DRIFTING, the drift alarm (a
  // toast, the FUEL row red), and within a few real seconds of Run the crew is lost.
  await unlocked();
  await h.press('Enter');
  await h.waitFor(() => window.nasa.services.simulation.voyage?.phase === 'flying', 2000);
  await frames(2);
  await h.press('Enter');
  await h.waitFor(() => window.nasa.services.simulation.isRunning, 2000);
  await h.waitFor(() => window.nasa.services.simulation.voyage?.phase === 'drifting', 60000);
  await frames(3);
  const drifting = await h.eval(nav);
  h.log(`drifting: ${JSON.stringify({ ...drifting, log: drifting.log.slice(-3) })}`);
  if (
    drifting.status !== 'DRIFTING' ||
    drifting.rows.fuel.level !== 'critical' ||
    !/^Out of fuel before MARS$/.test(drifting.next)
  ) {
    throw new Error(`the panel does not show the drift: ${JSON.stringify(drifting)}`);
  }
  await h.waitFor(() => {
    const info = window.nasa.game.scene.getScene('Navigation').debugInfo();
    return info.alarms.includes('drift') && /^ALARM/.test(info.toast ?? '');
  }, 3000);
  await h.shot('ship-navigation-drifting');
  // Adrift no event opens (they are dropped): the drift clock runs on to the end.
  await h.waitEvent('voyageEnded', 20000);
  await frames(2);
  const lost = await h.eval(nav);
  h.log(`lost: ${lost.status}, ${lost.next}, log ${JSON.stringify(lost.log.slice(-2))}`);
  // The drift kills within a few real seconds; a stock may run out first in that window (plan
  // S6 notes: `frozen` with the smoke seed), so any cause will do here.
  // The FUEL row stays red after the end: the tank is empty ("0.0t Δv0.0").
  if (
    lost.status !== 'LOST' ||
    !/^Lost: [\w:-]+, day \d+$/.test(lost.next) ||
    lost.rows.fuel.level !== 'critical'
  ) {
    throw new Error(`the panel does not show the loss: ${JSON.stringify(lost)}`);
  }
  await h.shot('ship-navigation-lost');

  // --- After a moment on LOST the death loop takes over (plan D18): the debrief in the
  // warehouse (death-loop.mjs checks it whole).
  await h.waitEvent('flightLost', SLOW);
  await h.waitFor(() => window.nasa.services.cutscenes.current === 'debrief', SLOW);
  const debrief = await h.eval(() => ({
    location: window.nasa.game.scene.getScene('World').debugInfo().locationId,
    cause: window.nasa.services.state.flags.get('run.lastCause'),
    voyageCause: window.nasa.services.state.flags.get('voyage.cause'),
  }));
  h.log(`after the loss: ${JSON.stringify(debrief)}`);
  if (debrief.location !== 'warehouse' || debrief.cause !== debrief.voyageCause) {
    throw new Error(`the loss did not lead to the debrief: ${JSON.stringify(debrief)}`);
  }
}
