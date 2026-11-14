/**
 * Smoke scenario: the core model. A flag change reaches the EventBus, the save lands in
 * localStorage, the menu's "Continue" is disabled without a save and enabled with one, and
 * loads it; "New Game" replaces it.
 * Run: node tools/smoke.mjs --scenario tools/smoke/scenarios/state.mjs
 *
 * @param {import('playwright-core').Page} _page
 * @param {any} h helpers, see tools/smoke.mjs
 */
export default async function state(_page, h) {
  const menuInfo = () => window.nasa.game.scene.getScene('MainMenu').debugInfo();

  // Start from an empty save, whatever the browser profile holds.
  await h.goto('/');
  await h.waitReady('MainMenu');
  await h.eval(() => window.nasa.services.save.clear());
  await h.goto('/');
  await h.waitReady('MainMenu');

  const before = await h.eval(menuInfo);
  if (before.continueEnabled) throw new Error('"Continue" is enabled without a save');
  await h.shot('state-continue-disabled');

  // A handler subscribed through services.events sees the flag change, and so does waitEvent.
  await h.mark();
  const received = await h.eval(() => {
    const { events, state } = window.nasa.services;
    const seen = [];
    const off = events.on('flagChanged', (payload) => seen.push(payload));
    state.flags.set('x', true);
    state.flags.set('x', true); // same value: no second event
    off();
    return { seen, value: state.flags.get('x'), has: state.flags.has('x') };
  });
  await h.waitEvent('flagChanged');
  h.log(`flagChanged payloads: ${JSON.stringify(received.seen)}`);
  if (received.seen.length !== 1)
    throw new Error(`expected 1 flagChanged, got ${received.seen.length}`);
  const [payload] = received.seen;
  if (payload.key !== 'x' || payload.value !== true || payload.previous !== undefined) {
    throw new Error(`unexpected flagChanged payload ${JSON.stringify(payload)}`);
  }
  if (received.value !== true || !received.has) throw new Error('flag x was not stored');

  // Saving needs a position; FlowService sets it during play.
  const stored = await h.eval(() => {
    const { save, state } = window.nasa.services;
    state.current = { actId: 'prologue', locationId: 'demo-corridor', spawn: 'spawn-default' };
    save.save(state);
    return {
      raw: localStorage.getItem('space-owner.save'),
      hasSave: save.hasSave(),
      loaded: save.load(),
    };
  });
  h.log(`localStorage['space-owner.save'] = ${stored.raw}`);
  if (stored.raw === null) throw new Error('localStorage has no space-owner.save after save()');
  if (!stored.hasSave) throw new Error('hasSave() is false after save()');
  if (stored.loaded?.flags?.x !== true || stored.loaded.locationId !== 'demo-corridor') {
    throw new Error(`load() returned ${JSON.stringify(stored.loaded)}`);
  }

  // The menu reads the save when it is created: reload it.
  await h.goto('/');
  await h.waitReady('MainMenu');
  const after = await h.eval(menuInfo);
  if (!after.continueEnabled) throw new Error('"Continue" is disabled although a save exists');
  await h.shot('state-continue-enabled');

  // "Continue" loads the save: its location, act and flags.
  const continueButton = after.buttons.find((button) => button.label === 'Continue');
  await h.click(continueButton.x, continueButton.y);
  await h.waitReady('World');
  const continued = await h.eval(() => ({
    location: window.nasa.game.scene.getScene('World').debugInfo().locationId,
    current: window.nasa.services.state.current,
    x: window.nasa.services.state.flags.get('x'),
  }));
  h.log(`Continue -> ${JSON.stringify(continued)}`);
  if (
    continued.location !== 'demo-corridor' ||
    continued.current?.actId !== 'prologue' ||
    continued.x !== true
  ) {
    throw new Error(`"Continue" did not load the save: ${JSON.stringify(continued)}`);
  }
  await h.shot('state-continue-loaded');

  // "New Game" deletes the save: the prologue's checkpoint writes a fresh one without flag x.
  await h.goto('/');
  await h.waitReady('MainMenu');
  const newGame = after.buttons.find((button) => button.label === 'New Game');
  await h.click(newGame.x, newGame.y);
  await h.waitReady('World', 10000);
  await h.waitFor(() => {
    const raw = localStorage.getItem('space-owner.save');
    return raw !== null && JSON.parse(raw).flags.x === undefined;
  }, 10000);

  // A broken save counts as none (and only warns).
  await h.eval(() => localStorage.setItem('space-owner.save', '{"version":99}'));
  const broken = await h.eval(() => window.nasa.services.save.hasSave());
  if (broken) throw new Error('hasSave() accepted a save of another version');
  await h.eval(() => window.nasa.services.save.clear());

  // Settings persist apart from the save, clamped to 0..1.
  const settings = await h.eval(() => {
    const { settings } = window.nasa.services;
    settings.set('music', 0.5);
    settings.set('sfx', 3);
    return {
      music: settings.get('music'),
      sfx: settings.get('sfx'),
      raw: localStorage.getItem('space-owner.settings'),
    };
  });
  h.log(`settings ${JSON.stringify(settings)}`);
  if (settings.music !== 0.5 || settings.sfx !== 1) throw new Error('settings not applied');
  if (!settings.raw) throw new Error('settings not stored in localStorage');
}
