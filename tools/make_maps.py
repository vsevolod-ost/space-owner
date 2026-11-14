#!/usr/bin/env python3
"""Generates the Tiled maps of the placeholder demo locations.

Usage (from the repository root or anywhere):
    python3 tools/make_maps.py

Writes public/assets/maps/<id>.tmj for every map in MAPS below. The collision rectangles come
from LOCATIONS in tools/placeholders.py (the same walls and obstacles drawn on the placeholder
backgrounds); the objects (spawns, doors, NPCs, points, triggers, interactables) are declared
in MAPS. To move a demo object or obstacle, edit MAPS or LOCATIONS, then run this script and
tools/placeholders.py so map and background stay in step. Needs Pillow (placeholders.py
imports it).

For the placeholder demo maps ONLY. Real locations are drawn in Tiled and never regenerated:
running this script over a map edited in Tiled throws those edits away. Once a demo location
gets real art and a hand-made map, remove it from MAPS.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # importing placeholders must not leave tools/__pycache__/
sys.path.insert(0, str(Path(__file__).resolve().parent))
from placeholders import LOCATIONS, ROOT, TILE, collision_rects  # noqa: E402

MAPS_DIR = ROOT / 'public' / 'assets' / 'maps'

# --- Objects of each demo map ---------------------------------------------------------------
# Each entry: (name, class, x, y, width, height); width = height = 0 makes a point object.
# Classes: spawn | door | npc | interactable | trigger | point (see docs/HOWTO-location.md).
# Behaviour is bound to the name in src/content/locations/<id>.ts, never stored in the map.
MAPS: dict[str, list[tuple[str, str, int, int, int, int]]] = {
    'demo-corridor': [
        ('spawn-default', 'spawn', 48, 270, 0, 0),
        ('spawn-from-room', 'spawn', 900, 270, 0, 0),
        ('door-room', 'door', 944, 238, 16, 64),
        ('npc-engineer', 'npc', 480, 310, 0, 0),
    ],
    'demo-room': [
        ('spawn-default', 'spawn', 56, 180, 0, 0),
        ('spawn-from-corridor', 'spawn', 56, 180, 0, 0),
        ('door-corridor', 'door', 0, 148, 16, 64),
        ('terminal', 'interactable', 584, 168, 24, 24),
        ('point-terminal', 'point', 560, 180, 0, 0),
        ('npc-captain', 'npc', 320, 96, 0, 0),
        ('trigger-center', 'trigger', 300, 150, 40, 60),
        ('door-ship', 'door', 608, 150, 16, 60),
        ('broken-vent', 'interactable', 40, 40, 32, 24),
    ],
    'ship-deck': [
        ('spawn-default', 'spawn', 48, 360, 0, 0),
        ('station-navigation', 'interactable', 560, 340, 40, 40),
        ('station-reactor', 'interactable', 900, 340, 40, 40),
        ('airlock', 'interactable', 1200, 340, 40, 40),
    ],
}


def tmj(location_id: str, objects: list[tuple[str, str, int, int, int, int]]) -> dict:
    """Builds the Tiled JSON of one map; object ids run 1.. over collisions, then objects."""
    width, height = LOCATIONS[location_id]['size']
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

    collisions = [obj('', '', *r) for r in collision_rects(LOCATIONS[location_id])]
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
        'nextlayerid': 4,
        'nextobjectid': next_id,
        'tilesets': [],
        'layers': [
            layer(
                1,
                type='imagelayer',
                name='background',
                image=f'../images/locations/{location_id}.png',
            ),
            layer(2, type='objectgroup', name='collisions', draworder='topdown', objects=collisions),
            layer(3, type='objectgroup', name='objects', draworder='topdown', objects=placed),
        ],
    }


def main() -> None:
    for location_id, objects in MAPS.items():
        path = MAPS_DIR / f'{location_id}.tmj'
        path.write_text(json.dumps(tmj(location_id, objects), indent=1) + '\n')
        print(f'wrote {path.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
