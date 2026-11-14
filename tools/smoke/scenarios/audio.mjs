/**
 * Smoke scenario: audio and settings. The menu's Settings button opens the settings panel;
 * "+" on Music (mouse) and Right on SFX (keyboard) change and store the volumes. In the corridor
 * exactly one track (`music-demo`) plays after a click (the smoke browser starts unlocked, so the
 * queued-until-unlock path is not exercised here); walking through
 * the door into the room keeps the same sound instance playing (not restarted). Pause ->
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
  const inRoom = () =>
    window.nasa.game.scene.getScene('World').debugInfo().locationId === 'demo-room';
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

  // --- Corridor: the first click unlocks WebAudio, one track plays -----------------------
  await h.goto('/?location=demo-corridor&spawn=spawn-default');
  await h.waitReady('World');
  await h.waitFor(settled);
  const lockedBefore = await h.eval(() => window.nasa.game.sound.locked);
  await h.click();
  await page.waitForTimeout(500);
  const corridor = await h.eval(playing);
  h.log(
    `corridor (sound locked before click: ${lockedBefore}): playing ${JSON.stringify(corridor)}`,
  );
  if (corridor.length !== 1 || corridor[0].key !== 'music-demo') {
    throw new Error(`expected exactly music-demo playing, got ${JSON.stringify(corridor)}`);
  }
  // Keep the instance to compare after the door.
  await h.eval(() => {
    window.__smokeMusic = window.nasa.game.sound.getAllPlaying()[0];
  });
  const volume = await h.eval(() => window.nasa.services.audio.debugInfo());
  h.log(`audio: ${JSON.stringify(volume)}`);

  // --- Through the door: the same track keeps playing -----------------------------------
  // The room's arrival cutscene counts as seen, so the walk is not interrupted.
  await h.eval(() =>
    window.nasa.services.state.flags.set('trigger:demo-room:trigger-center', true),
  );
  await h.teleport(900, 270);
  await h.holdUntil('ArrowRight', inRoom, 10000);
  await h.waitReady('World');
  await h.waitFor(settled);
  const room = await h.eval(() => {
    const sounds = window.nasa.game.sound.getAllPlaying();
    return {
      count: sounds.length,
      keys: sounds.map((sound) => sound.key),
      music: sounds.filter((sound) => sound.key.startsWith('music-')).length,
      same: sounds.includes(window.__smokeMusic),
      seek: window.__smokeMusic.seek,
    };
  });
  h.log(`room: ${JSON.stringify(room)}`);
  // sfx-door may still be sounding; exactly one music track, the same instance, never restarted.
  if (room.music !== 1 || !room.same) {
    throw new Error(`the music did not continue across the door: ${JSON.stringify(room)}`);
  }
  if (!room.keys.every((key) => key === 'music-demo' || key === 'sfx-door')) {
    throw new Error(`unexpected sounds after the door: ${JSON.stringify(room.keys)}`);
  }
  if (!(room.seek > 0)) throw new Error(`music seek ${room.seek}, expected > 0`);
  await page.waitForTimeout(600);
  const roomLater = await h.eval(playing);
  h.log(`room after 600 ms: playing ${JSON.stringify(roomLater)}`);
  if (roomLater.length !== 1 || roomLater[0].key !== 'music-demo') {
    throw new Error(`expected exactly music-demo playing, got ${JSON.stringify(roomLater)}`);
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

  // --- Main menu: the music fades out ----------------------------------------------------
  await h.eval(() => window.nasa.services.flow.toMainMenu());
  await h.waitReady('MainMenu');
  await page.waitForTimeout(500);
  const menuAgain = await h.eval(playing);
  h.log(`back in the menu: playing ${JSON.stringify(menuAgain)}`);
  if (menuAgain.some((sound) => sound.key === 'music-demo')) {
    throw new Error('the music did not stop on the way to the main menu');
  }
}
