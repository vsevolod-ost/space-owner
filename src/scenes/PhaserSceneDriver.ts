import Phaser from 'phaser';
import type { SceneDriver } from '@/core/flow/SceneDriver';
import { isImageKey } from '@/assets';
import { isLocationId } from '@/content/locations';
import { services } from '@/core/services';
import { isOverlayScene, SceneKey } from '@/scenes/keys';
import type { EndingSceneData } from '@/scenes/EndingScene';
import type { UiScene } from '@/scenes/UiScene';
import type { WorldScene, WorldSceneData } from '@/scenes/WorldScene';
import { PanelScene } from '@/ui/PanelScene';

/** Length of the fade out and of the fade in between locations, ms. */
const FADE_MS = 250;
/** Controls lock reason while the screen fades out. */
const TRANSITION_LOCK = 'transition';
/** Controls lock reason while an act title is on screen. */
const TITLE_LOCK = 'act-title';
/** How long an act title card stays on screen, fades included, ms. */
const ACT_TITLE_MS = 1500;
/** How long an act title card over a picture stays on screen, fades included, ms. OWNER: design */
const ACT_CARD_MS = 4000;

/** How `replaceGame` treats what was running. */
interface ReplaceOptions {
  /**
   * The game in progress is over (end screen, menu): cancel the cutscene and clear the UI
   * layer (hint, toast, title, dialogue). False for a location change, where a cutscene's
   * `goTo` goes on in the new location.
   */
  endGame: boolean;
  /** Leave the screen black after the switch (no fade-in). */
  dark?: boolean;
}

/**
 * `SceneDriver` on Phaser scenes: `FlowService` calls it to move between locations.
 * Attached in main.ts with
 * `services.flow.attach(new PhaserSceneDriver(game), { acts, actOrder, endings, debrief,
 * landingAct })`.
 *
 * Every switch of the main scene (location change, end screen, menu) goes through one path,
 * `replaceGame`: panels close, the screen fades to black, every scene but the overlays (UiScene,
 * DebugScene) stops, the new one starts and the screen fades in. While the fader covers the
 * screen it also swallows
 * clicks (see `Fader`), so nothing under it - the menu during an act title - reacts.
 */
export class PhaserSceneDriver implements SceneDriver {
  /** Counts `replaceGame` calls, so a newer one can cut an older one short. */
  private replaceCalls = 0;

  constructor(private readonly game: Phaser.Game) {}

  /**
   * Shows location `location` at spawn `spawn`: the hero stops, the screen fades to black
   * (UiScene's fader, so toasts and the hint fade too), whatever runs - the old location, the
   * menu, Boot, an open panel - is replaced by the World scene with the new location, and the
   * screen fades back in (`dark`: it stays black). From Boot the screen is already black, so it
   * skips the fade out.
   */
  async goTo(location: string, spawn: string, options: { dark?: boolean } = {}): Promise<void> {
    if (!isLocationId(location)) throw new Error(`goTo: unknown location "${location}"`);
    const data: WorldSceneData = { locationId: location, spawn };
    await this.replaceGame(SceneKey.World, data, { endGame: false, dark: options.dark });
  }

  /** Fades the screen in (UiScene's fader); at once if it is already clear. */
  async reveal(): Promise<void> {
    const ui = this.ui;
    await ui.whenReady();
    await ui.fader.fadeIn(FADE_MS);
  }

  /**
   * Fades to black (at once from Boot) and shows `title` on the black screen for
   * `ACT_TITLE_MS` (over picture `image` for `ACT_CARD_MS`), using UiScene's title, which draws
   * above the fader. The screen stays black
   * afterwards: the act's `goTo` fades in on its location, `finish` on the end screen. The
   * hero cannot move meanwhile, and the black fader takes the clicks meant for the menu.
   */
  async showActTitle(title: string, image?: string): Promise<void> {
    if (image !== undefined && !isImageKey(image)) {
      throw new Error(`showActTitle: unknown image "${image}"`);
    }
    const ui = this.ui;
    await ui.whenReady();
    const world = this.runningWorld();
    world?.controls.lock(TITLE_LOCK);
    try {
      await ui.fader.fadeOut(this.topSceneKey() === SceneKey.Boot ? 0 : FADE_MS);
      await ui.showTitle(title, image ? ACT_CARD_MS : ACT_TITLE_MS, image);
    } finally {
      world?.controls.unlock(TITLE_LOCK);
    }
  }

  /**
   * Cancels a playing cutscene, fades out, stops the world and any panels, clears the UI layer
   * and starts `EndingScene` with ending `ending`, then fades in.
   */
  showEnding(ending: string): void {
    const data: EndingSceneData = { endingId: ending };
    void this.replaceGame(SceneKey.Ending, data, { endGame: true });
  }

  /** Like `showEnding`, but opens the main menu. */
  toMainMenu(): void {
    void this.replaceGame(SceneKey.MainMenu, undefined, { endGame: true });
  }

  /** Shows a toast in the UI scene. */
  toast(text: string): void {
    this.ui.toast(text);
  }

  private get ui(): UiScene {
    return this.game.scene.getScene(SceneKey.Ui) as UiScene;
  }

  /** The World scene if it is running (not paused, not stopped). */
  private runningWorld(): WorldScene | null {
    const world = this.game.scene.getScene(SceneKey.World) as WorldScene;
    return world.scene.isActive() ? world : null;
  }

  /** Key of the topmost running scene other than the overlays (UI, debug), if any. */
  private topSceneKey(): string | undefined {
    return this.game.scene
      .getScenes(true, true)
      .find((scene) => !isOverlayScene(scene.sys.settings.key))?.sys.settings.key;
  }

  /**
   * Replaces whatever runs with scene `key` (a location, the end screen, the menu). Panels
   * close first (top down), so the fade-out shows the world or menu, not a panel; then the
   * screen fades to black (at once from Boot or from nothing), every scene but the overlays
   * (UiScene, DebugScene) stops, `key` starts behind the black fader and the screen fades in.
   * Resolves after the fade-in.
   * A newer call wins over one still fading: the older one returns without switching.
   */
  private async replaceGame(
    key: SceneKey,
    data: object | undefined,
    options: ReplaceOptions,
  ): Promise<void> {
    const call = ++this.replaceCalls;
    // Leave the current game step first: a scene must not be stopped inside its own update.
    await Promise.resolve();
    // The script must not go on behind the fade (its own fades would fight this one).
    if (options.endGame) {
      services.cutscenes.cancel();
      // The menu and the end screen have no music (yet): the track fades out with the screen.
      services.audio.stopMusic(FADE_MS);
    }
    const manager = this.game.scene;
    const fromKey = this.topSceneKey();
    for (const scene of manager.getScenes(false, true)) {
      if (scene instanceof PanelScene && isStarted(scene)) manager.stop(scene.sys.settings.key);
    }
    const ui = this.ui;
    await ui.whenReady();
    this.runningWorld()?.controls.lock(TRANSITION_LOCK);
    await ui.fader.fadeOut(fromKey === undefined || fromKey === SceneKey.Boot ? 0 : FADE_MS);
    if (call !== this.replaceCalls) return;

    if (options.endGame) ui.hideAll();
    // Stopping `key` too, when it runs, makes this a restart (a new location in the World).
    for (const scene of manager.getScenes(false, true)) {
      const sceneKey = scene.sys.settings.key;
      if (!isOverlayScene(sceneKey) && isStarted(scene)) manager.stop(sceneKey);
    }
    const target = manager.getScene(key);
    const created = new Promise<void>((resolve) => {
      target.events.once(Phaser.Scenes.Events.CREATE, () => resolve());
    });
    manager.start(key, data);
    manager.bringToTop(SceneKey.Ui);
    await created;
    if (call !== this.replaceCalls || options.dark) return;
    await ui.fader.fadeIn(FADE_MS);
  }
}

/** Whether a scene is running, paused or asleep (not stopped, not waiting to start). */
function isStarted(scene: Phaser.Scene): boolean {
  const status = scene.sys.settings.status;
  return status >= Phaser.Scenes.RUNNING && status <= Phaser.Scenes.SLEEPING;
}
