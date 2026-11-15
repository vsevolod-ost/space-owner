import Phaser from 'phaser';
import { fillChamfered, strokeChamfered } from '@/ui/kit/shapes';
import { theme } from '@/ui/theme';

/** Smallest panel side, px. */
const MIN_SIZE = 16;
/** Panels this high or lower are compact: a small corner cut and a 2 px frame, no lit strips. */
const COMPACT_HEIGHT = 36;
/** Corner cut of a compact and of a full panel, px. */
const COMPACT_CUT = 2;
const FULL_CUT = 4;
/** The lit strips on a full panel's bezel: length, distance from the corner, least panel width. */
const ACCENT_LENGTH = 16;
const ACCENT_INSET = 10;
const ACCENT_MIN_WIDTH = 64;

/**
 * Framed background of any size, drawn in code (`theme.panel`): dark glass in a steel bezel with
 * cut corners, lit from the top left, and two lit strips on the bezel of full-size panels;
 * panels 36 px high or lower (toasts, hints, strips) get a thinner frame. Positioned by its
 * top-left corner; the size is rounded to whole pixels and is never below 16 px. A plain
 * `setInteractive()` makes the whole panel clickable.
 *
 * ```ts
 * const panel = new Panel(this, 120, 80, 400, 200);
 * panel.resize(400, 240);
 * ```
 */
export class Panel extends Phaser.GameObjects.Container {
  private readonly background: Phaser.GameObjects.Graphics;
  private panelWidth = MIN_SIZE;
  private panelHeight = MIN_SIZE;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number) {
    super(scene, Math.round(x), Math.round(y));
    this.background = scene.add.graphics();
    this.add(this.background);
    scene.add.existing(this);
    this.resize(width, height);
  }

  /** Changes the size, keeping the top-left corner. */
  resize(width: number, height: number): this {
    this.panelWidth = clampSize(width);
    this.panelHeight = clampSize(height);
    // A Container's size centres its hit area on its position; the panel's starts top-left,
    // so keep the size 0 and give the hit area explicitly (see setInteractive).
    if (this.input?.hitArea instanceof Phaser.Geom.Rectangle) {
      this.input.hitArea.setSize(this.panelWidth, this.panelHeight);
    }
    this.draw();
    return this;
  }

  /** Without arguments the hit area is the whole panel; with them, as in Phaser. */
  override setInteractive(
    ...args: Parameters<Phaser.GameObjects.Container['setInteractive']>
  ): this {
    if (args.length > 0) return super.setInteractive(...args);
    return super.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, this.panelWidth, this.panelHeight),
      Phaser.Geom.Rectangle.Contains,
    );
  }

  private draw(): void {
    const w = this.panelWidth;
    const h = this.panelHeight;
    const look = theme.panel;
    const g = this.background.clear();
    if (h <= COMPACT_HEIGHT) {
      fillChamfered(g, 0, 0, w, h, COMPACT_CUT, look.fill, look.fillAlpha);
      strokeChamfered(g, 0, 0, w, h, COMPACT_CUT, look.outline);
      strokeChamfered(g, 1, 1, w - 2, h - 2, COMPACT_CUT - 1, look.frame, look.shade);
      return;
    }
    fillChamfered(g, 0, 0, w, h, FULL_CUT, look.fill, look.fillAlpha);
    // The bezel, outside in: a dark line, the lit and shaded edges, the face, a dark line.
    strokeChamfered(g, 0, 0, w, h, FULL_CUT, look.outline);
    strokeChamfered(g, 1, 1, w - 2, h - 2, FULL_CUT - 1, look.light, look.shade);
    strokeChamfered(g, 2, 2, w - 4, h - 4, FULL_CUT - 2, look.frame);
    strokeChamfered(g, 3, 3, w - 6, h - 6, FULL_CUT - 3, look.outline);
    if (w >= ACCENT_MIN_WIDTH) {
      g.fillStyle(look.accent, 1)
        .fillRect(ACCENT_INSET, 2, ACCENT_LENGTH, 1)
        .fillRect(w - ACCENT_INSET - ACCENT_LENGTH, h - 3, ACCENT_LENGTH, 1);
    }
  }
}

function clampSize(size: number): number {
  return Math.max(Math.round(size), MIN_SIZE);
}
