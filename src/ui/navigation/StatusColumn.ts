import type Phaser from 'phaser';
import { tr } from '@/core/locale/text';
import { drawGauge, strokeChamfered } from '@/ui/kit/shapes';
import { createText } from '@/ui/kit/text';
import {
  levelColor,
  levelFrame,
  resourceBarColor,
  ROW_ICONS,
  ROW_IDS,
  ROW_LABELS,
  statusColor,
  STATUS_LABELS,
  type RowId,
  type RowView,
  type Status,
} from '@/ui/navigation/navigationView';
import { theme } from '@/ui/theme';

/** What `StatusColumn.draw` shows. */
export interface ColumnView {
  /** The status id; the word shown is its `STATUS_LABELS` entry. */
  status: Status;
  /** "Day 42", or empty before the voyage. */
  day: string;
  /** "Next: MARS in 51 d", "Lost: hypoxia, day 52"; its colour. */
  next: string;
  nextColor: string;
  /** "Leg 3/6 · burn". */
  detail: string;
  /** The rows, or null before the voyage (shown as "-"). */
  rows: Record<RowId, RowView> | null;
  /** The two telemetry lines (`telemetryLines`), or empty before the voyage. */
  telemetry: readonly string[];
}

/** A game object the column shows and hides. */
type Shown = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible;

/** Offsets inside the column, px. */
const NEXT_Y = 24;
const DETAIL_Y = 36;
const ROWS_Y = 56;
const ROW_STEP = 16;
/** The telemetry lines under the rows (plan variable-mass D12, K7) and their step. */
const TELEMETRY_Y = 148;
const TELEMETRY_STEP = 12;
const LOG_Y = 176;
/** Rules between the column's parts: under the heading and above the log, px. */
const RULE_YS = [49, 171];
/** Lines of the log kept on screen. */
const LOG_LINES = 6;
/** Row layout: icon, name, bar, value, px from the column's left. */
const NAME_X = 12;
const BAR_X = 84;
/** The bar's inside (width less the frame) is a whole number of gauge segments less a gap. */
const BAR_WIDTH = 113;
const BAR_HEIGHT = 6;
const VALUE_X = 204;

/**
 * The right column of the navigation panel (GDD `ux-panel-layout` B): the status word (RUN /
 * HOLD / DRIFTING / LANDED / LOST), the day, the next gate and when it comes, six resource rows
 * (icon, name, bar, value; each bar has the colour of its icon, and its frame and value turn
 * amber / red when the resource is low / critical, D14), two telemetry lines (mass, acceleration, gravity,
 * escape speed; plan variable-mass D12), and the log of what happened.
 * Gate and event cards hide it and take its place.
 */
export class StatusColumn {
  private readonly objects: Shown[] = [];
  private readonly status: Phaser.GameObjects.Text;
  private readonly day: Phaser.GameObjects.Text;
  private readonly next: Phaser.GameObjects.Text;
  private readonly detail: Phaser.GameObjects.Text;
  private readonly bars: Phaser.GameObjects.Graphics;
  private readonly values: Record<RowId, Phaser.GameObjects.Text>;
  private readonly telemetry: Phaser.GameObjects.Text[];
  private readonly log: Phaser.GameObjects.Text;
  private readonly area: Phaser.Geom.Rectangle;

  constructor(scene: Phaser.Scene, area: Phaser.Geom.Rectangle) {
    this.area = area;
    const { x, y } = area;
    this.status = createText(scene, x, y, '', 'title');
    this.day = createText(scene, area.right, y + 4, '', 'body').setOrigin(1, 0);
    this.next = createText(scene, x, y + NEXT_Y, '', 'body');
    this.detail = createText(scene, x, y + DETAIL_Y, '', 'small');
    this.bars = scene.add.graphics();
    const values: Partial<Record<RowId, Phaser.GameObjects.Text>> = {};
    const icons: Shown[] = [];
    ROW_IDS.forEach((id, i) => {
      const rowY = y + ROWS_Y + i * ROW_STEP;
      icons.push(scene.add.image(x, rowY, 'panel-icons', ROW_ICONS[id]).setOrigin(0));
      icons.push(createText(scene, x + NAME_X, rowY, tr(ROW_LABELS[id]), 'small'));
      values[id] = createText(scene, x + VALUE_X, rowY, '', 'body');
    });
    this.values = values as Record<RowId, Phaser.GameObjects.Text>;
    this.telemetry = [0, 1].map((i) =>
      createText(scene, x, y + TELEMETRY_Y + i * TELEMETRY_STEP, '', 'small', {
        color: theme.text.dim,
      }),
    );
    this.log = createText(scene, x, y + LOG_Y, '', 'small', {
      lineSpacing: theme.lineSpacing,
      wordWrap: { width: area.width },
    });
    this.objects.push(
      this.status,
      this.day,
      this.next,
      this.detail,
      this.bars,
      ...icons,
      ...Object.values(this.values),
      ...this.telemetry,
      this.log,
    );
  }

  /** Shows or hides the whole column. */
  setVisible(visible: boolean): void {
    for (const object of this.objects) object.setVisible(visible);
  }

  /** Draws `view`. */
  draw(view: ColumnView): void {
    this.status.setText(tr(STATUS_LABELS[view.status])).setColor(statusColor(view.status));
    this.day.setText(view.day);
    this.next.setText(view.next).setColor(view.nextColor);
    this.detail.setText(view.detail);
    const g = this.bars;
    g.clear();
    g.fillStyle(theme.rule.line, 1);
    for (const ruleY of RULE_YS) g.fillRect(this.area.x, this.area.y + ruleY, this.area.width, 1);
    ROW_IDS.forEach((id, i) => {
      const row = view.rows?.[id];
      const rowY = this.area.y + ROWS_Y + i * ROW_STEP + 1;
      const barX = this.area.x + BAR_X;
      const inner = BAR_WIDTH - 2;
      const filled = row ? Math.round(inner * row.fraction) : 0;
      strokeChamfered(g, barX, rowY, BAR_WIDTH, BAR_HEIGHT, 0, levelFrame(row?.level ?? 'normal'));
      drawGauge(
        g,
        barX + 1,
        rowY + 1,
        inner,
        BAR_HEIGHT - 2,
        filled,
        resourceBarColor(id),
        theme.bar.back,
      );
      this.values[id].setText(row?.value ?? '-').setColor(levelColor(row?.level ?? 'normal'));
    });
    this.telemetry.forEach((line, i) => line.setText(view.telemetry[i] ?? ''));
  }

  /** Shows the log's last entries, oldest first, as many as fit in `LOG_LINES` wrapped lines. */
  drawLog(entries: readonly string[]): void {
    let shown = [...entries];
    while (shown.length > 1 && this.log.getWrappedText(shown.join('\n')).length > LOG_LINES) {
      shown = shown.slice(1);
    }
    this.log.setText(shown.join('\n'));
  }

  /** The telemetry lines as shown (debug). */
  get telemetryText(): string[] {
    return this.telemetry.map((line) => line.text);
  }

  /** Text of the value of row `id` as shown (debug). */
  valueOf(id: RowId): string {
    return this.values[id].text;
  }

  /** Colour of the value of row `id` as shown (debug). */
  colorOf(id: RowId): string {
    return this.values[id].style.color as string;
  }

  /** Whether the column is shown. */
  get visible(): boolean {
    return this.status.visible;
  }
}
