import Phaser from 'phaser';
import { GAMEPLAY_ACTIONS, KEY_BINDINGS, moveVector } from '@/core/input/controls';
import type { Action, Controls, Vector2 } from '@/core/input/controls';

/**
 * `Controls` on the keyboard of one scene (keys from `KEY_BINDINGS`). Presses are collected
 * from key events, so a tap shorter than a frame is not lost, and handed out for one frame at
 * the scene's PRE_UPDATE. Removes its keys when the scene shuts down.
 */
export class KeyboardControls implements Controls {
  private readonly keys = new Map<Action, Phaser.Input.Keyboard.Key[]>();
  /** Presses since the last frame started. */
  private pending = new Set<Action>();
  /** Presses visible to `justPressed` during the current frame. */
  private pressed = new Set<Action>();
  private readonly locks = new Set<string>();

  constructor(private readonly scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error('KeyboardControls: the keyboard plugin is disabled');

    for (const [action, codes] of Object.entries(KEY_BINDINGS) as [Action, readonly string[]][]) {
      const keys = codes.map((code) => {
        const key = keyboard.addKey(code);
        key.on(Phaser.Input.Keyboard.Events.DOWN, () => this.pending.add(action));
        return key;
      });
      this.keys.set(action, keys);
    }

    scene.events.on(Phaser.Scenes.Events.PRE_UPDATE, this.nextFrame, this);
    // Presses made while the scene is paused (panels, dialogue) must not fire on resume.
    scene.events.on(Phaser.Scenes.Events.PAUSE, this.dropPresses, this);
    scene.events.on(Phaser.Scenes.Events.RESUME, this.dropPresses, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  isDown(action: Action): boolean {
    if (this.blocked(action)) return false;
    return this.keys.get(action)?.some((key) => key.isDown) ?? false;
  }

  justPressed(action: Action): boolean {
    return !this.blocked(action) && this.pressed.has(action);
  }

  getMoveVector(): Vector2 {
    return moveVector(
      this.isDown('moveUp'),
      this.isDown('moveDown'),
      this.isDown('moveLeft'),
      this.isDown('moveRight'),
    );
  }

  lock(reason: string): void {
    this.locks.add(reason);
  }

  unlock(reason: string): void {
    this.locks.delete(reason);
  }

  isLocked(): boolean {
    return this.locks.size > 0;
  }

  private blocked(action: Action): boolean {
    return this.locks.size > 0 && GAMEPLAY_ACTIONS.has(action);
  }

  private nextFrame(): void {
    this.pressed = this.pending;
    this.pending = new Set();
  }

  private dropPresses(): void {
    this.pending.clear();
    this.pressed.clear();
  }

  private destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.PRE_UPDATE, this.nextFrame, this);
    this.scene.events.off(Phaser.Scenes.Events.PAUSE, this.dropPresses, this);
    this.scene.events.off(Phaser.Scenes.Events.RESUME, this.dropPresses, this);
    for (const keys of this.keys.values()) {
      for (const key of keys) this.scene.input.keyboard?.removeKey(key, true);
    }
    this.keys.clear();
  }
}
