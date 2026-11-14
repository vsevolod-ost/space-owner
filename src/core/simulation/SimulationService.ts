import type { EventBus } from '@/core/events/EventBus';
import type { GameEvents } from '@/core/events/events';
import { Simulation } from '@/core/simulation/Simulation';
import { SolarSystem } from '@/core/simulation/SolarSystem';
import type { SimulationContent, SimulationSnapshot } from '@/core/simulation/types';
import type { GameState } from '@/core/state/GameState';

/** Real time between two `simulationTick` events, ms: the panel redraws this often. */
const TICK_EVENT_MS = 250;
/** Longest real frame the simulation accepts, ms: a long stall (a debugger) is cut to this. */
const MAX_FRAME_MS = 100;

/**
 * Runs the ship simulation in the background of act 2. main.ts calls `tick`
 * on every game step (`game.events` STEP), so it keeps going while panels pause the world.
 * It steps only while started, not paused, and while the act it was started in is current
 * (`state.current.actId`); `FlowService` stops it whenever the player leaves the story or the
 * act (menu, ending, another act) and restores it from the save on "Continue".
 *
 * Emits `simulationTick` about four times per real second, not every frame.
 */
export class SimulationService {
  private content: SimulationContent | null = null;
  private solarSystem: SolarSystem | null = null;
  private simulation: Simulation | null = null;
  private paused = false;
  /** Act the simulation was started in; it does not step in other acts. */
  private actId: string | null = null;
  /** Real time since the last `simulationTick`, ms, and simulated time in it, s. */
  private sinceEventMs = 0;
  private simulatedSinceEventS = 0;

  constructor(
    private readonly events: EventBus<GameEvents>,
    private readonly state: GameState,
  ) {}

  /**
   * Hands over the solar system and the ship from src/content/simulation; main.ts calls this
   * once (src/core never imports content at run time).
   */
  attach(content: SimulationContent): void {
    this.content = content;
    this.solarSystem = new SolarSystem(content.bodies);
  }

  /** The bodies and their orbits (null before `attach`); the panel draws them. */
  get system(): SolarSystem | null {
    return this.solarSystem;
  }

  /**
   * Starts the simulation from `snapshot` (a saved game), or from the start of the voyage.
   * Bound to the act that is current now. Acts call it through `flow.startSimulation()`.
   */
  start(snapshot?: SimulationSnapshot): void {
    if (!this.content || !this.solarSystem) {
      throw new Error('SimulationService.start: no content attached (see main.ts)');
    }
    this.simulation = new Simulation(this.solarSystem, this.content.ship, snapshot);
    this.paused = false;
    this.actId = this.state.current?.actId ?? null;
    this.sinceEventMs = 0;
    this.simulatedSinceEventS = 0;
  }

  /** Freezes simulated time (the state is kept); `resume` continues. */
  pause(): void {
    this.paused = true;
  }

  /** Continues after `pause`. */
  resume(): void {
    this.paused = false;
  }

  /** Ends the simulation and drops its state; `snapshot()` is null afterwards. */
  stop(): void {
    this.simulation = null;
    this.paused = false;
    this.actId = null;
  }

  /** Whether the simulation has been started (and not stopped); it may be paused. */
  get isStarted(): boolean {
    return this.simulation !== null;
  }

  /** Whether the simulation advances now: started, not paused, and its act is current. */
  get isRunning(): boolean {
    if (!this.simulation || this.paused || this.actId === null) return false;
    return this.state.current?.actId === this.actId;
  }

  /** Whether the ship's engine is on. */
  get thrust(): boolean {
    return this.simulation?.thrustOn ?? false;
  }

  /** Turns the ship's engine on or off ("Thrust on/off" in the navigation panel). */
  setThrust(on: boolean): void {
    this.simulation?.setThrust(on);
  }

  /**
   * Advances the simulation by one game frame of `realDtMs` real milliseconds; main.ts calls
   * it on every game step. Does nothing while not running.
   */
  tick(realDtMs: number): void {
    if (!this.simulation || !this.isRunning) return;
    const dtMs = Math.min(realDtMs, MAX_FRAME_MS);
    const before = this.simulation.time;
    this.simulation.step(dtMs / 1000);
    const after = this.simulation.time;
    this.sinceEventMs += dtMs;
    this.simulatedSinceEventS += after - before;
    if (this.sinceEventMs >= TICK_EVENT_MS) {
      this.events.emit('simulationTick', { dt: this.simulatedSinceEventS });
      this.sinceEventMs = 0;
      this.simulatedSinceEventS = 0;
    }
  }

  /** The current state (a copy), or null when not started. Saved at checkpoints. */
  snapshot(): SimulationSnapshot | null {
    return this.simulation?.snapshot() ?? null;
  }
}
