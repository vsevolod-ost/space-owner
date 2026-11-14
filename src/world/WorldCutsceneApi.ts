import Phaser from 'phaser';
import type { AudioKey } from '@/assets';
import type { Direction } from '@/content/characters';
import type { DialogueId } from '@/content/dialogues';
import type { LocationId } from '@/content/locations';
import type { CancelToken } from '@/core/cutscene/cancel';
import { CUTSCENE_LOCK } from '@/core/cutscene/CutsceneService';
import type { CutsceneStage } from '@/core/cutscene/CutsceneService';
import type { ActorId, CutsceneApi, Place } from '@/core/cutscene/types';
import type { Speaker } from '@/core/dialogue/types';
import { services } from '@/core/services';
import type { FlagValue } from '@/core/state/GameState';
import { SceneKey } from '@/scenes/keys';
import type { UiScene } from '@/scenes/UiScene';
import type { WorldScene } from '@/scenes/WorldScene';
import type { Actor, Point } from '@/world/Actor';

/** Gap left between two actors when one walks up to the other, px. */
const BESIDE_GAP = 4;
/** Ease of `cameraPanTo`. */
const PAN_EASE = 'Sine.easeInOut';

const DIRECTIONS: ReadonlySet<string> = new Set<Direction>(['down', 'left', 'right', 'up']);

/**
 * `CutsceneStage` on Phaser scenes: `CutsceneService` calls it around every cutscene. Attached
 * in main.ts with `services.cutscenes.attach(new WorldCutsceneStage(game), cutscenes)`.
 */
export class WorldCutsceneStage implements CutsceneStage {
  constructor(private readonly game: Phaser.Game) {}

  /** A `WorldCutsceneApi` on the live World scene, stopped by `token`. */
  createApi(token: CancelToken): CutsceneApi {
    return new WorldCutsceneApi(this.game, token);
  }

  /** Locks the world's controls with reason `cutscene` (doors and triggers go quiet too). */
  begin(): void {
    const world = liveWorld(this.game);
    if (!world) {
      console.warn('Cutscene started with no World scene running: input is not locked');
      return;
    }
    world.controls.lock(CUTSCENE_LOCK);
  }

  /** Unlocks the controls and gives the camera back to the hero, whatever the script left. */
  end(): void {
    const world = liveWorld(this.game);
    if (!world) return;
    world.controls.unlock(CUTSCENE_LOCK);
    const camera = world.cameras.main;
    camera.panEffect.reset();
    camera.startFollow(world.hero, true);
  }
}

/**
 * `CutsceneApi` on the running `WorldScene` and `UiScene`. It looks the World
 * scene up on every call, so after `goTo` (which restarts that scene) the next steps act in the
 * new location. Unknown actors and places warn and skip the step.
 *
 * Every step first checks the cancel token; steps that take time are raced against it. After
 * `services.cutscenes.cancel()` each step rejects with `CutsceneCancelled`, so the script
 * stops at once, whatever scene the step was waiting on.
 */
export class WorldCutsceneApi implements CutsceneApi {
  constructor(
    private readonly game: Phaser.Game,
    private readonly token: CancelToken,
  ) {}

  walk(actor: ActorId, to: Place): Promise<void> {
    return this.step(() => this.walkNow(actor, to));
  }

  private async walkNow(actor: ActorId, to: Place): Promise<void> {
    const mover = this.findActor(actor, 'walk');
    if (!mover) return;
    const target = typeof to === 'string' ? this.world.actor(to) : undefined;
    const point = target ? beside(target, mover) : this.findPlace(to, 'walk');
    if (!point) return;
    const arrived = await this.token.race(mover.moveTo(point));
    if (!arrived && mover.active) {
      console.warn(`cutscene walk: "${actor}" was blocked on the way to ${describe(to)}`);
    }
    if (target?.active && mover.active) mover.faceTowards(target);
  }

  face(actor: ActorId, to: Direction | Place): void {
    this.token.throwIfCancelled();
    const turner = this.findActor(actor, 'face');
    if (!turner) return;
    if (typeof to === 'string' && DIRECTIONS.has(to)) {
      turner.faceDirection(to as Direction);
      return;
    }
    const point = this.findPlace(to, 'face');
    if (point) turner.faceTowards(point);
  }

  say(speaker: Speaker, text: string): Promise<void> {
    return this.step(() => this.ui.say(speaker, text, { controls: this.world.controls }));
  }

  dialogue(id: DialogueId): Promise<void> {
    return this.step(() => this.ui.openDialogue(id, { controls: this.world.controls }));
  }

  wait(ms: number): Promise<void> {
    return this.step(() => this.waitNow(ms));
  }

  private waitNow(ms: number): Promise<void> {
    const world = this.world;
    if (ms <= 0) return Promise.resolve();
    // Scene time, not setTimeout: it stops while the world is paused (panels).
    return new Promise((resolve) => {
      const done = () => {
        world.events.off(Phaser.Scenes.Events.SHUTDOWN, done);
        timer.remove();
        resolve();
      };
      const timer = world.time.delayedCall(ms, done);
      world.events.once(Phaser.Scenes.Events.SHUTDOWN, done);
    });
  }

  fadeOut(ms: number): Promise<void> {
    return this.step(async () => {
      await this.ui.whenReady();
      this.token.throwIfCancelled();
      await this.ui.fader.fadeOut(ms);
    });
  }

  fadeIn(ms: number): Promise<void> {
    return this.step(async () => {
      await this.ui.whenReady();
      this.token.throwIfCancelled();
      await this.ui.fader.fadeIn(ms);
    });
  }

  cameraPanTo(to: Place, ms: number): Promise<void> {
    return this.step(() => this.cameraPanNow(to, ms));
  }

  private cameraPanNow(to: Place, ms: number): Promise<void> {
    const world = this.world;
    const point = this.findPlace(to, 'cameraPanTo');
    if (!point) return Promise.resolve();
    const camera = world.cameras.main;
    camera.stopFollow();
    if (ms <= 0) {
      camera.centerOn(point.x, point.y);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const done = () => {
        camera.off(Phaser.Cameras.Scene2D.Events.PAN_COMPLETE, done);
        world.events.off(Phaser.Scenes.Events.SHUTDOWN, done);
        resolve();
      };
      camera.once(Phaser.Cameras.Scene2D.Events.PAN_COMPLETE, done);
      world.events.once(Phaser.Scenes.Events.SHUTDOWN, done);
      camera.pan(point.x, point.y, ms, PAN_EASE, true);
    });
  }

  cameraFollowPlayer(): void {
    this.token.throwIfCancelled();
    const world = this.world;
    world.cameras.main.panEffect.reset();
    world.cameras.main.startFollow(world.hero, true);
  }

  setFlag(name: string, value: FlagValue): void {
    this.token.throwIfCancelled();
    services.state.flags.set(name, value);
  }

  playSfx(key: AudioKey): void {
    this.token.throwIfCancelled();
    services.audio.playSfx(key);
  }

  teleport(actor: ActorId, to: Place): void {
    this.token.throwIfCancelled();
    const moved = this.findActor(actor, 'teleport');
    const point = this.findPlace(to, 'teleport');
    if (!moved || !point) return;
    moved.stopMoving();
    moved.placeAt(point);
  }

  goTo(location: LocationId, spawn: string): Promise<void> {
    return this.step(() => services.flow.goTo(location, spawn));
  }

  showTitle(text: string, ms: number): Promise<void> {
    return this.step(() => this.ui.showTitle(text, ms));
  }

  /**
   * Runs one step that takes time: rejects with `CutsceneCancelled` if the cutscene is
   * cancelled before it starts or while it runs.
   */
  private step(start: () => Promise<void>): Promise<void> {
    try {
      this.token.throwIfCancelled();
      return this.token.race(start());
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /** The World scene; the same object across location changes (Phaser restarts it). */
  private get world(): WorldScene {
    return this.game.scene.getScene(SceneKey.World) as WorldScene;
  }

  private get ui(): UiScene {
    return this.game.scene.getScene(SceneKey.Ui) as UiScene;
  }

  private findActor(id: ActorId, step: string): Actor | undefined {
    const actor = this.world.actor(id);
    if (!actor) console.warn(`cutscene ${step}: no actor "${id}" in this location`);
    return actor;
  }

  /** Map pixels of a place (rounded), or null with a warning. */
  private findPlace(place: Place, step: string): Point | null {
    if (typeof place !== 'string') return rounded(place);
    const actor = this.world.actor(place);
    if (actor) return rounded(actor);
    const point = this.world.pointOf(place);
    if (point) return rounded(point);
    console.warn(`cutscene ${step}: no actor, spawn or point "${place}" in this location`);
    return null;
  }
}

/** The World scene if it is running or paused (created), else undefined. */
function liveWorld(game: Phaser.Game): WorldScene | undefined {
  const world = game.scene.getScene(SceneKey.World) as WorldScene | null;
  if (!world || !(world.sys.isActive() || world.sys.isPaused())) return undefined;
  return world;
}

/**
 * Where `mover` stops to stand next to `target`: level with it, on the left or right side it
 * comes from, the sprites side by side (bodies at least `BESIDE_GAP` apart). Side by side reads
 * as a conversation; one above the other would hide the actor behind. Walking onto the target
 * itself would push the hero away (NPCs are immovable).
 */
function beside(target: Actor, mover: Actor): Point {
  const side = mover.x < target.x ? -1 : 1;
  const offset = Math.max(
    (target.body.width + mover.body.width) / 2 + BESIDE_GAP,
    (target.displayWidth + mover.displayWidth) / 2,
  );
  return rounded({ x: target.x + side * offset, y: target.y });
}

function rounded(point: Point): Point {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

function describe(place: Place): string {
  return typeof place === 'string' ? `"${place}"` : `(${place.x}, ${place.y})`;
}
