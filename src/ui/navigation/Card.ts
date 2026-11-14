import type Phaser from 'phaser';
import type { Controls } from '@/core/input/controls';
import type { Point } from '@/world/Actor';
import { ChoiceList } from '@/ui/kit/ChoiceList';
import { createText } from '@/ui/kit/text';
import { theme } from '@/ui/theme';

/**
 * How long a card ignores keys and clicks once it opens, s (GDD `gate-stop-go-ui`: the card
 * comes with an autopause, and Space or Enter pressed just before it opened must not choose on it).
 * OWNER: design
 */
export const CARD_INPUT_LOCK_S = 0.4;

/** The key legend at the bottom of a card. OWNER: script */
const LEGEND = '↑↓: select   Enter: choose';

/** What a card's `debugInfo` returns. */
export interface CardInfo {
  kind: 'gate' | 'event';
  /** Choice rows as shown, and which are disabled. */
  choices: string[];
  disabled: boolean[];
  /** Index of the selected row. */
  selected: number;
  /** Whether the card still ignores input (`CARD_INPUT_LOCK_S` after it opened). */
  locked: boolean;
  /** Centres of the rows, for `h.click(x, y)`. */
  centers: Point[];
  /** Every text line on the card, top to bottom (title, forecast, warnings, event text). */
  lines: string[];
}

/**
 * A decision card of the navigation panel (GDD `evt-presentation` A: one card for gates and
 * events), drawn in place of the status column: its texts, a `ChoiceList` (input is ignored
 * for `CARD_INPUT_LOCK_S` after the card opens, `cancel` does nothing: a decision must be made)
 * and the key legend. Subclasses lay out the texts and set the choices.
 */
export abstract class Card {
  protected readonly objects: Phaser.GameObjects.GameObject[] = [];
  protected readonly list: ChoiceList;
  private disabled: boolean[] = [];

  constructor(
    protected readonly scene: Phaser.Scene,
    protected readonly area: Phaser.Geom.Rectangle,
    controls: Controls,
    choicesY: number,
  ) {
    this.list = new ChoiceList(scene, area.x, area.y + choicesY, controls, {
      width: area.width,
    }).lockFor(CARD_INPUT_LOCK_S * 1000);
    this.list.on(ChoiceList.CHOSEN, (index: number) => this.chosen(index));
    this.objects.push(
      this.list,
      createText(scene, area.x, area.bottom, LEGEND, 'small').setOrigin(0, 1),
    );
  }

  /** Kind of the card, for `debugInfo`. */
  protected abstract readonly kind: 'gate' | 'event';

  /** Called with the index of the row the player chose. */
  protected abstract chosen(index: number): void;

  /** Every text line on the card, for `debugInfo`. */
  protected abstract lines(): string[];

  /** Replaces the choice rows; `disabled[i]`: row `i` cannot be chosen. */
  protected setChoices(items: readonly string[], selected: number, disabled: boolean[]): void {
    this.disabled = disabled;
    this.list.setChoices(items, selected, disabled);
  }

  /** A text on the card, removed with it. */
  protected text(
    x: number,
    y: number,
    text: string,
    variant: 'title' | 'body' | 'small' = 'body',
    wrap = false,
  ): Phaser.GameObjects.Text {
    const object = createText(this.scene, x, y, text, variant, {
      lineSpacing: theme.lineSpacing,
      ...(wrap ? { wordWrap: { width: this.area.right - x } } : {}),
    });
    this.objects.push(object);
    return object;
  }

  /** State for the panel's `debugInfo`. */
  debugInfo(): CardInfo {
    const items = this.list.items;
    return {
      kind: this.kind,
      choices: items,
      disabled: items.map((_, i) => this.disabled[i] === true),
      selected: this.list.selectedIndex,
      locked: this.list.locked,
      centers: items.map((_, i) => this.list.rowCenter(i)),
      lines: this.lines(),
    };
  }

  /** Removes the card. */
  destroy(): void {
    for (const object of this.objects) object.destroy();
    this.objects.length = 0;
  }
}
