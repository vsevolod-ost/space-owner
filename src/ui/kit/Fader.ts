import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '@/config';
import { theme } from '@/ui/theme';

/**
 * Full-screen colour layer (`theme.faderColor`) for fades: location changes, cutscenes, the end
 * of an act. Lives in `UiScene` above everything there, so the world, toasts and the hint fade
 * together. After `fadeOut` the screen stays covered until `fadeIn`.
 *
 * While it is visible at all (alpha above 0) it also takes every click and pointer move, so
 * scenes below UiScene - the menu under an act title, the world during a transition - cannot
 * react to what the player cannot see. At alpha 0 Phaser skips it and clicks pass through.
 *
 * ```ts
 * await ui.fader.fadeOut(250);
 * // ... change what is behind it ...
 * await ui.fader.fadeIn(250);
 * ```
 */
export class Fader extends Phaser.GameObjects.Rectangle {
  private tween?: Phaser.Tweens.Tween;
  private finishTween?: () => void;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, GAME_WIDTH, GAME_HEIGHT, theme.faderColor);
    this.setOrigin(0).setScrollFactor(0).setAlpha(0);
    scene.add.existing(this);
    // Phaser hit-tests only objects that render (alpha above 0); the top scene that gets a hit
    // keeps the pointer event from the scenes below (InputManager.globalTopOnly, on by default).
    this.setInteractive();
  }

  /** Covers the screen over `ms` milliseconds (0: at once). Resolves when fully covered. */
  fadeOut(ms: number): Promise<void> {
    return this.fadeTo(1, ms);
  }

  /** Uncovers the screen over `ms` milliseconds (0: at once). Resolves when fully clear. */
  fadeIn(ms: number): Promise<void> {
    return this.fadeTo(0, ms);
  }

  /** Whether the screen is fully covered. */
  isCovering(): boolean {
    return this.alpha >= 1;
  }

  /**
   * Tweens the alpha to `target`. A fade still running is cut short and its promise resolves,
   * so every awaiting script goes on.
   */
  private fadeTo(target: number, ms: number): Promise<void> {
    this.stopTween();
    if (ms <= 0 || this.alpha === target) {
      this.setAlpha(target);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.finishTween = resolve;
      this.tween = this.scene.tweens.add({
        targets: this,
        alpha: target,
        duration: ms,
        onComplete: () => {
          this.tween = undefined;
          this.finishTween = undefined;
          resolve();
        },
      });
    });
  }

  private stopTween(): void {
    this.tween?.stop();
    this.tween = undefined;
    const finish = this.finishTween;
    this.finishTween = undefined;
    finish?.();
  }
}
