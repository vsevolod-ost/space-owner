import { DEBUG } from '@/config';
import { bayAccessName, stationObject } from '@/core/alarm/station';
import type { EventBus } from '@/core/events/EventBus';
import type { GameEvents } from '@/core/events/events';
import type { SimulationService } from '@/core/simulation/SimulationService';
import type { Voyage } from '@/core/voyage/Voyage';
import type { VoyageService } from '@/core/voyage/VoyageService';

/**
 * Real seconds the player has to answer an event at its deck station (plan act2-stations D4),
 * counted from the moment the event fires (the navigation panel's alarm flash included). When
 * it runs out the event's `timeoutChoice` is applied with its bad outcome. OWNER: design
 */
export const STATION_TIMER_S = 10;

/** Longest real frame the timer counts, ms: a long stall (a debugger) is cut to this. */
const MAX_FRAME_MS = 100;

/** The alarm on now (`StationAlarmService.alarm`). */
export interface StationAlarm {
  /** The open event (`voyage.openEvent.id`). */
  eventId: string;
  /** Deck object where it is answered (`airlock`, `bay-access-3`, ...). */
  station: string;
  /** Real time left, ms (0..`durationMs`). */
  remainingMs: number;
  /** The whole timer of this alarm, ms. */
  durationMs: number;
}

/** What `StationAlarmService.debugInfo()` returns. */
export interface StationAlarmDebugInfo {
  /** The alarm on now (a copy), or null. */
  alarm: StationAlarm | null;
  /** Timer a new alarm gets, ms (`STATION_TIMER_S`, or `setDebugTimer`). */
  timerMs: number;
  /** Whether the timer stands now (pause menu or hidden tab). */
  paused: boolean;
  /** The last alarm that ran out in this page's life and the choice it applied, or null. */
  lastTimeout: { eventId: string; choiceId: string } | null;
}

/**
 * The station alarm of act 2 (plan act2-stations S3): while the voyage waits for an answer to
 * an event (phase `event`), an alarm is on for that event with a real-time countdown; the
 * player runs to the event's deck station and answers there. main.ts calls `tick` on every game
 * step, after `simulation.tick`. The state is derived from the voyage each tick: a new open
 * event (the next one of the queue, or of a new voyage) starts a new countdown; no open event
 * (answered, crew dead, voyage stopped) ends the alarm. Nothing is saved (D14). The timer
 * stands while the pause menu holds `pause` (and while the tab is hidden).
 *
 * When the countdown runs out: `stationAlarmTimedOut`, then the event's `timeoutChoice` is
 * answered with `forceHit` (`SimulationService.answerEvent`; its usual events follow), then
 * `stationAlarm` with `active: false`. An answer given anywhere else ends the alarm on the next
 * tick.
 *
 * Bus events: `stationAlarm { eventId, station, active }` when an alarm comes on and goes off;
 * `stationAlarmTimedOut { eventId, choiceId }`.
 */
export class StationAlarmService {
  private current: StationAlarm | null = null;
  /** The voyage the current alarm belongs to (a new voyage with the same event is a new alarm). */
  private currentVoyage: Voyage | null = null;
  private timerMs = STATION_TIMER_S * 1000;
  private lastTimeout: { eventId: string; choiceId: string } | null = null;

  constructor(
    private readonly events: EventBus<GameEvents>,
    private readonly simulation: SimulationService,
    private readonly voyageData: VoyageService,
  ) {}

  /** The alarm on now (a copy), or null; the timer bar and the deck stations read it. */
  get alarm(): StationAlarm | null {
    return this.current ? { ...this.current } : null;
  }

  /** Whether the timer stands now: the pause menu is open or the tab is hidden. */
  get paused(): boolean {
    return this.simulation.isHeld('pause') || this.simulation.isHeld('blur');
  }

  /**
   * Advances the alarm by one game frame of `realDtMs` real milliseconds: follows the voyage's
   * open event and runs the timer out. main.ts calls it on every game step.
   */
  tick(realDtMs: number): void {
    this.sync();
    const alarm = this.current;
    if (!alarm || this.paused) return;
    alarm.remainingMs = Math.max(0, alarm.remainingMs - Math.min(realDtMs, MAX_FRAME_MS));
    if (alarm.remainingMs === 0) this.timeOut(alarm);
  }

  /**
   * Debug only (`?debug=1` or `npm run dev`): the timer of new alarms becomes `ms` (smoke
   * scenarios use a short one), and the alarm on now is cut to it if it has more left; null
   * restores `STATION_TIMER_S`. Lasts for the page's life. Without debug mode it is ignored with
   * a warning.
   */
  setDebugTimer(ms: number | null): void {
    if (!DEBUG) {
      console.warn('StationAlarmService.setDebugTimer: debug mode only (?debug=1)');
      return;
    }
    if (ms !== null && (!Number.isFinite(ms) || ms <= 0)) {
      console.warn(`StationAlarmService.setDebugTimer: bad timer ${ms}, kept ${this.timerMs}`);
      return;
    }
    this.timerMs = ms ?? STATION_TIMER_S * 1000;
    const alarm = this.current;
    if (alarm) {
      alarm.durationMs = Math.min(alarm.durationMs, this.timerMs);
      alarm.remainingMs = Math.min(alarm.remainingMs, this.timerMs);
    }
  }

  /** State for the smoke tool and the console: `nasa.services.stationAlarm.debugInfo()`. */
  debugInfo(): StationAlarmDebugInfo {
    return {
      alarm: this.alarm,
      timerMs: this.timerMs,
      paused: this.paused,
      lastTimeout: this.lastTimeout ? { ...this.lastTimeout } : null,
    };
  }

  /** Starts, switches or ends the alarm to match the voyage's open event. */
  private sync(): void {
    const voyage = this.simulation.voyage;
    const eventId = voyage?.phase === 'event' ? (voyage.openEvent?.id ?? null) : null;
    const alarm = this.current;
    if (alarm && alarm.eventId === eventId && this.currentVoyage === voyage) return;
    if (alarm) {
      this.current = null;
      this.currentVoyage = null;
      this.events.emit('stationAlarm', {
        eventId: alarm.eventId,
        station: alarm.station,
        active: false,
      });
    }
    if (!voyage || eventId === null) return;
    const station = this.stationOf(eventId);
    this.current = { eventId, station, remainingMs: this.timerMs, durationMs: this.timerMs };
    this.currentVoyage = voyage;
    this.events.emit('stationAlarm', { eventId, station, active: true });
  }

  /** The deck object of event `eventId`'s station (`stationObject`, by the hold of the flags). */
  private stationOf(eventId: string): string {
    const def = this.voyageData.events[eventId];
    const station = stationObject(def.station, this.voyageData.hold());
    if (station !== null) return station;
    // An event at a crate's bay fires only with that cargo aboard, so this should not happen.
    console.warn(
      `StationAlarmService: event "${eventId}" is answered at the bay of ` +
        `"${JSON.stringify(def.station)}", which is not in the hold; using ${bayAccessName(1)}`,
    );
    return bayAccessName(1);
  }

  /**
   * The timer ran out: answers the event with its `timeoutChoice`, its bad outcome forced. If
   * the voyage refuses that choice (should not happen: `checkEventCatalog`), the first allowed
   * choices are tried in order, without forcing (a forced first choice could kill).
   */
  private timeOut(alarm: StationAlarm): void {
    const voyage = this.simulation.voyage;
    const event = voyage?.openEvent;
    if (!event || event.id !== alarm.eventId) return;
    const timeoutChoice = this.voyageData.events[event.id].timeoutChoice;
    // The marked choice with a sure bad outcome; should it be refused (the catalog check makes
    // that unreachable), the allowed choices in order, without forcing (a forced first choice
    // could kill).
    const candidates = [
      ...event.choices
        .filter((choice) => choice.id === timeoutChoice && choice.enabled)
        .map((choice) => ({ id: choice.id, forceHit: true })),
      ...event.choices
        .filter((choice) => choice.id !== timeoutChoice && choice.enabled)
        .map((choice) => ({ id: choice.id, forceHit: false })),
    ];
    const answered = candidates.find((candidate) => {
      if (candidate.id !== timeoutChoice) {
        console.warn(
          `StationAlarmService: timeoutChoice "${timeoutChoice}" of "${event.id}" was refused; ` +
            `answering "${candidate.id}"`,
        );
      }
      this.lastTimeout = { eventId: event.id, choiceId: candidate.id };
      this.events.emit('stationAlarmTimedOut', { eventId: event.id, choiceId: candidate.id });
      return this.simulation.answerEvent(candidate.id, { forceHit: candidate.forceHit }) !== null;
    });
    if (!answered) {
      // Unreachable with a checked catalog; count down again rather than warn every frame.
      console.warn(`StationAlarmService: no choice of "${event.id}" could be answered`);
      alarm.remainingMs = alarm.durationMs;
      return;
    }
    this.sync();
  }
}
