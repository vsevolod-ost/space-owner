import Phaser from 'phaser';
import { spritesheets } from '@/assets';
import { animationKey, characters } from '@/content/characters';
import type { ActorCharacterId, ActorDef, Direction } from '@/content/characters';

/** Size of the physics body at the feet; the rest of the sprite overlaps walls freely. */
const FEET_WIDTH = 20;
const FEET_HEIGHT = 12;
/** `moveTo` gives up when the actor moved less than this many pixels over STUCK_MS. */
const STUCK_DISTANCE = 1;
const STUCK_MS = 500;

/** A point in map pixels. */
export interface Point {
  x: number;
  y: number;
}

interface MoveOrder {
  target: Point;
  resolve: (arrived: boolean) => void;
  checkpoint: Point;
  checkpointAge: number;
}

/**
 * A character in the world: an Arcade sprite whose position is its feet (origin at the bottom
 * centre), with a small physics body there. Plays the idle and walk animations BootScene made
 * for its character and keeps its depth equal to its y, so lower actors draw in front.
 */
export class Actor extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;

  /** Character registry entry. */
  readonly def: ActorDef;
  /** Direction the actor looks in; idle and walk animations use it. */
  facing: Direction = 'down';

  private move: MoveOrder | null = null;
  private walking = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly characterId: ActorCharacterId,
  ) {
    const def: ActorDef = characters[characterId];
    super(scene, x, y, def.spritesheet);
    this.def = def;
    scene.add.existing(this);
    scene.physics.add.existing(this);

    const { frameWidth, frameHeight } = spritesheets[def.spritesheet];
    this.setOrigin(0.5, 1);
    this.body.setSize(FEET_WIDTH, FEET_HEIGHT, false);
    this.body.setOffset((frameWidth - FEET_WIDTH) / 2, frameHeight - FEET_HEIGHT);
    this.body.setCollideWorldBounds(true);
    this.playIdle();
    this.setDepth(y);
    // A walk in progress ends (resolves false) when the actor goes with its scene.
    this.once(Phaser.GameObjects.Events.DESTROY, () => this.finishMove(false));
  }

  /** Turns to a direction, keeping the current animation kind (walk or idle). */
  faceDirection(direction: Direction): this {
    if (this.isDestroyed) return this;
    return this.walking ? this.playWalk(direction) : this.playIdle(direction);
  }

  /** Turns to look at `point` (map pixels): the dominant axis of the offset wins. */
  faceTowards(point: Point): this {
    const dx = point.x - this.x;
    const dy = point.y - this.y;
    if (dx === 0 && dy === 0) return this;
    return this.faceDirection(directionOf(dx, dy, this.facing));
  }

  /** Plays the walk cycle facing `direction` (default: current facing). */
  playWalk(direction: Direction = this.facing): this {
    this.facing = direction;
    this.walking = true;
    this.play(animationKey(this.characterId, 'walk', direction), true);
    return this;
  }

  /** Shows the standing frame facing `direction` (default: current facing). */
  playIdle(direction: Direction = this.facing): this {
    this.facing = direction;
    this.walking = false;
    this.play(animationKey(this.characterId, 'idle', direction), true);
    return this;
  }

  /** Whether a `moveTo` is in progress. */
  isMoving(): boolean {
    return this.move !== null;
  }

  /**
   * Walks in a straight line to `point` (feet position) at the character's speed. Resolves
   * true on arrival, false when blocked (no progress for half a second) or interrupted by
   * another `moveTo` or `stopMoving`, or when the actor is destroyed (its location was left);
   * on a destroyed actor it resolves false at once. Collisions still apply. Used by cutscenes.
   */
  moveTo(point: Point): Promise<boolean> {
    if (this.isDestroyed) return Promise.resolve(false);
    this.finishMove(false);
    return new Promise((resolve) => {
      this.move = {
        target: { ...point },
        resolve,
        checkpoint: { x: this.x, y: this.y },
        checkpointAge: 0,
      };
    });
  }

  /** Cancels a `moveTo` (its promise resolves false) and stands still. */
  stopMoving(): void {
    this.finishMove(false);
  }

  /** Places the feet at a point at once, with no velocity left over. */
  placeAt(point: Point): void {
    if (this.isDestroyed) return;
    this.body.reset(point.x, point.y);
    this.setDepth(point.y);
  }

  /** Sets velocity from a direction vector of length 0..1 and animates accordingly. */
  protected walk(vx: number, vy: number): void {
    this.body.setVelocity(vx * this.def.speed, vy * this.def.speed);
    if (vx === 0 && vy === 0) {
      this.playIdle();
      return;
    }
    this.playWalk(directionOf(vx, vy, this.facing));
  }

  protected preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    if (this.move) this.stepMove(delta);
    this.setDepth(this.y);
  }

  private stepMove(delta: number): void {
    const move = this.move;
    if (!move) return;
    const dx = move.target.x - this.x;
    const dy = move.target.y - this.y;
    const distance = Math.hypot(dx, dy);
    // Arrive when the next physics step would overshoot.
    if (distance <= (this.def.speed * delta) / 1000) {
      this.placeAt(move.target);
      this.finishMove(true);
      return;
    }
    move.checkpointAge += delta;
    if (move.checkpointAge >= STUCK_MS) {
      const progress = Math.hypot(this.x - move.checkpoint.x, this.y - move.checkpoint.y);
      if (progress < STUCK_DISTANCE) {
        this.finishMove(false);
        return;
      }
      move.checkpoint = { x: this.x, y: this.y };
      move.checkpointAge = 0;
    }
    this.walk(dx / distance, dy / distance);
  }

  private finishMove(arrived: boolean): void {
    const move = this.move;
    if (!move) return;
    this.move = null;
    if (!this.isDestroyed) this.walk(0, 0);
    move.resolve(arrived);
  }
}

/**
 * Facing for a movement direction: the dominant axis wins; on an exact diagonal the current
 * facing is kept if it is one of the two directions, else the horizontal one is used.
 */
function directionOf(vx: number, vy: number, current: Direction): Direction {
  const horizontal: Direction = vx < 0 ? 'left' : 'right';
  const vertical: Direction = vy < 0 ? 'up' : 'down';
  if (vy === 0 || Math.abs(vx) > Math.abs(vy)) return horizontal;
  if (vx === 0 || Math.abs(vy) > Math.abs(vx)) return vertical;
  return current === horizontal || current === vertical ? current : horizontal;
}
