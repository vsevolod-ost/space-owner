import { DEBUG } from '@/config';
import type { EventBus } from '@/core/events/EventBus';
import type { GameEvents } from '@/core/events/events';
import type { Simulation } from '@/core/simulation/Simulation';
import { SolarSystem } from '@/core/simulation/SolarSystem';
import type {
  AutopilotState,
  SimulationContent,
  SimulationSnapshot,
} from '@/core/simulation/types';
import type { GameState } from '@/core/state/GameState';
import { DAY_S } from '@/core/simulation/constants';
import { Voyage, type VoyageOutcome, type VoyageSignal } from '@/core/voyage/Voyage';
import type { VoyageService } from '@/core/voyage/VoyageService';
import type { DeathForecast, LifeState } from '@/core/voyage/types';
import type { EventResolution } from '@/core/voyage/voyageEvents';

/** Real time between two `simulationTick` events, ms: the panel redraws this often. */
const TICK_EVENT_MS = 250;
/** Longest real frame the simulation accepts, ms: a long stall (a debugger) is cut to this. */
const MAX_FRAME_MS = 100;
/**
 * Wall-clock time per frame given to a forecast being computed, ms (a long leg's takes
 * up to seconds of CPU in all, so it is spread over frames; it goes on while time is held).
 */
const FORECAST_BUDGET_MS = 4;

/**
 * Why simulated time stands still. Time runs only while no reason is held:
 * - `panel` - the navigation panel is closed or in Hold; released only by its Run mode, and
 *   held again when the panel switches to Hold or closes;
 * - `pause` - the pause menu is open;
 * - `blur` - the browser tab is hidden (main.ts, `document.visibilitychange`);
 * - `gate` - parked at a gate, waiting for Stop or Go on (released by `goOn`);
 * - `event` - an event's card waits for an answer (released by `answerEvent`).
 * One rule for both cards (GDD `evt-presentation` A): `goOn` and `answerEvent` hold `panel`
 * again, so after a card the player presses Run himself.
 */
export type HoldReason = 'panel' | 'pause' | 'blur' | 'gate' | 'event';

/** Hold reasons of a new session: the navigation panel is closed, so `panel` is held. */
const SESSION_HOLDS: readonly HoldReason[] = ['panel'];

/**
 * Runs the voyage of act 2 (`Voyage`: the ship's `Simulation`, the gates, the forecast, the
 * events). main.ts calls `tick` on every game step (`game.events` STEP), so it can advance
 * while panels pause the world. It steps only while started, with no hold reason
 * (`HoldReason`: simulated time runs only while the navigation panel is open in Run mode), and
 * while the act it was started in is current (`state.current.actId`); `FlowService` starts it
 * (`flow.startVoyage`), stops it whenever the player leaves the story or the act (menu,
 * ending, another act) and resets the holds.
 *
 * Bus events: `simulationTick` about four times per real second, not every frame;
 * `gateReached` at a gate (holds `gate`), `voyageEvent` when an event's card opens (holds
 * `event`), `voyageEventResolved` when it is answered, `shipAlarm` when a death comes near
 * (D14), `shipDied` and then `voyageEnded` when the crew dies, `voyageEnded` on Stop. It keeps
 * the flag mirrors `voyage.*` and `event.*` for texts (GDD `act2-sim-to-content` D):
 * `voyage.nextGate` (body of the gate flown to or parked at), `voyage.legProgress` (whole per
 * cent of the leg by time, updated with `simulationTick`), `voyage.gateIndex`, `voyage.gate`,
 * `voyage.day` at a gate, and the outcome's flags at the end.
 */
export class SimulationService {
  private contentData: SimulationContent | null = null;
  private solarSystem: SolarSystem | null = null;
  private running: Voyage | null = null;
  private readonly holds = new Set<HoldReason>(SESSION_HOLDS);
  /** Debug time multiplier on top of the time scale (`setDebugWarp`); 1 in normal play. */
  private debugWarp = 1;
  /** Act the simulation was started in; it does not step in other acts. */
  private actId: string | null = null;
  /** Real time since the last `simulationTick`, ms, and simulated time in it, s. */
  private sinceEventMs = 0;
  private simulatedSinceEventS = 0;
  /** Death causes whose alarm is on (`shipAlarm` is emitted once when one comes on). */
  private alarms = new Set<string>();

  constructor(
    private readonly events: EventBus<GameEvents>,
    private readonly state: GameState,
    private readonly voyageData: VoyageService,
  ) {}

  /**
   * Hands over the solar system and the ship from src/content/simulation and the gates and
   * legs from src/content/voyage; main.ts calls this once (src/core never imports content at
   * run time).
   */
  attach(content: SimulationContent): void {
    this.contentData = content;
    this.solarSystem = new SolarSystem(content.bodies);
  }

  /** The bodies and their orbits (null before `attach`); the panel draws them. */
  get system(): SolarSystem | null {
    return this.solarSystem;
  }

  /** The content handed over by `attach` (gates, legs, ship), or null before it. */
  get content(): SimulationContent | null {
    return this.contentData;
  }

  /** The running simulation (the voyage's ship), or null when not started. */
  private get simulation(): Simulation | null {
    return this.running?.simulation ?? null;
  }

  /**
   * Starts a new voyage from the start orbit with the cargo the `cargo.<id>` flags put aboard
   * (`VoyageService.buildLoadout`) and events rolled with `seed` (plan D10: `run.seed`). Bound
   * to the act that is current now. Acts call it through `flow.startVoyage()`.
   */
  start(seed: number): void {
    const content = this.contentData;
    if (!content || !this.solarSystem) {
      throw new Error('SimulationService.start: no content attached (see main.ts)');
    }
    const route = { ...content, cargo: this.voyageData.cargo };
    this.running = new Voyage(
      this.solarSystem,
      route,
      this.voyageData.buildLoadout(),
      this.voyageData.events,
      seed,
    );
    this.actId = this.state.current?.actId ?? null;
    this.sinceEventMs = 0;
    this.simulatedSinceEventS = 0;
    this.alarms = new Set();
    this.mirrorLeg();
  }

  /**
   * The running voyage (phase, gate, open event, forecast, outcome, seed), or null when not
   * started. Read it; act through `goOn`, `stopHere`, `answerEvent`.
   */
  get voyage(): Voyage | null {
    return this.running;
  }

  /**
   * "Go on" at a gate: the ship leaves for the next one, the `gate` hold is released and
   * `panel` held (as after an event's card: the player presses Run himself, GDD
   * `evt-presentation` A). False when not parked at a gate or at the last one.
   */
  goOn(): boolean {
    if (!this.running?.goOn()) return false;
    this.release('gate');
    this.hold('panel');
    this.mirrorLeg();
    return true;
  }

  /**
   * "Stop here" at a gate: the voyage ends landed there (`voyageEnded`, flags `voyage.stopGate`,
   * `voyage.stopBody`, `voyage.stopName` (the body's name), `voyage.day`, `voyage.o2Days`). Returns the outcome, or null when not
   * parked at a gate. What follows (the colony, act 3) is the listener's (plan S11).
   */
  stopHere(): VoyageOutcome | null {
    const voyage = this.running;
    const oxygen = this.simulation?.snapshot().resources.oxygen.value ?? 0;
    const outcome = voyage?.stop() ?? null;
    if (!outcome) return null;
    this.release('gate');
    this.handle([{ kind: 'ended', outcome }], oxygen);
    return outcome;
  }

  /**
   * Answers the open event's card with choice `choiceId` (`Voyage.choose`): releases `event`
   * and holds `panel` (Run does not resume by itself), emits `voyageEventResolved`, sets
   * `event.<id>` to the choice and `event.<id>.hit`. Then whatever follows: the next card, the
   * gate reached behind it, or the end. Null if no card is open or the choice is not allowed.
   */
  answerEvent(choiceId: string): EventResolution | null {
    const answered = this.running?.choose(choiceId) ?? null;
    if (!answered) return null;
    const { resolution, signals } = answered;
    this.release('event');
    this.hold('panel');
    const flags = this.state.flags;
    flags.set(`event.${resolution.eventId}`, resolution.choiceId);
    flags.set(`event.${resolution.eventId}.hit`, resolution.hit);
    this.events.emit('voyageEventResolved', { ...resolution });
    this.handle(signals);
    return resolution;
  }

  /**
   * Stops simulated time for `reason` (the state is kept). Reasons are a set: holding one
   * twice needs one `release`.
   */
  hold(reason: HoldReason): void {
    this.holds.add(reason);
  }

  /** Removes one hold reason; time runs again when none is left. Unknown reasons are ignored. */
  release(reason: HoldReason): void {
    this.holds.delete(reason);
  }

  /** Whether `reason` is held now. */
  isHeld(reason: HoldReason): boolean {
    return this.holds.has(reason);
  }

  /** The hold reasons now, in the order they were added (for the debug overlay and smoke). */
  get heldReasons(): HoldReason[] {
    return [...this.holds];
  }

  /**
   * Drops every hold reason and holds `panel` again, as at the start of a session (the
   * navigation panel is closed then). `FlowService` calls it on every new session.
   */
  resetHolds(): void {
    this.holds.clear();
    for (const reason of SESSION_HOLDS) this.holds.add(reason);
  }

  /**
   * Debug only (`?debug=1` or `npm run dev`, see `DEBUG` in src/config.ts): multiplies the time scale by
   * `factor` so smoke scenarios fly long legs quickly - `nasa.services.simulation.setDebugWarp(50)`;
   * 1 turns it off. It lasts for the page's life (survives `stop` and new sessions, so a smoke
   * scenario sets it once). Without debug mode it is ignored with a warning.
   */
  setDebugWarp(factor: number): void {
    if (!DEBUG) {
      console.warn('SimulationService.setDebugWarp: debug mode only (?debug=1)');
      return;
    }
    if (!Number.isFinite(factor) || factor <= 0) {
      console.warn(`SimulationService.setDebugWarp: bad factor ${factor}, kept ${this.debugWarp}`);
      return;
    }
    this.debugWarp = factor;
  }

  /** The debug time multiplier now (1 unless `setDebugWarp` changed it). */
  get debugWarpFactor(): number {
    return this.debugWarp;
  }

  /** Ends the voyage and drops its state; `snapshot()` and `voyage` are null afterwards. */
  stop(): void {
    this.running = null;
    this.actId = null;
  }

  /** Whether the simulation has been started (and not stopped); it may be held or ended. */
  get isStarted(): boolean {
    return this.running !== null;
  }

  /**
   * Whether a voyage is under way: started and not ended (Stop, death). A checkpoint saves
   * this (`GameSave.voyage`): Continue starts the voyage again only if it was under way.
   */
  get isUnderWay(): boolean {
    return this.running !== null && this.running.phase !== 'ended';
  }

  /** Whether the simulation advances now: started, no hold reason, and its act is current. */
  get isRunning(): boolean {
    if (!this.simulation || this.holds.size > 0 || this.actId === null) return false;
    return this.state.current?.actId === this.actId;
  }

  /**
   * Every way the crew can die, how many simulated days away at the current flows and whether
   * it raises the alarm (D14); empty when not started or dead.
   */
  forecastLife(): DeathForecast[] {
    const simulation = this.simulation;
    if (!simulation || simulation.dead) return [];
    return simulation.forecastLife();
  }

  /** Offline items, the death if any, the drift clock (a copy), or null when not started. */
  get life(): LifeState | null {
    return this.simulation?.lifeState ?? null;
  }

  /** What the autopilot does now (a copy), or null when not started. */
  get autopilot(): AutopilotState | null {
    return this.simulation?.autopilot ?? null;
  }

  /**
   * An independent copy of the running simulation, or null when not started: a forecast flies
   * it ahead headless (`Simulation.advance`) without touching the game (D16). The flight is the
   * same as the game's, whatever the frame rate.
   */
  clone(): Simulation | null {
    return this.simulation?.clone() ?? null;
  }

  /**
   * Advances the voyage by one game frame of `realDtMs` real milliseconds; main.ts calls it on
   * every game step. A forecast being computed gets its slice of the frame even while time is
   * held (it is computed at the gates). Flies only while running. The debug warp stretches the
   * frame given to the voyage, so simulated time grows `debugWarp` times faster (the step
   * splits it into substeps as usual).
   */
  tick(realDtMs: number): void {
    const voyage = this.running;
    if (!voyage) return;
    voyage.workForecast(FORECAST_BUDGET_MS);
    if (!this.isRunning) return;
    const dtMs = Math.min(realDtMs, MAX_FRAME_MS);
    const before = voyage.simulation.time;
    const signals = voyage.advance((dtMs / 1000) * this.debugWarp);
    this.reportAlarms();
    this.handle(signals);
    const after = voyage.simulation.time;
    this.sinceEventMs += dtMs;
    this.simulatedSinceEventS += after - before;
    if (this.sinceEventMs >= TICK_EVENT_MS) {
      this.mirrorProgress();
      this.events.emit('simulationTick', { dt: this.simulatedSinceEventS });
      this.sinceEventMs = 0;
      this.simulatedSinceEventS = 0;
    }
  }

  /**
   * Turns the voyage's signals into holds, flag mirrors and bus events. `oxygen`: days of
   * oxygen at a Stop (read before the voyage ended).
   */
  private handle(signals: readonly VoyageSignal[], oxygen?: number): void {
    const flags = this.state.flags;
    const gates = this.contentData?.gates ?? [];
    for (const signal of signals) {
      const day = Math.floor((this.simulation?.time ?? 0) / DAY_S);
      if (signal.kind === 'gate') {
        const gate = gates[signal.gate];
        this.hold('gate');
        this.mirrorProgress();
        flags.set('voyage.gateIndex', signal.gate);
        flags.set('voyage.gate', gate?.body ?? '');
        flags.set('voyage.day', day);
        this.events.emit('gateReached', {
          gateIndex: signal.gate,
          body: gate?.body ?? '',
          last: gate?.last === true,
        });
      } else if (signal.kind === 'event') {
        this.hold('event');
        this.mirrorProgress();
        flags.set(`event.${signal.eventId}`, 'open');
        this.events.emit('voyageEvent', { eventId: signal.eventId });
      } else {
        const outcome = signal.outcome;
        flags.set('voyage.day', Math.floor(outcome.day));
        if (outcome.kind === 'landed') {
          flags.set('voyage.stopGate', outcome.gate);
          flags.set('voyage.stopBody', outcome.body);
          flags.set('voyage.stopName', this.solarSystem?.get(outcome.body).name ?? outcome.body);
          flags.set('voyage.o2Days', Math.floor(oxygen ?? 0));
        } else {
          flags.set('voyage.cause', outcome.cause);
          this.events.emit('shipDied', { cause: outcome.cause, day: outcome.day });
        }
        this.events.emit('voyageEnded', { outcome: { ...outcome } });
      }
    }
  }

  /** `voyage.nextGate` and `voyage.legProgress` for the leg just begun. */
  private mirrorLeg(): void {
    const voyage = this.running;
    if (!voyage) return;
    const gate = this.contentData?.gates[voyage.legIndex];
    this.state.flags.set('voyage.nextGate', gate?.body ?? '');
    this.mirrorProgress();
  }

  /**
   * `voyage.legProgress`: whole per cent of the leg flown by time. Called at most with every
   * `simulationTick` (four times a real second; the flag changes about once a second), as every
   * flag change marks the world for a rebuild (done once when the panel closes: it pauses the
   * world).
   */
  private mirrorProgress(): void {
    const voyage = this.running;
    if (!voyage || voyage.phase === 'ended') return;
    this.state.flags.set('voyage.legProgress', Math.floor(voyage.legFraction * 100));
  }

  /** `shipAlarm` for every death whose alarm has just come on (again after it went off). */
  private reportAlarms(): void {
    const simulation = this.simulation;
    if (!simulation || simulation.dead) return;
    const on = new Set<string>();
    for (const forecast of simulation.forecastLife()) {
      if (!forecast.alarm) continue;
      on.add(forecast.cause);
      if (!this.alarms.has(forecast.cause)) {
        this.events.emit('shipAlarm', { cause: forecast.cause, days: forecast.days });
      }
    }
    this.alarms = on;
  }

  /**
   * The current state (a copy), or null when not started (the panel, tools; not saved: a save
   * restarts the voyage, plan D17).
   */
  snapshot(): SimulationSnapshot | null {
    return this.simulation?.snapshot() ?? null;
  }
}
