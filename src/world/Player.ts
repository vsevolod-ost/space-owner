import type Phaser from 'phaser';
import type { Controls } from '@/core/input/controls';
import type { ActorCharacterId } from '@/content/characters';
import { Actor } from '@/world/Actor';

/**
 * The hero: an `Actor` driven by `Controls`. Eight directions, the diagonal normalised by
 * `Controls.getMoveVector`, speed from the character definition. While a `moveTo` runs
 * (cutscenes) the controls are ignored.
 */
export class Player extends Actor {
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly controls: Controls,
    characterId: ActorCharacterId = 'hero',
  ) {
    super(scene, x, y, characterId);
  }

  /** Reads the controls and sets velocity and animation; call from the scene's `update`. */
  steer(): void {
    if (this.isMoving()) return;
    const { x, y } = this.controls.getMoveVector();
    this.walk(x, y);
  }
}
