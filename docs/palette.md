# Palette

TODO (artists): fill in the game's palette and keep it here, so every artist and the UI code use
the same colours.

Constraints from the team's design document:

- a limited palette of **16 base colours**;
- each base colour has **16 shades**;
- the same palette for characters, locations, portraits and UI.

What to put here:

1. A table of the base colours: name, hex value (`#rrggbb`), what it is used for (skin, metal,
   space, UI frame, ...).
2. The shades of each base colour, darkest to lightest, as hex values.
3. A palette file for the drawing tools (`docs/palette.gpl` for Aseprite / GIMP / Krita, or a
   `.png` swatch strip), linked from here.

| Base colour | Hex | Used for |
| ----------- | --- | -------- |
| TODO        |     |          |

When the palette is decided, the UI colours in `src/ui/theme.ts` (text, highlight, backdrop) are
changed to palette colours to match.
