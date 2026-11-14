import type Phaser from 'phaser';
import { HOLD_STRIP_DEPTH } from '@/ui/HoldStrip';
import { theme } from '@/ui/theme';

/**
 * Depth of the marker in the world scene: above every actor and prop (their depth is their feet
 * y, at most the map's height), below the HOLD strip.
 */
const MARKER_DEPTH = HOLD_STRIP_DEPTH - 1;
/** Half a blink: the marker is shown for this long, then hidden for as long, ms. */
const BLINK_MS = 300;
/**
 * Gap between the station's top edge and the marker's tip, px: room for the "E" hint the UI
 * puts over a focused object (its bottom is 4 px above the object, its height 16 px).
 */
const GAP_ABOVE = 24;
/**
 * Gap between the station's bottom edge and the tip of a marker drawn under it, px: below the
 * HOLD strip (its bottom is at y 28) for the porthole at the top of the deck.
 */
const GAP_BELOW = 16;
/** Rows of the pointer, widest first, px (a pixel-art triangle). */
const ROWS = [9, 7, 5, 3, 1];

/** A map object the marker can point at (a `MapObject` of the location). */
export interface MarkerTarget {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where `StationMarker` points now (`WorldScene.debugInfo().marker`). */
export interface StationMarkerInfo {
  /** The map object it points at. */
  station: string;
  /** Tip of the pointer in map pixels. */
  x: number;
  y: number;
  /** Whether it points down at the object from above (else up from below). */
  above: boolean;
  /** Whether it is drawn in this blink phase. */
  visible: boolean;
}

/**
 * The blinking pointer over the deck station of the station alarm (plan act2-stations S5): a
 * small triangle in `theme.stationAlarm.marker` above the station's map object, pointing down
 * at it (under the object, pointing up, when there is no room above: the porthole at the top
 * of the deck). WorldScene calls `update` every frame with the alarm's station, or null; a
 * station that is not an object of this location shows nothing. World-space, so it sits on
 * the object and stops with the world under panels.
 */
export class StationMarker {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private info: StationMarkerInfo | null = null;
  /** Points of the last drawn pointer (`station|above`), to redraw only when it changes. */
  private drawn: string | null = null;

  constructor(
    scene: Phaser.Scene,
    private readonly objects: readonly MarkerTarget[],
  ) {
    this.graphics = scene.add.graphics().setDepth(MARKER_DEPTH).setVisible(false);
  }

  /** Points at `station` (a map object name) blinking by `timeMs`, or hides with null. */
  update(station: string | null, timeMs: number): void {
    const object =
      station === null ? undefined : this.objects.find((candidate) => candidate.name === station);
    if (!station || !object) {
      this.info = null;
      this.graphics.setVisible(false);
      return;
    }
    const above = object.y >= GAP_ABOVE + ROWS.length;
    const x = Math.round(object.x + object.width / 2);
    const y = above ? object.y - GAP_ABOVE : object.y + object.height + GAP_BELOW;
    const key = `${station}|${above}`;
    if (key !== this.drawn) {
      this.drawn = key;
      this.draw(x, y, above);
    }
    const visible = Math.floor(timeMs / BLINK_MS) % 2 === 0;
    this.graphics.setVisible(visible);
    this.info = { station, x, y, above, visible };
  }

  /** Where it points now, or null. */
  debugInfo(): StationMarkerInfo | null {
    return this.info ? { ...this.info } : null;
  }

  /** Removes the pointer (the scene shuts down). */
  destroy(): void {
    this.graphics.destroy();
  }

  /** Draws the triangle with its tip at (x, y), pointing down when `above`, else up. */
  private draw(x: number, y: number, above: boolean): void {
    const g = this.graphics;
    g.clear();
    g.fillStyle(theme.stationAlarm.marker, 1);
    ROWS.forEach((width, i) => {
      // Down: the widest row is the farthest from the tip.
      const row = ROWS.length - 1 - i;
      const rowY = above ? y - 1 - row : y + row;
      g.fillRect(x - (width - 1) / 2, rowY, width, 1);
    });
  }
}
