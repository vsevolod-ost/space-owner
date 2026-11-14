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
import { HoldStrip } from '@/ui/HoldStrip';
import type { HoldStripInfo } from '@/ui/HoldStrip';
import { Actor } from '@/world/Actor';
import type { Point } from '@/world/Actor';
import { Interactables } from '@/world/Interactables';
import { KeyboardControls } from '@/world/KeyboardControls';
import { bindingsOf } from '@/world/bindings';
import { loadLocation } from '@/world/LocationLoader';
import type { LoadedLocation, MapObject } from '@/world/LocationLoader';
import { Player } from '@/world/Player';
import { isPresent } from '@/world/presence';
import { Props } from '@/world/Props';
import type { PropsDebugInfo } from '@/world/Props';
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
  /** Direction each NPC looks in, by the name of its map object (those standing there now). */
  npcs: Record<string, Direction>;
  /** Drawn props and background tints (see `Props.debugInfo`). */
  props: PropsDebugInfo;
  /** How many times the objects were rebuilt after flags changed since the scene started. */
  rebuilds: number;
  /** Whether a flag changed and the rebuild waits for a dialogue or cutscene to end. */
  rebuildPending: boolean;
  /** The HOLD strip (locations with `showHold`), or null. */
  hold: HoldStripInfo | null;
}

/**
 * A location with the hero walking in it: background, walls, NPCs, props, interactables, doors
 * and triggers, camera following. Keeps `UiScene` (launched by Boot) above itself. Locations
 * change through `services.flow.goTo`, which restarts this scene with new data. Objects with a
 * `when` (and props, background tints) follow the flags: a `flagChanged` marks the location for
 * a rebuild, done on the next frame with no dialogue or cutscene running.
 */
export class WorldScene extends Phaser.Scene {
  private locationId!: LocationId;
  private spawn = DEFAULT_SPAWN;
  private location!: LoadedLocation;
  private keyboard!: Controls;
  private player!: Player;
  private npcs = new Map<string, Actor>();
  /** Colliders between the hero and each NPC, removed with the NPC. */
  private npcColliders = new Map<string, Phaser.Physics.Arcade.Collider>();
  private interactables!: Interactables;
  private props!: Props;
  private holdStrip?: HoldStrip;
  /** A flag changed since the last rebuild. */
  private dirty = false;
  private rebuilds = 0;

  constructor() {
    super(SceneKey.World);
  }

  init(data: WorldSceneData): void {
    this.locationId = data.locationId;
    this.spawn = data.spawn ?? DEFAULT_SPAWN;
    this.npcs = new Map();
    this.npcColliders = new Map();
    this.dirty = false;
    this.rebuilds = 0;
    this.holdStrip = undefined;
  }

  // Keep create synchronous: the smoke tool's ready signal fires when it returns.
  create(): void {
    const def = locations[this.locationId];
    this.location = loadLocation(this, this.locationId, def);
    const { objects, walls } = this.location;

    this.keyboard = new KeyboardControls(this);
    // A cutscene's goTo restarts this scene: the new controls start locked like the old ones.
    if (services.cutscenes.isPlaying) this.keyboard.lock(CUTSCENE_LOCK);
    const start = this.findSpawn(objects);
    this.player = new Player(this, start.x, start.y, this.keyboard);
    this.physics.add.collider(this.player, walls);
    this.syncNpcs();
    this.cameras.main.startFollow(this.player, true);

    this.props = new Props(this, {
      objects,
      bindings: bindingsOf(def),
      background: this.location.background,
    });
    this.props.refresh(services.state);
    if (def.showHold) {
      this.holdStrip = new HoldStrip(this, services.voyage).refresh(services.state.flags);
    }

    // Boot launches the UI; this covers a World started some other way. `run` on a running
    // scene would restart it; the UI keeps running across locations.
    if (!this.scene.isActive(SceneKey.Ui)) this.scene.run(SceneKey.Ui);
    this.scene.bringToTop(SceneKey.Ui);

    this.interactables = new Interactables({
      locationId: this.locationId,
      objects,
      bindings: bindingsOf(def),
      player: this.player,
      npcs: this.npcs,
      context: this.context(),
    });
    const offFlags = services.events.on('flagChanged', () => {
      this.dirty = true;
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offFlags();
      this.interactables.destroy();
      this.props.clear();
    });

    // The same track continues across locations that share it (the service does not restart
    // it); a location without music keeps whatever plays.
    if (def.music) services.audio.playMusic(def.music);

    // services.flow.goTo has set services.state.current before this scene started.
    services.events.emit('locationEntered', { locationId: this.locationId, spawn: this.spawn });
  }

  update(): void {
    if (this.dirty && !this.ui.isDialogueOpen && !services.cutscenes.isPlaying) this.rebuild();
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

  /**
   * Re-reads every `when`, prop and background tint from the flags now: NPCs appear or go,
   * interactables and doors come and go, props are redrawn. `update` calls it after a flag
   * changed, once no dialogue or cutscene runs (the world must not change under a scene that
   * holds its actors, or behind a line that talks about it).
   */
  rebuild(): void {
    this.dirty = false;
    this.rebuilds += 1;
    this.syncNpcs();
    this.interactables.refresh();
    this.props.refresh(services.state);
    this.holdStrip?.refresh(services.state.flags);
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

  /** Position of the `npc` object named `name` in this location's map (its home). */
  npcHomeOf(name: string): Point | undefined {
    const object = this.location.objects.find(
      (candidate) => candidate.name === name && candidate.kind === 'npc',
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
      voyage: services.voyage,
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
      props: this.props?.debugInfo() ?? { props: {}, background: {} },
      rebuilds: this.rebuilds,
      rebuildPending: this.dirty,
      hold: this.holdStrip?.debugInfo() ?? null,
    };
  }

  /** Puts the hero's feet at map pixel (x, y), for the smoke tool and the console. */
  debugTeleport(x: number, y: number): void {
    this.player.placeAt({ x, y });
  }

  /** Puts up the NPCs whose `when` holds and removes those whose `when` no longer does. */
  private syncNpcs(): void {
    const def = locations[this.locationId];
    for (const [name, binding] of Object.entries(bindingsOf(def))) {
      if (binding.kind !== 'npc') continue;
      const object = this.location.objects.find((candidate) => candidate.name === name);
      if (!object) continue; // reported by loadLocation
      const present = isPresent(binding, services.state);
      const npc = this.npcs.get(name);
      if (present && !npc) {
        const actor = new Actor(this, object.x, object.y, binding.character);
        actor.playIdle(binding.facing ?? 'down');
        actor.body.setImmovable(true);
        actor.body.pushable = false;
        this.npcs.set(name, actor);
        this.npcColliders.set(name, this.physics.add.collider(this.player, actor));
      } else if (!present && npc) {
        this.npcColliders.get(name)?.destroy();
        this.npcColliders.delete(name);
        npc.destroy();
        this.npcs.delete(name);
      }
    }
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
