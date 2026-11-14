import type { DisplayLanguage, LocalText } from '@/core/locale/text';
import type { FlagValue, GameSave } from '@/core/state/GameState';
import type { FlightSummary } from '@/core/voyage/flightSummary';
import type { VoyageOutcome } from '@/core/voyage/Voyage';

/**
 * Every game event and its payload. To add an event, add a line here: `services.events.emit`
 * and `services.events.on` pick it up with full typing.
 *
 * Location, act, dialogue and cutscene ids are plain strings in src/core: the registries that
 * narrow them (`LocationId`, `DialogueId`, ...) live in src/content.
 */
export interface GameEvents {
  /**
   * A flag got a new value (`GameState.flags.set`; `previous` is undefined for a new flag), or
   * was deleted (`value` undefined, `Flags.deletePrefix`).
   */
  flagChanged: { key: string; value: FlagValue | undefined; previous: FlagValue | undefined };
  /** The hero appeared in a location (WorldScene, after loading it). */
  locationEntered: { locationId: string; spawn: string };
  /**
   * The object the hero would interact with changed (`name` of the map object), or the hero
   * moved away from all of them (`null`). UiScene shows the "E" hint from this.
   */
  interactableFocused: { name: string | null };
  /** A dialogue window opened. */
  dialogueStarted: { dialogueId: string };
  /** A dialogue window closed. */
  dialogueEnded: { dialogueId: string };
  /** A cutscene began; player input is off until it ends. */
  cutsceneStarted: { cutsceneId: string };
  /** A cutscene finished. */
  cutsceneEnded: { cutsceneId: string };
  /** The game was saved at a checkpoint. */
  checkpointSaved: { save: GameSave };
  /**
   * The voyage was lost - the crew died, or the player gave up (`abort`) - and the death loop
   * begins (`FlowService.die`): the `run.*` flags are set, the scientists' debrief follows.
   */
  flightLost: { summary: FlightSummary };
  /**
   * The ship simulation advanced (about four times per real second, not every frame); `dt` is
   * the simulated time since the previous `simulationTick`, seconds. Not recorded in
   * `window.__nasaEvents`.
   */
  simulationTick: { dt: number };
  /**
   * The ship reached gate `gateIndex` (src/content/voyage/gates.ts) of body `body`: it is parked
   * there, simulated time is held (`gate`) until Stop or Go on (`services.simulation.stopHere`,
   * `goOn`); `last`: the last gate, only Stop. Not emitted when the crew died in the same
   * moment (death wins) or while an event's card is open (it comes after the answer).
   */
  gateReached: { gateIndex: number; body: string; last: boolean };
  /**
   * An event on the way happened (src/content/voyage/events): its card waits for an answer,
   * time is held (`event`); `services.simulation.voyage.openEvent` has the card.
   */
  voyageEvent: { eventId: string };
  /**
   * The open event was answered with `choiceId`; `hit`: its risk struck; `text` to show (`tr` it
   * when shown; null: nothing to show).
   */
  voyageEventResolved: { eventId: string; choiceId: string; hit: boolean; text: LocalText | null };
  /**
   * The voyage ended (`endVoyage`): `landed` at a gate (Stop) or `died` (after `shipDied`).
   * `FlowService` listens: `died` starts the death loop (`die`); `landed` - the colony (S11).
   */
  voyageEnded: { outcome: VoyageOutcome };
  /**
   * A death came near (D14): under 10 simulated days or 3 real seconds away at the current
   * pace, or the ship drifts out of fuel. `cause` is a `DeathCause` (`hypoxia`, `frozen`,
   * `drift`, ...), `days` simulated days to it at the current flows. Emitted once when the
   * alarm comes on (again if it went off in between).
   */
  shipAlarm: { cause: string; days: number };
  /** The crew died (`cause`: a `DeathCause`) on simulated day `day`; the simulation stands. */
  shipDied: { cause: string; day: number };
  /**
   * The station alarm of event `eventId` came on (`active: true`, the event fired and its timer
   * runs) or went off (`active: false`: answered, timed out, the crew died, the voyage stopped).
   * `station`: the deck object where it is answered (`airlock`, `bay-access-3`, ...).
   * `services.stationAlarm.alarm` has the time left. Not the resource alarm `shipAlarm`.
   */
  stationAlarm: { eventId: string; station: string; active: boolean };
  /**
   * The station alarm of event `eventId` ran out: `choiceId` (its `timeoutChoice`) is answered
   * next, its bad outcome forced; `voyageEventResolved` and `stationAlarm` (`active: false`)
   * follow.
   */
  stationAlarmTimedOut: { eventId: string; choiceId: string };
  /**
   * The language `tr` shows changed from `previous` to `language` (`services.locale.setLanguage`:
   * the settings row, or `pseudo` from the console/smoke): open screens rebuild their text.
   */
  languageChanged: { language: DisplayLanguage; previous: DisplayLanguage };
}
