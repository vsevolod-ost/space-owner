import Phaser from 'phaser';
import type { AudioKey } from '@/assets';
import { services } from '@/core/services';
import type { Controls } from '@/core/input/controls';
import type { Point } from '@/world/Actor';
import { createText } from '@/ui/kit/text';
import { theme } from '@/ui/theme';

/** Sound of choosing a row. */
const CLICK_SOUND: AudioKey = 'ui-click';

/** Marker drawn left of the selected row. */
const MARKER = '>';
/** Width of the marker column, px (two glyphs of the 8 px font). */
const MARKER_WIDTH = 16;

/** Options of a `ChoiceList`. */
export interface ChoiceListOptions {
  /**
   * Width of the list, px: longer items wrap, and the whole width of a row reacts to the mouse.
   * Default: as wide as the longest item.
   */
  width?: number;
  /** Whether `cancel` (Esc) emits `cancelled`; default false (a choice must be made). */
  cancelable?: boolean;
}

/**
 * Vertical list of options. Keyboard: up/down (arrows, W/S) move the selection, `confirm`
 * (Enter, Space) chooses; mouse: hovering a row selects it, a click chooses it. Emits
 * `ChoiceList.CHOSEN` with the index, or `ChoiceList.CANCELLED` (Esc, when `cancelable`).
 * `(x, y)` is the top-left corner of the first row.
 *
 * Reads keys through `controls` - pass the controls of the scene the list is in (UiScene and
 * panel scenes have their own), never the world's: those are locked during dialogue. A press
 * in the frame the list was filled is ignored, so the key that opened it does not choose.
 *
 * ```ts
 * const list = new ChoiceList(this, 200, 120, this.controls, { width: 240 });
 * list.setChoices(['Yes', 'No']);
 * list.once(ChoiceList.CHOSEN, (index: number) => list.destroy());
 * ```
 */
export class ChoiceList extends Phaser.GameObjects.Container {
  /** Event with the chosen index. */
  static readonly CHOSEN = 'chosen';
  /** Event when the player backs out with `cancel` (only if `cancelable`). */
  static readonly CANCELLED = 'cancelled';

  private rows: { text: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone }[] = [];
  private readonly marker: Phaser.GameObjects.Text;
  private selected = 0;
  /** Game frame in which the choices were set: input in that frame is ignored. */
  private openedFrame = -1;
  private readonly cancelable: boolean;
  private readonly fixedWidth?: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly controls: Controls,
    options: ChoiceListOptions = {},
  ) {
    super(scene, Math.round(x), Math.round(y));
    this.cancelable = options.cancelable ?? false;
    this.fixedWidth = options.width;
    this.marker = createText(scene, 0, 0, MARKER, 'body', { color: theme.text.highlight });
    this.add(this.marker);
    scene.add.existing(this);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.readKeys, this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.readKeys, this);
    });
  }

  /** Index of the selected row. */
  get selectedIndex(): number {
    return this.selected;
  }

  /** Texts of the rows, top to bottom. */
  get items(): string[] {
    return this.rows.map((row) => row.text.text);
  }

  /** Replaces the options and selects `selected` (default the first). */
  setChoices(items: readonly string[], selected = 0): this {
    for (const row of this.rows) {
      row.text.destroy();
      row.zone.destroy();
    }
    const wrapWidth = this.fixedWidth ? this.fixedWidth - MARKER_WIDTH : undefined;
    const texts = items.map((item) =>
      createText(this.scene, MARKER_WIDTH, 0, item, 'body', {
        lineSpacing: theme.lineSpacing,
        ...(wrapWidth ? { wordWrap: { width: wrapWidth } } : {}),
      }),
    );
    const width =
      this.fixedWidth ?? MARKER_WIDTH + Math.max(0, ...texts.map((text) => Math.ceil(text.width)));

    let y = 0;
    this.rows = texts.map((text, index) => {
      const height = Math.ceil(text.height);
      text.setY(y);
      // The zone covers the row and half the gaps around it, so the mouse never falls between.
      const zone = this.scene.add
        .zone(0, y - theme.rowGap / 2, width, height + theme.rowGap)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.select(index))
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.choose(index));
      this.add([zone, text]);
      y += height + theme.rowGap;
      return { text, zone };
    });
    this.setSize(width, Math.max(0, y - theme.rowGap));
    this.openedFrame = this.scene.game.loop.frame;
    this.selected = -1;
    this.select(Phaser.Math.Clamp(selected, 0, Math.max(0, items.length - 1)));
    return this;
  }

  /** Moves the selection to `index` (clamped) and redraws the highlight. */
  select(index: number): this {
    if (this.rows.length === 0) return this;
    const next = Phaser.Math.Clamp(index, 0, this.rows.length - 1);
    this.rows.forEach((row, i) =>
      row.text.setColor(i === next ? theme.text.highlight : theme.text.normal),
    );
    this.marker.setY(this.rows[next].text.y);
    this.selected = next;
    return this;
  }

  /** Emits `CHOSEN` with `index`, as if the player chose that row. */
  choose(index: number): void {
    if (index < 0 || index >= this.rows.length) return;
    this.select(index);
    services.audio.playSfx(CLICK_SOUND);
    this.emit(ChoiceList.CHOSEN, index);
  }

  /** Centre of a row in scene coordinates: for the smoke tool's mouse clicks. */
  rowCenter(index: number): Point {
    const row = this.rows[index];
    const matrix = this.getWorldTransformMatrix();
    return {
      x: Math.round(matrix.tx + row.zone.x + row.zone.width / 2),
      y: Math.round(matrix.ty + row.text.y + row.text.height / 2),
    };
  }

  private readKeys(): void {
    if (!this.active || !this.visible || this.rows.length === 0) return;
    if (this.scene.game.loop.frame === this.openedFrame) return;
    const controls = this.controls;
    if (controls.justPressed('moveUp')) {
      this.select((this.selected - 1 + this.rows.length) % this.rows.length);
    } else if (controls.justPressed('moveDown')) {
      this.select((this.selected + 1) % this.rows.length);
    } else if (controls.justPressed('confirm')) {
      this.choose(this.selected);
    } else if (this.cancelable && controls.justPressed('cancel')) {
      this.emit(ChoiceList.CANCELLED);
    }
  }
}
