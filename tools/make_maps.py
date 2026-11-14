#!/usr/bin/env python3
"""Generates the Tiled maps of the locations that have only placeholder art.

Usage (from the repository root or anywhere):
    python3 tools/make_maps.py

Writes public/assets/maps/<id>.tmj for every map in MAPS below. The collision rectangles come
from LOCATIONS in tools/placeholders.py (the same walls and obstacles drawn on the placeholder
backgrounds); the objects (spawns, doors, NPCs, points, triggers, interactables) are declared
in MAPS. To move an object or obstacle, edit MAPS or LOCATIONS, then run this script and
tools/placeholders.py so map and background stay in step. Needs Pillow (placeholders.py
imports it).

For maps under placeholder art ONLY. Once a location gets its real background and its map is
edited in Tiled, remove it from MAPS (and from LOCATIONS in placeholders.py): running this
script over a map edited in Tiled throws those edits away.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # importing placeholders must not leave tools/__pycache__/
sys.path.insert(0, str(Path(__file__).resolve().parent))
from placeholders import LOCATIONS, ROOT, TILE, collision_rects  # noqa: E402

MAPS_DIR = ROOT / 'public' / 'assets' / 'maps'


def hold_bays() -> int:
    """The hold's bay count, read from `bays` in src/content/voyage/cargo/index.ts (one source:
    the ship deck's `bay-N` and the colony's `build-N` objects follow it)."""
    source = (ROOT / 'src' / 'content' / 'voyage' / 'cargo' / 'index.ts').read_text()
    found = re.search(r'\bbays:\s*(\d+)\s*}', source)
    if not found:
        sys.exit('make_maps.py: no `bays: <n> }` in src/content/voyage/cargo/index.ts')
    return int(found.group(1))


BAYS = hold_bays()
# Colony building places: two rows, the upper one takes the extra place of an odd count.
BUILD_UPPER = (BAYS + 1) // 2

# --- Objects of each generated map ----------------------------------------------------------
# Each entry: (name, class, x, y, width, height); width = height = 0 makes a point object.
# Classes: spawn | door | npc | interactable | trigger | point | prop (see
# docs/HOWTO-location.md). Behaviour is bound to the name in src/content/locations/<id>.ts,
# never stored in the map.
MAPS: dict[str, list[tuple[str, str, int, int, int, int]]] = {
    'home': [
        ('spawn-default', 'spawn', 48, 180, 0, 0),
        ('door-warehouse', 'door', 624, 148, 16, 64),
    ],
    # Crate places are 32x32 cells of the islands, 2x2 per island; fuel first, then the cargo
    # order (fuel, oxygen, supplies, battery, solar, reactor, greenhouse, regolith-kit, ice-kit,
    # thermal-kit). The scientists stand by the islands; post-1/post-2 are their places in the
    # booth, `debrief` the hero's place in front of it (a spawn, so `goTo('warehouse',
    # 'debrief')` works), `spawn-hatch` where the hero stands after the debrief. `arrival` (a
    # once-trigger on the walking line just right of the spawn) plays the arrival cutscene.
    'warehouse': [
        ('spawn-default', 'spawn', 48, 184, 0, 0),
        ('arrival', 'trigger', 96, 160, 32, 48),
        ('debrief', 'spawn', 96, 136, 0, 0),
        ('spawn-hatch', 'spawn', 588, 184, 0, 0),
        *[
            (f'crate-{item}', 'interactable', ix + col * 32, 232 + row * 32, 32, 32)
            for ix, cells in (
                (208, ('fuel-1', 'fuel-2', 'fuel-3', 'oxygen')),
                (336, ('supplies', 'battery', 'solar', 'reactor')),
                (464, ('greenhouse', 'regolith-kit', 'ice-kit', 'thermal-kit')),
            )
            for (row, col), item in zip(((0, 0), (0, 1), (1, 0), (1, 1)), cells)
        ],
        ('npc-engineer', 'npc', 288, 168, 0, 0),
        ('npc-astronomer', 'npc', 416, 168, 0, 0),
        ('post-1', 'point', 56, 96, 0, 0),
        ('post-2', 'point', 136, 96, 0, 0),
        ('hatch', 'interactable', 608, 160, 16, 48),
    ],
    # station-navigation sits on the spawn line: the ship smoke walks right until it is in focus.
    'ship-deck': [
        ('spawn-default', 'spawn', 48, 180, 0, 0),
        ('station-navigation', 'interactable', 160, 160, 64, 16),
        ('porthole', 'interactable', 272, 0, 64, 16),
        ('radio', 'interactable', 384, 48, 48, 16),
        ('airlock', 'interactable', 608, 156, 16, 48),
        # bay-1..BAYS: the hold, one 32x32 crate place per bay of the hold.
        *[(f'bay-{i + 1}', 'prop', 160 + i * 48, 288, 32, 32) for i in range(BAYS)],
    ],
    # build-1..BAYS: places of the colony modules (64x48), one per colony item taken (at most
    # one per bay of the hold).
    'colony': [
        ('spawn-default', 'spawn', 48, 180, 0, 0),
        ('shelter', 'interactable', 232, 152, 32, 16),
        ('systems', 'interactable', 336, 152, 24, 16),
        ('overlook', 'interactable', 576, 148, 32, 32),
        *[(f'build-{i + 1}', 'prop', 112 + i * 96, 208, 64, 48) for i in range(BUILD_UPPER)],
        *[
            (f'build-{BUILD_UPPER + i + 1}', 'prop', 160 + i * 96, 280, 64, 48)
            for i in range(BAYS - BUILD_UPPER)
        ],
    ],
}


def tmj(location_id: str, objects: list[tuple[str, str, int, int, int, int]]) -> dict:
    """Builds the Tiled JSON of one map; object ids run 1.. over collisions, then objects."""
    width, height = LOCATIONS[location_id]['size']
    images = LOCATIONS[location_id].get('layers', [location_id])  # back to front
    next_id = 1

    def obj(name: str, cls: str, x: int, y: int, w: int, h: int) -> dict:
        nonlocal next_id
        o = {
            'id': next_id,
            'name': name,
            'type': cls,
            'x': x,
            'y': y,
            'width': w,
            'height': h,
            'rotation': 0,
            'visible': True,
        }
        if w == 0 and h == 0:
            o['point'] = True
        next_id += 1
        return o

    for name, _cls, x, y, w, h in objects:
        if x < 0 or y < 0 or x + w > width or y + h > height:
            sys.exit(
                f'make_maps.py: {location_id} object {name!r} lies outside the {width}x{height} '
                'map (too many bays for this layout? edit its row in MAPS)'
            )

    geometry = LOCATIONS[location_id]
    collisions = [obj('', '', *r) for r in collision_rects(geometry)]
    placed = [obj(*o) for o in objects]

    def layer(layer_id: int, **fields) -> dict:
        return {**fields, 'x': 0, 'y': 0, 'opacity': 1, 'visible': True, 'id': layer_id}

    return {
        'type': 'map',
        'version': '1.10',
        'tiledversion': '1.11.0',
        'orientation': 'orthogonal',
        'renderorder': 'right-down',
        'width': -(-width // TILE),  # rounded up: a 360 px background is 23 tiles tall
        'height': -(-height // TILE),
        'tilewidth': TILE,
        'tileheight': TILE,
        'infinite': False,
        'compressionlevel': -1,
        'nextlayerid': len(images) + 3,
        'nextobjectid': next_id,
        'tilesets': [],
        'layers': [
            *[
                layer(
                    i + 1,
                    type='imagelayer',
                    name='background' if len(images) == 1 else f'background-{image}',
                    image=f'../images/locations/{image}.png',
                )
                for i, image in enumerate(images)
            ],
            layer(
                len(images) + 1,
                type='objectgroup',
                name='collisions',
                draworder='topdown',
                objects=collisions,
            ),
            layer(len(images) + 2, type='objectgroup', name='objects', draworder='topdown', objects=placed),
        ],
    }


def main() -> None:
    for location_id, objects in MAPS.items():
        path = MAPS_DIR / f'{location_id}.tmj'
        path.write_text(json.dumps(tmj(location_id, objects), indent=1) + '\n')
        print(f'wrote {path.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
