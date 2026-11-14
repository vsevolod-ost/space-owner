import Phaser from 'phaser';
import { services } from '@/core/services';
import { DAY_S } from '@/core/simulation/constants';
import type { FlagValue } from '@/core/state/GameState';
import { readOverlayParam } from '@/debug/startParams';
import { SceneKey } from '@/scenes/keys';
import type { WorldScene } from '@/scenes/WorldScene';
import { createText } from '@/ui/kit/text';
import { theme } from '@/ui/theme';

/** How often the overlay text is rebuilt while it is on, ms (not every frame). */
const REFRESH_MS = 250;
/** How many recently changed flags the overlay lists. */
const RECENT_FLAGS = 5;
/** Longest flag value shown; longer ones are cut with "~". */
const MAX_VALUE_CHARS = 16;
/** Distance of the overlay from the top-left corner of the screen, px. */
const MARGIN = 4;
/** The dark box behind the text. */
const BACKGROUND = { color: 0x000000, alpha: 0.75 } as const;

/** What `DebugScene.debugInfo()` returns. */
export interface DebugOverlayInfo {
  /** Whether the overlay is shown (F3 or `?overlay=1`). */
  enabled: boolean;
  /** The text on screen, lines joined with "\n"; empty while the overlay is off. */
  text: string;
}

/**
 * The debug overlay: FPS, location and spawn, the hero's position in map pixels
 * (what location authors copy into Tiled), the object in focus, the act, the music, the flags
 * with the last few changes and the simulation's time scale. F3 turns it on and off at any
 * time; `?overlay=1` turns it on at start (`?debug=1` does not). BootScene launches it and it
 * runs for the whole game like UiScene, drawing nothing while off. It stays above every scene:
 * panels raise themselves when they open, so while it is on it re-raises itself in `update`
 * when it is not the top scene (a one-frame lag after a panel opens). The text is rebuilt
 * every `REFRESH_MS`; only `flagChanged` is subscribed, to remember the recent changes.
 */
export class DebugScene extends Phaser.Scene {
  private enabled = false;
  private background?: Phaser.GameObjects.Rectangle;
  private text?: Phaser.GameObjects.Text;
  private sinceRefreshMs = 0;
  /** `key=value` of the last changed flags, newest last. */
  private recentFlags: string[] = [];

  constructor() {
    super(SceneKey.Debug);
  }

  create(): void {
    this.background = this.add
      .rectangle(MARGIN, MARGIN, 0, 0, BACKGROUND.color, BACKGROUND.alpha)
      .setOrigin(0);
    this.text = createText(
      this,
      MARGIN + theme.labelPadding,
      MARGIN + theme.labelPadding,
      '',
      'small',
      {
        lineSpacing: theme.lineSpacing,
      },
    );

    const keyboard = this.input.keyboard;
    // F3 is "find next" in some browsers: capture it so the page keeps the key.
    keyboard?.addCapture('F3');
    keyboard?.on('keydown-F3', () => this.setEnabled(!this.enabled));

    const off = services.events.on('flagChanged', ({ key, value }) =>
      this.rememberFlag(key, value),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      off();
      this.background = undefined;
      this.text = undefined;
    });

    this.setEnabled(readOverlayParam());
  }

  update(_time: number, delta: number): void {
    if (!this.enabled) return;
    // Panels bring themselves to the top when they open; take the top back.
    const scenes = this.game.scene.scenes;
    if (scenes[scenes.length - 1] !== this) this.scene.bringToTop();
    this.sinceRefreshMs += delta;
    if (this.sinceRefreshMs >= REFRESH_MS) this.refresh();
  }

  /** Shows or hides the overlay (what F3 toggles). */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.background?.setVisible(enabled);
    this.text?.setVisible(enabled);
    if (enabled) this.refresh();
  }

  /** Whether the overlay is shown; overlays that keep the top (the alarm bar) stay under it. */
  get shown(): boolean {
    return this.enabled;
  }

  /** State for the smoke tool and the console: `game.scene.getScene('Debug').debugInfo()`. */
  debugInfo(): DebugOverlayInfo {
    return { enabled: this.enabled, text: this.enabled ? (this.text?.text ?? '') : '' };
  }

  private rememberFlag(key: string, value: FlagValue | undefined): void {
    let shown = value === undefined ? '(deleted)' : JSON.stringify(value);
    if (shown.length > MAX_VALUE_CHARS) shown = `${shown.slice(0, MAX_VALUE_CHARS - 1)}~`;
    this.recentFlags.push(`${key}=${shown}`);
    if (this.recentFlags.length > RECENT_FLAGS) this.recentFlags.shift();
  }

  private refresh(): void {
    this.sinceRefreshMs = 0;
    if (!this.text || !this.background) return;
    this.text.setText(this.lines().join('\n'));
    const pad = theme.labelPadding;
    this.background.setSize(
      Math.ceil(this.text.width) + pad * 2,
      Math.ceil(this.text.height) + pad * 2,
    );
  }

  private lines(): string[] {
    const { state, simulation, audio } = services;
    const current = state.current;
    const lines = [`FPS ${Math.round(this.game.loop.actualFps)}`];
    lines.push(current ? `loc ${current.locationId} @ ${current.spawn}` : 'loc -');

    const world = this.game.scene.getScene(SceneKey.World) as WorldScene;
    if (world.sys.isActive() || world.sys.isPaused()) {
      const { player, focused } = world.debugInfo();
      lines.push(`hero ${Math.round(player.x)},${Math.round(player.y)}`);
      lines.push(`focus ${focused ?? '-'}`);
    }

    lines.push(`act ${current?.actId ?? '-'}`);
    lines.push(`music ${audio.debugInfo().music ?? '-'}`);
    const snapshot = simulation.snapshot();
    if (snapshot) {
      const day = Math.floor(snapshot.timeS / DAY_S) + 1;
      lines.push(`T×${Math.round(snapshot.timeScale)} Day ${day}`);
      const holds = simulation.heldReasons;
      const warp = simulation.debugWarpFactor === 1 ? '' : ` warp×${simulation.debugWarpFactor}`;
      lines.push((holds.length > 0 ? `sim hold ${holds.join(',')}` : 'sim run') + warp);
    }

    const count = Object.keys(state.flags.toRecord()).length;
    // A new game or a return to the menu empties the flags: forget the previous run's list.
    if (count === 0) this.recentFlags.length = 0;
    lines.push(this.recentFlags.length > 0 ? `flags ${count}, last:` : `flags ${count}`);
    for (const flag of [...this.recentFlags].reverse()) lines.push(` ${flag}`);
    return lines;
  }
}
