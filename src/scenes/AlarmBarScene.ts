import Phaser from 'phaser';
import { GAME_WIDTH } from '@/config';
import { stationName } from '@/content/locations/ship-deck';
import { services } from '@/core/services';
import type { StationAlarm } from '@/core/alarm/StationAlarmService';
import type { DebugScene } from '@/scenes/DebugScene';
import { SceneKey } from '@/scenes/keys';
import type { NavigationScene } from '@/scenes/NavigationScene';
import type { UiScene } from '@/scenes/UiScene';
import { Panel } from '@/ui/kit/Panel';
import { createText } from '@/ui/kit/text';
import { theme } from '@/ui/theme';

/**
 * Narrowest box, px: clear of the HOLD strip on the deck (its right edge is at x 420) and of
 * the station card (x 158..482), so on both the box covers nothing.
 */
const MIN_WIDTH = 152;
/** Distance of the box from the top and right edges of the screen, px. */
const MARGIN = 4;
/** Space between the box's edge and its content: clear of the panel art's frame, px. */
const PAD = theme.panelBorder;
/** Gap between the two lines of text and between the text and the bar, px. */
const GAP = 4;
/** Height of the countdown bar, px. */
const BAR_HEIGHT = 4;
/** The bar takes the alarm colour when this share of the timer or less is left (D4). */
const ALARM_SHARE = 1 / 3;

/** What `AlarmBarScene.debugInfo()` returns. */
export interface AlarmBarInfo {
  /** Whether the box is drawn (an alarm is on); its opacity follows the fader. */
  visible: boolean;
  /** Opacity of the box: 1, less while the UI's fader covers the screen. */
  alpha: number;
  /** The event and the station as shown (`['HULL BREACH', 'AIRLOCK']`); empty while hidden. */
  lines: string[];
  /** Whole seconds shown (the remaining time rounded up), or null while hidden. */
  seconds: number | null;
  /** Share of the timer left, 0..1 (the bar's filled part). */
  fill: number;
  /** Colour of the filled part: `fill` normally, `alarm` in the last third. */
  color: 'fill' | 'alarm';
  /** Whether this scene draws above every other scene but the debug overlay. */
  onTop: boolean;
}

/**
 * The station alarm's timer bar (plan act2-stations S5, D4): while `services.stationAlarm` has
 * an alarm on, a small box in the top-right corner of the screen shows the event, the deck
 * station where it is answered, the seconds left and a countdown bar (`theme.bar`, its alarm
 * colour in the last third); on the navigation panel's alarm it moves above the panel's Close
 * button (`NavigationScene.alarmBarSpot`). It is an overlay (BootScene launches it, `OVERLAY_SCENES`), so it
 * stays on the deck, over the navigation panel's alarm flash and over the station card. Panels
 * raise themselves when they open, so while the alarm runs it re-raises itself every frame
 * (below the debug overlay when that is on). Without an alarm it draws nothing; its opacity
 * follows the UI's fader, so it never shows over a fade (the death loop's included). Reads
 * the alarm every frame (a small copy); texts change only when the alarm or the seconds do.
 */
export class AlarmBarScene extends Phaser.Scene {
  private box?: Phaser.GameObjects.Container;
  private panel?: Panel;
  private title?: Phaser.GameObjects.Text;
  private station?: Phaser.GameObjects.Text;
  private seconds?: Phaser.GameObjects.Text;
  private bar?: Phaser.GameObjects.Graphics;
  /** The alarm shown (`eventId|station`), to rebuild the texts only when it changes. */
  private shownKey: string | null = null;
  private shownSeconds: number | null = null;
  private fill = 0;
  private alarmColor = false;
  private barWidth = 0;
  /** Width of the box as last laid out, px. */
  private boxWidth = MIN_WIDTH;
  /** Width of the seconds text the box was last sized for, px (a wider one re-sizes it). */
  private laidOutSecondsWidth = 0;

  constructor() {
    super(SceneKey.AlarmBar);
  }

  create(): void {
    const pad = PAD;
    this.panel = new Panel(this, 0, 0, MIN_WIDTH, this.boxHeight());
    this.title = createText(this, pad, pad, '', 'body').setColor(theme.text.highlight);
    const lineY = pad + theme.fontSize.body + GAP;
    this.station = createText(this, pad, lineY, '', 'body');
    this.seconds = createText(this, 0, lineY, '', 'body').setOrigin(1, 0);
    this.bar = this.add.graphics();
    this.box = this.add
      .container(0, MARGIN, [this.panel, this.title, this.station, this.seconds, this.bar])
      .setVisible(false);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.box = undefined;
      this.shownKey = null;
      this.shownSeconds = null;
    });
  }

  update(): void {
    const box = this.box;
    if (!box) return;
    const alarm = services.stationAlarm.alarm;
    if (!alarm) {
      if (box.visible) box.setVisible(false);
      this.shownKey = null;
      this.shownSeconds = null;
      this.fill = 0;
      this.alarmColor = false;
      return;
    }
    this.keepOnTop();
    this.show(alarm);
    this.place();
    box.setVisible(true).setAlpha(1 - this.ui().faderAlpha);
  }

  /** State for the smoke tool and the console: `game.scene.getScene('AlarmBar').debugInfo()`. */
  debugInfo(): AlarmBarInfo {
    const visible = this.box?.visible === true;
    const scenes = this.game.scene.scenes;
    const above = scenes.slice(scenes.indexOf(this) + 1);
    return {
      visible,
      alpha: this.box?.alpha ?? 0,
      lines: visible ? [this.title?.text ?? '', this.station?.text ?? ''] : [],
      seconds: visible ? this.shownSeconds : null,
      fill: visible ? this.fill : 0,
      color: visible && this.alarmColor ? 'alarm' : 'fill',
      onTop: above.every((scene) => scene.sys.settings.key === SceneKey.Debug),
    };
  }

  /**
   * Takes the top back from panels that raised themselves; stays below the debug overlay when
   * it is on (which raises itself when it is not the top), so the two never trade places.
   */
  private keepOnTop(): void {
    const scenes = this.game.scene.scenes;
    const debug = this.scene.get(SceneKey.Debug) as DebugScene;
    const top = scenes[scenes.length - 1];
    if (!debug.shown) {
      if (top !== this) this.scene.bringToTop();
      return;
    }
    if (top === debug && scenes[scenes.length - 2] === this) return;
    this.scene.bringToTop();
    this.scene.bringToTop(SceneKey.Debug);
  }

  /** Updates the texts (when the alarm or the seconds change) and the bar. */
  private show(alarm: StationAlarm): void {
    const key = `${alarm.eventId}|${alarm.station}`;
    const seconds = Math.ceil(alarm.remainingMs / 1000);
    const share = alarm.durationMs > 0 ? alarm.remainingMs / alarm.durationMs : 0;
    const alarmColor = share <= ALARM_SHARE;
    const newAlarm = key !== this.shownKey;
    if (newAlarm) {
      this.shownKey = key;
      const title = services.voyage.events[alarm.eventId]?.title ?? alarm.eventId;
      this.title?.setText(title.toUpperCase());
      this.station?.setText(stationName(alarm.station).toUpperCase());
    }
    if (newAlarm || seconds !== this.shownSeconds || alarmColor !== this.alarmColor) {
      this.shownSeconds = seconds;
      // OWNER: script - the seconds left.
      this.seconds
        ?.setText(`${seconds}s`)
        .setColor(alarmColor ? theme.text.alarm : theme.text.normal);
    }
    // Sized after the texts are set: a new alarm's own seconds, not the previous alarm's.
    if (newAlarm || (this.seconds?.width ?? 0) > this.laidOutSecondsWidth) this.layout();
    const width = Math.round(this.barWidth * share);
    if (width !== Math.round(this.barWidth * this.fill) || alarmColor !== this.alarmColor) {
      this.drawBar(width, alarmColor);
    }
    this.fill = share;
    this.alarmColor = alarmColor;
  }

  /** Sizes the box to its texts (at least `MIN_WIDTH`); `place` puts it. */
  private layout(): void {
    const pad = PAD;
    const textWidth = Math.max(
      this.title?.width ?? 0,
      (this.station?.width ?? 0) + GAP + (this.seconds?.width ?? 0) + theme.fontSize.body * 3,
    );
    const width = Math.max(MIN_WIDTH, Math.ceil(textWidth) + pad * 2);
    this.laidOutSecondsWidth = this.seconds?.width ?? 0;
    this.barWidth = width - pad * 2;
    this.panel?.resize(width, this.boxHeight());
    this.seconds?.setX(width - pad);
    this.boxWidth = width;
    // Redraw the bar at its new width.
    this.drawBar(Math.round(this.barWidth * this.fill), this.alarmColor);
  }

  /**
   * Puts the box in the top-right corner, or, while the navigation panel shows the alarm, at
   * the panel's `alarmBarSpot()`: there the top-right corner is the gate ribbon's end.
   */
  private place(): void {
    const navigation = this.scene.isActive(SceneKey.Navigation)
      ? (this.scene.get(SceneKey.Navigation) as NavigationScene)
      : null;
    const spot = navigation?.alarmBarSpot() ?? null;
    if (spot) this.box?.setPosition(spot.right - this.boxWidth, spot.bottom - this.boxHeight());
    else this.box?.setPosition(GAME_WIDTH - MARGIN - this.boxWidth, MARGIN);
  }

  private drawBar(width: number, alarmColor: boolean): void {
    const bar = this.bar;
    if (!bar) return;
    const pad = PAD;
    const y = this.boxHeight() - pad - BAR_HEIGHT;
    bar.clear();
    bar.fillStyle(theme.bar.back, 1).fillRect(pad, y, this.barWidth, BAR_HEIGHT);
    if (width > 0) {
      bar
        .fillStyle(alarmColor ? theme.bar.alarm : theme.bar.fill, 1)
        .fillRect(pad, y, width, BAR_HEIGHT);
    }
  }

  /** Two lines of text, the bar and the padding, px. */
  private boxHeight(): number {
    const pad = PAD;
    return pad + theme.fontSize.body * 2 + GAP * 2 + BAR_HEIGHT + pad;
  }

  private ui(): UiScene {
    return this.scene.get(SceneKey.Ui) as UiScene;
  }
}
