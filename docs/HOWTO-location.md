# How to add a location

A location is a background (one picture, or a few layers of the same size) plus a Tiled map
that marks up where you can walk and what is where. Behaviour (where a door leads, what a
terminal says) lives in a TypeScript file next to the other locations, so the compiler checks
it.

Rule: **one background = one location.** The picture is the whole world of that location; the
camera follows the hero over it when it is larger than the screen (640×360). The game has four:
`home` (prologue), `warehouse` (act 1), `ship-deck` (act 2), `colony` (act 3).

## Install Tiled

Download Tiled **1.10 or newer** from <https://www.mapeditor.org/>. Tiled 1.9 saved an object's
Class under a JSON field (`class`) that Phaser does not read; 1.10 went back to `type`. No plugins
are needed.

## Open an existing map

Open `public/assets/maps/<id>.tmj` (for example `warehouse.tmj`) with _File → Open_. The map
shows the background picture as an image layer, so you see what you are marking up. Save with
_Ctrl+S_; the format stays JSON (`.tmj`).

**All four maps are generated now** (see [Generated maps](#generated-maps)): do not edit them
in Tiled until they are taken out of the generator.

## Generated maps

While a location has placeholder art, its map is written by a script: `home`, `warehouse`,
`ship-deck` and `colony` come from `python3 tools/make_maps.py`. Their objects (name, class,
position, size) are listed in `MAPS` at the top of that script; their collision rectangles come
from `LOCATIONS` in `tools/placeholders.py` - the walls and obstacles painted on the placeholder
backgrounds, which also show every object's outline and name as a layout draft for the artists.

To move something in a generated map, edit those two lists and run both scripts, in this order:

```bash
python3 tools/placeholders.py   # rewrites placeholder images, keeps real art: check git status
python3 tools/make_maps.py
```

An edit made in Tiled is lost the next time the script runs.

**Taking a map out of the generator** (when its real background arrives and the map is edited
in Tiled from then on):

1. Delete the location's entry from `MAPS` in `tools/make_maps.py` and from `LOCATIONS` in
   `tools/placeholders.py`, so neither script writes its files again (the map, and the
   background or, for the colony, its three layers).
2. Put the real background in place under the same name and size (or a new size: then resize
   the map in Tiled, _Map → Resize Map_).
3. Open `public/assets/maps/<id>.tmj` in Tiled and move the objects onto the real art; keep
   every object's name and class (the bindings find them by name).
4. Update the list of generated maps in this section.
5. Play the location (`?location=<id>&overlay=1`) and run its smoke scenarios.

## Layers

Every map has three layers with exactly these names:

| Layer        | Type         | What goes there                                                       |
| ------------ | ------------ | --------------------------------------------------------------------- |
| `background` | Image layer  | The background picture, for reference only; the game draws it itself. |
| `collisions` | Object layer | Rectangles the hero cannot walk into (walls, furniture). No names.    |
| `objects`    | Object layer | Named objects: spawns, doors, NPCs, interactables, triggers, points.  |

Only rectangles count in `collisions`; anything else is skipped with a warning. The hero's
collision box is small and sits at his feet (20×12 px), so draw collision rectangles where the
_floor_ is blocked, not around the whole drawn furniture.

## Objects

Every object in the `objects` layer needs:

- a **Class** (the "Class" field in the object's properties; `type` in the JSON) - one of the
  kinds below (`MAP_OBJECT_KINDS` in `src/content/locations/types.ts`);
- a **Name**, unique within the map. Code refers to objects by name.

An object with an unknown class or no name is skipped with a warning in the browser console; a
repeated name keeps the first object.

| Class          | Shape                | What it does                                                             | Binding needed |
| -------------- | -------------------- | ------------------------------------------------------------------------ | -------------- |
| `spawn`        | Point                | Where the hero appears. Doors and the URL refer to it by name.           | no             |
| `door`         | Rectangle            | Walking into it moves the hero to another location (fade out/in).        | yes            |
| `npc`          | Point (the feet)     | A character stands here.                                                 | yes            |
| `interactable` | Rectangle (or point) | Shows the "E" hint when the hero is within 20 px; E runs its script.     | yes            |
| `trigger`      | Rectangle            | Runs a script when the hero's feet walk in (optionally only once).       | yes            |
| `point`        | Point                | A named place for scripts and cutscenes (camera targets, walk targets).  | no             |
| `prop`         | Rectangle            | Where a picture stands (a crate, a colony module), drawn by its binding. | no             |

Conventions:

- **`spawn-default`** - every map has a spawn with this name. It is used when no spawn is given
  (`?location=<id>` without `&spawn=`, a new game).
- A spawn next to a door should be **at least 24 px away from the door rectangle**, measured from
  the edge of the hero's feet box (10 px either side of the point). Otherwise the hero arrives
  touching the door. The game ignores a door the hero is already standing in on arrival, but a
  small step back would send him through again.
- A door must be a rectangle the hero can walk into: usually a gap in the wall, but it need not
  be in a wall at all.
- Names: `spawn-from-<location>`, `door-<location>`, `npc-<character>`, `point-<what>`,
  `trigger-<what>`.

## Bindings: what the objects do

`src/content/locations/<id>.ts` gives each `door`, `npc`, `interactable` and `trigger` object its
behaviour, by name. The binding's `kind` must equal the object's class. Example (a location
like the warehouse, with one binding of each kind; the real `warehouse.ts` builds its crates
from the cargo registry, see below):

```ts
import { TODO, tr } from '@/core/locale/text';
import type { LocationDef } from '@/content/locations/types';

const EMPTY_SHELVES = { en: 'Empty shelves.', uk: TODO }; // OWNER: script

export const storeroom: LocationDef = {
  title: { en: 'Storeroom', uk: TODO }, // OWNER: script
  background: 'location-storeroom',
  map: 'storeroom',
  music: 'music-demo',
  bindings: {
    'door-warehouse': { kind: 'door', to: 'warehouse', spawn: 'spawn-from-storeroom' },
    'npc-engineer': { kind: 'npc', character: 'engineer', dialogue: 'engineer-advice' },
    shelf: { kind: 'interactable', run: (ctx) => ctx.ui.toast(tr(EMPTY_SHELVES)) },
    arrival: {
      kind: 'trigger',
      once: true,
      run: (ctx) => ctx.cutscenes.play('warehouse-arrival'),
    },
  },
};
```

The four locations of the game, to copy from: `home.ts` (one act door), `warehouse.ts` (crates
built from the cargo registry, advisers, the hatch: a dialogue built by code, the HOLD strip),
`ship-deck.ts` (the navigation station opens a panel; the hold's bays are props),
`colony.ts` (a layered, tinted background built from the colony registry; building places).

- `door`: `to` is a location id (checked by the compiler); `spawn` is a spawn name in that
  location's map. **The spawn name is not checked by the compiler**: a wrong one warns at run
  time and the hero appears at the target's first spawn. A door can start an act instead:
  `'door-ship': { kind: 'door', act: 'act2' }` shows the act's title and runs its script (see
  [HOWTO-story.md](HOWTO-story.md)).
- `npc`: `character` is a key of `src/content/characters.ts`; `facing` is optional;
  `dialogue` (a key of `src/content/dialogues/index.ts`) is what E starts - see
  [HOWTO-dialogue.md](HOWTO-dialogue.md).
- `interactable` and `trigger`: `run(ctx)` gets the world context - `ctx.ui.toast(text)` (a
  finished string: `tr` the pair when the toast shows, see
  [HOWTO-localization.md](HOWTO-localization.md)),
  `ctx.state.flags`, `ctx.controls.lock(reason)` / `unlock(reason)`, `ctx.cutscenes.play(id)`
  (see [HOWTO-cutscene.md](HOWTO-cutscene.md)), `ctx.flow` (story: `ctx.flow.startAct('act2')`,
  `ctx.flow.checkpoint()`, see [HOWTO-story.md](HOWTO-story.md)), `ctx.voyage` (the cargo
  registry and what is aboard: `ctx.voyage.count('oxygen')`), `ctx.scene`. It may be `async`.
- `bindings` may also be a function `({ voyage }) => ({ ... })`, built once when the location
  first loads: for objects that follow a registry content may only import as a type
  (`voyage` = `services.voyage`: the cargo and colony registries and what is aboard). The
  warehouse's `crate-<id>` places, the deck's `bay-1..7` and the colony's `build-1..7` are made
  this way, one binding per registry entry or place.
- Doors and triggers do not fire while the hero's input is locked (cutscene, dialogue, location
  change): a scripted walk across a door stays in the location.
- `trigger` with `once: true` fires once per game; it is remembered in the flag
  `trigger:<location>:<name>` (or the name given in `flag`).

### Objects that follow the flags

- `when: (s) => ...` on a `door`, `npc` or `interactable` binding: while it is false the object is
  not there at all (not drawn, no "E", no collision, the door does not fire).
- `prop: { layers: [{ image: 'crate' }, { spritesheet: 'items', frame: 1 }] }` on an
  `interactable`, or a `{ kind: 'prop', prop, when? }` binding on a `prop` object: pictures
  centred on the object, sorted with the actors by the object's bottom edge. `layers` may be a
  function of the state (the ship's hold shows whatever was taken); `tint: (s) => 0xff8866`
  colours them. A prop does not block: put it where a collision rectangle already stands.
- `background` may be a list of layers drawn back to front, each with an optional
  `tint: (s) => colour`, or a function `({ voyage }) => [layers]` built once like `bindings`
  (`colony.ts`: the sky and the ground take the colours of the body in the colony registry, the
  base keeps its own). The first layer's size is the world's size.
- `showHold: true` shows the HOLD strip at the top of the screen: `HOLD n/7` and the icons of
  the cargo aboard (the warehouse and the ship deck). It covers about the top 32 px in the
  middle (x 220-420, y 4-28); keep doors, spawns and anything to read out of it.
- When a flag changes the location rebuilds on the next frame (props, `when`, tints, the HOLD
  strip), but not while a dialogue or a cutscene runs or a panel pauses the world: then it waits
  for the end. The hero and the NPCs keep their places. `WorldScene.debugInfo().props` shows
  what is drawn.
- Never put `when` on an NPC or an object the hero could be standing on when it appears: the
  collision would push him.

A door, NPC, interactable or trigger **without a binding only warns** in the console and does
nothing; a binding without its object warns too. Open the browser console (F12) after changing
a map.

## Coordinates

Tiled shows the cursor position in map pixels in its status bar (bottom left). A point
object's position is the point; a rectangle's is its top-left corner.

To find a spot from inside the game, use the **debug overlay**: open the game with
`?overlay=1` in the URL (`http://localhost:5173/?location=<id>&overlay=1`), or press **F3** at
any time to turn it on and off. Walk the hero to the spot and read the line `hero x,y`: whole
map pixels of the hero's feet, the same numbers Tiled uses, ready to type into a spawn or a
point object. The overlay also shows the location and spawn, the object in focus (what **E**
would use), the act, the music, the flag count with the last 5 changed flags and, in act 2,
the simulation's time scale and day. It refreshes four times a second.

## Checklist: a new location

1. **Background.** Put the picture into `public/assets/images/locations/<id>.png`. Its size is
   the world size; make it a multiple of 16 px if you can. If it is not (360 px tall = 22.5
   tiles), set the Tiled map size to the tile count rounded **up** (23); the extra half tile is
   outside the world and does nothing.
2. **Image registry.** Add `'location-<id>': { path: 'assets/images/locations/<id>.png' }` to
   `src/assets/images.ts`.
3. **Map.** In Tiled: _File → New → New Map…_, orientation orthogonal, tile size 16×16, map size
   = background size / 16 (rounded up). Save as `public/assets/maps/<id>.tmj`. Add the image
   layer `background` with the picture (path relative to the map:
   `../images/locations/<id>.png`), then the object layers `collisions` and `objects`. Easiest:
   copy an existing `.tmj` and change it.
4. **Map registry.** Add `'<id>': { path: 'assets/maps/<id>.tmj' }` to `src/assets/maps.ts`.
5. **Location file.** Create `src/content/locations/<id>.ts` exporting a `LocationDef` (see the
   example above).
6. **Location registry.** Import it in `src/content/locations/index.ts` and add
   `'<id>': <name>` to `locations`.
7. **A door to it.** Bind a door in a neighbouring location with `to: '<id>'`, and add the
   matching `spawn-from-<neighbour>` in the new map.
8. **Try it.** `npm run dev`, open `http://localhost:5173/?location=<id>` (and
   `&spawn=<name>` for another spawn). Check the console for warnings.

### A new NPC

Besides the `npc` object and its binding:

1. Add the character to `src/content/characters.ts` (`name`, `portrait`, `spritesheet`, the
   sheet layout). The portrait is a 48×48 image registered in `src/assets/images.ts`.
2. Register its sprite sheet in `src/assets/spritesheets.ts` (path and frame size).
3. No art yet? Add it to the `character(...)` list in `tools/placeholders.py` with its own
   colour and run `python3 tools/placeholders.py` for a stub sheet. The script rewrites
   **every** placeholder file, so check `git status` afterwards and restore any real art it
   overwrote (`git checkout -- <file>`).
