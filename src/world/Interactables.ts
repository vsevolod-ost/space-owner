import Phaser from 'phaser';
import { services } from '@/core/services';
import { characters } from '@/content/characters';
import { TODO, tr, type LocalText } from '@/core/locale/text';
import { formatText } from '@/core/text/format';
import type { DialogueId } from '@/content/dialogues';
import type { LocationId } from '@/content/locations';
import type {
  Binding,
  DoorBinding,
  InteractableBinding,
  NpcBinding,
  TriggerBinding,
  WorldScript,
} from '@/content/locations/types';
import type { Actor, Point } from '@/world/Actor';
import type { MapObject } from '@/world/LocationLoader';
import type { Player } from '@/world/Player';
import { isPresent } from '@/world/presence';
import type { WorldContext } from '@/world/WorldContext';

/** The toast at an NPC without a dialogue: `{name}` the character's name. OWNER: script */
const NOTHING_TO_SAY: LocalText = { en: '{name} has nothing to say yet.', uk: TODO };
/**
 * How close the hero's feet must be to an interactable or an NPC to focus it, px: measured to
 * the nearest point of the object's rectangle (a point object: to the point; an NPC: to its
 * feet body, which the hero cannot walk into).
 */
export const INTERACT_RADIUS = 20;

/** A map object paired with its binding, narrowed by kind. */
interface Bound<B extends Binding> {
  object: MapObject;
  binding: B;
}

/** What `Interactables` needs from the world scene. */
export interface InteractablesOptions {
  locationId: LocationId;
  objects: readonly MapObject[];
  bindings: Readonly<Record<string, Binding>>;
  player: Player;
  /** NPC actors by the name of their map object (only those standing there now). */
  npcs: ReadonlyMap<string, Actor>;
  /** Context handed to interactable and trigger scripts. */
  context: WorldContext;
}

/**
 * Everything in a location the hero can use or walk into: interactables and NPCs (focus by
 * distance, E runs them), doors (walking in changes the location), triggers (walking in runs a
 * script). Built from the map objects and the location's bindings; `update()` runs every frame.
 * Objects whose `when` is false are left out; `refresh()` re-reads them after flags change.
 * Emits `interactableFocused` when the focused object changes.
 */
export class Interactables {
  /** Every bound object this class handles, present or not. */
  private readonly all: Bound<InteractableBinding | NpcBinding | DoorBinding | TriggerBinding>[] =
    [];
  private usable: Bound<InteractableBinding | NpcBinding>[] = [];
  private doors: Bound<DoorBinding>[] = [];
  private triggers: Bound<TriggerBinding>[] = [];
  /** Doors and triggers the hero's feet overlap now; they act on entering, not on staying. */
  private readonly inside = new Set<string>();
  private focusedName: string | null = null;

  constructor(private readonly options: InteractablesOptions) {
    for (const object of options.objects) {
      const binding = options.bindings[object.name];
      if (!binding || binding.kind !== object.kind) continue; // reported by loadLocation
      if (binding.kind === 'prop') continue; // drawn by Props
      this.all.push({ object, binding });
    }
    this.refresh();
  }

  /**
   * Re-reads which objects are there (`when`); call after flags change and the NPC actors are
   * in step. A door that appears under the hero's feet does not fire until he walks out and
   * back in. Triggers are not pre-filled on arrival: one under a spawn fires.
   */
  refresh(): void {
    const { state } = this.options.context;
    const doors = new Set(this.doors.map(({ object }) => object.name));
    this.usable = [];
    this.doors = [];
    this.triggers = [];
    for (const bound of this.all) {
      const { object, binding } = bound;
      if (!isPresent(binding, state)) {
        this.inside.delete(object.name);
        continue;
      }
      if (binding.kind === 'door') {
        this.doors.push({ object, binding });
        // Arriving on a spawn inside a door must not send the hero straight back.
        if (!doors.has(object.name) && this.touches(object)) this.inside.add(object.name);
      } else if (binding.kind === 'trigger') this.triggers.push({ object, binding });
      else if (binding.kind === 'interactable') this.usable.push({ object, binding });
      else if (this.options.npcs.has(object.name)) this.usable.push({ object, binding });
    }
    if (this.focusedName && !this.usable.some(({ object }) => object.name === this.focusedName)) {
      this.setFocus(null);
    }
  }

  /** Name of the object the hero would interact with, or null. */
  get focused(): string | null {
    return this.focusedName;
  }

  /** Updates the focus, runs the focused object on E, and checks doors and triggers. */
  update(): void {
    this.updateFocus();
    if (this.focusedName && this.options.context.controls.justPressed('interact')) {
      this.interact(this.focusedName);
    }
    // While the hero's input is locked (cutscene, dialogue, transition) doors and triggers
    // still track what the feet overlap but do not fire: a scripted walk across a door must
    // not leave the location. Walking out and back in fires them as usual.
    const quiet = this.options.context.controls.isLocked();
    for (const door of this.doors) {
      if (this.entered(door.object) && !quiet) {
        const binding = door.binding;
        // The door sound belongs to the door, not to flow.goTo: scripted moves (cutscenes,
        // acts, Continue) go through goTo too and must stay silent.
        services.audio.playSfx('sfx-door');
        // FlowService ignores a second goTo while the transition runs; startAct locks the
        // controls during its title, so the door cannot fire twice either.
        if ('act' in binding) void services.flow.startAct(binding.act);
        else void services.flow.goTo(binding.to, binding.spawn);
      }
    }
    for (const trigger of this.triggers) {
      if (this.entered(trigger.object) && !quiet) this.fire(trigger);
    }
  }

  /**
   * Top centre of the focused object in map pixels (where the "E" hint goes), or null when
   * nothing is focused.
   */
  focusAnchor(): Point | null {
    const target = this.usable.find(({ object }) => object.name === this.focusedName);
    if (!target) return null;
    const npc = this.options.npcs.get(target.object.name);
    if (npc) return { x: npc.x, y: npc.y - npc.displayHeight };
    const { x, y, width } = target.object;
    return { x: x + width / 2, y };
  }

  /** Clears the focus (hides the hint); call when the scene shuts down. */
  destroy(): void {
    this.setFocus(null);
  }

  private updateFocus(): void {
    const feet = { x: this.options.player.x, y: this.options.player.y };
    let best: string | null = null;
    let bestDistance = INTERACT_RADIUS;
    for (const { object } of this.usable) {
      const distance = distanceToRect(feet, this.targetRect(object));
      if (distance <= bestDistance) {
        best = object.name;
        bestDistance = distance;
      }
    }
    this.setFocus(best);
  }

  private setFocus(name: string | null): void {
    if (name === this.focusedName) return;
    this.focusedName = name;
    services.events.emit('interactableFocused', { name });
  }

  /** The rectangle focus is measured to: an NPC's feet body, else the map object itself. */
  private targetRect(object: MapObject): Phaser.Geom.Rectangle {
    const body = this.options.npcs.get(object.name)?.body;
    if (body) return new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height);
    return new Phaser.Geom.Rectangle(object.x, object.y, object.width, object.height);
  }

  private interact(name: string): void {
    const target = this.usable.find(({ object }) => object.name === name);
    if (!target) return;
    const { binding } = target;
    if (binding.kind === 'interactable') this.runScript(binding.run, name);
    else this.talkTo(name, binding);
  }

  /** E next to an NPC: its dialogue, or the `NOTHING_TO_SAY` toast when it has none. */
  private talkTo(name: string, binding: NpcBinding): void {
    const { dialogue } = binding;
    if (!dialogue) {
      this.options.context.ui.toast(
        formatText(tr(NOTHING_TO_SAY), { name: tr(characters[binding.character].name) }),
      );
      return;
    }
    this.converse(name, dialogue).catch((error: unknown) => {
      console.error(`location "${this.options.locationId}", NPC "${name}": dialogue failed`, error);
    });
  }

  /** The NPC and the hero turn to each other for the dialogue; the NPC turns back after it. */
  private async converse(name: string, dialogue: DialogueId): Promise<void> {
    const { player, context } = this.options;
    const npc = this.options.npcs.get(name);
    const facing = npc?.facing;
    npc?.faceTowards(player);
    if (npc) player.faceTowards(npc);
    try {
      await context.ui.openDialogue(dialogue, context);
    } finally {
      // The location may have changed during the dialogue (a cutscene's goTo).
      if (npc?.active && facing) npc.faceDirection(facing);
    }
  }

  private fire({ object, binding }: Bound<TriggerBinding>): void {
    if (binding.once) {
      const flag = binding.flag ?? `trigger:${this.options.locationId}:${object.name}`;
      const { flags } = this.options.context.state;
      if (flags.get(flag) === true) return;
      flags.set(flag, true);
    }
    this.runScript(binding.run, object.name);
  }

  private runScript(run: WorldScript, name: string): void {
    const where = `location "${this.options.locationId}", object "${name}"`;
    try {
      Promise.resolve(run(this.options.context)).catch((error: unknown) => {
        console.error(`${where}: script failed`, error);
      });
    } catch (error) {
      console.error(`${where}: script failed`, error);
    }
  }

  /** Whether the hero's feet just started overlapping the object's rectangle. */
  private entered(object: MapObject): boolean {
    const touching = this.touches(object);
    const wasInside = this.inside.has(object.name);
    if (touching) this.inside.add(object.name);
    else this.inside.delete(object.name);
    return touching && !wasInside;
  }

  private touches(object: MapObject): boolean {
    const { body } = this.options.player;
    return (
      body.x < object.x + object.width &&
      body.right > object.x &&
      body.y < object.y + object.height &&
      body.bottom > object.y
    );
  }
}

/** Distance from a point to the nearest point of a rectangle (0 inside it). */
function distanceToRect(point: Point, rect: Phaser.Geom.Rectangle): number {
  const dx = Math.max(rect.x - point.x, 0, point.x - rect.right);
  const dy = Math.max(rect.y - point.y, 0, point.y - rect.bottom);
  return Math.hypot(dx, dy);
}
