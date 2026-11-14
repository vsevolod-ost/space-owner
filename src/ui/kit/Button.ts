import Phaser from 'phaser';
import type { AudioKey } from '@/assets';
import { services } from '@/core/services';
import { cutCorners } from '@/ui/kit/shapes';
import { createText } from '@/ui/kit/text';
import { theme } from '@/ui/theme';

/** Default size of a button, px. */
const DEFAULT_WIDTH = 160;
const DEFAULT_HEIGHT = 36;
/** Below this size a button is a plain rectangle (no cut corners or corner marks), px. */
const SMALL_WIDTH = 40;
const SMALL_HEIGHT = 28;
/** Size of the cut corners of a full-size button, px. */
const CORNER_CUT = 8;
/** Sound of a click. */
const CLICK_SOUND: AudioKey = 'ui-click';

/** The look a button is drawn in. */
type ButtonState = 'normal' | 'hover' | 'pressed';

/** Options of a `Button`. */
export interface ButtonOptions {
  /** Size of the button, px; default 160x36. */
  width?: number;
  height?: number;
}

/**
 * Labelled button drawn in code (`theme.button`: a dark plate with cut corners and a neon
 * outline that changes on hover and press; small buttons are plain rectangles). `(x, y)` is
 * the centre. Fires `onClick` (and plays the `ui-click` sound) when the pointer is both
 * pressed and released over it. A disabled button is half transparent and ignores input.
 */
export class Button extends Phaser.GameObjects.Container {
  /** Text shown on the button. */
  readonly label: string;
  private readonly background: Phaser.GameObjects.Graphics;
  private readonly buttonWidth: number;
  private readonly buttonHeight: number;
  private isPressed = false;
  private enabled = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    label: string,
    onClick: () => void,
    options: ButtonOptions = {},
  ) {
    super(scene, Math.round(x), Math.round(y));
    this.label = label;
    this.buttonWidth = Math.round(options.width ?? DEFAULT_WIDTH);
    this.buttonHeight = Math.round(options.height ?? DEFAULT_HEIGHT);

    this.background = scene.add.graphics();
    this.draw('normal');
    const text = createText(scene, 0, 0, label, 'body').setOrigin(0.5);
    this.add([this.background, text]);
    scene.add.existing(this);

    const w = this.buttonWidth;
    const h = this.buttonHeight;
    this.background
      .setInteractive({
        hitArea: new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        useHandCursor: true,
      })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
        if (this.enabled) this.draw('hover');
      })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
        this.isPressed = false;
        if (this.enabled) this.draw('normal');
      })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
        if (!this.enabled) return;
        this.isPressed = true;
        this.draw('pressed');
      })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        if (!this.enabled || !this.isPressed) return;
        this.isPressed = false;
        this.draw('hover');
        services.audio.playSfx(CLICK_SOUND);
        onClick();
      });
  }

  /** Enables or disables the button; a disabled one is drawn faded and ignores the pointer. */
  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    this.isPressed = false;
    this.setAlpha(enabled ? 1 : theme.disabledAlpha);
    this.draw('normal');
    if (this.background.input) this.background.input.cursor = enabled ? 'pointer' : 'default';
    return this;
  }

  /** Whether the button reacts to input. */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** Redraws the plate in the colours of `state`. */
  private draw(state: ButtonState): void {
    const look = theme.button[state];
    const w = this.buttonWidth;
    const h = this.buttonHeight;
    const left = -Math.floor(w / 2);
    const top = -Math.floor(h / 2);
    const g = this.background.clear();
    g.fillStyle(look.fill, 1).lineStyle(look.line, look.stroke, 1);
    if (w < SMALL_WIDTH || h < SMALL_HEIGHT) {
      g.fillRect(left, top, w, h).strokeRect(left, top, w, h);
      return;
    }
    const outline = cutCorners(left, top, w, h, CORNER_CUT);
    g.fillPoints(outline, true).strokePoints(outline, true);
    // Two small corner marks, top left and bottom right.
    g.lineStyle(1, look.stroke, 0.9)
      .strokeRect(left + 3, top + 3, 3, 3)
      .strokeRect(left + w - 6, top + h - 6, 3, 3);
  }
}
