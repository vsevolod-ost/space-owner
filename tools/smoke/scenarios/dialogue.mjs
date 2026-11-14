/**
 * Smoke scenario: dialogue. In the corridor the hero stands next to the engineer and
 * presses E: the dialogue opens at `greeting`, the NPC turns to the hero, the world is locked
 * (E does not reopen it). Enter moves to the choices; ArrowDown + Enter picks option 2, which
 * sets `engineer.toldAboutShip`; Enter to the end. A second E starts at another node
 * (`question`, since `greeting` is skipped by its `when`), and the NPC turns back afterwards.
 * Run: node tools/smoke.mjs --scenario tools/smoke/scenarios/dialogue.mjs
 *
 * @param {import('playwright-core').Page} page
 * @param {any} h helpers, see tools/smoke.mjs
 */
export default async function dialogue(page, h) {
  // Page-side functions see only `window`.
  const dialogueInfo = () => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue;
  const worldInfo = () => window.nasa.game.scene.getScene('World').debugInfo();
  const eventCount = (name) => window.__nasaEvents.filter((e) => e.name === name).length;

  /** Presses Enter and waits until the dialogue window shows something else (or closes). */
  async function confirm() {
    const before = JSON.stringify(await h.eval(dialogueInfo));
    await h.press('Enter');
    await page.waitForFunction(
      (prev) => JSON.stringify(window.nasa.game.scene.getScene('Ui').debugInfo().dialogue) !== prev,
      before,
      { timeout: 5000 },
    );
  }

  /** Presses Enter until the dialogue has closed; returns the node ids passed through. */
  async function confirmToEnd() {
    const nodes = [];
    for (let i = 0; i < 20; i += 1) {
      const info = await h.eval(dialogueInfo);
      if (!info) return nodes;
      if (info.choices) throw new Error(`unexpected choices at ${info.nodeId}`);
      if (!info.typing) nodes.push(info.nodeId);
      await confirm();
    }
    throw new Error('dialogue did not end after 20 presses');
  }

  await h.goto('/?location=demo-corridor&spawn=spawn-default');
  await h.waitReady('World');
  await h.waitFor(() => !window.nasa.services.flow.isTransitioning);

  // Left of the engineer (feet at 480,310), within INTERACT_RADIUS of its feet body.
  await h.teleport(454, 310);
  await h.waitFor(
    () => window.nasa.game.scene.getScene('World').debugInfo().focused === 'npc-engineer',
  );
  const before = await h.eval(worldInfo);
  if (before.npcs['npc-engineer'] !== 'down') {
    throw new Error(`engineer faces ${before.npcs['npc-engineer']} before talking, want down`);
  }

  // First talk: opens at the greeting, typewriter running.
  await h.press('KeyE');
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue !== null);
  const first = await h.eval(dialogueInfo);
  h.log(`opened: ${JSON.stringify(first)}`);
  if (first.id !== 'demo-engineer' || first.nodeId !== 'greeting') {
    throw new Error(`first talk opened ${first.id}/${first.nodeId}, want demo-engineer/greeting`);
  }
  if (!first.typing) throw new Error('typewriter did not run');
  const during = await h.eval(worldInfo);
  if (during.npcs['npc-engineer'] !== 'left') {
    throw new Error(`engineer faces ${during.npcs['npc-engineer']} while talking, want left`);
  }
  if (!(await h.eval(() => window.nasa.game.scene.getScene('World').controls.isLocked()))) {
    throw new Error('world controls not locked during the dialogue');
  }
  // E is a world action: locked, so it must not start the dialogue again.
  await h.press('KeyE');
  await page.waitForTimeout(200);
  const started = await h.eval(eventCount, 'dialogueStarted');
  if (started !== 1) throw new Error(`dialogueStarted ${started} times, want 1`);

  // Let the typewriter finish on its own (the line is ~80 characters at 40 per second).
  await h.waitFor(() => !window.nasa.game.scene.getScene('Ui').debugInfo().dialogue.typing, 5000);
  await h.shot('dialogue-line');

  // Enter: on to the question; the choices appear once its line is typed out (Enter there
  // could already pick an option, so wait instead of skipping).
  await confirm();
  const question = await h.eval(dialogueInfo);
  if (question.nodeId !== 'question') throw new Error(`after greeting: ${question.nodeId}`);
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue.choices, 5000);
  const shown = await h.eval(dialogueInfo);
  h.log(`choices: ${JSON.stringify(shown.choices)}`);
  if (shown.choices.items.length !== 3) throw new Error('want three visible choices');
  await h.press('ArrowDown');
  await h.waitFor(
    () => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue.choices.selected === 1,
  );
  await h.shot('dialogue-choices');

  // Option 2: "Tell me about the ship." sets the flag.
  await confirm();
  const told = await h.eval(() => window.nasa.services.state.flags.get('engineer.toldAboutShip'));
  if (told !== true) throw new Error(`engineer.toldAboutShip is ${told}, want true`);
  const rest = await confirmToEnd();
  h.log(`after choice 2: ${rest.join(' -> ')}`);
  await h.waitFor(() => !window.nasa.game.scene.getScene('World').controls.isLocked());
  const ended = await h.eval(eventCount, 'dialogueEnded');
  if (ended !== 1) throw new Error(`dialogueEnded ${ended} times, want 1`);
  const after = await h.eval(worldInfo);
  if (after.npcs['npc-engineer'] !== 'down') {
    throw new Error(`engineer faces ${after.npcs['npc-engineer']} after talking, want down`);
  }

  // Second talk: the greeting is skipped by its `when`.
  await h.press('KeyE');
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue !== null);
  const second = await h.eval(dialogueInfo);
  h.log(`second talk opened at ${second.nodeId}`);
  if (second.nodeId === first.nodeId) throw new Error(`second talk starts at ${second.nodeId}`);
  await h.waitFor(() => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue.choices, 5000);
  const again = await h.eval(dialogueInfo);
  h.log(`second choices: ${JSON.stringify(again.choices.items)}`);
  if (again.choices.items.includes('Tell me about the ship.')) {
    throw new Error('the ship option should be hidden once told');
  }
  // The last option ("Nothing. See you later."): ArrowUp wraps to it.
  await h.press('ArrowUp');
  await h.waitFor(
    () => window.nasa.game.scene.getScene('Ui').debugInfo().dialogue.choices.selected === 2,
  );
  await confirm();
  await confirmToEnd();
  await h.waitFor(() => !window.nasa.game.scene.getScene('World').controls.isLocked());
  const ends = await h.eval(eventCount, 'dialogueEnded');
  if (ends !== 2) throw new Error(`dialogueEnded ${ends} times, want 2`);
}
