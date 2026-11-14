import Phaser from 'phaser';
import { cutCorners } from '@/ui/kit/shapes';
import { theme } from '@/ui/theme';

/** Smallest panel side, px. */
const MIN_SIZE = 16;
/** Panels this high or lower are compact: small corner cut, thin outline, no corner marks. */
const COMPACT_HEIGHT = 36;
/** Corner cut of a compact and of a full panel, px. */
const COMPACT_CUT = 4;
const FULL_CUT = 12;

/**
 * Framed background of any size, drawn in code (`theme.panel`: a deep-space plate with cut
 * corners, an indigo outline and four corner marks on full-size panels). Positioned by its
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
    const compact = h <= COMPACT_HEIGHT;
    const look = theme.panel;
    const outline = cutCorners(0, 0, w, h, compact ? COMPACT_CUT : FULL_CUT);
    const g = this.background.clear();
    g.fillStyle(look.fill, look.fillAlpha).fillPoints(outline, true);
    g.lineStyle(compact ? 1 : 2, look.stroke, 1).strokePoints(outline, true);
    // Corner marks only on big panels: on small widgets they would cover the text.
    if (!compact) {
      g.lineStyle(1, look.accent, 0.8)
        .strokeRect(6, 6, 4, 4)
        .strokeRect(w - 10, 6, 4, 4)
        .strokeRect(6, h - 10, 4, 4)
        .strokeRect(w - 10, h - 10, 4, 4);
    }
  }
}

function clampSize(size: number): number {
  return Math.max(Math.round(size), MIN_SIZE);
}
