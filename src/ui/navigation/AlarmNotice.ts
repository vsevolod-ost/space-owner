import type Phaser from 'phaser';
import { createText } from '@/ui/kit/text';
import { theme } from '@/ui/theme';

/** What the notice says: the event and where it is answered. */
export interface AlarmNoticeView {
  /** The event's title ("Hull breach"). */
  title: string;
  /** The station's name for the player ("Airlock", "Bay 3"). */
  station: string;
}

/** Offsets inside the column, px. */
const TITLE_Y = 24;
const STATION_Y = 44;
const HINT_Y = 68;
/** The notice's lines. OWNER: script */
const HEADING = 'ALARM';
const HINT = 'Answer it at the station before the timer runs out. E/Esc: close';

/**
 * The navigation panel's alarm in place of the status column while an event waits for an
 * answer at a deck station (plan act2-stations D6): ALARM, the event's title and where to go.
 * The panel shows it for a moment and closes by itself when the event fires, and shows it again
 * when opened during the alarm.
 */
export class AlarmNotice {
  private readonly texts: Phaser.GameObjects.Text[];

  constructor(scene: Phaser.Scene, area: Phaser.Geom.Rectangle, view: AlarmNoticeView) {
    const { x, y } = area;
    const wrap = { wordWrap: { width: area.width }, lineSpacing: theme.lineSpacing };
    this.texts = [
      createText(scene, x, y, HEADING, 'title').setColor(theme.text.alarm),
      createText(scene, x, y + TITLE_Y, view.title.toUpperCase(), 'body', wrap).setColor(
        theme.text.highlight,
      ),
      // OWNER: script
      createText(scene, x, y + STATION_Y, `Go to: ${view.station.toUpperCase()}`, 'body', wrap),
      createText(scene, x, y + HINT_Y, HINT, 'small', wrap).setColor(theme.text.dim),
    ];
  }

  /** Every line as shown, top to bottom, for `debugInfo`. */
  get lines(): string[] {
    return this.texts.map((text) => text.text);
  }

  /** Removes the notice. */
  destroy(): void {
    for (const text of this.texts) text.destroy();
    this.texts.length = 0;
  }
}
