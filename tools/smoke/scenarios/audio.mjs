/**
 * Smoke scenario: audio and settings. The menu's Settings button opens the settings panel;
 * "+" on Music (mouse) and Right on SFX (keyboard) change and store the volumes. At home
 * exactly one track (`music-demo`) plays after a click (the smoke browser starts unlocked, so the
 * queued-until-unlock path is not exercised here); walking through the door (act 1's title
 * card) into the warehouse crossfades to act 1's theme (`music-act1`), and asking for the track
 * that already plays keeps the same sound instance (not restarted). Pause ->
 * Settings stacks the panels and they close top-down. A sound effect plays without errors, and
 * going to the main menu fades the music out.
 * Run: node tools/smoke.mjs --scenario tools/smoke/scenarios/audio.mjs
 *
 * @param {import('playwright-core').Page} page
 * @param {any} h helpers, see tools/smoke.mjs
 */
export default async function audio(page, h) {
  // Page-side predicates see only `window`: these run in the page and use no closure.
  const settingsInfo = () => window.nasa.game.scene.getScene('Settings').debugInfo();
  const playing = () =>
    window.nasa.game.sound.getAllPlaying().map((sound) => ({ key: sound.key, seek: sound.seek }));
  const settled = () => !window.nasa.services.flow.isTransitioning;
  const inWarehouse = () =>
    window.nasa.game.scene.getScene('World').debugInfo().locationId === 'warehouse';
  const stored = () => JSON.parse(localStorage.getItem('space-owner.settings') ?? '{}');
  const frames = (count) =>
    h.eval(
      (n) =>
        new Promise((resolve) => {
          const step = (left) =>
            left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1));
          step(n);
        }),
      count,
    );

  // --- Main menu -> Settings -------------------------------------------------------------
  await h.goto('/');
  await h.waitReady('MainMenu');
  const menuPlaying = await h.eval(playing);
  h.log(`menu: playing ${JSON.stringify(menuPlaying)}`);
  if (menuPlaying.some((sound) => sound.key.startsWith('music-'))) {
    throw new Error('music plays in the main menu');
  }
  const menu = await h.eval(() => window.nasa.game.scene.getScene('MainMenu').debugInfo());
  const settingsButton = menu.buttons.find((button) => button.label === 'Settings');
  await h.click(settingsButton.x, settingsButton.y);
  await h.waitReady('Settings');
  // Clicks in a new panel's first frames are lost: let its input register.
  await frames(3);
  if (!(await h.eval(() => window.nasa.game.scene.isPaused('MainMenu')))) {
    throw new Error('the menu is not paused under the settings panel');
  }
  await h.shot('audio-settings');

  const before = await h.eval(settingsInfo);
  h.log(`settings before: music ${before.music}, sfx ${before.sfx}`);
  await h.click(before.buttons.musicUp.x, before.buttons.musicUp.y);
  const expectedMusic = Math.min(1, Math.round((before.music + 0.1) * 10) / 10);
  await h.waitFor(`window.nasa.services.settings.get('music') === ${expectedMusic}`);
  const afterMouse = await h.eval(stored);
  h.log(`"+" on Music: settings ${JSON.stringify(afterMouse)}`);
  if (afterMouse.music !== expectedMusic) {
    throw new Error(`localStorage music ${afterMouse.music}, expected ${expectedMusic}`);
  }

  // Keyboard: Down to the SFX row, Right raises it, Left lowers it back.
  await h.press('ArrowDown');
  await frames(2);
  await h.press('ArrowRight');
  const expectedSfx = Math.min(1, Math.round((before.sfx + 0.1) * 10) / 10);
  await h.waitFor(`window.nasa.services.settings.get('sfx') === ${expectedSfx}`);
  await h.press('ArrowLeft');
  await h.waitFor(`window.nasa.services.settings.get('sfx') === ${before.sfx}`);
  const keyboard = await h.eval(settingsInfo);
  h.log(`keyboard: selected row ${keyboard.selected}, sfx ${keyboard.sfx}`);
  if (keyboard.selected !== 1) throw new Error('Down did not select the SFX row');
  await h.shot('audio-settings-changed');

  await h.press('Escape');
  await h.waitFor(
    () =>
      !window.nasa.game.scene.isActive('Settings') && window.nasa.game.scene.isActive('MainMenu'),
  );

  // --- Home: the first click unlocks WebAudio, one track plays --------------------------
  await h.goto('/?location=home&spawn=spawn-default');
  await h.waitReady('World');
  await h.waitFor(settled);
  const lockedBefore = await h.eval(() => window.nasa.game.sound.locked);
  await h.click();
  await page.waitForTimeout(500);
  const home = await h.eval(playing);
  h.log(`home (sound locked before click: ${lockedBefore}): playing ${JSON.stringify(home)}`);
  if (home.length !== 1 || home[0].key !== 'music-demo') {
    throw new Error(`expected exactly music-demo playing, got ${JSON.stringify(home)}`);
  }
  // Keep the instance to compare after the door.
  await h.eval(() => {
    window.__smokeMusic = window.nasa.game.sound.getAllPlaying()[0];
  });
  const volume = await h.eval(() => window.nasa.services.audio.debugInfo());
  h.log(`audio: ${JSON.stringify(volume)}`);

  // --- Through the door: the warehouse crossfades to act 1's theme ---------------------
  // The warehouse's arrival cutscene counts as seen, so nothing interrupts.
  await h.eval(() => window.nasa.services.state.flags.set('trigger:warehouse:arrival', true));
  await h.teleport(590, 180);
  await h.holdUntil('ArrowRight', inWarehouse, 10000);
  await h.waitReady('World');
  await h.waitFor(settled);
  // The crossfade takes 0.5 s; then exactly one music track, the warehouse's.
  await page.waitForTimeout(600);
  const warehouse = await h.eval(() => {
    const sounds = window.nasa.game.sound.getAllPlaying();
    return {
      keys: sounds.map((sound) => sound.key),
      music: sounds.filter((sound) => sound.key.startsWith('music-')).map((sound) => sound.key),
      homeStillPlaying: sounds.includes(window.__smokeMusic),
    };
  });
  h.log(`warehouse: ${JSON.stringify(warehouse)}`);
  if (warehouse.music.length !== 1 || warehouse.music[0] !== 'music-act1') {
    throw new Error(`expected exactly music-act1 after the door: ${JSON.stringify(warehouse)}`);
  }
  if (warehouse.homeStillPlaying) throw new Error('the home track did not fade out');

  // The same key again does not restart the track: same instance, seek keeps running.
  const again = await h.eval(() => {
    const before = window.nasa.game.sound.getAllPlaying().find((s) => s.key === 'music-act1');
    window.nasa.services.audio.playMusic('music-act1');
    const after = window.nasa.game.sound.getAllPlaying().filter((s) => s.key === 'music-act1');
    return { count: after.length, same: after[0] === before, seek: after[0]?.seek ?? 0 };
  });
  h.log(`playMusic(music-act1) again: ${JSON.stringify(again)}`);
  if (again.count !== 1 || !again.same || !(again.seek > 0)) {
    throw new Error(`the same track restarted: ${JSON.stringify(again)}`);
  }

  // --- Pause -> Settings: panels stack and close top-down --------------------------------
  await h.press('Escape');
  await h.waitReady('Pause');
  await frames(3);
  // One key per frame: two presses within a frame would both reach the list in one update.
  await h.press('ArrowDown');
  await frames(2);
  await h.press('Enter');
  await h.waitReady('Settings');
  const stack = await h.eval(() => ({
    pausePaused: window.nasa.game.scene.isPaused('Pause'),
    worldPaused: window.nasa.game.scene.isPaused('World'),
  }));
  h.log(`pause -> settings: ${JSON.stringify(stack)}`);
  if (!stack.pausePaused || !stack.worldPaused) throw new Error('panels did not stack');
  await h.shot('audio-settings-over-pause');
  await h.press('Escape');
  await h.waitFor(
    () => !window.nasa.game.scene.isActive('Settings') && window.nasa.game.scene.isActive('Pause'),
  );
  await frames(2);
  await h.press('Escape');
  await h.waitFor(
    () => !window.nasa.game.scene.isActive('Pause') && window.nasa.game.scene.isActive('World'),
  );

  // --- A sound effect from code ----------------------------------------------------------
  const sfx = await h.eval(() => {
    window.nasa.services.audio.playSfx('ui-click');
    return window.nasa.game.sound.getAllPlaying().map((sound) => sound.key);
  });
  h.log(`after playSfx('ui-click'): playing ${JSON.stringify(sfx)}`);
  if (!sfx.includes('ui-click')) throw new Error('playSfx did not play ui-click');

  // --- Resume: a track switched away from and back continues where it stopped -----------
  // (the fallback alarm over music without a drum layer, src/scenes/stationSound.ts).
  const resumed = await h.eval(async () => {
    const { audio } = window.nasa.services;
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    audio.playMusic('music-demo', { fadeMs: 0 });
    await wait(1500);
    audio.playMusic('music-alarm', { fadeMs: 0 });
    const left = audio.debugInfo().tracks.length;
    audio.playMusic('music-demo', { fadeMs: 0, resume: true });
    const back = audio.debugInfo().tracks.find((track) => track.key === 'music-demo');
    return { left, seek: back?.seek ?? -1 };
  });
  h.log(`resume: ${JSON.stringify(resumed)}`);
  // The demo loop is 4 s; it was stopped about 1.5 s in.
  if (resumed.left !== 1 || !(resumed.seek > 1)) {
    throw new Error(`music-demo did not resume where it stopped: ${JSON.stringify(resumed)}`);
  }

  // --- Layers: none on a plain track; one asked for later joins the playing track in time --
  const layers = await h.eval(async () => {
    const { audio } = window.nasa.services;
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const plain = audio.setLayer(true, 0);
    audio.playMusic('music-flight', { fadeMs: 0 });
    await wait(700);
    audio.playMusic('music-flight', { layer: 'music-flight-drums' });
    const raised = audio.setLayer(true, 0);
    const track = audio.debugInfo().tracks[0];
    return { plain, raised, track };
  });
  h.log(`layers: ${JSON.stringify(layers)}`);
  if (layers.plain) throw new Error('setLayer reported a layer on music without one');
  const late = layers.track.layer;
  if (!layers.raised || late?.gain !== 1 || Math.abs(late.seek - layers.track.seek) > 0.05) {
    throw new Error(`a layer added later is not in time: ${JSON.stringify(layers)}`);
  }

  // --- Main menu: the music fades out ----------------------------------------------------
  await h.eval(() => window.nasa.services.flow.toMainMenu());
  await h.waitReady('MainMenu');
  await page.waitForTimeout(500);
  const menuAgain = await h.eval(playing);
  h.log(`back in the menu: playing ${JSON.stringify(menuAgain)}`);
  if (menuAgain.some((sound) => sound.key.startsWith('music-'))) {
    throw new Error('the music did not stop on the way to the main menu');
  }
}
