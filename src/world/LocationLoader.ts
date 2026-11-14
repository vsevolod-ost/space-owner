import type Phaser from 'phaser';
import { MAP_OBJECT_KINDS } from '@/content/locations/types';
import type { LocationDef, MapObjectKind } from '@/content/locations/types';
import type { BuiltBackgroundLayer } from '@/world/Props';
import { backgroundOf, bindingsOf } from '@/world/bindings';

/** Layer of impassable rectangles. */
const COLLISIONS_LAYER = 'collisions';
/** Layer of named objects (spawns, doors, NPCs, ...). */
const OBJECTS_LAYER = 'objects';

/**
 * A named object from the map's `objects` layer, in map pixels. A point object has width and
 * height 0 and `x, y` at the point; a rectangle has `x, y` at its top-left corner.
 */
export interface MapObject {
  name: string;
  kind: MapObjectKind;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What `loadLocation` built. */
export interface LoadedLocation {
  /** World size in pixels: the background image size. */
  width: number;
  height: number;
  /**
   * Background layers back to front (one for a single-image background), at depth -1 under
   * every actor and prop; their tints are set by `Props`.
   */
  background: BuiltBackgroundLayer[];
  /** Static bodies of the `collisions` layer; collide actors with this. */
  walls: Phaser.Physics.Arcade.StaticGroup;
  /** Valid objects of the `objects` layer, in map order. */
  objects: MapObject[];
}

/**
 * Builds a location in a scene: the background (its layers), static walls from the `collisions` layer,
 * the object list from the `objects` layer, physics and main-camera bounds set to the
 * background size. Problems in the map (unknown class, missing or repeated name, a binding
 * without its object) are reported with `console.warn`; the bad object is skipped.
 */
export function loadLocation(scene: Phaser.Scene, id: string, def: LocationDef): LoadedLocation {
  const layers = backgroundOf(def);
  // Same depth: the layers draw in the order they were added, back to front.
  const background = layers.map((layer) => ({
    layer,
    image: scene.add.image(0, 0, layer.image).setOrigin(0).setDepth(-1),
  }));
  const first = background[0]?.image;
  if (!first) throw new Error(`location "${id}": the background has no layers`);
  const { width, height } = first;
  scene.physics.world.setBounds(0, 0, width, height);
  scene.cameras.main.setBounds(0, 0, width, height);

  const map = scene.make.tilemap({ key: def.map });
  const where = `location "${id}" (map "${def.map}")`;
  for (const { layer, image } of background) {
    if (image.width !== width || image.height !== height) {
      console.warn(
        `${where}: background layer "${layer.image}" is ${image.width}x${image.height}, ` +
          `the first layer ${width}x${height}`,
      );
    }
  }

  const walls = scene.physics.add.staticGroup();
  for (const rect of layerObjects(map, COLLISIONS_LAYER, where)) {
    const w = rect.width ?? 0;
    const h = rect.height ?? 0;
    if (w <= 0 || h <= 0) {
      console.warn(`${where}: collision object ${rect.id} is not a rectangle; skipped`);
      continue;
    }
    // Zones are invisible; a static body takes the zone's bounds once, when added.
    const zone = scene.add.zone(rect.x ?? 0, rect.y ?? 0, w, h).setOrigin(0);
    walls.add(zone);
  }

  const objects = parseObjects(layerObjects(map, OBJECTS_LAYER, where), where);
  checkBindings(def, objects, where);
  map.destroy();

  return { width, height, background, walls, objects };
}

function layerObjects(
  map: Phaser.Tilemaps.Tilemap,
  layer: string,
  where: string,
): Phaser.Types.Tilemaps.TiledObject[] {
  const objects = map.getObjectLayer(layer)?.objects;
  if (!objects) console.warn(`${where}: no object layer "${layer}"`);
  return objects ?? [];
}

function parseObjects(raw: Phaser.Types.Tilemaps.TiledObject[], where: string): MapObject[] {
  const kinds: readonly string[] = MAP_OBJECT_KINDS;
  const seen = new Set<string>();
  const objects: MapObject[] = [];
  for (const object of raw) {
    const { name, type } = object;
    const label = `object ${object.id} "${name}"`;
    if (!kinds.includes(type)) {
      console.warn(`${where}: ${label} has class "${type}", expected one of ${kinds.join(', ')}`);
      continue;
    }
    if (!name) {
      console.warn(`${where}: ${label} (${type}) has no name; skipped`);
      continue;
    }
    if (seen.has(name)) {
      console.warn(`${where}: ${label} repeats a name; the first one is used`);
      continue;
    }
    seen.add(name);
    objects.push({
      name,
      kind: type as MapObjectKind,
      x: object.x ?? 0,
      y: object.y ?? 0,
      width: object.point ? 0 : (object.width ?? 0),
      height: object.point ? 0 : (object.height ?? 0),
    });
  }
  return objects;
}

/**
 * Object kinds that do nothing without a binding in the location's TS file. Not `prop`: a prop
 * place without a binding is a place nothing stands on yet.
 */
const KINDS_NEEDING_BINDING: ReadonlySet<MapObjectKind> = new Set([
  'door',
  'npc',
  'interactable',
  'trigger',
]);

function checkBindings(def: LocationDef, objects: MapObject[], where: string): void {
  const bindings = bindingsOf(def);
  for (const object of objects) {
    if (KINDS_NEEDING_BINDING.has(object.kind) && !(object.name in bindings)) {
      console.warn(`${where}: ${object.kind} "${object.name}" has no binding and does nothing`);
    }
  }
  for (const [name, binding] of Object.entries(bindings)) {
    const object = objects.find((candidate) => candidate.name === name);
    if (!object) {
      console.warn(`${where}: binding "${name}" has no object with that name in the map`);
    } else if (object.kind !== binding.kind) {
      console.warn(
        `${where}: binding "${name}" is a ${binding.kind}, the object is a ${object.kind}`,
      );
    }
  }
}
