import type Phaser from 'phaser';
import type { Controls } from '@/core/input/controls';
import { tr, type LocalText } from '@/core/locale/text';
import { formatText } from '@/core/text/format';
import type { LegForecast } from '@/core/voyage/forecast';
import type { ColonyTier } from '@/core/voyage/colony';
import { Card } from '@/ui/navigation/Card';
import {
  dvLine,
  forecastHeading,
  forecastRows,
  forecastWarning,
  legLine,
  levelColor,
} from '@/ui/navigation/navigationView';
import { theme } from '@/ui/theme';

/** What the gate card is about. */
export interface GateCardData {
  /** Index of the gate and how many there are. */
  gate: number;
  total: number;
  /** Name of the gate's body. */
  body: string;
  /** Name of the next gate's body, or null at the last gate (only Stop). */
  next: string | null;
  /** Shown day of the voyage. */
  day: number;
  /** The colony "Stop here" would build (`colonyFit`). */
  tier: ColonyTier;
  /** The cabin warmth's full amount (heat state names in the forecast). */
  heatMax: number;
}

/** The player's answer at a gate. */
export type GateChoice = 'goOn' | 'stop';

/** Offsets inside the card, px. */
const SUBTITLE_Y = 24;
const HEADING_Y = 40;
const ROWS_Y = 52;
const ROW_STEP = 12;
const LEG_Y = 114;
const DV_Y = 126;
const WARNING_Y = 140;
const HAZARD_Y = 172;
const CHOICES_Y = 208;

/**
 * The card's lines: `{gate}` of `{total}`, `{day}` the shown day, `{next}` the next gate's
 * name in capitals. The hazard and only-stop lines wrap; the others are one line of the card
 * (37 characters). OWNER: script
 */
const TEXTS = {
  // budget: 10 chars, top right beside the gate's name in title glyphs ("Gate 3/6")
  gate: { en: 'Gate {gate}/{total}', uk: 'Ворота {gate}/{total}' },
  // budget: 37 chars, the card's width ("Day 42. Next leg: GANYMEDE"), and for lastGate
  subtitle: { en: 'Day {day}. Next leg: {next}', uk: 'День {day}. Далі: {next}' },
  lastGate: { en: 'Day {day}. The last gate.', uk: 'День {day}. Останні ворота.' },
  hazard: {
    en: 'Events on the way are not in the forecast.',
    uk: 'Події в дорозі не входять у прогноз.',
  },
  onlyStop: {
    en: 'Only Stop here: no gate lies beyond.',
    uk: 'Лише «Зупинитися тут»: далі воріт немає.',
  },
  computing: { en: 'Computing the forecast...', uk: 'Обчислення прогнозу...', max: 37 },
  // budget: 37 chars, a choice row ("Go on to GANYMEDE"); it would wrap
  goOn: { en: 'Go on to {next}', uk: 'Летіти до {next}' },
} as const satisfies Record<string, LocalText>;

/**
 * "Stop here" with the colony it builds: a whole phrase per tier (no article from code).
 * OWNER: script
 */
const STOP_TEXTS: Readonly<Record<ColonyTier, LocalText>> = {
  outpost: { en: 'Stop here: build an outpost', uk: 'Зупинитися тут: форпост' },
  settlement: { en: 'Stop here: build a settlement', uk: 'Зупинитися тут: поселення' },
  colony: { en: 'Stop here: build a colony', uk: 'Зупинитися тут: колонія' },
};

/**
 * The gate card (plan S8, D6, D15; GDD `gate-panel-view` A, `ux-decision-support` B): the
 * gate, then the forecast of the next leg (fuel and stocks now and on arrival, the leg's days,
 * the delta-v it needs against what the fuel gives, an explicit red warning when the fuel does
 * not reach the next gate or a stock runs out,
 * "events are not in the forecast"), and "Go on to <next>" / "Stop here: <tier>". While the
 * forecast computes nothing can be chosen and the cursor waits on Go on; then Go on is always
 * allowed (D6) and the cursor starts on it. Only Stop at the last gate.
 * The card's texts are `TEXTS` and `STOP_TEXTS`; the forecast's are in `navigationView.ts`.
 */
export class GateCard extends Card {
  protected readonly kind = 'gate' as const;
  private readonly heading: Phaser.GameObjects.Text;
  private readonly rows: Phaser.GameObjects.Text[] = [];
  private readonly leg: Phaser.GameObjects.Text;
  private readonly dv: Phaser.GameObjects.Text;
  private readonly warning: Phaser.GameObjects.Text;
  private readonly title: Phaser.GameObjects.Text;
  private readonly subtitle: Phaser.GameObjects.Text;
  private readonly hazard: Phaser.GameObjects.Text;
  private forecast: LegForecast | null = null;

  constructor(
    scene: Phaser.Scene,
    area: Phaser.Geom.Rectangle,
    controls: Controls,
    private readonly data: GateCardData,
    private readonly onChoose: (choice: GateChoice) => void,
  ) {
    super(scene, area, controls, CHOICES_Y);
    const { x, y } = area;
    this.title = this.text(x, y, data.body.toUpperCase(), 'title').setColor(theme.text.highlight);
    const gate = formatText(tr(TEXTS.gate), { gate: data.gate + 1, total: data.total });
    this.text(area.right, y + 4, gate, 'small').setOrigin(1, 0);
    this.subtitle = this.text(
      x,
      y + SUBTITLE_Y,
      data.next
        ? formatText(tr(TEXTS.subtitle), { day: data.day, next: data.next.toUpperCase() })
        : formatText(tr(TEXTS.lastGate), { day: data.day }),
    );
    this.heading = this.text(x, y + HEADING_Y, '', 'small');
    for (let i = 0; i < 5; i++) this.rows.push(this.text(x, y + ROWS_Y + i * ROW_STEP, ''));
    this.leg = this.text(x, y + LEG_Y, '', 'small');
    this.dv = this.text(x, y + DV_Y, '', 'small');
    this.warning = this.text(x, y + WARNING_Y, '', 'body', true);
    this.hazard = this.text(x, y + HAZARD_Y, data.next ? tr(TEXTS.hazard) : '', 'small', true);
    this.setForecast(null);
  }

  /** Shows the forecast of the next leg (null: still computing); enables the choices when in. */
  setForecast(forecast: LegForecast | null): void {
    this.forecast = forecast;
    const { data } = this;
    if (!data.next) {
      this.heading.setText('');
      this.rows.forEach((row) => row.setText(''));
      this.leg.setText('');
      this.dv.setText('');
      this.warning.setText(tr(TEXTS.onlyStop)).setColor(theme.text.normal);
      this.setChoices([this.stopText()], 0, [false]);
      return;
    }
    if (!forecast) {
      this.heading.setText(tr(TEXTS.computing));
      this.rows.forEach((row) => row.setText(''));
      this.leg.setText('');
      this.dv.setText('');
      this.warning.setText('');
    } else {
      this.heading.setText(forecastHeading());
      forecastRows(forecast, data.heatMax).forEach((line, i) =>
        this.rows[i]?.setText(line.text).setColor(levelColor(line.level)),
      );
      this.leg.setText(legLine(forecast));
      const dv = dvLine(forecast);
      this.dv.setText(dv.text).setColor(levelColor(dv.level));
      const warning = forecastWarning(forecast, data.next.toUpperCase());
      this.warning.setText(warning?.text ?? '').setColor(levelColor(warning?.level ?? 'normal'));
    }
    const goOn = formatText(tr(TEXTS.goOn), { next: data.next.toUpperCase() });
    // Computing: both rows disabled, so the cursor stays on Go on and Stop cannot be chosen.
    const computing = forecast === null;
    this.setChoices([goOn, this.stopText()], 0, [computing, computing]);
  }

  /** Whether the forecast on the card says the fuel does not reach the next gate (D6). */
  get fuelShort(): boolean {
    return this.forecast?.fuelShort === true;
  }

  protected chosen(index: number): void {
    const choices: GateChoice[] = this.data.next ? ['goOn', 'stop'] : ['stop'];
    this.onChoose(choices[index]);
  }

  protected lines(): string[] {
    return [
      this.title,
      this.subtitle,
      this.heading,
      ...this.rows,
      this.leg,
      this.dv,
      this.warning,
      this.hazard,
    ]
      .map((text) => text.text)
      .filter((text) => text !== '');
  }

  private stopText(): string {
    return tr(STOP_TEXTS[this.data.tier]);
  }
}
