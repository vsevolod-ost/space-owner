import Phaser from 'phaser';
import { createText } from '@/ui/kit/text';
import type { TextVariant } from '@/ui/kit/text';
import { Panel } from '@/ui/kit/Panel';
import { theme } from '@/ui/theme';

/** Options of a `Label`. */
export interface LabelOptions {
  /** Text style; default `body`. */
  variant?: TextVariant;
  /**
   * Which point of the label sits at (x, y), as fractions of its size like `setOrigin`:
   * (0, 0) top-left, (0.5, 1) bottom centre. Default (0.5, 0.5).
   */
  originX?: number;
  originY?: number;
  /** Longer lines wrap at this width (text only, without padding), px. */
  wrapWidth?: number;
}

/**
 * Short text on a panel that fits around it (padding `theme.labelPadding`): toasts, the
 * interaction hint, tooltips. Resizes itself on `setText`; stays on whole pixels.
 *
 * ```ts
 * const label = new Label(this, 320, 344, 'Saved', { originY: 1 });
 * label.setText('Saved at the airlock');
 * ```
 */
export class Label extends Phaser.GameObjects.Container {
  private readonly panel: Panel;
  private readonly textObject: Phaser.GameObjects.Text;
  private readonly anchorX: number;
  private readonly anchorY: number;

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, options: LabelOptions = {}) {
    super(scene, Math.round(x), Math.round(y));
    this.anchorX = options.originX ?? 0.5;
    this.anchorY = options.originY ?? 0.5;
    this.panel = new Panel(scene, 0, 0, 0, 0);
    this.textObject = createText(scene, 0, 0, '', options.variant ?? 'body', {
      align: 'center',
      lineSpacing: theme.lineSpacing,
      ...(options.wrapWidth ? { wordWrap: { width: options.wrapWidth } } : {}),
    });
    this.add([this.panel, this.textObject]);
    scene.add.existing(this);
    this.setText(text);
  }

  /** The text shown. */
  get text(): string {
    return this.textObject.text;
  }

  /** Replaces the text and refits the panel around it. */
  setText(text: string): this {
    this.textObject.setText(text);
    const pad = theme.labelPadding;
    const width = Math.ceil(this.textObject.width) + pad * 2;
    const height = Math.ceil(this.textObject.height) + pad * 2;
    const left = -Math.round(width * this.anchorX);
    const top = -Math.round(height * this.anchorY);
    this.panel.setPosition(left, top).resize(width, height);
    this.textObject.setPosition(left + pad, top + pad);
    this.setSize(width, height);
    return this;
  }
}
