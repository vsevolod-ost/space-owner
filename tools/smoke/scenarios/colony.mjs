import { VOYAGE_SEED } from '../voyage-seed.mjs';

/**
 * Smoke scenario: the colony and the endings (plan S11, D19). `?act=act3` opens the colony;
 * with the flags of a Stop on Mars (and an oxygen crate, the battery, solar panels, the
 * reactor aboard) the sky and the ground take Mars's colours, four buildings stand and the
 * power closes Mars's needs: a colony; with the flags of a Stop on the Moon (fuel, solar
 * panels, the reactor, a regolith kit) they take the Moon's, three buildings stand (fuel
 * builds nothing) and the colony is a settlement (heat and shielding short). The shelter tells
 * the tier, the systems each need; the overlook says its line and ends on `colony-moon` with
 * the settlement's tier line; "Fly again" takes the hero to the
 * warehouse's hatch in act 1 with the cargo still aboard, `run.attempt` +1, a checkpoint.
 * Then a real Stop: act 2 with the smoke seed, Run with the debug warp to the Moon, "Stop
 * here" on the gate card -> LANDED, the title "Moon · day N", act 3 in the colony on the Moon.
 * Screenshots: colony-mars, colony-moon, colony-ending, colony-fly-again, colony-landed.
 * Run: node tools/smoke.mjs --scenario tools/smoke/scenarios/colony.mjs --timeout 600000
 *
 * @param {import('playwright-core').Page} page
 * @param {any} h helpers, see tools/smoke.mjs
 */
export default async function colony(page, h) {
  const world = () => window.nasa.game.scene.getScene('World').debugInfo();
  const ui = () => window.nasa.game.scene.getScene('Ui').debugInfo();
  const ending = () => window.nasa.game.scene.getScene('Ending').debugInfo();
  const faderClear = () => window.nasa.game.scene.getScene('Ui').debugInfo().fader === 0;
  const savedGame = () => JSON.parse(localStorage.getItem('space-owner.save') ?? 'null');
  const SLOW = 10000;
  /** Waits until `fn(arg)` is truthy in the page (`h.waitFor` takes no argument). */
  const waitWith = (fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms });
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

  /** Sets the flags of a Stop on `body` with `cargo` aboard (every other cargo flag cleared). */
  const land = (gate, body, name, cargo) =>
    h.eval(
      ({ gate, body, name, cargo }) => {
        const flags = window.nasa.services.state.flags;
        flags.deletePrefix('cargo.');
        for (const [id, n] of Object.entries(cargo)) flags.set(`cargo.${id}`, n);
        flags.set('voyage.stopGate', gate);
        flags.set('voyage.stopName', name);
        flags.set('voyage.day', 60);
        flags.set('voyage.stopBody', body);
      },
      { gate, body, name, cargo },
    );
  /** Waits until the colony shows `sky` over its sky layer, then returns its props. */
  const painted = async (sky) => {
    await waitWith(
      (tint) =>
        window.nasa.game.scene.getScene('World').debugInfo().props.background[
          'location-colony-sky'
        ] === tint,
      sky,
      SLOW,
    );
    return (await h.eval(world)).props;
  };
  /** The hold's bays (one building place each) and the sites' colours, read after a load. */
  let bays;
  let sites;
  /** Names of the buildings drawn at `build-1..<bays>`, in place order, empty places cut off. */
  const buildings = (props) =>
    Array.from({ length: bays }, (_, i) => props.props[`build-${i + 1}`]?.layers.join('+') ?? '')
      .join(',')
      .replace(/,+$/, '');
  /** E at map object `name` from (x, y): returns the line it says, and closes it. */
  const ask = async (name, x, y) => {
    await h.teleport(x, y);
    await waitWith(
      (n) => window.nasa.game.scene.getScene('World').debugInfo().focused === n,
      name,
      5000,
    );
    await h.press('KeyE');
    await h.waitFor(
      () => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue?.typing === false,
      SLOW,
    );
    const line = (await h.eval(ui)).dialogue;
    return line;
  };
  const close = async () => {
    await h.press('Enter');
    await h.waitFor(
      () => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue === null,
      SLOW,
    );
  };

  // --- ?act=act3 opens the colony with its checkpoint.
  await h.goto('/');
  await h.waitReady('MainMenu');
  await h.eval(() => window.nasa.services.save.clear());
  await h.goto('/?act=act3');
  await h.waitReady('World', SLOW);
  ({ bays, sites } = await h.eval(() => ({
    bays: window.nasa.services.voyage.cargo.bays,
    sites: window.nasa.services.voyage.colony.bodies,
  })));
  await h.waitEvent('checkpointSaved', SLOW);
  await h.waitFor(faderClear, SLOW);
  if ((await h.eval(world)).locationId !== 'colony')
    throw new Error('act3 did not open the colony');

  // --- Mars: the sky and the ground in Mars's colours, four buildings, a colony (power 4/4,
  // heat 1/1 from the reactor).
  await land(1, 'mars', 'Mars', { oxygen: 1, battery: 1, solar: 1, reactor: 1 });
  const mars = await painted(sites.mars.sky);
  h.log(`mars: ${JSON.stringify(mars.background)}, buildings ${buildings(mars)}`);
  if (mars.background['location-colony-ground'] !== sites.mars.ground) {
    throw new Error(`the ground is not Mars's: ${JSON.stringify(mars.background)}`);
  }
  if (buildings(mars) !== 'colony-module,colony-battery,colony-solar,colony-reactor') {
    throw new Error(`unexpected buildings on Mars: ${buildings(mars)}`);
  }
  const marsTier = await h.eval(() => window.nasa.services.voyage.colonyTier('mars'));
  if (marsTier !== 'colony') throw new Error(`Mars with every power source is a ${marsTier}`);
  await h.shot('colony-mars');

  // --- The Moon: other colours, three buildings (fuel builds nothing), a settlement.
  await land(0, 'moon', 'Moon', { fuel: 1, solar: 1, reactor: 1, 'regolith-kit': 1 });
  const moon = await painted(sites.moon.sky);
  h.log(`moon: ${JSON.stringify(moon.background)}, buildings ${buildings(moon)}`);
  if (moon.background['location-colony-ground'] !== sites.moon.ground) {
    throw new Error(`the ground is not the Moon's: ${JSON.stringify(moon.background)}`);
  }
  if (buildings(moon) !== 'colony-solar,colony-reactor,colony-regolith') {
    throw new Error(`unexpected buildings on the Moon: ${buildings(moon)}`);
  }
  await h.shot('colony-moon');

  // --- The shelter tells the tier, the systems each need of the Moon.
  const shelterLine = await ask('shelter', 248, 180);
  h.log(`shelter: ${JSON.stringify(shelterLine?.text)}`);
  if (!/Moon/.test(shelterLine?.text) || !/settlement/.test(shelterLine?.text)) {
    throw new Error(`unexpected shelter line ${JSON.stringify(shelterLine)}`);
  }
  await close();
  const systemsLine = await ask('systems', 348, 180);
  h.log(`systems: ${JSON.stringify(systemsLine?.text)}`);
  const needs = String(systemsLine?.text ?? '').split('\n');
  if (
    needs.length !== 2 ||
    !/cold gets in \(1\/2\)/.test(needs[0]) ||
    !/radiation gets through \(3\/4\)/.test(needs[1])
  ) {
    throw new Error(`unexpected systems lines ${JSON.stringify(needs)}`);
  }
  await close();

  // --- The overlook: its line, then the end screen of the Moon with the settlement's line.
  const view = await ask('overlook', 560, 180);
  h.log(`overlook: ${JSON.stringify(view?.text)}`);
  await h.press('Enter');
  await h.waitReady('Ending', SLOW);
  await h.waitFor(faderClear, SLOW);
  const end = await h.eval(ending);
  h.log(`ending: ${JSON.stringify(end)}`);
  if (
    end.endingId !== 'colony-moon' ||
    end.tier !== 'settlement' ||
    !/^Settlement\./.test(end.tierLine) ||
    JSON.stringify(end.choices.items) !== '["Fly again","Main menu"]' ||
    end.choices.selected !== 0
  ) {
    throw new Error(`unexpected end screen ${JSON.stringify(end)}`);
  }
  await h.shot('colony-ending');

  // --- "Fly again": the warehouse's hatch in act 1, the cargo aboard, attempt 2, a checkpoint.
  await h.mark();
  await h.press('Enter');
  await h.waitReady('World', SLOW);
  await h.waitEvent('checkpointSaved', SLOW);
  await h.waitFor(faderClear, SLOW);
  const back = await h.eval(() => ({
    world: window.nasa.game.scene.getScene('World').debugInfo(),
    current: window.nasa.services.state.current,
    flags: window.nasa.services.state.flags.toRecord(),
    ending: window.nasa.game.scene.isActive('Ending'),
    under: window.nasa.services.simulation.isUnderWay,
  }));
  const save = await h.eval(savedGame);
  h.log(
    `fly again: ${back.world.locationId} at ${JSON.stringify(back.world.player)}, act ` +
      `${back.current?.actId}, attempt ${back.flags['run.attempt']}, best ` +
      `${back.flags['run.bestGate']}, save ${save?.actId}/${save?.locationId}`,
  );
  if (
    back.world.locationId !== 'warehouse' ||
    back.current?.actId !== 'act1' ||
    Math.abs(back.world.player.x - 588) > 2 ||
    Math.abs(back.world.player.y - 184) > 2 ||
    back.ending ||
    back.under
  ) {
    throw new Error(`"Fly again" did not put the hero at the hatch: ${JSON.stringify(back)}`);
  }
  if (
    back.flags['cargo.reactor'] !== 1 ||
    back.flags['cargo.solar'] !== 1 ||
    back.flags['cargo.regolith-kit'] !== 1 ||
    back.flags['cargo.fuel'] !== 1 ||
    back.flags['run.attempt'] !== 2 ||
    back.flags['run.bestGate'] !== 0
  ) {
    throw new Error(`"Fly again" lost the cargo or the run flags: ${JSON.stringify(back.flags)}`);
  }
  if (save?.actId !== 'act1' || save.locationId !== 'warehouse' || save.voyage) {
    throw new Error(`no warehouse checkpoint after "Fly again": ${JSON.stringify(save)}`);
  }
  await h.shot('colony-fly-again');

  // --- A real Stop: act 2 with the smoke seed, the warp to the Moon, "Stop here" -> the colony.
  await h.eval(() => window.nasa.services.save.clear());
  await h.goto(`/?act=act2&seed=${VOYAGE_SEED}`);
  await h.waitReady('World', SLOW);
  await h.waitEvent('checkpointSaved', SLOW);
  await h.waitFor(faderClear, SLOW);
  await h.holdUntil(
    'ArrowRight',
    () => window.nasa.game.scene.getScene('World').debugInfo().focused === 'station-navigation',
    20000,
  );
  await h.press('KeyE');
  await h.waitReady('Navigation');
  await frames(3);
  await h.press('Enter');
  await h.waitFor(() => window.nasa.services.simulation.isRunning, 2000);
  await h.eval(() => window.nasa.services.simulation.setDebugWarp(20));
  await h.waitEvent('gateReached', 60000);
  await h.eval(() => window.nasa.services.simulation.setDebugWarp(1));
  await h.waitFor(() => {
    const card = window.nasa.game.scene.getScene('Navigation').debugInfo().card;
    return card?.kind === 'gate' && card.disabled[1] === false && card.locked === false;
  }, 20000);
  const card = (await h.eval(() => window.nasa.game.scene.getScene('Navigation').debugInfo())).card;
  h.log(`gate card: ${JSON.stringify(card.choices)}`);
  if (card.choices[1] !== 'Stop here: build an outpost') {
    throw new Error(`unexpected Stop row ${JSON.stringify(card.choices)}`);
  }
  await h.press('ArrowDown');
  await frames(2);
  await h.press('Enter');
  await h.waitEvent('voyageEnded', 5000);
  const landedOn = await h.eval(() => ({
    status: window.nasa.game.scene.getScene('Navigation').debugInfo().status,
    stopBody: window.nasa.services.state.flags.get('voyage.stopBody'),
    stopName: window.nasa.services.state.flags.get('voyage.stopName'),
    day: window.nasa.services.state.flags.get('voyage.day'),
  }));
  h.log(`landed: ${JSON.stringify(landedOn)}`);
  if (landedOn.status !== 'LANDED' || landedOn.stopBody !== 'moon') {
    throw new Error(`Stop did not land on the Moon: ${JSON.stringify(landedOn)}`);
  }
  const title = `Moon · day ${landedOn.day + 1}`;
  await h.mark();
  await waitWith((t) => window.nasa.game.scene.getScene('Ui').debugInfo().title === t, title, SLOW);
  await h.waitEvent('checkpointSaved', SLOW);
  await h.waitFor(faderClear, SLOW);
  const colonyNow = await h.eval(() => ({
    world: window.nasa.game.scene.getScene('World').debugInfo(),
    current: window.nasa.services.state.current,
    navigation: window.nasa.game.scene.isActive('Navigation'),
  }));
  const landedSave = await h.eval(savedGame);
  h.log(
    `act 3: ${colonyNow.world.locationId}, act ${colonyNow.current?.actId}, sky ` +
      `${colonyNow.world.props.background['location-colony-sky']}, save ${landedSave?.actId}`,
  );
  if (
    colonyNow.world.locationId !== 'colony' ||
    colonyNow.current?.actId !== 'act3' ||
    colonyNow.navigation ||
    colonyNow.world.props.background['location-colony-sky'] !== sites.moon.sky ||
    landedSave?.actId !== 'act3' ||
    landedSave.voyage
  ) {
    throw new Error(`Stop did not open the colony on the Moon: ${JSON.stringify(colonyNow)}`);
  }
  await h.shot('colony-landed');
}
