import type { AudioKey, ImageKey, MapKey, SpritesheetKey } from '@/assets';
import type { ActorCharacterId, Direction } from '@/content/characters';
import type { DialogueId } from '@/content/dialogues';
import type { LocationId } from '@/content/locations';
import type { ActId } from '@/content/story';
import type { GameState } from '@/core/state/GameState';
import type { VoyageService } from '@/core/voyage/VoyageService';
import type { WorldContext } from '@/world/WorldContext';

/**
 * Kinds of objects in a map's `objects` layer: the Tiled "Class" field (`type` in JSON).
 * `prop` marks where a picture stands (a crate in the hold, a colony module); its binding
 * (`PropBinding`) says what is drawn there and when.
 */
export const MAP_OBJECT_KINDS = [
  'spawn',
  'door',
  'npc',
  'interactable',
  'trigger',
  'point',
  'prop',
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

/** A door to another location: `{ kind: 'door', to: 'warehouse', spawn: 'spawn-default' }`. */
export interface LocationDoorBinding {
  kind: 'door';
  /** The door is there only while this is true; default always. */
  when?: WorldCondition;
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
  /** The door is there only while this is true; default always. */
  when?: WorldCondition;
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
  /** A character with a sprite sheet (src/content/characters.ts). */
  character: ActorCharacterId;
  /** Direction the character looks in; default `down`. */
  facing?: Direction;
  /** Dialogue started by E next to the character (src/content/dialogues). */
  dialogue?: DialogueId;
  /** The character stands there only while this is true; default always. */
  when?: WorldCondition;
}

/**
 * Whether a map object exists now, from the game state (flags): `(s) => s.flags.get('cargo.oxygen')
 * === 0`. False: the object is not there at all (not drawn, not usable, not collided with, a door
 * does not fire). Re-read when a flag changes, but not while a dialogue or a cutscene runs: the
 * world catches up when it ends. Never put `when` on something the hero could stand inside.
 */
export type WorldCondition = (state: GameState) => boolean;

/** One picture of a prop: a whole image, or one frame of a sprite sheet. */
export type PropLayer = (
  | { image: ImageKey }
  | {
      spritesheet: SpritesheetKey;
      /** Frame index, left to right, top to bottom. */
      frame: number;
    }
) & {
  /** Shift from the common anchor, px (whole pixels); default none. */
  offset?: { x: number; y: number };
};

/**
 * What a prop or an interactable looks like: pictures drawn back to front, all centred on the
 * centre of the map object (a point object: on the point), drawn in front of what stands above
 * the object's bottom edge and behind what stands below it (like actors, by their feet).
 * Re-read when a flag changes (see `WorldCondition`).
 *
 * ```ts
 * // A crate with the oxygen icon on it.
 * { layers: [{ image: 'crate' }, { spritesheet: 'items', frame: 1 }] }
 * ```
 */
export interface PropSpec {
  /** The pictures, or a function of the state that returns them (none: nothing is drawn). */
  layers: readonly PropLayer[] | ((state: GameState) => readonly PropLayer[]);
  /** Colour multiplied over every layer (`0xff8866`); undefined or 0xffffff: none. */
  tint?: (state: GameState) => number | undefined;
}

/**
 * A `prop` object (a rectangle or a point): a picture standing there, `{ kind: 'prop', prop:
 * { layers: [{ image: 'crate' }] } }`. Props do nothing and do not block: put them only where a
 * collision rectangle already stands (or where the hero cannot walk).
 */
export interface PropBinding {
  kind: 'prop';
  prop: PropSpec;
  /** The prop is there only while this is true; default always. */
  when?: WorldCondition;
}

/** Code run by an interactable or a trigger; may be async (a cutscene, for example). */
export type WorldScript = (ctx: WorldContext) => void | Promise<void>;

/**
 * An `interactable` object (a rectangle or a point): when the hero is near it, the "E" hint
 * shows over it and pressing E runs `run`. With `prop` it is also drawn (a crate the hero can
 * take): one map object, one class, so a usable picture is an interactable with a prop.
 */
export interface InteractableBinding {
  kind: 'interactable';
  run: WorldScript;
  /** Picture drawn at the object, as for a `prop` object; default none. */
  prop?: PropSpec;
  /** The object (and its picture) is there only while this is true; default always. */
  when?: WorldCondition;
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
export type Binding = DoorBinding | NpcBinding | InteractableBinding | TriggerBinding | PropBinding;

/**
 * One layer of a layered background: an image the size of the world, and a colour multiplied
 * over it from the state (the colony's sky by the body it stands on). Re-read when a flag
 * changes (see `WorldCondition`).
 */
export interface BackgroundLayer {
  image: ImageKey;
  /** Colour multiplied over the layer (`0xff8866`); undefined or 0xffffff: none. */
  tint?: (state: GameState) => number | undefined;
}

/**
 * One location: a background image, a Tiled map with its markup, and what the named map
 * objects do. Lives in src/content/locations/<id>.ts and is listed in ./index.ts.
 */
export interface LocationDef {
  /** Name shown to the player. */
  title: string;
  /**
   * Background image, or layers drawn back to front (`[{ image: 'location-colony-sky', tint },
   * { image: 'location-colony-ground' }]`), or a function that builds the layers from the
   * game's registries once (`BindingSources`, as for `bindings`: the colony's tints follow the
   * colony registry). The (first) image's size is the size of the world (camera and physics
   * bounds); the other layers should match it.
   */
  background:
    | ImageKey
    | readonly BackgroundLayer[]
    | ((sources: BindingSources) => readonly BackgroundLayer[]);
  /** Tiled map with the `collisions` and `objects` layers. */
  map: MapKey;
  /**
   * Music played while in the location; locations with the same track continue it
   * (docs/HOWTO-audio.md). Without it, whatever plays keeps playing.
   */
  music?: AudioKey;
  /**
   * Second loop of `music` (same length and tempo), started with it and silent until the game
   * raises it: on the ship deck, the alarm drums (docs/HOWTO-audio.md, "Two states of act 2").
   */
  musicLayer?: AudioKey;
  /**
   * Shows the HOLD strip at the top of the screen: `HOLD n/7` and the icons of the cargo aboard
   * (plan D21; the warehouse and the ship deck). Default false.
   */
  showHold?: boolean;
  /**
   * Behaviour per map object name. Objects with no binding (spawns) need none. A function
   * builds them from the game's registries instead (`BindingSources`), once: a location whose
   * objects follow a registry (the warehouse's crates follow the cargo registry, which content
   * may import only as a type).
   */
  bindings:
    | Readonly<Record<string, Binding>>
    | ((sources: BindingSources) => Readonly<Record<string, Binding>>);
}

/** What a location's `bindings` function gets: registries reached through core services. */
export interface BindingSources {
  /**
   * The voyage's data: the cargo and colony registries and what is aboard (`services.voyage`).
   */
  voyage: VoyageService;
}
