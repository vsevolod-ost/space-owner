import type { AudioKey, ImageKey, MapKey } from '@/assets';
import type { CharacterId, Direction } from '@/content/characters';
import type { DialogueId } from '@/content/dialogues';
import type { LocationId } from '@/content/locations';
import type { ActId } from '@/content/story';
import type { WorldContext } from '@/world/WorldContext';

/** Kinds of objects in a map's `objects` layer: the Tiled "Class" field (`type` in JSON). */
export const MAP_OBJECT_KINDS = [
  'spawn',
  'door',
  'npc',
  'interactable',
  'trigger',
  'point',
] as const;

/** Kind of a map object; see `MAP_OBJECT_KINDS`. */
export type MapObjectKind = (typeof MAP_OBJECT_KINDS)[number];

/**
 * A door object (a rectangle): walking into it moves the hero to `spawn` of location `to`
 * (fade out, the location loads, fade in), or, with `act`, starts that act (its title card,
 * then wherever the act's script goes). Doors need no key press, and need not sit in a gap of
 * a wall: any rectangle the hero can walk into works.
 */
export type DoorBinding = LocationDoorBinding | ActDoorBinding;

/** A door to another location: `{ kind: 'door', to: 'demo-room', spawn: 'spawn-from-corridor' }`. */
export interface LocationDoorBinding {
  kind: 'door';
  /** Target location. */
  to: LocationId;
  /**
   * Name of a `spawn` object in the target location's map. Not checked by the compiler: a wrong
   * name warns at run time and the hero appears at the target's first spawn.
   */
  spawn: string;
}

/** A door into the next part of the story: `{ kind: 'door', act: 'act2' }` (`flow.startAct`). */
export interface ActDoorBinding {
  kind: 'door';
  /** Act started when the hero walks in (src/content/story). */
  act: ActId;
}

/**
 * An `npc` object (a point at the character's feet): the character standing there. With a
 * `dialogue`, E next to the character starts it (the character turns to the hero while they
 * talk); without one, a "has nothing to say" toast shows.
 */
export interface NpcBinding {
  kind: 'npc';
  character: CharacterId;
  /** Direction the character looks in; default `down`. */
  facing?: Direction;
  /** Dialogue started by E next to the character (src/content/dialogues). */
  dialogue?: DialogueId;
}

/** Code run by an interactable or a trigger; may be async (a cutscene, for example). */
export type WorldScript = (ctx: WorldContext) => void | Promise<void>;

/**
 * An `interactable` object (a rectangle or a point): when the hero is near it, the "E" hint
 * shows over it and pressing E runs `run`.
 */
export interface InteractableBinding {
  kind: 'interactable';
  run: WorldScript;
}

/**
 * A `trigger` object (a rectangle): `run` starts when the hero's feet enter the zone - every
 * time, or only the first time with `once`.
 */
export interface TriggerBinding {
  kind: 'trigger';
  /** Fire only once per game; remembered in a flag, so it survives saves. Default false. */
  once?: boolean;
  /**
   * Name of the flag that remembers a `once` trigger, for dialogues and the story to check;
   * default `trigger:<location>:<name>`. Ignored without `once`.
   */
  flag?: string;
  run: WorldScript;
}

/**
 * Behaviour attached to a map object by its `name`. The object's kind in Tiled must equal the
 * binding's `kind`.
 */
export type Binding = DoorBinding | NpcBinding | InteractableBinding | TriggerBinding;

/**
 * One location: a background image, a Tiled map with its markup, and what the named map
 * objects do. Lives in src/content/locations/<id>.ts and is listed in ./index.ts.
 */
export interface LocationDef {
  /** Name shown to the player. */
  title: string;
  /** Background image; its size is the size of the world (camera and physics bounds). */
  background: ImageKey;
  /** Tiled map with the `collisions` and `objects` layers. */
  map: MapKey;
  /**
   * Music played while in the location; locations with the same track continue it
   * (docs/HOWTO-audio.md). Without it, whatever plays keeps playing.
   */
  music?: AudioKey;
  /** Behaviour per map object name. Objects with no binding (spawns) need none. */
  bindings: Readonly<Record<string, Binding>>;
}
