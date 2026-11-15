import type Phaser from 'phaser';

type Graphics = Phaser.GameObjects.Graphics;

/** Lit part and gap of a gauge segment, px. */
const SEGMENT_LIT = 3;
const SEGMENT_GAP = 1;
/** Stripe and period of the hazard pattern, px. */
const HAZARD_STRIPE = 3;
const HAZARD_PERIOD = 6;
/** Space a selection band leaves above and below the row it marks, px. */
export const SELECTION_PAD = 3;
/** Width of the lit bar at the left of a selection band, px. */
const SELECTION_BAR = 2;

/** Colours of a selection band (`theme.selection`). */
export interface SelectionLook {
  band: number;
  bandAlpha: number;
  bar: number;
  arrow: number;
}

/**
 * Fills a `w` x `h` rectangle at `(x, y)` whose corners are cut at 45 degrees by `cut` px. Drawn
 * as whole-pixel rows (no slanted lines), so the edge is a clean pixel staircase.
 */
export function fillChamfered(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  cut: number,
  color: number,
  alpha = 1,
): void {
  const c = clampCut(cut, w, h);
  g.fillStyle(color, alpha);
  for (let k = 0; k < c; k++) {
    const inset = c - k;
    g.fillRect(x + inset, y + k, w - inset * 2, 1);
    g.fillRect(x + inset, y + h - 1 - k, w - inset * 2, 1);
  }
  g.fillRect(x, y + c, w, h - c * 2);
}

/**
 * Draws the 1 px outline of the shape `fillChamfered` fills. The top and left edges take
 * `color`, the bottom and right ones `shade` (default the same): a bevel lit from the top left.
 * Rings nest: the next one in is `(x + 1, y + 1, w - 2, h - 2, cut - 1)`.
 */
export function strokeChamfered(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  cut: number,
  color: number,
  shade = color,
): void {
  const c = clampCut(cut, w, h);
  const right = x + w - 1;
  const bottom = y + h - 1;
  g.fillStyle(color, 1).fillRect(x, y + c, 1, h - c * 2);
  g.fillStyle(shade, 1).fillRect(right, y + c, 1, h - c * 2);
  g.fillStyle(color, 1).fillRect(x + c, y, w - c * 2, 1);
  for (let k = 1; k < c; k++)
    g.fillRect(x + c - k, y + k, 1, 1).fillRect(right - c + k, y + k, 1, 1);
  g.fillStyle(shade, 1).fillRect(x + c, bottom, w - c * 2, 1);
  for (let k = 1; k < c; k++) {
    g.fillRect(x + c - k, bottom - k, 1, 1).fillRect(right - c + k, bottom - k, 1, 1);
  }
}

/**
 * Draws a gauge: a `w` x `h` strip in `back` whose first `filled` px are lit in `color` and cut
 * into segments, like a row of lamps on an instrument.
 */
export function drawGauge(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  filled: number,
  color: number,
  back: number,
): void {
  const lit = Math.max(0, Math.min(Math.round(filled), w));
  g.fillStyle(back, 1).fillRect(x, y, w, h);
  if (lit === 0) return;
  g.fillStyle(color, 1).fillRect(x, y, lit, h);
  g.fillStyle(back, 1);
  const step = SEGMENT_LIT + SEGMENT_GAP;
  for (let gap = SEGMENT_LIT; gap < lit; gap += step) g.fillRect(x + gap, y, SEGMENT_GAP, h);
}

/**
 * Fills a `w` x `h` rectangle with slanted hazard stripes of `stripe` over `base`, as on the
 * ship's airlock.
 */
export function fillHazard(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  base: number,
  stripe: number,
): void {
  g.fillStyle(base, 1).fillRect(x, y, w, h);
  g.fillStyle(stripe, 1);
  for (let row = 0; row < h; row++) {
    for (let start = -(row % HAZARD_PERIOD); start < w; start += HAZARD_PERIOD) {
      const from = Math.max(start, 0);
      const to = Math.min(start + HAZARD_STRIPE, w);
      if (to > from) g.fillRect(x + from, y + row, to - from, 1);
    }
  }
}

/**
 * Fills a small pixel triangle whose long side is `size` px (odd): pointing right, `(x, y)` is
 * the top of its left side; pointing down, the left of its top side.
 */
export function fillArrow(
  g: Graphics,
  x: number,
  y: number,
  direction: 'right' | 'down',
  color: number,
  size = 5,
): void {
  g.fillStyle(color, 1);
  for (let k = 0; size - k * 2 > 0; k++) {
    const length = size - k * 2;
    if (direction === 'right') g.fillRect(x + k, y + k, 1, length);
    else g.fillRect(x + k, y + k, length, 1);
  }
}

/**
 * Draws the mark of a selected row: a tinted band `w` x `h` at `(x, y)` with a lit bar at its
 * left and an arrow `arrowX` px in and `arrowY` px down: by default level with a line of 8 px
 * text that starts `SELECTION_PAD` below the band's top.
 */
export function drawSelection(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  arrowX: number,
  look: SelectionLook,
  arrowY = SELECTION_PAD + 1,
): void {
  g.fillStyle(look.band, look.bandAlpha).fillRect(x + SELECTION_BAR, y, w - SELECTION_BAR, h);
  g.fillStyle(look.bar, 1).fillRect(x, y, SELECTION_BAR, h);
  fillArrow(g, x + arrowX, y + arrowY, 'right', look.arrow);
}

function clampCut(cut: number, w: number, h: number): number {
  return Math.max(0, Math.min(cut, Math.floor(Math.min(w, h) / 2)));
}
