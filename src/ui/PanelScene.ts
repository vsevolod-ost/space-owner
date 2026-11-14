import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '@/config';
import type { Controls } from '@/core/input/controls';
import { services } from '@/core/services';
import { isOverlayScene, SceneKey } from '@/scenes/keys';
import type { UiScene } from '@/scenes/UiScene';
import { KeyboardControls } from '@/world/KeyboardControls';
import { Panel } from '@/ui/kit/Panel';
import { createText } from '@/ui/kit/text';
import { theme } from '@/ui/theme';

/** Size and heading of the panel a `PanelScene` draws with `addPanel`. */
export interface PanelFrame {
  /** Heading at the top of the panel; omit for none. */
  title?: string;
  /** Outer size of the panel, px. */
  width: number;
  height: number;
}

/** Gap between the title and the content area, px. */
const TITLE_GAP = 8;

/**
 * Base class of panel scenes over the game: pause menu, settings, the navigation
 * panel. `open(data)` starts the scene on top and pauses every scene under it except the
 * overlays, UiScene and DebugScene (the world stops: physics, timers, input; the simulation
 * keeps ticking on `game.events`);
 * `close()` stops it and resumes them. Esc (`cancel`) closes by default. A panel that sets
 * `rebuildOnLanguageChange` rebuilds its content in place on `languageChanged` (`rebuild()`).
 *
 * A subclass registers in main.ts, gives its key in the constructor and builds its content in
 * `build(data)`, usually starting with `addPanel`. `this.controls` is the panel's own keyboard.
 * Full example: docs/HOWTO-ui.md.
 *
 * ```ts
 * export class PauseScene extends PanelScene {
 *   constructor() { super(SceneKey.Pause); }
 *   protected build(): void {
 *     const area = this.addPanel({ title: 'Paused', width: 240, height: 140 });
 *     new Button(this, area.centerX, area.centerY, 'Resume', () => this.close());
 *   }
 * }
 * // anywhere: await (game.scene.getScene(SceneKey.Pause) as PauseScene).open();
 * ```
 */
export abstract class PanelScene<TData extends object = object> extends Phaser.Scene {
  /** Whether `cancel` (Esc) closes the panel; set false in `build` to handle it yourself. */
  protected closeOnCancel = true;
  /**
   * Whether `languageChanged` rebuilds the content in place (`rebuild()`). Set it (as a field) on
   * panels that can be open while the language changes: the settings panel and what it opens
   * over (plan uk-localization D11).
   */
  protected rebuildOnLanguageChange = false;
  /** True while `rebuild()` runs `build`: keep the selection instead of starting over. */
  protected rebuilding = false;
  private buildData = {} as TData;
  private teardowns: (() => void)[] = [];
  private keyboard?: KeyboardControls;
  /** Scenes this panel paused, resumed when it closes. */
  private pausedKeys: string[] = [];
  /** Whether this panel turned off UiScene's input (false when a lower panel already had). */
  private disabledUiInput = false;
  private closedWaiters: (() => void)[] = [];

  /**
   * Opens the panel over everything and pauses the scenes under it. Resolves when the panel
   * closes. Opening an open panel only waits for it to close.
   */
  open(data?: TData): Promise<void> {
    const closed = new Promise<void>((resolve) => this.closedWaiters.push(resolve));
    if (this.scene.isActive() || this.scene.isPaused()) return closed;

    const manager = this.game.scene;
    const key = this.sys.settings.key;
    this.pausedKeys = manager
      .getScenes(true)
      .map((scene) => scene.sys.settings.key)
      .filter((other) => other !== key && !isOverlayScene(other));
    for (const other of this.pausedKeys) manager.pause(other);

    // UiScene keeps running (fader, toasts) but must not react to keys or clicks meant for us.
    const ui = manager.getScene(SceneKey.Ui) as UiScene | null;
    this.disabledUiInput = Boolean(ui?.sys.isActive() && ui.input.enabled);
    if (ui && this.disabledUiInput) setSceneInput(ui, false);
    // A toast shown before the panel would be half covered by it: the panel takes over.
    ui?.clearToast();

    manager.run(key, data);
    manager.bringToTop(key);
    return closed;
  }

  /** Closes the panel and resumes the scenes it paused (from the next frame). */
  close(): void {
    if (this.scene.isActive() || this.scene.isPaused()) {
      this.scene.stop();
    } else if (this.scene.settings.status < Phaser.Scenes.RUNNING) {
      // Called from build(): the scene is still being created and stop() would be ignored.
      this.events.once(Phaser.Scenes.Events.CREATE, () => this.scene.stop());
    }
  }

  /** The panel's own keyboard; the world's controls are paused with the world. */
  protected get controls(): Controls {
    if (!this.keyboard) throw new Error('PanelScene.controls used before create');
    return this.keyboard;
  }

  /** Do not override: put the content in `build`. */
  create(data: TData): void {
    this.keyboard = new KeyboardControls(this);
    this.closeOnCancel = true;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.onShutdown());
    this.buildData = data ?? ({} as TData);
    this.addBackdrop();
    this.build(this.buildData);
    if (this.rebuildOnLanguageChange) {
      this.onTeardown(
        services.events.on('languageChanged', () => this.rebuild()),
        true,
      );
    }
  }

  /** Closes on `cancel` when `closeOnCancel`. Call `super.update()` if you override it. */
  update(): void {
    if (this.closeOnCancel && this.keyboard?.justPressed('cancel')) this.close();
  }

  /**
   * Builds the panel's content. Called from `create` with the data given to `open`, and again
   * by `rebuild()` (then `rebuilding` is true). Undo outside effects with `onTeardown`.
   */
  protected abstract build(data: TData): void;

  /**
   * Runs `teardown` when the content goes: before a `rebuild()` and when the panel closes
   * (`untilShutdown`: only when it closes). For what `build` does outside its game objects
   * (holds, event handlers).
   */
  protected onTeardown(teardown: () => void, untilShutdown = false): void {
    if (untilShutdown) this.events.once(Phaser.Scenes.Events.SHUTDOWN, teardown);
    else this.teardowns.push(teardown);
  }

  /**
   * Builds the content again in place, with the data given to `open`: in the current language,
   * after `languageChanged`. The panel stays open and keeps what it paused and its `open()`
   * promise; it works while the panel is paused under another one. `build` sees `rebuilding`.
   */
  protected rebuild(): void {
    if (!this.keyboard) return;
    this.runTeardowns();
    for (const child of [...this.children.list]) child.destroy();
    this.addBackdrop();
    this.rebuilding = true;
    try {
      this.build(this.buildData);
    } finally {
      this.rebuilding = false;
    }
  }

  /**
   * Draws a panel in the middle of the screen with the title at its top and returns the
   * content area inside it (padding and title excluded), in whole pixels.
   */
  protected addPanel(frame: PanelFrame): Phaser.Geom.Rectangle {
    const left = Math.round((GAME_WIDTH - frame.width) / 2);
    const top = Math.round((GAME_HEIGHT - frame.height) / 2);
    new Panel(this, left, top, frame.width, frame.height);
    const pad = theme.panelPadding;
    let contentTop = top + pad;
    if (frame.title) {
      const title = createText(this, left + frame.width / 2, contentTop, frame.title, 'title');
      title.setOrigin(0.5, 0);
      contentTop += Math.ceil(title.height) + TITLE_GAP;
    }
    return new Phaser.Geom.Rectangle(
      left + pad,
      contentTop,
      frame.width - pad * 2,
      top + frame.height - pad - contentTop,
    );
  }

  /** Dims the paused scenes and catches clicks that miss the panel. */
  private addBackdrop(): void {
    this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, theme.backdrop.color, theme.backdrop.alpha)
      .setOrigin(0)
      .setInteractive();
  }

  private runTeardowns(): void {
    const teardowns = this.teardowns;
    this.teardowns = [];
    for (const teardown of teardowns) teardown();
  }

  private onShutdown(): void {
    this.runTeardowns();
    const manager = this.game.scene;
    for (const key of this.pausedKeys) {
      if (manager.isPaused(key)) manager.resume(key);
    }
    this.pausedKeys = [];
    const ui = manager.getScene(SceneKey.Ui);
    if (ui && this.disabledUiInput) setSceneInput(ui, true);
    this.disabledUiInput = false;
    this.keyboard = undefined;
    const waiters = this.closedWaiters;
    this.closedWaiters = [];
    for (const resolve of waiters) resolve();
  }
}

function setSceneInput(scene: Phaser.Scene, enabled: boolean): void {
  scene.input.enabled = enabled;
  if (scene.input.keyboard) scene.input.keyboard.enabled = enabled;
}
