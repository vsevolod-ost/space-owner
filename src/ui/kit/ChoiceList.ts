import Phaser from 'phaser';
import type { AudioKey } from '@/assets';
import { services } from '@/core/services';
import type { Controls } from '@/core/input/controls';
import type { Point } from '@/world/Actor';
import { drawSelection, SELECTION_PAD } from '@/ui/kit/shapes';
import { StepGate } from '@/ui/kit/StepGate';
import { createText } from '@/ui/kit/text';
import { theme } from '@/ui/theme';

/** Sound of choosing a row. */
const CLICK_SOUND: AudioKey = 'ui-click';

/** Width of the column left of the rows, where the selected row's arrow stands, px. */
const MARKER_WIDTH = 16;
/** The arrow's distance from the band's left edge, px. */
const ARROW_X = 9;
/** How far the selected row's band reaches past the list's sides, px. */
const BAND_OVERHANG = 4;

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
 * Vertical list of options; the selected row stands on a lit band with an arrow
 * (`theme.selection`). Keyboard: up/down (arrows, W/S) move the selection, `confirm`
 * (Enter, Space) chooses; mouse: hovering a row selects it, a click chooses it. A disabled row
 * (`setChoices`' `disabled`) is drawn dim and cannot be chosen; the keys and the mouse skip it,
 * but the selection `setChoices` asks for stays on it (the cursor never jumps to another row by
 * itself: that row may be an irreversible one). `lockFor` ignores input for a while. Emits
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

  private rows: {
    text: Phaser.GameObjects.Text;
    zone: Phaser.GameObjects.Zone;
    disabled: boolean;
  }[] = [];
  private readonly band: Phaser.GameObjects.Graphics;
  private selected = 0;
  /** Closed while the step the choices were set in runs: keys in that step are ignored. */
  private readonly opening: StepGate;
  /**
   * Game loop time (ms) until which keys and clicks are ignored (`lockFor`). Not the scene's
   * clock: in a panel scene started again that clock still holds the time it stopped at until
   * its first update, so a lock set in `create` would end at once.
   */
  private lockedUntil = -Infinity;
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
    this.opening = new StepGate(scene.game);
    this.cancelable = options.cancelable ?? false;
    this.fixedWidth = options.width;
    this.band = scene.add.graphics();
    this.add(this.band);
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

  /**
   * Replaces the options and selects `selected` (default the first; it stays selected even when
   * disabled). `disabled[i]` true: row `i` is shown dim and cannot be chosen.
   */
  setChoices(items: readonly string[], selected = 0, disabled: readonly boolean[] = []): this {
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
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
          if (!this.locked) this.choose(index);
        });
      this.add([zone, text]);
      y += height + theme.rowGap;
      return { text, zone, disabled: disabled[index] === true };
    });
    this.setSize(width, Math.max(0, y - theme.rowGap));
    this.opening.close();
    if (this.rows.length > 0) {
      this.highlight(Phaser.Math.Clamp(selected, 0, this.rows.length - 1));
    }
    return this;
  }

  /** Moves the selection to `index` (clamped) and redraws it; a disabled row is not selected. */
  select(index: number): this {
    if (this.rows.length === 0) return this;
    const next = Phaser.Math.Clamp(index, 0, this.rows.length - 1);
    if (!this.rows[next].disabled) this.highlight(next);
    return this;
  }

  /** Ignores keys and clicks for `ms` of game-loop time from now (e.g. after an autopause). */
  lockFor(ms: number): this {
    this.lockedUntil = this.scene.game.loop.time + ms;
    return this;
  }

  /** Whether input is ignored now (`lockFor`). */
  get locked(): boolean {
    return this.scene.game.loop.time < this.lockedUntil;
  }

  /** Emits `CHOSEN` with `index`, as if the player chose that row (not a disabled one). */
  choose(index: number): void {
    if (index < 0 || index >= this.rows.length || this.rows[index].disabled) return;
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

  /** Selects row `index` (disabled or not) and redraws the rows and the band. */
  private highlight(index: number): void {
    const disabled = this.rows[index].disabled;
    this.rows.forEach((row, i) => {
      const color = row.disabled ? theme.text.dim : theme.text.normal;
      row.text.setColor(i === index && !disabled ? theme.text.highlight : color);
    });
    const text = this.rows[index].text;
    drawSelection(
      this.band.clear(),
      -BAND_OVERHANG,
      text.y - SELECTION_PAD,
      this.width + BAND_OVERHANG * 2,
      Math.ceil(text.height) + SELECTION_PAD * 2,
      ARROW_X,
      disabled ? theme.selection.disabled : theme.selection.enabled,
    );
    this.selected = index;
  }

  /** Moves the selection one enabled row up (-1) or down (1), wrapping around. */
  private step(direction: 1 | -1): void {
    const count = this.rows.length;
    for (let i = 1; i <= count; i++) {
      const index = (((this.selected + direction * i) % count) + count) % count;
      if (!this.rows[index].disabled) {
        this.select(index);
        return;
      }
    }
  }

  private readKeys(): void {
    if (!this.active || !this.visible || this.rows.length === 0) return;
    if (this.opening.isClosed || this.locked) return;
    const controls = this.controls;
    if (controls.justPressed('moveUp')) {
      this.step(-1);
    } else if (controls.justPressed('moveDown')) {
      this.step(1);
    } else if (controls.justPressed('confirm')) {
      this.choose(this.selected);
    } else if (this.cancelable && controls.justPressed('cancel')) {
      this.emit(ChoiceList.CANCELLED);
    }
  }
}
