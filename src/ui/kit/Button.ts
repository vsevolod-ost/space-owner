import Phaser from 'phaser';
import type { AudioKey, ImageKey } from '@/assets';
import { services } from '@/core/services';
import { createText } from '@/ui/kit/text';
import { theme } from '@/ui/theme';

const TEXTURE = {
  normal: 'button-normal',
  hover: 'button-hover',
  pressed: 'button-pressed',
} as const satisfies Record<string, ImageKey>;
/** Size of the button art, px; the default button size. */
const ART_WIDTH = 160;
const ART_HEIGHT = 36;
/** Sound of a click. */
const CLICK_SOUND: AudioKey = 'ui-click';

/** Options of a `Button`. */
export interface ButtonOptions {
  /** Size of the button, px; default the art size 160x36. Other sizes stretch the art 9-slice. */
  width?: number;
  height?: number;
}

/**
 * Labelled button (160x36 art from `ui/button-{normal,hover,pressed}.png`, label drawn by the
 * game - never bake text into the art). `(x, y)` is the centre. Fires `onClick` (and plays the
 * `ui-click` sound) when the pointer is both pressed and released over it. A disabled button is
 * half transparent and ignores input. Other sizes (`options`) stretch the art as a 9-slice with
 * corners of `theme.buttonBorder` px, so a small "+" button keeps a crisp frame.
 */
export class Button extends Phaser.GameObjects.Container {
  /** Text shown on the button. */
  readonly label: string;
  private readonly background: Phaser.GameObjects.NineSlice;
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

    const border = theme.buttonBorder;
    this.background = scene.add.nineslice(
      0,
      0,
      TEXTURE.normal,
      undefined,
      options.width ?? ART_WIDTH,
      options.height ?? ART_HEIGHT,
      border,
      border,
      border,
      border,
    );
    const text = createText(scene, 0, 0, label, 'body').setOrigin(0.5);
    this.add([this.background, text]);
    scene.add.existing(this);

    this.background
      .setInteractive({ useHandCursor: true })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
        if (this.enabled) this.background.setTexture(TEXTURE.hover);
      })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
        this.isPressed = false;
        if (this.enabled) this.background.setTexture(TEXTURE.normal);
      })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
        if (!this.enabled) return;
        this.isPressed = true;
        this.background.setTexture(TEXTURE.pressed);
      })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        if (!this.enabled || !this.isPressed) return;
        this.isPressed = false;
        this.background.setTexture(TEXTURE.hover);
        services.audio.playSfx(CLICK_SOUND);
        onClick();
      });
  }

  /** Enables or disables the button; a disabled one is drawn faded and ignores the pointer. */
  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    this.isPressed = false;
    this.setAlpha(enabled ? 1 : theme.disabledAlpha);
    this.background.setTexture(TEXTURE.normal);
    if (this.background.input) this.background.input.cursor = enabled ? 'pointer' : 'default';
    return this;
  }

  /** Whether the button reacts to input. */
  isEnabled(): boolean {
    return this.enabled;
  }
}
