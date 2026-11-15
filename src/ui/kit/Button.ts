import Phaser from 'phaser';
import type { AudioKey } from '@/assets';
import { services } from '@/core/services';
import { fillChamfered, strokeChamfered } from '@/ui/kit/shapes';
import { createText } from '@/ui/kit/text';
import { theme } from '@/ui/theme';

/** Default size of a button, px. */
const DEFAULT_WIDTH = 160;
const DEFAULT_HEIGHT = 36;
/** Below this size a button is small: a 1 px corner cut and a 1 px lip, px. */
const SMALL_WIDTH = 40;
const SMALL_HEIGHT = 28;
/** Corner cut and height of the lip (the key's side under its face), full-size and small, px. */
const CUT = 2;
const SMALL_CUT = 1;
const LIP = 2;
const SMALL_LIP = 1;
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
 * Labelled button drawn in code (`theme.button`): a key of the console with a steel rim and a
 * dark lip under it; the rim lights up cyan under the pointer or with `setFocused`, and the key
 * sinks onto its lip while pressed. `(x, y)` is the centre. Fires `onClick` (and plays the `ui-click` sound) when the pointer is both
 * pressed and released over it, or on `click()`. A disabled button is half transparent and ignores input.
 */
export class Button extends Phaser.GameObjects.Container {
  /** Event when the pointer comes over the enabled button: a keyboard focus can follow it. */
  static readonly HOVERED = 'hovered';
  /** Text shown on the button. */
  readonly label: string;
  private readonly background: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private readonly buttonWidth: number;
  private readonly buttonHeight: number;
  private isPressed = false;
  private enabled = true;
  private focused = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    label: string,
    private readonly onClick: () => void,
    options: ButtonOptions = {},
  ) {
    super(scene, Math.round(x), Math.round(y));
    this.label = label;
    this.buttonWidth = Math.round(options.width ?? DEFAULT_WIDTH);
    this.buttonHeight = Math.round(options.height ?? DEFAULT_HEIGHT);

    this.background = scene.add.graphics();
    this.text = createText(scene, 0, 0, label, 'body').setOrigin(0.5);
    this.add([this.background, this.text]);
    this.draw('normal');
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
        if (!this.enabled) return;
        this.draw('hover');
        this.emit(Button.HOVERED);
      })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
        this.isPressed = false;
        if (this.enabled) this.drawAtRest();
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
        this.click();
      });
  }

  /** Clicks the button as the pointer does (sound, `onClick`): for a key; not when disabled. */
  click(): void {
    if (!this.enabled) return;
    services.audio.playSfx(CLICK_SOUND);
    this.onClick();
  }

  /** Enables or disables the button; a disabled one is drawn faded and ignores the pointer. */
  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    this.isPressed = false;
    this.setAlpha(enabled ? 1 : theme.disabledAlpha);
    this.drawAtRest();
    if (this.background.input) this.background.input.cursor = enabled ? 'pointer' : 'default';
    return this;
  }

  /** Whether the button reacts to input. */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Marks the button as the one the keyboard is on (the hover look) or not. The scene that
   * moves a selection with the keys calls it; the button itself reads only the pointer.
   */
  setFocused(focused: boolean): this {
    this.focused = focused;
    if (!this.isPressed) this.drawAtRest();
    return this;
  }

  /** Draws the button as it is with no pointer on it. */
  private drawAtRest(): void {
    this.draw(this.focused && this.enabled ? 'hover' : 'normal');
  }

  /** Redraws the key in the colours of `state`; pressed, its face sits down on the lip. */
  private draw(state: ButtonState): void {
    const look = theme.button[state];
    const w = this.buttonWidth;
    const h = this.buttonHeight;
    const small = w < SMALL_WIDTH || h < SMALL_HEIGHT;
    const cut = small ? SMALL_CUT : CUT;
    const lip = small ? SMALL_LIP : LIP;
    const left = -Math.floor(w / 2);
    const top = -Math.floor(h / 2);
    const faceHeight = h - lip;
    const sunk = state === 'pressed' ? lip : 0;
    const faceTop = top + sunk;
    const g = this.background.clear();
    if (sunk === 0) fillChamfered(g, left, top + lip, w, faceHeight, cut, theme.button.lip);
    fillChamfered(g, left, faceTop, w, faceHeight, cut, look.fill);
    strokeChamfered(g, left, faceTop, w, faceHeight, cut, look.light, look.shade);
    g.fillStyle(look.gloss, 1).fillRect(left + cut + 1, faceTop + 1, w - (cut + 1) * 2, 1);
    // The label rides on the face: centred on it, and down with it.
    this.text.setY(sunk - Math.floor(lip / 2));
  }
}
