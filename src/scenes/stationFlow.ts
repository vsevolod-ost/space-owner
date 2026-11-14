import Phaser from 'phaser';
import { stationName } from '@/content/locations/ship-deck';
import { services } from '@/core/services';
import type { EventStationScene } from '@/scenes/EventStationScene';
import { SceneKey } from '@/scenes/keys';
import type { NavigationScene } from '@/scenes/NavigationScene';
import type { UiScene } from '@/scenes/UiScene';

/** Lines of the deck's toasts about the voyage. OWNER: script */
const LINES = {
  /** Before an event's result when its alarm ran out. */
  tooLate: 'Too late!',
  /** A gate was reached behind an answered event: the gate card waits on the panel. */
  gate: 'Gate reached: back to the navigation station.',
  /** A new alarm came on while the panel is closed (the next event of the queue). */
  alarm: (title: string, station: string) => `ALARM: ${title} - go to the ${station}!`,
} as const;

/**
 * Wires the act 2 voyage to the ship deck while the navigation panel is closed (plan
 * act2-stations D9, D13; main.ts calls it once). Events are answered at deck stations, so what
 * the panel used to show goes elsewhere:
 * - the result of an answer (`voyageEventResolved`; "Too late!" before it when the alarm ran
 *   out), a gate reached behind the event and a new alarm of the queue are a toast on the deck
 *   (UiScene), all of one game step joined in one toast;
 * - a death (`voyageEnded`, `died`) closes the station's card if it is open and opens the
 *   navigation panel, which shows LOST until the death loop takes over (`LOSS_BEAT_MS`), with
 *   the world paused under it. The panel opens only after the card's scene has shut down
 *   (`PanelScene` resumes the scenes it paused on shutdown, K15).
 * While the navigation panel is open it shows all of this itself.
 */
export function attachStationFlow(game: Phaser.Game): void {
  const scenes = game.scene;
  const navigation = () => scenes.getScene(SceneKey.Navigation) as NavigationScene;
  const panelOpen = () => {
    const scene = navigation();
    return scene.scene.isActive() || scene.scene.isPaused();
  };
  /** The deck's toast lines of this game step, shown together after it. */
  const pending: string[] = [];
  let timedOut: string | null = null;

  const events = services.events;
  events.on('stationAlarmTimedOut', ({ eventId }) => {
    timedOut = eventId;
  });
  events.on('voyageEventResolved', ({ eventId, text }) => {
    const late = timedOut === eventId;
    timedOut = null;
    if (panelOpen() || !text) return;
    pending.push(late ? `${LINES.tooLate} ${text}` : text);
  });
  events.on('gateReached', () => {
    if (!panelOpen()) pending.push(LINES.gate);
  });
  events.on('stationAlarm', ({ eventId, station, active }) => {
    if (!active || panelOpen()) return;
    const title = services.voyage.events[eventId]?.title ?? eventId;
    pending.push(LINES.alarm(title, stationName(station).toLowerCase()));
  });
  events.on('voyageEnded', ({ outcome }) => {
    if (outcome.kind === 'died' && !panelOpen()) void showLoss();
  });
  game.events.on(Phaser.Core.Events.POST_STEP, () => {
    if (pending.length === 0) return;
    const ui = scenes.getScene(SceneKey.Ui) as UiScene;
    ui.toast(pending.join(' '));
    pending.length = 0;
  });

  /** Closes the station's card (if open), then opens the navigation panel on LOST. */
  async function showLoss(): Promise<void> {
    const station = scenes.getScene(SceneKey.EventStation) as EventStationScene;
    if (station.scene.isActive() || station.scene.isPaused()) {
      // Opening an open panel only waits for it to close.
      const closed = station.open();
      station.close();
      await closed;
    }
    const world = scenes.getScene(SceneKey.World);
    // The death loop may have moved on meanwhile (it waits `LOSS_BEAT_MS`).
    if (!world.scene.isActive() || services.simulation.voyage?.outcome?.kind !== 'died') return;
    void navigation().open();
  }
}
