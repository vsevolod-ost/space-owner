# Palette

The game's palette as the artists delivered it: 27 colours, left to right in
[palette.png](palette.png) (one 8×8 swatch each, 216×8). The ship deck and the computer portrait
use only these colours; the menu ship (`menu/ship.png`) does not yet (about 700 colours).

| #   | Hex       |
| --- | --------- |
| 1   | `#c0cbdc` |
| 2   | `#8b9cb2` |
| 3   | `#124e89` |
| 4   | `#3b4664` |
| 5   | `#181425` |
| 6   | `#ffffff` |
| 7   | `#242b46` |
| 8   | `#5e6786` |
| 9   | `#d57443` |
| 10  | `#ffaf34` |
| 11  | `#fee661` |
| 12  | `#763a3f` |
| 13  | `#b57154` |
| 14  | `#0797d8` |
| 15  | `#ead4aa` |
| 16  | `#28e8f2` |
| 17  | `#254a7b` |
| 18  | `#c28569` |
| 19  | `#e8b796` |
| 20  | `#3e2731` |
| 21  | `#e4a672` |
| 22  | `#0099db` |
| 23  | `#2ce8f5` |
| 24  | `#feae34` |
| 25  | `#fee761` |
| 26  | `#b86f50` |
| 27  | `#733e39` |

Open points for the artists:

- Six pairs are almost the same colour: 10 and 24, 11 and 25, 13 and 26, 12 and 27, 14 and 22,
  16 and 23. Keep one of each pair, or say why both are needed.
- The team's design document asks for 16 base colours with 16 shades each; this palette is a
  flat list. Say which colours are the bases, and what each is used for (skin, metal, space, UI
  frame, ...), and add that as a column above.
- A palette file for the drawing tools (`docs/palette.gpl` for Aseprite / GIMP / Krita) is
  welcome next to the PNG.

When the palette is final, the UI colours in `src/ui/theme.ts` (text, highlight, backdrop) are
changed to palette colours to match.
