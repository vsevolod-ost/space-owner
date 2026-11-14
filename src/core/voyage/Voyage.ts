import { DAY_S } from '@/core/simulation/constants';
import { Simulation, type VoyageRoute } from '@/core/simulation/Simulation';
import type { SolarSystem } from '@/core/simulation/SolarSystem';
import { ForecastJob, type LegForecast } from '@/core/voyage/forecast';
import type { DeathCause, Loadout, StockId } from '@/core/voyage/types';
import {
  enabledChoices,
  eventContext,
  rollEvent,
  rollRisk,
  type EventContext,
  type EventLogEntry,
  type EventResolution,
  type OpenEvent,
  type VoyageEventCatalog,
  type VoyageEventDef,
} from '@/core/voyage/voyageEvents';

/**
 * Where the voyage is (plan S7):
 * - `flying` - on a leg (Run advances it);
 * - `atGate` - parked at a gate, waiting for Stop or Go on (only Stop at the last gate);
 * - `event` - an event's card is open, waiting for a choice;
 * - `drifting` - out of fuel on a leg (D13): the crew is lost after a few real seconds of Run;
 * - `ended` - landed (Stop) or the crew died (`outcome`).
 */
export type VoyagePhase = 'flying' | 'atGate' | 'event' | 'drifting' | 'ended';

/**
 * How the voyage ended (GDD `sim-lifecycle` B, `endVoyage`):
 * - `landed` at gate `gate` (the player stopped there);
 * - `died` of `cause` on leg `leg` (`legFraction` of it flown by time), after last reaching
 *   gate `gate` (-1: none).
 */
export type VoyageOutcome =
  | { kind: 'landed'; gate: number; body: string; day: number }
  | {
      kind: 'died';
      cause: DeathCause;
      gate: number;
      leg: number;
      legFraction: number;
      day: number;
    };

/**
 * What happened in a step of the voyage, in the order to act on it (GDD `evt-arbitration`:
 * death > event > gate): the game turns them into holds and bus events.
 */
export type VoyageSignal =
  | { kind: 'gate'; gate: number }
  | { kind: 'event'; eventId: string }
  | { kind: 'ended'; outcome: VoyageOutcome };

/** An event of the current leg not rolled yet, and the simulated time it is due. */
interface PendingEvent {
  id: string;
  def: VoyageEventDef;
  dueS: number;
}

/**
 * The voyage of act 2 as a whole (plan D12, S7): the ship's `Simulation` flying the chain of
 * gates, the decision at each gate, the forecast of the next leg (D16), the events on the way
 * rolled from the run's seed (D10, D15), and how it ends. No Phaser, no event bus: the game
 * drives it through `SimulationService` (holds, bus events, flag mirrors), the tools
 * (src/devtools) drive it directly.
 */
export class Voyage {
  /** The ship flying the voyage (read it; change it only through the voyage). */
  readonly simulation: Simulation;
  /** Every event roll so far, in order (tools, the debug surface). */
  readonly log: EventLogEntry[] = [];
  private state: 'flying' | 'atGate' | 'event' | 'ended' = 'flying';
  /** Last gate reached, -1 before the first. */
  private reached = -1;
  /** Simulated time the current leg began and its planned duration, s. */
  private legStartS = 0;
  private legPlanS = 0;
  private pending: PendingEvent[] = [];
  /** Events that happened and wait for their card; the first one's card is open. */
  private queue: string[] = [];
  /** A gate reached while an event's card was open: its decision comes after the events. */
  private gateWaiting: number | null = null;
  private job: ForecastJob | null = null;
  private latest: LegForecast | null = null;
  private result: VoyageOutcome | null = null;

  /**
   * A new voyage with `loadout`'s cargo from the start orbit, events from `events` rolled with
   * `seed`. The forecast of the first leg starts computing (`workForecast`).
   */
  constructor(
    system: SolarSystem,
    private readonly route: VoyageRoute,
    loadout: Loadout,
    private readonly events: VoyageEventCatalog,
    readonly seed: number,
  ) {
    this.simulation = new Simulation(system, route, loadout);
    this.beginLeg();
    this.job = new ForecastJob(this.simulation);
  }

  /** Where the voyage is now (`VoyagePhase`). */
  get phase(): VoyagePhase {
    if (this.state === 'flying' && this.simulation.autopilot.phase === 'drifting') {
      return 'drifting';
    }
    return this.state;
  }

  /** Index of the leg flown now (or of the gate parked at): leg `i` ends at gate `i`. */
  get legIndex(): number {
    return this.simulation.autopilot.legIndex;
  }

  /** Last gate reached, -1 before the first. */
  get gateIndex(): number {
    return this.reached;
  }

  /** Whether the ship is parked at the last gate (only Stop there). */
  get atLastGate(): boolean {
    return this.state === 'atGate' && this.route.gates[this.reached]?.last === true;
  }

  /** How the voyage ended, or null while it goes on. */
  get outcome(): VoyageOutcome | null {
    return this.result;
  }

  /** Simulated day of the voyage now. */
  get day(): number {
    return this.simulation.time / DAY_S;
  }

  /** How far along the current leg by time, 0..1 (by the forecast's arrival, else the plan). */
  get legFraction(): number {
    const forecast = this.latest;
    let endS = this.legStartS + this.legPlanS;
    if (forecast && forecast.leg === this.legIndex && forecast.arrives) {
      endS = (forecast.startDay + forecast.legDays) * DAY_S;
    }
    const total = endS - this.legStartS;
    if (total <= 0) return 1;
    return Math.min(1, Math.max(0, (this.simulation.time - this.legStartS) / total));
  }

  /**
   * Advances the voyage by `realDtS` real seconds of Run: flies the leg (stopping exactly where
   * an event is due), rolls events, notes arrivals and deaths. Does nothing at a gate, on an
   * event's card or after the end. Returns what happened, death first, then the event, then the
   * gate (GDD `evt-arbitration`).
   */
  advance(realDtS: number): VoyageSignal[] {
    if (this.state !== 'flying') return [];
    this.simulation.advance(realDtS, this.pending[0]?.dueS);
    return this.afterStep();
  }

  /**
   * The open event's card (the first of the queue), with each choice enabled or not, or null
   * when no card is open.
   */
  get openEvent(): OpenEvent | null {
    if (this.state !== 'event') return null;
    const id = this.queue[0];
    const def = this.events[id];
    const ctx = this.context();
    return {
      id,
      leg: def.leg,
      speaker: def.speaker ?? 'computer',
      title: def.title,
      text: def.text,
      choices: def.choices.map((choice) => {
        const enabled = choice.when ? choice.when(ctx) : true;
        return {
          id: choice.id,
          text: choice.text,
          enabled,
          needs: enabled ? '' : (choice.needs ?? ''),
        };
      }),
    };
  }

  /**
   * Answers the open event with choice `choiceId`: rolls its risk with the seed, applies its
   * effects. Returns how it went and what follows (the next queued event, the gate reached
   * behind it, or the end if the crew died), or null if no card is open or the choice is
   * unknown or disabled. Back to `flying` otherwise; the forecast of the rest of the leg is
   * computed again.
   */
  choose(choiceId: string): { resolution: EventResolution; signals: VoyageSignal[] } | null {
    if (this.state !== 'event') return null;
    const id = this.queue[0];
    const def = this.events[id];
    const choice = def.choices.find((c) => c.id === choiceId);
    const ctx = this.context();
    if (!choice || !enabledChoices(def, ctx).includes(choice)) return null;
    const { risk, riskRoll, hit } = rollRisk(choice, id, this.seed, ctx);
    this.simulation.applyEvent(id, choice.effect);
    if (hit) this.simulation.applyEvent(id, choice.onHit);
    const entry = [...this.log].reverse().find((e) => e.eventId === id && e.happened);
    if (entry) Object.assign(entry, { choiceId: choice.id, riskRoll, risk, hit });
    this.queue.shift();
    const resolution: EventResolution = {
      eventId: id,
      choiceId: choice.id,
      hit,
      text: (hit ? choice.hitResult : choice.result) ?? '',
    };
    return { resolution, signals: this.afterEvents() };
  }

  /**
   * Go on (D6: allowed whatever the forecast says, the ship may drift): leaves the gate for the
   * next one. False when not parked at a gate or at the last one. The forecast computed at the
   * gate is the forecast of the leg now flown.
   */
  goOn(): boolean {
    if (this.state !== 'atGate' || this.atLastGate) return false;
    if (!this.simulation.departToNextGate()) return false;
    this.state = 'flying';
    this.beginLeg();
    return true;
  }

  /**
   * Stop here: the voyage ends landed at the gate parked at. Returns the outcome, or null when
   * not parked at a gate.
   */
  stop(): VoyageOutcome | null {
    if (this.state !== 'atGate') return null;
    const body = this.route.gates[this.reached].body;
    const outcome: VoyageOutcome = { kind: 'landed', gate: this.reached, body, day: this.day };
    this.end(outcome);
    return outcome;
  }

  /**
   * The forecast of the leg ahead (at a gate: the next leg; flying: the rest of this leg), or
   * null while it is being computed or when there is none (the last gate, the end).
   */
  get forecast(): LegForecast | null {
    return this.job ? null : this.latest;
  }

  /** Whether a forecast is being computed (`workForecast` advances it). */
  get forecastPending(): boolean {
    return this.job !== null;
  }

  /**
   * Computes the pending forecast for about `budgetMs` of wall-clock time; the game calls it
   * every frame (a long leg takes up to seconds of CPU in all). Returns the forecast when ready.
   */
  workForecast(budgetMs: number): LegForecast | null {
    if (this.job) {
      const done = this.job.work(budgetMs);
      if (done) {
        this.latest = done;
        this.job = null;
      }
    }
    return this.forecast;
  }

  /** Finishes the pending forecast at once (tools; seconds of CPU on the long legs). */
  finishForecast(): LegForecast | null {
    if (this.job) {
      this.latest = this.job.runAll();
      this.job = null;
    }
    return this.latest;
  }

  /** The context event numbers read now. */
  private context(): EventContext {
    const resources = this.simulation.snapshot().resources;
    const leg = this.legIndex;
    return eventContext(
      this.simulation.cargo,
      this.simulation.lifeState.offline,
      (id: StockId) => resources[id].value,
      this.route.legs[leg].comms,
      leg,
    );
  }

  /** The leg just begun: its plan and its events, by the point they are due. */
  private beginLeg(): void {
    const pilot = this.simulation.autopilot;
    this.legStartS = pilot.legStartS;
    this.legPlanS = Math.max(0, pilot.arrivalS - pilot.legStartS);
    this.pending = Object.entries(this.events)
      .filter(([, def]) => def.leg === pilot.legIndex)
      .map(([id, def]) => ({ id, def, dueS: this.legStartS + def.at * this.legPlanS }))
      .sort((a, b) => a.dueS - b.dueS);
  }

  /** After the simulation stepped: death, events due, arrivals - in that order. */
  private afterStep(): VoyageSignal[] {
    const simulation = this.simulation;
    // Death wins over an arrival in the same substep (D14, GDD `evt-arbitration`).
    if (simulation.dead) return [this.died()];
    const arrivals = simulation.takeArrivals();
    // Adrift the crew is lost in seconds of Run: no event card stops that clock (D13, D15).
    if (simulation.autopilot.phase === 'drifting') this.dropEvents();
    while (this.pending.length > 0 && simulation.time >= this.pending[0].dueS) {
      const next = this.pending.shift() as PendingEvent;
      this.roll(next);
    }
    for (const gate of arrivals) {
      this.reached = gate;
      this.dropPending();
      this.gateWaiting = gate;
    }
    if (this.queue.length > 0) {
      this.state = 'event';
      return [{ kind: 'event', eventId: this.queue[0] }];
    }
    return this.afterEvents();
  }

  /** No event card open: the end if the crew died, the waiting gate, or flying on. */
  private afterEvents(): VoyageSignal[] {
    if (this.simulation.dead) return [this.died()];
    // An answer that left the ship adrift (a fuel leak) drops the cards still queued.
    if (this.simulation.autopilot.phase === 'drifting') this.dropEvents();
    if (this.queue.length > 0) {
      this.state = 'event';
      return [{ kind: 'event', eventId: this.queue[0] }];
    }
    if (this.gateWaiting !== null) {
      const gate = this.gateWaiting;
      this.gateWaiting = null;
      this.state = 'atGate';
      this.latest = null;
      this.job = this.route.gates[gate].last ? null : new ForecastJob(this.simulation);
      return [{ kind: 'gate', gate }];
    }
    if (this.state === 'event') {
      // Back on the leg after an event: its effects changed the stocks, forecast the rest.
      this.state = 'flying';
      this.latest = null;
      this.job = new ForecastJob(this.simulation);
    }
    return [];
  }

  /** Logs the events not yet rolled on this leg as dropped and forgets them. */
  private dropPending(): void {
    for (const left of this.pending) {
      this.log.push({
        eventId: left.id,
        leg: left.def.leg,
        day: this.day,
        roll: 0,
        chance: 0,
        happened: false,
        dropped: true,
      });
    }
    this.pending = [];
  }

  /**
   * The ship is adrift: drops the events not yet rolled and the ones that happened but wait for
   * their card (their log entries are marked dropped, unanswered).
   */
  private dropEvents(): void {
    this.dropPending();
    for (const id of this.queue) {
      const entry = [...this.log].reverse().find((e) => e.eventId === id && e.happened);
      if (entry) entry.dropped = true;
    }
    this.queue = [];
  }

  /** Rolls whether event `pending` happens now; queues it if so. */
  private roll(pending: PendingEvent): void {
    const { roll, chance, happened } = rollEvent(
      pending.def,
      pending.id,
      this.seed,
      this.context(),
    );
    this.log.push({
      eventId: pending.id,
      leg: pending.def.leg,
      day: this.day,
      roll,
      chance,
      happened,
    });
    if (happened) this.queue.push(pending.id);
  }

  private died(): VoyageSignal {
    const life = this.simulation.lifeState;
    return this.end({
      kind: 'died',
      cause: life.cause ?? 'drift',
      gate: this.reached,
      leg: this.legIndex,
      legFraction: this.legFraction,
      day: life.deathDay ?? this.day,
    });
  }

  /** `endVoyage`: the voyage is over with `outcome`; nothing moves any more. */
  private end(outcome: VoyageOutcome): VoyageSignal & { kind: 'ended' } {
    this.state = 'ended';
    this.result = outcome;
    this.queue = [];
    this.pending = [];
    this.gateWaiting = null;
    this.job = null;
    return { kind: 'ended', outcome };
  }
}
