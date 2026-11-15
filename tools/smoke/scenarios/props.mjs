/**
 * Smoke scenario: the world follows the flags (plan D20). In the warehouse the oxygen crate is
 * drawn until `cargo.oxygen` = 1, then it is gone (its empty place stays usable: the stand
 * puts it back, plan S9); a flag set while a dialogue is
 * open (`openDialogueDef`, with a line that is a function of the state) changes the world only
 * after the dialogue closes. On the ship deck the hold's bays show what was taken, fuel first
 * (plan D21). In the colony the background is the picture of `voyage.stopBody` (the Moon's
 * without one, then Mars's, then the Moon's again; the full colony check is colony.mjs).
 * Run: node tools/smoke.mjs --scenario tools/smoke/scenarios/props.mjs
 *
 * @param {import('playwright-core').Page} page
 * @param {any} h helpers, see tools/smoke.mjs
 */
export default async function props(page, h) {
  const info = () => window.nasa.game.scene.getScene('World').debugInfo();
  const setFlag = (key, value) =>
    h.eval(([k, v]) => window.nasa.services.state.flags.set(k, v), [key, value]);

  // --- Warehouse: crates disappear when taken -------------------------------------------------
  await h.goto('/?location=warehouse');
  await h.waitReady('World');
  await setFlag('trigger:warehouse:arrival', true);
  const before = await h.eval(info);
  const crates = Object.keys(before.props.props).filter((name) => name.startsWith('crate-'));
  h.log(
    `crates drawn: ${crates.length}; oxygen ${JSON.stringify(before.props.props['crate-oxygen'])}`,
  );
  if (crates.length !== 12) throw new Error(`expected 12 crates, got ${crates.length}`);
  if (before.props.props['crate-oxygen']?.layers.join() !== 'crate,items:1') {
    throw new Error('crate-oxygen should be a crate with icon frame 1');
  }
  // Stand by the oxygen crate (island 1, cell 240..272 x 264..296; walking line below it).
  await h.teleport(256, 312);
  await h.waitFor(
    () => window.nasa.game.scene.getScene('World').debugInfo().focused === 'crate-oxygen',
  );
  await h.shot('props-warehouse-before');

  await setFlag('cargo.oxygen', 1);
  await h.waitFor(
    () => !('crate-oxygen' in window.nasa.game.scene.getScene('World').debugInfo().props.props),
  );
  const after = await h.eval(info);
  h.log(`after cargo.oxygen=1: focused ${after.focused}, rebuilds ${after.rebuilds}`);
  if (after.focused !== 'crate-oxygen') throw new Error('the empty place should stay usable');
  if (!after.props.props['crate-fuel-1']) throw new Error('crate-fuel-1 should still stand');
  await h.shot('props-warehouse-oxygen-taken');

  // Fuel places empty from the first: one fuel crate taken removes crate-fuel-1 only.
  await setFlag('cargo.fuel', 1);
  await h.waitFor(
    () => !('crate-fuel-1' in window.nasa.game.scene.getScene('World').debugInfo().props.props),
  );
  const fuel = await h.eval(info);
  if (!fuel.props.props['crate-fuel-2'] || !fuel.props.props['crate-fuel-3']) {
    throw new Error('crate-fuel-2 and -3 should stand with cargo.fuel = 1');
  }

  // --- Rebuild waits for the dialogue; a line may be a function of the state ------------------
  await h.eval(() => {
    const world = window.nasa.game.scene.getScene('World');
    const ui = window.nasa.game.scene.getScene('Ui');
    const line = (s) => `Oxygen crates aboard: ${s.flags.get('cargo.oxygen')}`;
    void ui.openDialogueDef(
      { start: 'a', nodes: { a: { text: line } } },
      { controls: world.controls },
      'props-test',
    );
  });
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue !== null);
  const dialogue = await h.eval(() => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue);
  h.log(`dialogue ${JSON.stringify(dialogue)}`);
  if (dialogue.id !== 'props-test' || dialogue.text !== 'Oxygen crates aboard: 1') {
    throw new Error(`openDialogueDef: unexpected ${JSON.stringify(dialogue)}`);
  }
  await setFlag('cargo.supplies', 1);
  await page.waitForTimeout(300);
  const held = await h.eval(info);
  h.log(
    `during dialogue: pending ${held.rebuildPending}, supplies drawn ${!!held.props.props['crate-supplies']}`,
  );
  if (!held.rebuildPending || !held.props.props['crate-supplies']) {
    throw new Error('the world was rebuilt while the dialogue was open');
  }
  for (let i = 0; i < 10; i++) {
    if ((await h.eval(() => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue)) === null)
      break;
    await h.press('Enter');
    await page.waitForTimeout(150);
  }
  await h.waitFor(
    () => !('crate-supplies' in window.nasa.game.scene.getScene('World').debugInfo().props.props),
  );
  h.log('crate-supplies gone after the dialogue closed');

  // --- Ship deck: the hold's bays, fuel first, then the registry order ------------------------
  await setFlag('cargo.fuel', 2);
  await h.eval(() => window.nasa.services.flow.goTo('ship-deck', 'spawn-default'));
  await h.waitFor(
    () => window.nasa.game.scene.getScene('World').debugInfo().locationId === 'ship-deck',
  );
  await h.waitFor(() => !window.nasa.services.flow.isTransitioning);
  const deck = await h.eval(info);
  const bays = Object.fromEntries(
    Object.entries(deck.props.props).map(([name, prop]) => [name, prop.layers.join()]),
  );
  h.log(`bays ${JSON.stringify(bays)}`);
  const expected = {
    'bay-1': 'crate,items:0',
    'bay-2': 'crate,items:0',
    'bay-3': 'crate,items:1',
    'bay-4': 'crate,items:2',
  };
  if (JSON.stringify(bays) !== JSON.stringify(expected)) {
    throw new Error(`bays: expected ${JSON.stringify(expected)}`);
  }
  await h.shot('props-deck-hold');

  // --- Colony: the background is the body's picture ----------------------------------------
  const skyClip = async () => {
    const box = await page.locator('canvas').boundingBox();
    return page.screenshot({
      clip: { x: box.x + box.width * 0.4, y: box.y + box.height * 0.1, width: 32, height: 32 },
    });
  };
  /** Whether the colony shows the picture of `body` and no other body's. */
  const shows = (body) => {
    const background = window.nasa.game.scene.getScene('World').debugInfo().props.background;
    return Object.entries(background).every(
      ([key, shown]) =>
        key === 'location-colony-base' || shown === (key === `location-colony-${body}`),
    );
  };
  await h.goto('/?location=colony');
  await h.waitReady('World');
  // Without a landing the colony stands on the first site, the Moon.
  if (!(await h.eval(shows, 'moon')))
    throw new Error("the picture is not the Moon's without a body");
  await setFlag('voyage.stopBody', 'mars');
  await page.waitForFunction(shows, 'mars', { timeout: 15000 });
  await h.shot('props-colony-mars');
  const marsSky = await skyClip();
  await setFlag('voyage.stopBody', 'moon');
  await page.waitForFunction(shows, 'moon', { timeout: 15000 });
  await h.shot('props-colony-moon');
  const moonSky = await skyClip();
  if (marsSky.equals(moonSky)) throw new Error('the sky looks the same for mars and the moon');
}
