import type Phaser from 'phaser';
import { createText } from '@/ui/kit/text';
import { GATE_COLORS, type GateState } from '@/ui/navigation/SystemMap';
import { theme } from '@/ui/theme';

/** What `GateRibbon.draw` shows. */
export interface RibbonView {
  /** State of each gate, in flight order. */
  gates: readonly GateState[];
  /**
   * Where the ship is: on leg `leg` (from node `leg` to node `leg + 1`; node 0 is the Earth),
   * `fraction` of the way; null before the voyage.
   */
  ship: { leg: number; fraction: number } | null;
  /** Colour of the ship's marker. */
  shipColor: number;
}

/** Radius of a node, px. */
const NODE = 3;
/** Ship marker: half width and height of the triangle above the line, px. */
const SHIP_HALF = 3;
const SHIP_HEIGHT = 5;
/** Space between the line and the names under it, px. */
const NAME_GAP = 6;
/** Room kept on each side for the end nodes' names, px (half of a six-letter name, "EUROPA"). */
const SIDE = 28;

/**
 * The strip of gates across the top of the navigation panel (GDD `ux-panel-layout` B): the
 * Earth and the six gates on a line, passed / current / ahead in the map's colours, and the
 * ship moving along its leg from the first second.
 */
export class GateRibbon {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly names: Phaser.GameObjects.Text[];
  private readonly xs: number[];
  private readonly lineY: number;

  /** `names`: the Earth's and the gates' names, in order. */
  constructor(scene: Phaser.Scene, area: Phaser.Geom.Rectangle, names: readonly string[]) {
    this.lineY = Math.round(area.y + SHIP_HEIGHT + NODE);
    const step = (area.width - SIDE * 2) / Math.max(1, names.length - 1);
    this.xs = names.map((_, i) => Math.round(area.x + SIDE + step * i));
    this.graphics = scene.add.graphics();
    this.names = names.map((name, i) =>
      createText(scene, this.xs[i], this.lineY + NAME_GAP, name.toUpperCase(), 'small').setOrigin(
        0.5,
        0,
      ),
    );
  }

  /** Draws the ribbon for `view`. */
  draw(view: RibbonView): void {
    const g = this.graphics;
    const y = this.lineY;
    g.clear();
    g.lineStyle(1, theme.map.orbit, 1);
    g.lineBetween(this.xs[0], y, this.xs[this.xs.length - 1], y);
    this.xs.forEach((x, node) => {
      // Node 0 is the Earth: always behind.
      const state: GateState = node === 0 ? 'passed' : (view.gates[node - 1] ?? 'ahead');
      const color = GATE_COLORS[state];
      if (state === 'ahead') {
        g.fillStyle(theme.bar.back, 1);
        g.fillCircle(x, y, NODE);
        g.lineStyle(1, color, 1);
        g.strokeCircle(x, y, NODE);
      } else {
        g.fillStyle(color, 1);
        g.fillCircle(x, y, NODE);
      }
      const nameColor =
        state === 'current'
          ? theme.text.highlight
          : state === 'passed'
            ? theme.text.normal
            : theme.text.dim;
      this.names[node].setColor(nameColor);
    });
    if (!view.ship) return;
    const from = this.xs[Math.min(view.ship.leg, this.xs.length - 1)];
    const to = this.xs[Math.min(view.ship.leg + 1, this.xs.length - 1)];
    const x = Math.round(from + (to - from) * view.ship.fraction);
    const top = y - NODE - SHIP_HEIGHT;
    g.fillStyle(view.shipColor, 1);
    g.fillTriangle(x - SHIP_HALF, top, x + SHIP_HALF, top, x, y - NODE);
  }
}
