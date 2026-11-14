/**
 * Smoke scenario: the warehouse of act 1 (plan S9). The hero takes three crates at their stands
 * (fuel-1, fuel-2, oxygen: `cargo.*` flags, toasts `Cargo n/7 · M t` with the ship's start
 * mass, each stand's "Mass M t." line, crates gone, HOLD strip), puts
 * the oxygen back at its empty place and leaves a crate standing ("Leave it": no change, no
 * toast). With the hold full (7 of 7 by flags) a crate's stand has no "Take it" and says "No
 * cargo space", while a taken crate's place still offers "Put it back". The astronomer's
 * advice sets `advice.astronomer.bodies`. At the hatch the engineer names what is not aboard;
 * "Wait" stays in the warehouse, "Board" starts act 2 on the deck with the two fuel crates in
 * the hold (bays, HOLD strip, the voyage's cargo) and the `voyage.*` / `event.*` flags cleared.
 * Run: node tools/smoke.mjs --scenario tools/smoke/scenarios/warehouse.mjs
 *
 * @param {import('playwright-core').Page} page
 * @param {any} h helpers, see tools/smoke.mjs
 */
export default async function warehouse(page, h) {
  const SLOW = 30000;
  const world = () => window.nasa.game.scene.getScene('World').debugInfo();
  const ui = () => window.nasa.game.scene.getScene('Ui').debugInfo();
  const flags = () => window.nasa.services.state.flags.toRecord();
  const setFlag = (key, value) =>
    h.eval(([k, v]) => window.nasa.services.state.flags.set(k, v), [key, value]);

  /** `h.waitFor` with an argument for `fn` (page-side functions see no closure). */
  const waitArg = (fn, arg, timeout = 5000) => page.waitForFunction(fn, arg, { timeout });

  /** Stands the hero at (x, y) and waits until `name` has the focus. */
  async function standAt(name, x, y) {
    await h.teleport(x, y);
    await waitArg((n) => window.nasa.game.scene.getScene('World').debugInfo().focused === n, name);
  }

  /** Presses Enter until the open dialogue shows its choices; returns the dialogue info. */
  async function choicesOf(id) {
    await waitArg((d) => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue?.id === d, id);
    for (let i = 0; i < 10; i++) {
      const info = (await h.eval(ui)).dialogue;
      if (info?.choices) return info;
      await h.press('Enter');
      await page.waitForTimeout(150);
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

  /**
   * E at `name` (standing at x, y), then `label` at its stand; returns the stand's info. `shot`
   * names a screenshot of the open stand.
   */
  async function stand(name, x, y, label, shot) {
    await standAt(name, x, y);
    await h.press('KeyE');
    const info = await choicesOf('cargo-stand');
    if (shot) await h.shot(shot);
    await choose(info, label);
    return info;
  }

  /**
   * Waits for the toast `Cargo <used>/7 · <mass> t` (plan variable-mass S8: the ship's start
   * mass), then until it has gone; returns the mass in tonnes. `shot` names a screenshot of it.
   */
  async function toast(used, shot) {
    const prefix = `Cargo ${used}/7 · `;
    await waitArg(
      (p) => window.nasa.game.scene.getScene('Ui').debugInfo().toast?.startsWith(p) === true,
      prefix,
    );
    const text = (await h.eval(ui)).toast;
    if (shot) await h.shot(shot);
    await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().toast === null, 5000);
    const match = /^Cargo \d\/7 · (\d+\.\d) t$/.exec(text ?? '');
    if (!match) throw new Error(`the toast should read "Cargo n/7 · M.M t": "${text}"`);
    h.log(`toast: ${text}`);
    return Number(match[1]);
  }

  /** The crate's mass on a stand's text, "Mass 14.0 t.", in tonnes. */
  function standMass(info) {
    const match = /^Mass (\d+\.\d) t\.$/m.exec(info.text);
    if (!match)
      throw new Error(`the stand should show the crate's mass: ${JSON.stringify(info.text)}`);
    return Number(match[1]);
  }

  // The stand points: above a crate of the top row, below one of the bottom row.
  const AT = {
    'crate-fuel-1': [224, 222],
    'crate-fuel-2': [256, 222],
    'crate-fuel-3': [224, 312],
    'crate-oxygen': [256, 312],
    'crate-supplies': [352, 222],
  };
  const at = (name) => AT[name];

  await h.goto('/?location=warehouse');
  await h.waitReady('World');
  await setFlag('trigger:warehouse:arrival', true);
  await h.waitFor(() => !window.nasa.services.flow.isTransitioning);
  const start = await h.eval(world);
  h.log(`start: hold ${JSON.stringify(start.hold)}`);
  if (start.hold?.text !== 'HOLD 0/7' || start.hold.icons.length !== 0) {
    throw new Error('the HOLD strip should read HOLD 0/7 with no icons');
  }
  await h.shot('warehouse-before');

  // --- Take three crates ----------------------------------------------------------------------
  const first = await stand('crate-fuel-1', ...at('crate-fuel-1'), 'Take it');
  h.log(`fuel-1 stand: ${JSON.stringify(first.text)} ${JSON.stringify(first.choices.items)}`);
  if (JSON.stringify(first.choices.items) !== '["Take it","Leave it"]') {
    throw new Error('a standing crate with room should offer Take it / Leave it');
  }
  const fuelCrate = standMass(first);
  const mass1 = await toast(1);
  const second = await stand('crate-fuel-2', ...at('crate-fuel-2'), 'Take it');
  const mass2 = await toast(2);
  const oxygen = await stand('crate-oxygen', ...at('crate-oxygen'), 'Take it', 'warehouse-stand');
  const mass3 = await toast(3, 'warehouse-toast');
  const oxygenCrate = standMass(oxygen);
  h.log(
    `crate mass: fuel ${fuelCrate} t, oxygen ${oxygenCrate} t; start mass ${mass1} ${mass2} ${mass3} t`,
  );
  // The total grows by the crate's own mass (one function in core, rounding to 0.1 t aside).
  if (standMass(second) !== fuelCrate) throw new Error('two fuel crates of different mass');
  if (Math.abs(mass2 - mass1 - fuelCrate) > 0.11 || Math.abs(mass3 - mass2 - oxygenCrate) > 0.11) {
    throw new Error("the start mass should grow by the taken crate's mass");
  }
  const three = await h.eval(world);
  const f3 = await h.eval(flags);
  h.log(
    `after 3 takes: fuel ${f3['cargo.fuel']}, oxygen ${f3['cargo.oxygen']}, hold ${JSON.stringify(three.hold)}`,
  );
  if (f3['cargo.fuel'] !== 2 || f3['cargo.oxygen'] !== 1) throw new Error('flags after 3 takes');
  if (three.hold.text !== 'HOLD 3/7' || three.hold.icons.join() !== '0,0,1') {
    throw new Error('the HOLD strip should show fuel, fuel, oxygen');
  }
  for (const name of ['crate-fuel-1', 'crate-fuel-2', 'crate-oxygen']) {
    if (name in three.props.props) throw new Error(`${name} is still drawn`);
  }
  if (!three.props.props['crate-fuel-3']) throw new Error('crate-fuel-3 should stand');
  await h.shot('warehouse-hold-strip');

  // --- Put the oxygen back at its empty place --------------------------------------------------
  const back = await stand('crate-oxygen', ...at('crate-oxygen'), 'Put it back');
  h.log(`empty oxygen place: ${JSON.stringify(back.choices.items)}`);
  if (back.choices.items.includes('Take it')) throw new Error('an empty place offers Take it');
  if ((await toast(2)) !== mass2) throw new Error('putting the oxygen back: start mass');
  await h.waitFor(
    () => 'crate-oxygen' in window.nasa.game.scene.getScene('World').debugInfo().props.props,
  );
  if ((await h.eval(flags))['cargo.oxygen'] !== 0) throw new Error('cargo.oxygen should be 0');

  // "Leave it" changes nothing and shows no toast.
  await stand('crate-fuel-3', ...at('crate-fuel-3'), 'Leave it');
  await page.waitForTimeout(400);
  if ((await h.eval(ui)).toast !== null) throw new Error('Leave it showed a toast');
  if ((await h.eval(flags))['cargo.fuel'] !== 2) throw new Error('Leave it changed cargo.fuel');

  // Copies go in place order: with 2 fuel aboard only fuel-2 offers "Put it back" and only
  // fuel-3 offers "Take it" (fuel-1 offers neither), so the crate that moves is this place's.
  const early = await stand('crate-fuel-1', ...at('crate-fuel-1'), 'Leave it');
  h.log(`fuel-1 with 2 aboard: ${JSON.stringify(early.choices.items)}`);
  if (JSON.stringify(early.choices.items) !== '["Leave it"]') {
    throw new Error('fuel-1 should offer only Leave it while fuel-2 is the last taken');
  }
  await page.waitForTimeout(400);

  // --- A full hold: no "Take it" -------------------------------------------------------------
  const fill = ['supplies', 'battery', 'solar', 'reactor', 'greenhouse'];
  for (const id of fill) await setFlag(`cargo.${id}`, 1);
  await h.waitFor(
    () => window.nasa.game.scene.getScene('World').debugInfo().hold?.text === 'HOLD 7/7',
  );
  await standAt('crate-fuel-3', ...at('crate-fuel-3'));
  await h.press('KeyE');
  const full = await choicesOf('cargo-stand');
  h.log(`full hold stand: ${JSON.stringify(full.text)} ${JSON.stringify(full.choices.items)}`);
  if (full.choices.items.includes('Take it')) throw new Error('Take it with a full hold');
  if (!full.text.includes('No cargo space. Put something back first.')) {
    throw new Error('the stand should say there is no cargo space');
  }
  await h.shot('warehouse-full-hold');
  await choose(full, 'Leave it');
  const putBack = await stand('crate-supplies', ...at('crate-supplies'), 'Put it back');
  if (!putBack.choices.items.includes('Put it back')) throw new Error('no Put it back when full');
  await toast(6);
  for (const id of fill) await setFlag(`cargo.${id}`, 0);
  await h.waitFor(
    () => window.nasa.game.scene.getScene('World').debugInfo().hold?.text === 'HOLD 2/7',
  );

  // --- Advice: the astronomer --------------------------------------------------------------
  await standAt('npc-astronomer', 416, 184);
  await h.press('KeyE');
  const advice = await choicesOf('astronomer-advice');
  await h.press('Enter'); // the first choice: ask where to settle
  for (let i = 0; i < 20 && (await h.eval(ui)).dialogue !== null; i++) {
    await h.press('Enter');
    await page.waitForTimeout(150);
  }
  const adviceFlags = await h.eval(flags);
  h.log(`astronomer choices ${JSON.stringify(advice.choices.items)}`);
  if (adviceFlags['advice.astronomer.bodies'] !== true || adviceFlags['astronomer.met'] !== true) {
    throw new Error('the astronomer advice should set advice.astronomer.bodies');
  }
  await h.waitFor(() => !window.nasa.game.scene.getScene('World').debugInfo().rebuildPending);
  await h.shot('warehouse-after');

  // --- The hatch: Wait stays, Board starts act 2 -------------------------------------------
  await setFlag('voyage.smoke', 1);
  await setFlag('event.smoke', 1);
  await standAt('hatch', 596, 184);
  await h.press('KeyE');
  const check = await choicesOf('hatch');
  h.log(`hatch: ${JSON.stringify(check.text)} ${JSON.stringify(check.choices.items)}`);
  if (JSON.stringify(check.choices.items) !== '["Wait","Board"]') {
    throw new Error('the hatch should offer Wait (first) and Board');
  }
  if (!check.text.includes('extra air') || check.text.includes('spare fuel')) {
    throw new Error('the hatch check should name the missing air and not the fuel');
  }
  if (!check.text.includes('Free bays: 5')) throw new Error('the hatch check: free bays');
  await h.shot('warehouse-hatch');
  await choose(check, 'Wait');
  await page.waitForTimeout(600);
  if (
    (await h.eval(world)).locationId !== 'warehouse' ||
    (await h.eval(() => window.nasa.services.flow.isTransitioning))
  ) {
    throw new Error('Wait left the warehouse');
  }

  await h.press('KeyE');
  await h.mark();
  await choose(await choicesOf('hatch'), 'Board');
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().title === 'Act 2', SLOW);
  await h.waitReady('World', SLOW);
  await h.waitEvent('checkpointSaved', SLOW);
  await h.waitFor(() => !window.nasa.services.flow.isTransitioning, SLOW);
  const deck = await h.eval(world);
  const deckFlags = await h.eval(flags);
  const cargo = await h.eval(
    () => window.nasa.services.simulation.voyage?.simulation.snapshot().cargo,
  );
  const bays = Object.fromEntries(
    Object.entries(deck.props.props).map(([name, prop]) => [name, prop.layers.join()]),
  );
  h.log(
    `deck: ${deck.locationId}, bays ${JSON.stringify(bays)}, hold ${JSON.stringify(deck.hold)}, cargo ${JSON.stringify(cargo)}`,
  );
  if (deck.locationId !== 'ship-deck') throw new Error('Board should go to the ship deck');
  if (
    JSON.stringify(bays) !== JSON.stringify({ 'bay-1': 'crate,items:0', 'bay-2': 'crate,items:0' })
  ) {
    throw new Error('the hold should hold two fuel crates');
  }
  if (deck.hold?.text !== 'HOLD 2/7' || deck.hold.icons.join() !== '0,0') {
    throw new Error('the deck HOLD strip should read HOLD 2/7 with two fuel icons');
  }
  if (JSON.stringify(cargo) !== '{"fuel":2}') throw new Error('the voyage should carry 2 fuel');
  if ('voyage.smoke' in deckFlags || 'event.smoke' in deckFlags) {
    throw new Error('voyage.* and event.* should be cleared at the start of act 2');
  }
  if (deckFlags['advice.astronomer.bodies'] !== true) throw new Error('advice lost on boarding');
  await h.shot('warehouse-deck-hold');
}
