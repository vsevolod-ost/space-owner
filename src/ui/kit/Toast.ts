import type Phaser from 'phaser';
import { Label } from '@/ui/kit/Label';
import { theme } from '@/ui/theme';

/**
 * A short message on a panel that hides itself after a while. `(x, y)` is the bottom centre.
 * A new `show` replaces the message on screen and restarts the timer.
 *
 * ```ts
 * const toast = new Toast(this, GAME_WIDTH / 2, GAME_HEIGHT - 16, GAME_WIDTH - 64);
 * toast.show('A dusty terminal.');
 * ```
 */
export class Toast extends Label {
  private timer?: Phaser.Time.TimerEvent;

  /** `wrapWidth`: longer messages wrap to several lines at this width, px. */
  constructor(scene: Phaser.Scene, x: number, y: number, wrapWidth: number) {
    super(scene, x, y, '', { originX: 0.5, originY: 1, wrapWidth });
    this.setVisible(false);
  }

  /** The message on screen, or null when hidden. */
  get message(): string | null {
    return this.visible ? this.text : null;
  }

  /** Shows `text` for `ms` milliseconds (default `theme.toastMs`). */
  show(text: string, ms: number = theme.toastMs): this {
    this.setText(text).setVisible(true);
    this.timer?.remove();
    this.timer = this.scene.time.delayedCall(ms, () => this.hide());
    return this;
  }

  /** Hides the toast at once. */
  hide(): this {
    this.timer?.remove();
    this.timer = undefined;
    return this.setVisible(false);
  }
}
