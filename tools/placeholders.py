#!/usr/bin/env python3
"""Generates the placeholder art in public/assets/ (flat colours, a label and a frame).

Usage (from the repository root or anywhere):
    python3 tools/placeholders.py              # (re)write every placeholder file
    python3 tools/placeholders.py --geometry   # print location geometry as JSON, write nothing

Real art replaces a placeholder by overwriting the file with the same name and size; the script
overwrites only untouched placeholders (its PLACEHOLDER comment with a hash that still matches
the pixels), so it is safe to rerun over real art.
To add a placeholder, add an entry to the matching list below and run the script again.

The files and sizes follow the art order (P0 and P1 rows); a real file must keep the name and
the size of its placeholder.

LOCATIONS is the single source of the geometry of the generated locations: the walls and
obstacles drawn on each background are the collision rectangles of the matching Tiled map
(public/assets/maps/<id>.tmj), which tools/make_maps.py writes from it. Backgrounds of locations
with `markup` also show the map objects of tools/make_maps.py (outlines and names): the grey
layout draft the artist paints over. After changing LOCATIONS or MAPS run both scripts. Needs
Pillow (pip install pillow).
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from PIL.PngImagePlugin import PngInfo

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'public' / 'assets'
FONT = ROOT / 'public' / 'fonts' / 'PressStart2P.ttf'

# Mirrors GAME_WIDTH / GAME_HEIGHT / TILE_SIZE in src/config.ts.
GAME_WIDTH, GAME_HEIGHT = 640, 360
TILE = 16

# --- Location geometry (map pixels) -------------------------------------------------------
# size:      background size, px
# wall:      thickness of the wall along every edge, px
# floor:     floor colour of the placeholder background
# doorways:  gaps in an edge wall, (side, start, end) along that side, px
# obstacles: impassable rectangles inside the room, (x, y, width, height[, label]), px;
#            label '' draws none
# markup:    draw the map objects of tools/make_maps.py on the background (layout draft)
# layers:    a layered background (colony): image names, back to front; replaces `floor`
# horizon:   layered background only: y of the horizon, px (the ground is transparent above)
# Rule for every generated map: the straight line from `spawn-default` along the middle
# (y = height/2) to every door, NPC, trigger and station stays free of collisions - the smoke
# tests walk it.
LOCATIONS: dict[str, dict] = {
    # Prologue: the hero's flat, one screen; the door on the right starts act 1.
    'home': {
        'size': (640, 360),
        'wall': 16,
        'floor': (104, 84, 64),
        'doorways': [('right', 148, 212)],  # door-warehouse, centred on y = 180
        'obstacles': [(32, 32, 96, 48, 'bed'), (464, 16, 96, 32, 'wardrobe'), (256, 248, 96, 48, 'table')],
        'markup': True,
    },
    # Act 1: one screen 640x368 (the camera scrolls 8 px). The scientists' glass booth top left,
    # shelves along the top wall, 3 islands of 4 crate places below the middle line, the hatch
    # to the ship on the right wall.
    'warehouse': {
        'size': (640, 368),
        'wall': 16,
        'floor': (64, 72, 80),
        'doorways': [],
        'obstacles': [
            (16, 16, 160, 96, 'booth'),
            (192, 16, 432, 32, 'shelves'),
            (208, 232, 64, 64, ''),  # island 1: the crates name it
            (336, 232, 64, 64, ''),  # island 2
            (464, 232, 64, 64, ''),  # island 3
        ],
        'markup': True,
    },
    # Act 2: the deck as a diorama, one screen. The navigation console above the middle line,
    # the radio at the top wall, the airlock on the right wall, the hold with 7 bays at the
    # bottom (the hero cannot walk into the hold).
    'ship-deck': {
        'size': (640, 360),
        'wall': 16,
        'floor': (52, 64, 80),
        'doorways': [],
        'obstacles': [
            (160, 112, 64, 48, 'nav console'),
            (384, 16, 48, 32, 'radio desk'),
            (144, 264, 352, 80, ''),  # the hold: the bays name it
        ],
        'markup': True,
    },
    # Act 3: one map for every body; sky and ground are recoloured per body, the base is not.
    'colony': {
        'size': (640, 360),
        'wall': 16,
        'layers': ['colony-sky', 'colony-ground', 'colony-base'],
        'horizon': 128,
        'doorways': [],
        'obstacles': [
            (16, 16, 608, 112, 'sky'),
            (48, 96, 96, 48, 'lander'),
            (208, 96, 80, 48, 'shelter'),
        ],
        'markup': True,
    },
}


def wall_rects(location: dict) -> list[tuple[int, int, int, int]]:
    """Edge walls as (x, y, w, h), split around doorways."""
    width, height = location['size']
    t = location['wall']
    doors = location['doorways']

    def side(name: str, length: int, make) -> list[tuple[int, int, int, int]]:
        # Free spans of one side between its doorways; the corners belong to top and bottom.
        gaps = sorted((a, b) for s, a, b in doors if s == name)
        rects, start = [], t if name in ('left', 'right') else 0
        end_all = length - t if name in ('left', 'right') else length
        for a, b in gaps:
            if a > start:
                rects.append(make(start, a - start))
            start = b
        if end_all > start:
            rects.append(make(start, end_all - start))
        return rects

    return (
        side('top', width, lambda p, n: (p, 0, n, t))
        + side('bottom', width, lambda p, n: (p, height - t, n, t))
        + side('left', height, lambda p, n: (0, p, t, n))
        + side('right', height, lambda p, n: (width - t, p, t, n))
    )


def collision_rects(location: dict) -> list[tuple[int, int, int, int]]:
    """Every impassable rectangle of a location: walls first, then obstacles."""
    return wall_rects(location) + [tuple(o[:4]) for o in location['obstacles']]


# --- Drawing helpers ------------------------------------------------------------------------


def font(size: int = 8) -> ImageFont.FreeTypeFont:
    """The game font; sizes must be multiples of 8 (its pixel grid). PIL default if missing."""
    try:
        return ImageFont.truetype(str(FONT), size)
    except OSError:
        return ImageFont.load_default()


def new_draw(image: Image.Image) -> ImageDraw.ImageDraw:
    draw = ImageDraw.Draw(image)
    draw.fontmode = '1'  # no antialiasing: placeholder labels stay pixel-crisp
    return draw


def label(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, fill, size: int = 8, anchor='la'):
    draw.text(xy, text, font=font(size), fill=fill, anchor=anchor)


def frame(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], colour, width: int = 1):
    x0, y0, x1, y1 = box
    draw.rectangle((x0, y0, x1 - 1, y1 - 1), outline=colour, width=width)


def pixel_hash(image: Image.Image) -> str:
    """Short hash of the pixels (mode, size, data): changes with any edit of the picture."""
    digest = hashlib.sha1(f'{image.mode} {image.size}'.encode())
    digest.update(image.tobytes())
    return digest.hexdigest()[:16]


def is_real_art(path: Path) -> bool:
    """True if `path` exists and is not an untouched placeholder of this script.

    A placeholder carries a PLACEHOLDER comment with the hash of its pixels. Art painted over a
    placeholder in an editor that keeps the comment no longer matches the hash, so it counts as
    real art too.
    """
    if not path.exists():
        return False
    with Image.open(path) as existing:
        comment = str(existing.info.get('Comment', ''))
        if not comment.startswith('PLACEHOLDER'):
            return True
        if 'pixels=' not in comment:
            return False  # written before the hash existed: a placeholder
        return comment.rsplit('pixels=', 1)[1].strip() != pixel_hash(existing)


def save(image: Image.Image, relative: str) -> None:
    path = ASSETS / relative
    if is_real_art(path):
        print(f'  {relative}  kept: real art')
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    info = PngInfo()
    info.add_text(
        'Comment',
        f'PLACEHOLDER generated by tools/placeholders.py - replace with real art ({relative})'
        f' pixels={pixel_hash(image)}',
    )
    image.save(path, pnginfo=info, optimize=True)
    print(f'  {relative}  {image.width}x{image.height}')


# --- Placeholders ---------------------------------------------------------------------------


def menu() -> None:
    bg = Image.new('RGB', (GAME_WIDTH, GAME_HEIGHT), (16, 20, 40))
    d = new_draw(bg)
    # A fixed pseudo-random starfield, so regenerating gives the same file.
    seed = 12345
    for _ in range(140):
        seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF
        x, y = seed % GAME_WIDTH, (seed // GAME_WIDTH) % GAME_HEIGHT
        d.point((x, y), fill=(200, 210, 255) if seed % 3 else (120, 130, 170))
    frame(d, (0, 0, GAME_WIDTH, GAME_HEIGHT), (60, 70, 110))
    label(d, (4, GAME_HEIGHT - 4), f'menu/background.png {GAME_WIDTH}x{GAME_HEIGHT}', (90, 100, 140), anchor='ld')
    save(bg, 'menu/background.png')

    logo = Image.new('RGBA', (320, 100), (0, 0, 0, 0))
    d = new_draw(logo)
    frame(d, (0, 0, 320, 100), (255, 200, 60, 255))
    label(d, (160, 44), 'SPACE OWNER', (255, 200, 60, 255), size=24, anchor='mm')
    label(d, (160, 86), 'menu/logo.png 320x100', (255, 200, 60, 255), anchor='mm')
    save(logo, 'menu/logo.png')


def buttons() -> None:
    styles = {
        'normal': ((40, 60, 110), (120, 150, 220)),
        'hover': ((60, 90, 160), (190, 210, 255)),
        'pressed': ((25, 35, 70), (90, 110, 170)),
    }
    for state, (fill, edge) in styles.items():
        image = Image.new('RGBA', (160, 36), fill + (255,))
        d = new_draw(image)
        frame(d, (0, 0, 160, 36), edge, width=2)
        save(image, f'ui/button-{state}.png')


def panel() -> None:
    # 24x24 for 9-slice: 8 px corners and edges, the 8x8 centre stretches.
    image = Image.new('RGBA', (24, 24), (20, 24, 44, 255))
    d = new_draw(image)
    frame(d, (0, 0, 24, 24), (200, 210, 255, 255), width=2)
    frame(d, (3, 3, 21, 21), (90, 100, 150, 255))
    save(image, 'ui/panel.png')


def cursor() -> None:
    # Interaction hint: an "E" key cap.
    image = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    d = new_draw(image)
    d.rectangle((0, 0, 15, 15), fill=(240, 240, 240, 255), outline=(40, 40, 40, 255))
    label(d, (8, 8), 'E', (20, 20, 20, 255), anchor='mm')
    save(image, 'ui/cursor-interact.png')


# Cargo items in the order of ui/items.png: (id, two-letter code, colour).
ITEMS: list[tuple[str, str, tuple[int, int, int]]] = [
    ('fuel', 'FU', (220, 120, 40)),
    ('oxygen', 'O2', (80, 160, 230)),
    ('supplies', 'SU', (170, 130, 80)),
    ('battery', 'BA', (230, 210, 60)),
    ('solar', 'SO', (60, 90, 200)),
    ('reactor', 'RE', (200, 60, 60)),
    ('greenhouse', 'GR', (70, 170, 80)),
    ('regolith-kit', 'RG', (150, 110, 90)),
    ('ice-kit', 'IC', (170, 220, 240)),
    ('thermal-kit', 'TH', (240, 90, 140)),
]
ITEM_COLOUR = {item: colour for item, _, colour in ITEMS}


def lighter(colour: tuple[int, ...], by: int = 60) -> tuple[int, ...]:
    return tuple(min(c + by, 255) for c in colour[:3])


def darker(colour: tuple[int, ...], by: int = 60) -> tuple[int, ...]:
    return tuple(max(c - by, 0) for c in colour[:3])


def portraits() -> None:
    # (file name, label, colour, face): face 'head' draws a head, 'screen' a display.
    for name, text, colour, face in (
        ('hero', 'hero', (60, 140, 230), 'head'),
        ('hero-resolute', 'hero-R', (60, 140, 230), 'head'),
        ('hero-tired', 'hero-T', (60, 140, 230), 'head'),
        ('engineer', 'engin', (230, 140, 40), 'head'),
        ('engineer-worried', 'eng-W', (230, 140, 40), 'head'),
        ('astronomer', 'astro', (90, 180, 170), 'head'),
        ('astronomer-worried', 'ast-W', (90, 180, 170), 'head'),
        ('computer', 'CPU', (70, 90, 110), 'screen'),
    ):
        image = Image.new('RGB', (48, 48), colour)
        d = new_draw(image)
        if face == 'head':
            d.ellipse((12, 6, 35, 29), fill=lighter(colour), outline=(0, 0, 0))
        else:
            d.rectangle((8, 6, 39, 29), fill=(20, 40, 30), outline=(0, 0, 0))
            d.line((12, 18, 35, 18), fill=(80, 230, 120))
        frame(d, (0, 0, 48, 48), (0, 0, 0))
        label(d, (24, 41), text, (0, 0, 0), anchor='mm')
        save(image, f'portraits/{name}.png')


def character(name: str, colour: tuple[int, int, int], columns: int = 4) -> None:
    """Sheet of 32x48 frames, rows down, left, right, up. With 4 columns (the hero): column 0
    idle, 1-3 walk. With 1 column (a standing NPC): one standing frame per direction."""
    fw, fh = 32, 48
    image = Image.new('RGBA', (fw * columns, fh * 4), (0, 0, 0, 0))
    d = new_draw(image)
    light = lighter(colour, 70) + (255,)
    # Arrow tip and two base points per direction, relative to the body centre.
    arrows = {
        'down': ((0, 7), (-5, -3), (5, -3)),
        'left': ((-7, 0), (3, -5), (3, 5)),
        'right': ((7, 0), (-3, -5), (-3, 5)),
        'up': ((0, -7), (-5, 3), (5, 3)),
    }
    for row, direction in enumerate(('down', 'left', 'right', 'up')):
        for col in range(columns):
            x0, y0 = col * fw, row * fh
            bob = 0 if col == 0 else (-1 if col % 2 else 1)  # walk frames bob a pixel
            body = (x0 + 6, y0 + 10 + bob, x0 + 26, y0 + 44 + bob)
            d.rectangle(body, fill=colour + (255,), outline=(0, 0, 0, 255))
            d.rectangle((x0 + 10, y0 + 2 + bob, x0 + 22, y0 + 12 + bob), fill=light, outline=(0, 0, 0, 255))
            cx, cy = x0 + 16, y0 + 27 + bob
            d.polygon([(cx + ax, cy + ay) for ax, ay in arrows[direction]], fill=(255, 255, 255, 255))
            label(d, (x0 + 16, y0 + 42 + bob), str(col), (0, 0, 0, 255), anchor='ms')
            frame(d, (x0, y0, x0 + fw, y0 + fh), (255, 0, 255, 90))
    save(image, f'sprites/{name}.png')


def items() -> None:
    """ui/items.png: one 16x16 icon per cargo item in a row, in ITEMS order."""
    image = Image.new('RGBA', (16 * len(ITEMS), 16), (0, 0, 0, 0))
    d = new_draw(image)
    for i, (_, code, colour) in enumerate(ITEMS):
        x = i * 16
        d.rectangle((x, 0, x + 15, 15), fill=colour + (255,), outline=darker(colour, 90) + (255,))
        text = (0, 0, 0, 255) if sum(colour) > 380 else (255, 255, 255, 255)
        label(d, (x + 8, 8), code, text, anchor='mm')
    save(image, 'ui/items.png')


def panel_icons() -> None:
    """ui/panel-icons.png: 8x8 icons for the navigation panel rows."""
    icons = (
        ('O', (80, 160, 230)),  # oxygen
        ('S', (170, 130, 80)),  # supplies
        ('P', (230, 210, 60)),  # power
        ('F', (220, 120, 40)),  # fuel
        ('H', (240, 90, 140)),  # heat
        ('C', (150, 150, 170)),  # comms
    )
    image = Image.new('RGBA', (8 * len(icons), 8), (0, 0, 0, 0))
    d = new_draw(image)
    for i, (letter, colour) in enumerate(icons):
        d.rectangle((i * 8, 0, i * 8 + 7, 7), fill=colour + (255,))
        label(d, (i * 8 + 4, 4), letter, (0, 0, 0, 255), anchor='mm')
    save(image, 'ui/panel-icons.png')


def crate() -> None:
    """sprites/crate.png: an empty cargo crate with a flat 16x16 place for the item icon."""
    image = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    d = new_draw(image)
    d.rectangle((1, 3, 30, 31), fill=(120, 110, 90, 255), outline=(40, 36, 30, 255))
    d.rectangle((1, 3, 30, 6), fill=(150, 140, 115, 255), outline=(40, 36, 30, 255))
    d.rectangle((8, 11, 23, 26), fill=(200, 196, 180, 255))  # the icon goes here
    frame(d, (0, 0, 32, 32), (255, 0, 255, 90))
    save(image, 'sprites/crate.png')


def colony_sprites() -> None:
    """The universal colony module, the P1 buildings per item and the P1 sky objects."""
    image = Image.new('RGBA', (64, 48), (0, 0, 0, 0))
    d = new_draw(image)
    d.rectangle((4, 16, 59, 47), fill=(170, 175, 180, 255), outline=(50, 55, 60, 255))
    d.pieslice((12, 2, 51, 31), 180, 360, fill=(190, 195, 200, 255), outline=(50, 55, 60, 255))
    d.rectangle((24, 24, 39, 39), fill=(230, 230, 225, 255))  # plate for the item icon
    label(d, (32, 46), 'module', (30, 30, 30, 255), anchor='ms')
    save(image, 'sprites/colony/module.png')

    # P1: own buildings instead of the module (names as in the art order).
    for name, item in (
        ('greenhouse', 'greenhouse'),
        ('solar', 'solar'),
        ('reactor', 'reactor'),
        ('battery', 'battery'),
        ('regolith', 'regolith-kit'),
        ('ice', 'ice-kit'),
        ('thermal', 'thermal-kit'),
    ):
        colour = ITEM_COLOUR[item]
        image = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
        d = new_draw(image)
        d.rectangle((4, 16, 59, 63), fill=colour + (255,), outline=darker(colour, 90) + (255,))
        label(d, (32, 40), name[:6], (0, 0, 0, 255), anchor='mm')
        frame(d, (0, 0, 64, 64), (255, 0, 255, 90))
        save(image, f'sprites/colony/{name}.png')

    # P1: what hangs in the colony sky, per body.
    for body, what, colour, radius in (
        ('moon', 'Earth', (70, 120, 220), 28),
        ('mars', 'Sun', (255, 230, 120), 8),
    ):
        image = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
        d = new_draw(image)
        d.ellipse((32 - radius, 32 - radius, 31 + radius, 31 + radius), fill=colour + (255,))
        label(d, (32, 63), what[:8], (255, 255, 255, 255), anchor='ms')
        frame(d, (0, 0, 64, 64), (255, 0, 255, 90))
        save(image, f'sprites/colony/sky-{body}.png')


# Outline colour of map objects per class on backgrounds with `markup`.
KIND_COLOUR = {
    'spawn': (120, 255, 120),
    'door': (60, 220, 90),
    'npc': (255, 200, 60),
    'interactable': (90, 200, 255),
    'trigger': (255, 120, 255),
    'point': (255, 255, 255),
    'prop': (200, 170, 255),
}


def short_name(name: str, width: int) -> str:
    """A label that fits `width` px of the 8 px font: crates by item code (`FU1`, `O2`)."""
    if len(name) * 8 <= width:
        return name
    if name.startswith('crate-'):
        item, _, number = name.removeprefix('crate-').partition('-')
        codes = {i: code for i, code, _ in ITEMS}
        if item not in codes:  # an id with a dash: regolith-kit
            item, number = name.removeprefix('crate-'), ''
        if item in codes:
            return codes[item] + (number if number.isdigit() else '')
    compact = name.replace('-', '')  # bay-1 -> bay1
    if len(compact) * 8 <= width:
        return compact
    *words, number = name.split('-')
    if len(words) > 1 and number.isdigit():  # bay-access-3 -> ba3: neighbours do not overlap
        initials = ''.join(word[0] for word in words) + number
        if len(initials) * 8 <= width:
            return initials
    return name


def shadowed(d: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, colour, anchor='la') -> None:
    """A label with a 1 px dark shadow, readable on light and dark floors."""
    label(d, (xy[0] + 1, xy[1] + 1), text, (16, 16, 20), anchor=anchor)
    label(d, xy, text, colour, anchor=anchor)


def draw_markup(d: ImageDraw.ImageDraw, name: str) -> None:
    """Outlines and names of the map objects of tools/make_maps.py: the layout draft."""
    sys.dont_write_bytecode = True  # importing make_maps must not leave tools/__pycache__/
    from make_maps import MAPS  # noqa: PLC0415 - make_maps imports this module at its top

    width = LOCATIONS[name]['size'][0]
    labelled: dict[tuple[int, int], int] = {}  # points already labelled at a place
    for obj_name, cls, x, y, w, h in MAPS.get(name, []):
        colour = KIND_COLOUR[cls]
        if w == 0 and h == 0:
            d.line((x - 3, y, x + 3, y), fill=colour)
            d.line((x, y - 3, x, y + 3), fill=colour)
            below = labelled.get((x, y), 0)  # coincident points: next label one line lower
            labelled[(x, y)] = below + 1
            shadowed(d, (x + 5, y - 1 + below * 10), obj_name, colour, anchor='ls')
        else:
            d.rectangle((x, y, x + w - 1, y + h - 1), outline=colour)
            text = short_name(obj_name, w - 2)
            if x + 2 + len(text) * 8 > width:  # would run off the right edge
                shadowed(d, (x + w - 2, y + 2), text, colour, anchor='ra')
            else:
                shadowed(d, (x + 2, y + 2), text, colour)


def draw_geometry(d: ImageDraw.ImageDraw, geometry: dict, fill_obstacles: bool = True) -> None:
    """Walls, obstacles (filled, with their labels) and doorways of a location."""
    width, height = geometry['size']
    for x, y, w, h in wall_rects(geometry):
        d.rectangle((x, y, x + w - 1, y + h - 1), fill=(28, 30, 36), outline=(110, 115, 130))
    for i, (x, y, w, h, *name) in enumerate(geometry['obstacles'], 1):
        text = name[0] if name else f'obstacle {i}'
        if fill_obstacles:
            d.rectangle((x, y, x + w - 1, y + h - 1), fill=(150, 70, 60), outline=(240, 160, 140))
        else:
            d.rectangle((x, y, x + w - 1, y + h - 1), outline=(240, 160, 140))
        if text:  # an empty label draws none
            label(d, (x + w // 2, y + h // 2), text, (255, 230, 220), anchor='mm')
    for side, a, b in geometry['doorways']:
        t = geometry['wall']
        box = {
            'top': (a, 0, b - 1, t - 1),
            'bottom': (a, height - t, b - 1, height - 1),
            'left': (0, a, t - 1, b - 1),
            'right': (width - t, a, width - 1, b - 1),
        }[side]
        d.rectangle(box, fill=(60, 170, 90))


def draw_grid(d: ImageDraw.ImageDraw, size: tuple[int, int], floor: tuple[int, ...], top: int = 0) -> None:
    width, height = size
    grid = tuple(c + 10 for c in floor[:3])
    for x in range(0, width, TILE):
        d.line((x, top, x, height), fill=grid)
    for y in range(top, height, TILE):
        d.line((0, y, width, y), fill=grid)


def location(name: str, geometry: dict) -> None:
    if 'layers' in geometry:
        layered_location(name, geometry)
        return
    width, height = geometry['size']
    floor = geometry['floor']
    image = Image.new('RGB', (width, height), floor)
    d = new_draw(image)
    draw_grid(d, (width, height), floor)
    # The middle line the smoke tests walk along.
    d.line((0, height // 2, width, height // 2), fill=tuple(c + 30 for c in floor))
    draw_geometry(d, geometry)
    if geometry.get('markup'):
        draw_markup(d, name)
    label(d, (24, 22), f'{name}  {width}x{height}  PLACEHOLDER', (230, 230, 240))
    save(image, f'images/locations/{name}.png')


def layered_location(name: str, geometry: dict) -> None:
    """The colony: sky (opaque), ground (transparent above the horizon), base (transparent but
    for the lander, the shelter and the layout draft). Sky and ground are light neutral greys
    because the game tints them per body; the base is not tinted."""
    width, height = geometry['size']
    horizon = geometry['horizon']
    sky_layer, ground_layer, base_layer = geometry['layers']

    sky = Image.new('RGB', (width, height), (212, 214, 218))
    d = new_draw(sky)
    for y in range(0, horizon, 32):
        d.line((0, y, width, y), fill=(200, 202, 206))
    label(d, (24, 22), f'{sky_layer}  {width}x{height}  PLACEHOLDER', (120, 122, 128))
    save(sky, f'images/locations/{sky_layer}.png')

    ground_floor = (176, 176, 172)
    ground = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    d = new_draw(ground)
    d.rectangle((0, horizon, width - 1, height - 1), fill=ground_floor + (255,))
    draw_grid(d, (width, height), ground_floor, top=horizon)
    d.line((0, height // 2, width, height // 2), fill=lighter(ground_floor, 30))
    label(d, (24, height - 16), f'{ground_layer}  {width}x{height}  PLACEHOLDER', (110, 110, 106))
    save(ground, f'images/locations/{ground_layer}.png')

    base = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    d = new_draw(base)
    for x, y, w, h, *_ in geometry['obstacles'][1:]:  # lander and shelter, not the sky
        d.rectangle((x, y, x + w - 1, y + h - 1), fill=(90, 96, 104, 255))
    draw_geometry(d, geometry, fill_obstacles=False)
    draw_markup(d, name)
    label(d, (24, 40), f'{base_layer}  {width}x{height}  PLACEHOLDER', (40, 40, 48))
    save(base, f'images/locations/{base_layer}.png')


def print_geometry() -> None:
    out = {
        name: {
            'size': geometry['size'],
            'wall': geometry['wall'],
            'doorways': geometry['doorways'],
            'obstacles': geometry['obstacles'],
            'collisions': collision_rects(geometry),
        }
        for name, geometry in LOCATIONS.items()
    }
    print(json.dumps(out, indent=1))


def main() -> None:
    if '--geometry' in sys.argv:
        print_geometry()
        return
    print(f'Writing placeholders into {ASSETS}')
    menu()
    buttons()
    panel()
    cursor()
    panel_icons()
    portraits()
    items()
    crate()
    colony_sprites()
    character('hero', (60, 140, 230))
    character('npc-engineer', (230, 140, 40), columns=1)
    character('npc-astronomer', (90, 180, 170), columns=1)
    for name, geometry in LOCATIONS.items():
        location(name, geometry)


if __name__ == '__main__':
    main()
