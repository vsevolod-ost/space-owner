import Phaser from 'phaser';
import { CUTSCENE_LOCK } from '@/core/cutscene/CutsceneService';
import { services } from '@/core/services';
import type { Controls } from '@/core/input/controls';
import type { Direction } from '@/content/characters';
import { locations } from '@/content/locations';
import type { LocationId } from '@/content/locations';
import { SceneKey } from '@/scenes/keys';
import type { PauseScene } from '@/scenes/PauseScene';
import type { UiScene } from '@/scenes/UiScene';
import { Actor } from '@/world/Actor';
import type { Point } from '@/world/Actor';
import { Interactables } from '@/world/Interactables';
import { KeyboardControls } from '@/world/KeyboardControls';
import { loadLocation } from '@/world/LocationLoader';
import type { LoadedLocation, MapObject } from '@/world/LocationLoader';
import { Player } from '@/world/Player';
import type { WorldContext } from '@/world/WorldContext';

/** Spawn used when none is given. Every map has a `spawn` object with this name. */
export const DEFAULT_SPAWN = 'spawn-default';

/** Data for `scene.start(SceneKey.World, data)`. */
export interface WorldSceneData {
  locationId: LocationId;
  /** Name of a `spawn` object; default `DEFAULT_SPAWN`. */
  spawn?: string;
}

/** What `WorldScene.debugInfo()` returns. */
export interface WorldDebugInfo {
  locationId: LocationId;
  spawn: string;
  /** Hero feet position in map pixels. */
  player: Point;
  /** Name of the object the hero would interact with (the "E" hint is over it), or null. */
  focused: string | null;
  /** Direction each NPC looks in, by the name of its map object. */
  npcs: Record<string, Direction>;
}

/**
 * A location with the hero walking in it: background, walls, NPCs, interactables, doors and
 * triggers, camera following. Keeps `UiScene` (launched by Boot) above itself. Locations change through
 * `services.flow.goTo`, which restarts this scene with new data.
 */
export class WorldScene extends Phaser.Scene {
  private locationId!: LocationId;
  private spawn = DEFAULT_SPAWN;
  private location!: LoadedLocation;
  private keyboard!: Controls;
  private player!: Player;
  private npcs = new Map<string, Actor>();
  private interactables!: Interactables;

  constructor() {
    super(SceneKey.World);
  }

  init(data: WorldSceneData): void {
    this.locationId = data.locationId;
    this.spawn = data.spawn ?? DEFAULT_SPAWN;
    this.npcs = new Map();
  }

  // Keep create synchronous: the smoke tool's ready signal fires when it returns.
  create(): void {
    const def = locations[this.locationId];
    this.location = loadLocation(this, this.locationId, def);
    const { objects, walls } = this.location;

    for (const [name, binding] of Object.entries(def.bindings)) {
      if (binding.kind !== 'npc') continue;
      const object = objects.find((candidate) => candidate.name === name);
      if (!object) continue; // reported by loadLocation
      const npc = new Actor(this, object.x, object.y, binding.character);
      npc.playIdle(binding.facing ?? 'down');
      npc.body.setImmovable(true);
      npc.body.pushable = false;
      this.npcs.set(name, npc);
    }

    this.keyboard = new KeyboardControls(this);
    // A cutscene's goTo restarts this scene: the new controls start locked like the old ones.
    if (services.cutscenes.isPlaying) this.keyboard.lock(CUTSCENE_LOCK);
    const start = this.findSpawn(objects);
    this.player = new Player(this, start.x, start.y, this.keyboard);
    this.physics.add.collider(this.player, walls);
    this.physics.add.collider(this.player, [...this.npcs.values()]);
    this.cameras.main.startFollow(this.player, true);

    // Boot launches the UI; this covers a World started some other way. `run` on a running
    // scene would restart it; the UI keeps running across locations.
    if (!this.scene.isActive(SceneKey.Ui)) this.scene.run(SceneKey.Ui);
    this.scene.bringToTop(SceneKey.Ui);

    this.interactables = new Interactables({
      locationId: this.locationId,
      objects,
      bindings: def.bindings,
      player: this.player,
      npcs: this.npcs,
      context: this.context(),
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.interactables.destroy());

    // The same track continues across locations that share it (the service does not restart
    // it); a location without music keeps whatever plays.
    if (def.music) services.audio.playMusic(def.music);

    // services.flow.goTo has set services.state.current before this scene started.
    services.events.emit('locationEntered', { locationId: this.locationId, spawn: this.spawn });
  }

  update(): void {
    // Esc pauses, unless the hero cannot act (cutscene, dialogue, transition, act title).
    if (this.keyboard.justPressed('cancel') && !this.keyboard.isLocked()) {
      void (this.scene.get(SceneKey.Pause) as PauseScene).open();
      return;
    }
    this.player.steer();
    this.interactables.update();
    // No "E" hint while the hero cannot act (cutscene, dialogue, transition).
    const anchor = this.keyboard.isLocked() ? null : this.interactables.focusAnchor();
    this.ui.placeHint(this.toScreen(anchor));
  }

  /** The world's input; lock it to stop the hero (dialogue, cutscene, transition). */
  get controls(): Controls {
    return this.keyboard;
  }

  /** The UI scene above the world (hint, toasts, dialogue). */
  get ui(): UiScene {
    return this.scene.get(SceneKey.Ui) as UiScene;
  }

  /** The hero. */
  get hero(): Player {
    return this.player;
  }

  /**
   * The hero (`'player'`) or the NPC standing at `npc` object `id`, or undefined - also once
   * this scene has stopped and its actors are destroyed.
   */
  actor(id: string): Actor | undefined {
    const actor = id === 'player' ? this.player : this.npcs.get(id);
    return actor && !actor.isDestroyed ? actor : undefined;
  }

  /** Position of the `spawn` or `point` object named `name` in this location's map. */
  pointOf(name: string): Point | undefined {
    const object = this.location.objects.find(
      (candidate) =>
        candidate.name === name && (candidate.kind === 'spawn' || candidate.kind === 'point'),
    );
    return object ? { x: object.x, y: object.y } : undefined;
  }

  /** Context for interactable and trigger scripts of this location. */
  context(): WorldContext {
    return {
      scene: this,
      state: services.state,
      ui: this.ui,
      controls: this.keyboard,
      cutscenes: services.cutscenes,
      flow: services.flow,
    };
  }

  /** State for the smoke tool and the console: `window.nasa.game.scene.getScene('World')`. */
  debugInfo(): WorldDebugInfo {
    return {
      locationId: this.locationId,
      spawn: this.spawn,
      player: this.player ? { x: this.player.x, y: this.player.y } : { x: NaN, y: NaN },
      focused: this.interactables?.focused ?? null,
      npcs: Object.fromEntries([...this.npcs].map(([name, npc]) => [name, npc.facing])),
    };
  }

  /** Puts the hero's feet at map pixel (x, y), for the smoke tool and the console. */
  debugTeleport(x: number, y: number): void {
    this.player.placeAt({ x, y });
  }

  /** Map point to screen point through the main camera (no rotation). */
  private toScreen(point: Point | null): Point | null {
    if (!point) return null;
    const camera = this.cameras.main;
    return {
      x: camera.x + (point.x - camera.worldView.x) * camera.zoom,
      y: camera.y + (point.y - camera.worldView.y) * camera.zoom,
    };
  }

  /** The requested spawn point; falls back to the first spawn, then the map centre. */
  private findSpawn(objects: MapObject[]): Point {
    const spawns = objects.filter((object) => object.kind === 'spawn');
    const wanted = spawns.find((object) => object.name === this.spawn);
    if (wanted) return wanted;
    const fallback = spawns[0];
    console.warn(
      `Location "${this.locationId}" has no spawn "${this.spawn}"; ` +
        (fallback ? `using "${fallback.name}"` : 'using the map centre'),
    );
    if (fallback) {
      this.spawn = fallback.name;
      return fallback;
    }
    return { x: this.location.width / 2, y: this.location.height / 2 };
  }
}
