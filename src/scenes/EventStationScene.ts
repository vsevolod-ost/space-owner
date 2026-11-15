import Phaser from 'phaser';
import { stationName } from '@/content/locations/ship-deck';
import { tr, type LocalText } from '@/core/locale/text';
import { services } from '@/core/services';
import { SceneKey } from '@/scenes/keys';
import { PanelScene } from '@/ui/PanelScene';
import type { CardInfo } from '@/ui/navigation/Card';
import { EventCard } from '@/ui/navigation/EventCard';
import { createText } from '@/ui/kit/text';
import { theme } from '@/ui/theme';

/** What `EventStationScene.debugInfo()` returns. */
export interface EventStationDebugInfo {
  /** The event whose card is open, or null (the scene is not open). */
  eventId: string | null;
  /** The deck object the card was opened at (`airlock`, `bay-access-3`, ...), or null. */
  station: string | null;
  /** The card (`EventCard.debugInfo`), or null. */
  card: CardInfo | null;
}

/** Outer size of the panel, px: the content area is the navigation panel's column, 300x288. */
const PANEL_WIDTH = 324;
const PANEL_HEIGHT = 312;
/**
 * The key hint at the card's bottom right. Max 10: it shares the bottom line (37 characters)
 * with the card's legend (src/ui/navigation/Card.ts, max 26); the two can trade room.
 * OWNER: script
 */
const LEAVE_HINT: LocalText = { en: 'Esc: leave', uk: 'Esc: вийти', max: 10 };

/**
 * The card of the open event at its deck station (plan act2-stations D1, D4): the same
 * `EventCard` the navigation panel used to show, on a panel of its own over the paused deck.
 * The station's binding (`src/content/locations/ship-deck.ts`) opens it while the alarm is on
 * there. A choice answers the event (`services.simulation.answerEvent`) and closes the panel;
 * Esc closes it without an answer (the alarm's timer goes on, the hero can come back); it
 * closes by itself when the alarm goes off another way (its timer ran out). The station's name
 * is at the top right.
 */
export class EventStationScene extends PanelScene {
  private card: EventCard | null = null;
  private eventId: string | null = null;
  private station: string | null = null;

  constructor() {
    super(SceneKey.EventStation);
  }

  protected build(): void {
    const alarm = services.stationAlarm.alarm;
    const event = services.simulation.voyage?.openEvent;
    const area = this.addPanel({ width: PANEL_WIDTH, height: PANEL_HEIGHT });
    if (!alarm || !event || event.id !== alarm.eventId) {
      // The alarm went off between the press and the panel: nothing to answer.
      this.close();
      return;
    }
    this.eventId = event.id;
    this.station = alarm.station;
    createText(this, area.right, area.y, stationName(alarm.station).toUpperCase(), 'small')
      .setOrigin(1, 0)
      .setColor(theme.text.alarm);
    createText(this, area.right, area.bottom, tr(LEAVE_HINT), 'small').setOrigin(1, 1);
    this.card = new EventCard(this, area, this.controls, event, (choiceId) => {
      if (services.simulation.answerEvent(choiceId)) this.close();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.card?.destroy();
      this.card = null;
      this.eventId = this.station = null;
    });
  }

  /** Closes on Esc (PanelScene), and by itself once the alarm of its event is off. */
  update(): void {
    super.update();
    if (this.eventId !== null && services.stationAlarm.alarm?.eventId !== this.eventId) {
      this.close();
    }
  }

  /** State for the smoke tool and the console: `window.nasa.game.scene.getScene('EventStation')`. */
  debugInfo(): EventStationDebugInfo {
    return {
      eventId: this.eventId,
      station: this.station,
      card: this.card?.debugInfo() ?? null,
    };
  }
}
