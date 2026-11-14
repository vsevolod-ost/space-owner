import {
  AUTOPILOT,
  captureRadius,
  flightTime,
  guidance,
  guidanceEffort,
  parkingRadius,
} from '@/core/simulation/autopilot';
import { DAY_S, G } from '@/core/simulation/constants';
import { Workspace, coast, coastToClosest, kick, substepFor } from '@/core/simulation/dynamics';
import { type LambertSolution, solveLambert } from '@/core/simulation/lambert';
import { deltaVMS, fuelFlowKgPerS, fuelForDvKg } from '@/core/simulation/rocket';
import type { SolarSystem } from '@/core/simulation/SolarSystem';
import { computeTelemetry, type Telemetry } from '@/core/simulation/telemetry';
import type {
  AutopilotState,
  Body,
  GateDef,
  LegDef,
  Resources,
  ShipConfig,
  ShipState,
  SimulationSnapshot,
} from '@/core/simulation/types';
import { RESOURCE_IDS } from '@/core/simulation/types';
import {
  DRIFT_DEATH_REAL_S,
  FLOW_IDS,
  freshLife,
  lifeForecast,
  resourceDeath,
  stepLife,
} from '@/core/voyage/flows';
import { loadoutOf, startResources } from '@/core/voyage/loadout';
import { shipMassKg, shipMassRateKgPerS, startMassKg } from '@/core/voyage/mass';
import type {
  CargoCatalog,
  DeathCause,
  DeathForecast,
  FlowId,
  LifeState,
  Loadout,
} from '@/core/voyage/types';
import { applyEventEffect, type EventEffect } from '@/core/voyage/voyageEvents';

// OWNER: physics - every constant and formula in this file is a first draft by the programmer;
// replace them freely. Keep the contract: `step(realDtS)` advances the world by one frame and
// returns a JSON-safe `SimulationSnapshot` (docs/HOWTO-simulation.md).

// Time scale (GDD D9: logarithmic in the distance to the places of the voyage, the `home`,
// `gate` and `parent` bodies): simulated seconds per real second for every factor of 10 in that
// distance beyond `TIME_SCALE_REFERENCE_M`, within a floor..`MAX_TIME_SCALE`. The floor is
// `MIN_TIME_SCALE` by the body of the gate the ship flies to (the approach and the docking the
// player watches) and `DEPARTURE_MIN_TIME_SCALE` by every other one (the body the ship leaves,
// the Earth on the way to Mars): `timeScaleAt`. Tuned with `npm run voyage-check` (plan
// variable-mass D8, S5) to the old pace of act 2 with the realistic engine: the whole voyage
// about 49 s of Run (47-52 s with a body's phase shifted), the Moon leg about 17 s, at least
// 2-3 s of slow approach to every gate before the capture radius. The flight itself does not
// depend on these constants (only how long it takes in real time); a leg's docking lasts `dockS`
// simulated seconds, sized in src/content/voyage/legs.ts to about 0.9 real s at these constants -
// resize it after changing them. The real-time alarm and the drift death (`ALARM_REAL_S`,
// `DRIFT_DEATH_REAL_S`, src/core/voyage/flows.ts) and invariant I6 depend on them too: run
// `npm run balance` after a change. OWNER: physics - every time-scale constant below.

/**
 * Time scale: simulated s per real s for every factor of 10 in the distance. 450 000 (was
 * 300 000 for a 51-day Mars leg): the realistic engine's transfer coasts about 160 days at
 * 1e10-1e11 m from the bodies, and this flies them in about 22 s of Run, as long as the old
 * 51-day leg took in all.
 */
const TIME_SCALE_PER_DECADE = 450_000;
/** Time scale: distance at which the logarithmic part is 0, m (beyond the Moon's orbit). */
const TIME_SCALE_REFERENCE_M = 5e8;
/**
 * Time scale floor by the gate body the ship flies to, sim s per real s (15 000: 250 minutes a
 * second). The whole Moon leg (2-3 days, all within 5e8 m of the Moon) runs at it: about 16 s
 * of Run, the old Moon leg's length; the Mars approach (within 10 capture radii, 1.1e10 m) takes
 * about 6 s.
 */
const MIN_TIME_SCALE = 15_000;
/**
 * Time scale floor by every other `home`, `gate` or `parent` body (the one the ship leaves),
 * sim s per real s. The Mars transfer waits up to 3 days on the Moon's parking orbit for its
 * departure direction and then burns 2-4 days near the Moon and the Earth: at the approach
 * floor that alone was 30-45 s of Run; at 150 000 (about 1.7 days a second) it is 2-4 s, still
 * long enough to see the ship spiral out.
 */
const DEPARTURE_MIN_TIME_SCALE = 150_000;
/** Time scale ceiling, sim s per real s (not reached on the current route: 1e12 m gives 1.5e6). */
const MAX_TIME_SCALE = 2_000_000;
/** Substeps a docking is split into. */
const DOCKING_SUBSTEPS = 24;
/**
 * Near the gate body a substep moves the ship at most this share of its distance to the body,
 * so the capture radius is never jumped over.
 */
const APPROACH_STEP_FRACTION = 0.05;

/** What a `Simulation` flies besides the bodies: the ship, the gates and legs, the cargo. */
export interface VoyageRoute {
  ship: ShipConfig;
  gates: readonly GateDef[];
  legs: readonly LegDef[];
  /** The cargo registry: a snapshot's `cargo` counts are turned back into a loadout. */
  cargo: CargoCatalog;
}

/** When and where a stock ran out on a forecast copy (`Simulation.depletions`). */
export interface Depletion {
  /** Simulated time, s. */
  timeS: number;
  /** The ship's position then, m (the panel's mark, D7). */
  x: number;
  y: number;
}

/** A Lambert arc of a transfer leg and the gate body's velocity on arrival (`lambertTo`), m/s. */
type TransferArc = LambertSolution & { arriveVx: number; arriveVy: number };

/** A gate as the simulation uses it: its body's index, capture and parking radii. */
interface GatePlace {
  index: number;
  captureM: number;
  parkM: number;
  /**
   * For a moon deep in its planet's gravity (the planet pulls harder than the engine at the
   * moon's orbit): the planet's index and the standoff distance from it, m; otherwise -1, 0.
   */
  planetIndex: number;
  standoffM: number;
  /**
   * A transfer (the gate body orbits the Sun, plan variable-mass S4): the autopilot flies a
   * Lambert arc around `centralIndex` (`AUTOPILOT.minTransferS`).
   */
  transfer: boolean;
  centralIndex: number;
}

/**
 * The ship flying through the solar system: flat model, bodies on static orbits
 * (`SolarSystem`), the ship pulled by the strongest gravity sources and pushed by its engine,
 * which the autopilot fires to reach the next gate (`autopilot.ts`); resources run down. No
 * Phaser and no browser: `SimulationService` drives it from the game loop, the voyage check
 * (src/devtools) and forecasts drive copies of it (`clone`).
 */
export class Simulation {
  private timeS: number;
  private timeScale: number;
  private pendingS: number;
  private readonly ship: ShipState;
  private readonly resources: Resources;
  private readonly pilot: AutopilotState;
  /** What the ship carries (its flows per day, `evaluateFlows`). */
  private readonly loadout: Loadout;
  private readonly life: LifeState;
  private readonly work: Workspace;
  private readonly predictWork: Workspace;
  /** Scratch of `telemetry` (made on first use: forecast copies never need it). */
  private telemetryWork: Workspace | null = null;
  private readonly places: readonly GatePlace[];
  /** Body indices the time scale looks at (roles `home`, `gate`, `parent`). */
  private readonly pacers: readonly number[];
  /** Gates reached since the last `takeArrivals`, in order. */
  private arrivals: number[] = [];
  /** False for a forecast copy (`forecastCopy`): nobody dies, depletions are recorded. */
  private mortal = true;
  private readonly depleted: Partial<Record<FlowId, Depletion>> = {};

  /**
   * Starts from `from`: a snapshot (the state being cloned), or a loadout - the start of the
   * voyage with that cargo (`buildLoadout`): on the parking orbit of `route.ship.start`, flying
   * leg 0, resources from the cargo's `start` amounts.
   */
  constructor(
    private readonly system: SolarSystem,
    private readonly route: VoyageRoute,
    from: Loadout | SimulationSnapshot,
  ) {
    this.work = new Workspace(system);
    this.predictWork = new Workspace(system);
    this.pacers = system.bodies.flatMap((body, i) => (body.role === 'scenery' ? [] : [i]));
    const loadout = 'entries' in from ? from : loadoutOf(route.cargo, from.cargo);
    // Parking and standoff distances from the mass at the start of the voyage (plan
    // variable-mass D16), so they stay put while the ship gets lighter.
    const accel = route.ship.thrustN / startMassKg(route.cargo, loadout);
    this.places = route.gates.map((gate) => {
      const body = system.get(gate.body);
      const index = system.indexOf(gate.body);
      const parent = system.get(body.parent ?? system.bodies[0].id);
      const captureM = captureRadius(body, parent);
      const planetIndex = body.parent === undefined ? -1 : system.indexOf(body.parent);
      const planetGm = planetIndex < 0 ? 0 : system.gm[planetIndex];
      const deep = planetGm / body.orbitRadiusM ** 2 > accel;
      return {
        index,
        captureM,
        parkM: parkingRadius(system.gm[index], body.radiusM, captureM, accel),
        planetIndex: deep ? planetIndex : -1,
        standoffM: deep ? Math.sqrt(planetGm / (AUTOPILOT.standoffPullFraction * accel)) : 0,
        transfer: body.parent === undefined,
        centralIndex: system.indexOf(parent.id),
      };
    });
    if (route.legs.length !== route.gates.length) {
      throw new Error('Simulation: one leg per gate expected (src/content/voyage)');
    }
    if (!('entries' in from)) {
      const snapshot = from;
      this.timeS = snapshot.timeS;
      this.timeScale = snapshot.timeScale;
      this.pendingS = snapshot.pendingS;
      this.ship = { ...snapshot.ship };
      this.loadout = loadout;
      this.resources = cloneResources({
        ...startResources(this.loadout),
        ...snapshot.resources,
      });
      this.pilot = { ...snapshot.autopilot };
      this.life = cloneLife(snapshot.life);
    } else {
      this.timeS = 0;
      this.pendingS = 0;
      this.loadout = from;
      this.resources = startResources(from);
      this.ship = initialShip(system, route.ship, shipMassKg(route.cargo, from, this.resources));
      this.pilot = emptyPilot();
      this.life = freshLife();
      this.beginLeg(0);
      this.timeScale = this.timeScaleNow();
      // Rates of the first leg, so the panel shows days of stock before Run.
      stepLife(this.resources, this.loadout, this.leg, this.life, 0);
    }
  }

  /** An independent copy in the same state (a headless forecast flies it ahead). */
  clone(): Simulation {
    return new Simulation(this.system, this.route, this.snapshot());
  }

  /**
   * Advances the simulation by `realDtS` real seconds (one frame) and returns the new state.
   * The time scale grants `realDtS * timeScale` simulated seconds; the integrator advances in
   * whole substeps chosen from the state alone and keeps the rest for the next frame. While
   * parked at a gate (`arrived`, `finished`) nothing moves and simulated time stands (GDD: time
   * stands at the gates); the frame that docks drops what is left of its grant. So the flight
   * is the same at any frame rate, debug warp or time spent at the gates (a forecast on a clone
   * matches the game).
   */
  step(realDtS: number): SimulationSnapshot {
    this.advance(realDtS);
    return this.snapshot();
  }

  /**
   * `step` without building a snapshot (for long headless runs). With `untilS`, integration
   * stops after the first substep that reaches that simulated time (a voyage event is due then,
   * `Voyage`); the rest of the frame's grant is kept for the next call. Substeps are chosen from
   * the state alone, so where it stops does not depend on frame times either.
   */
  advance(realDtS: number, untilS?: number): void {
    this.timeScale = this.timeScaleNow();
    if (this.parked || this.dead) {
      this.pendingS = 0;
      return;
    }
    this.pendingS += realDtS * this.timeScale;
    for (;;) {
      if (untilS !== undefined && this.timeS >= untilS) break;
      const h = this.substep();
      if (this.pendingS < h) break;
      this.pendingS -= h;
      this.integrate(h);
      if (this.parked || this.dead) {
        this.pendingS = 0;
        return;
      }
    }
    // Out of fuel mid-leg (D13): the crew is lost after `DRIFT_DEATH_REAL_S` of Run. Counted in
    // the real seconds given to `advance` (the debug warp shortens it too). A forecast copy
    // (`forecastCopy`) does not die.
    if (this.pilot.phase === 'drifting' && this.mortal) {
      this.life.driftRealS += realDtS;
      if (this.life.driftRealS >= DRIFT_DEATH_REAL_S) this.die('drift');
    }
  }

  /**
   * A forecast copy flying ahead headless (D16): integrates at most `maxSubsteps` substeps -
   * the same substeps `advance` takes, chosen from the state alone, so the flight is the game's
   * whatever the frame grant - and stops early once parked, dead or drifting, or once simulated
   * time reaches `untilS`. Takes no frame grant (the time scale and the drift clock stay as
   * they are), so it is for forecast copies only. Returns the substeps taken.
   */
  flySubsteps(maxSubsteps: number, untilS = Number.POSITIVE_INFINITY): number {
    let taken = 0;
    while (taken < maxSubsteps && this.timeS < untilS) {
      const phase = this.pilot.phase;
      if (this.parked || this.dead || phase === 'drifting') break;
      this.integrate(this.substep());
      taken += 1;
    }
    return taken;
  }

  /**
   * A copy for a forecast (D16): it flies like this one but nobody aboard dies - a stock at 0
   * stays at 0 and the copy records when each stock first ran out (`depletions`), a drifting
   * copy drifts on. Its effects on items (the greenhouse dying without power) still apply.
   */
  forecastCopy(): Simulation {
    const copy = this.clone();
    copy.mortal = false;
    return copy;
  }

  /** Forecast copies: when and where each stock first ran out (simulated s, ship position). */
  get depletions(): Readonly<Partial<Record<FlowId, Depletion>>> {
    return this.depleted;
  }

  /**
   * Applies an event's effect (plan S7) to the ship: `applyEventEffect` - waiting days of the
   * flows (the ship, the bodies and the voyage's clock stay where they are: a working
   * approximation, GDD `evt-asteroid`), stocks within 0..max (fuel, in kg, at 0 on a leg leaves
   * the ship drifting, D13; a resource at 0 kills as usual), items offline, the event's own
   * death. The ship's mass follows (`shipMassKg`).
   */
  applyEvent(eventId: string, effect: EventEffect | undefined): void {
    applyEventEffect(
      {
        resources: this.resources,
        life: this.life,
        flow: (dtS) => this.flowResources(dtS),
        fuelOut: () => {
          if (this.pilot.phase !== 'flying') return;
          this.pilot.phase = 'drifting';
          this.engineOff();
        },
        die: (cause) => this.die(cause),
      },
      eventId,
      effect,
    );
    this.updateMass();
  }

  /** Whether the crew is dead (`life.cause` set): nothing moves any more. */
  get dead(): boolean {
    return this.life.cause !== null;
  }

  /** Offline items, the death, the drift clock (a copy). */
  get lifeState(): LifeState {
    return cloneLife(this.life);
  }

  /** What the ship carries. */
  get cargo(): Loadout {
    return this.loadout;
  }

  /**
   * Ends the voyage with the crew's death from `cause`: the simulation stands from now on.
   * The resource deaths and `drift` come by themselves; plan S7's events call it with
   * `event:<id>`. A second death is ignored.
   */
  die(cause: DeathCause): void {
    if (this.dead) return;
    this.life.cause = cause;
    this.life.deathDay = this.timeS / DAY_S;
    this.engineOff();
  }

  /**
   * Every way the crew can die and how far away it is at the current flows, with the alarm
   * (`lifeForecast`, D14): the panel and `SimulationService`'s `shipAlarm` read it.
   */
  forecastLife(): DeathForecast[] {
    return lifeForecast({
      resources: this.resources,
      loadout: this.loadout,
      leg: this.leg,
      life: this.life,
      timeScale: this.timeScale,
      realSecondsTo: (days) => this.realSecondsTo(days),
      drifting: this.pilot.phase === 'drifting' && !this.dead,
    });
  }

  /** Real seconds of Run until `days` simulated days from now, at most (`realSecondsAhead`). */
  private realSecondsTo(days: number): number {
    return realSecondsAhead(this.pace(), days);
  }

  /**
   * What the pace of Run depends on now (`realSecondsAhead`): the time scale, the distance to
   * the closest `home`, `gate` or `parent` body and the ship's speed against it, the engine's
   * acceleration. The balance tools (src/devtools) record it along a flight.
   */
  pace(): PaceState {
    return { timeScale: this.timeScale, accel: this.accel, ...this.nearestPacer() };
  }

  /** Whether the ship is parked at a gate (`arrived`, `finished`): simulated time stands. */
  private get parked(): boolean {
    return this.pilot.phase === 'arrived' || this.pilot.phase === 'finished';
  }

  /** The current state as a new plain object (safe to keep and to save as JSON). */
  snapshot(): SimulationSnapshot {
    return {
      timeS: this.timeS,
      timeScale: this.timeScale,
      pendingS: this.pendingS,
      ship: { ...this.ship },
      resources: cloneResources(this.resources),
      autopilot: { ...this.pilot },
      cargo: { ...this.loadout.counts },
      life: cloneLife(this.life),
    };
  }

  /** Simulated time since the start of the voyage, s. */
  get time(): number {
    return this.timeS;
  }

  /**
   * Delta-v the fuel aboard gives the ship at its mass now, m/s (the rocket equation, plan
   * variable-mass D16): the panel's FUEL row and the gate card's "have".
   */
  get dvAvailable(): number {
    return deltaVMS(this.route.ship.ispS, this.ship.massKg, this.resources.fuel.value);
  }

  /**
   * The ship's flight data now (`computeTelemetry`, plan variable-mass D12): mass, its rate,
   * the engine's acceleration, local gravity, escape speed. Shown by the navigation panel.
   */
  telemetry(): Telemetry {
    this.telemetryWork ??= new Workspace(this.system);
    return computeTelemetry(
      this.telemetryWork,
      this.ship,
      this.timeS,
      shipMassRateKgPerS(this.route.cargo, this.resources),
    );
  }

  /** Specific impulse of the ship's engine, s (`ShipConfig.ispS`). */
  get ispS(): number {
    return this.route.ship.ispS;
  }

  /** The autopilot's state now (a copy). */
  get autopilot(): AutopilotState {
    return { ...this.pilot };
  }

  /** Capture radius of gate `gateIndex`, m. */
  captureRadiusOf(gateIndex: number): number {
    return this.places[gateIndex].captureM;
  }

  /**
   * Gates reached (docking finished) since the last call, in order; empties the list.
   * `Voyage` turns them into gate decisions (`gateReached`).
   */
  takeArrivals(): number[] {
    const arrivals = this.arrivals;
    this.arrivals = [];
    return arrivals;
  }

  /**
   * Leaves the gate the ship is parked at for the next one. Only while `arrived` (not at the
   * last gate); returns whether the leg began.
   */
  departToNextGate(): boolean {
    if (this.pilot.phase !== 'arrived') return false;
    const next = this.pilot.legIndex + 1;
    if (next >= this.route.gates.length) return false;
    this.beginLeg(next);
    return true;
  }

  /**
   * The time scale at the ship's position now (`timeScaleAt`): its distance to the body of the
   * gate it flies to (or is parked at) and to the nearest other `home`, `gate` or `parent` body.
   */
  private timeScaleNow(): number {
    const positions = this.work.positions;
    this.system.fillPositions(this.timeS, positions);
    const gate = this.places[this.pilot.legIndex]?.index ?? -1;
    let gateM = Infinity;
    let otherM = Infinity;
    for (const i of this.pacers) {
      const distance = Math.hypot(
        positions[i * 2] - this.ship.x,
        positions[i * 2 + 1] - this.ship.y,
      );
      if (i === gate) gateM = distance;
      else otherM = Math.min(otherM, distance);
    }
    return timeScaleAt(gateM, otherM);
  }

  /** The closest `home`, `gate` or `parent` body: distance and the ship's speed against it. */
  private nearestPacer(): { distanceM: number; speedMS: number } {
    const positions = this.work.positions;
    this.system.fillPositions(this.timeS, positions);
    let nearest = Infinity;
    let index = -1;
    for (const i of this.pacers) {
      const dx = positions[i * 2] - this.ship.x;
      const dy = positions[i * 2 + 1] - this.ship.y;
      const distance = Math.hypot(dx, dy);
      if (distance < nearest) {
        nearest = distance;
        index = i;
      }
    }
    if (index < 0) return { distanceM: Infinity, speedMS: 0 };
    const v = this.system.velocityOf(this.system.bodies[index], this.timeS);
    return {
      distanceM: nearest,
      speedMS: Math.hypot(this.ship.vx - v.x, this.ship.vy - v.y),
    };
  }

  /** Distance from the ship to the body of the gate it flies to, m. */
  distanceToGate(): number {
    const p = this.system.positionOf(this.gateBody(), this.timeS);
    return Math.hypot(p.x - this.ship.x, p.y - this.ship.y);
  }

  /** The engine's acceleration at the ship's mass now, m/s^2 (a = F / M(t)). */
  private get accel(): number {
    return this.route.ship.thrustN / this.ship.massKg;
  }

  private gateBody() {
    return this.system.bodies[this.places[this.pilot.legIndex].index];
  }

  /** Length of the next substep from the current state, s. */
  private substep(): number {
    const pilot = this.pilot;
    if (pilot.phase === 'docking') return pilot.dockDurationS / DOCKING_SUBSTEPS;
    const ship = this.ship;
    this.work.gravity(ship.x, ship.y, this.timeS);
    let h = substepFor(this.work);
    // Close to the gate body: short steps, so the capture radius is not jumped over.
    const body = this.gateBody();
    const p = this.system.positionOf(body, this.timeS);
    const v = this.system.velocityOf(body, this.timeS);
    const distance = Math.hypot(p.x - ship.x, p.y - ship.y);
    const speed = Math.hypot(v.x - ship.vx, v.y - ship.vy);
    if (speed > 0) h = Math.min(h, Math.max(1, (APPROACH_STEP_FRACTION * distance) / speed));
    if (pilot.phase === 'flying' && this.leg.mode === 'physics') {
      // A guidance update lands on a substep boundary.
      h = Math.min(h, Math.max(1, pilot.nextReplanS - this.timeS));
    }
    if (pilot.phase === 'flying' && this.leg.mode === 'rail' && pilot.arrivalS > this.timeS) {
      // The rail's last substep ends at its end.
      h = Math.min(h, pilot.arrivalS - this.timeS);
    }
    return h;
  }

  private get leg(): LegDef {
    return this.route.legs[this.pilot.legIndex];
  }

  /**
   * One substep of `h` simulated seconds in the current autopilot phase (`advance` never calls
   * it while parked). Resources change for the time that actually passed.
   */
  private integrate(h: number): void {
    const pilot = this.pilot;
    const startS = this.timeS;
    // The engine's burn of this substep (kg/s); `fly` and `followRail` set it while it fires.
    this.resources.fuel.ratePerS = 0;
    switch (pilot.phase) {
      case 'flying':
        if (this.leg.mode === 'rail') this.followRail(h);
        else this.fly(h);
        break;
      case 'drifting':
        this.work.gravity(this.ship.x, this.ship.y, this.timeS);
        kick(this.ship, this.work, this.timeS, h, 0, 0, 0, 0);
        this.timeS += h;
        break;
      case 'docking':
        this.timeS += h;
        this.dock();
        break;
      case 'arrived':
      case 'finished':
        break;
    }
    this.flowResources(this.timeS - startS);
  }

  /** A physics leg: guidance, engine, gravity, fuel, capture. */
  private fly(h: number): void {
    const pilot = this.pilot;
    const ship = this.ship;
    if (this.timeS >= pilot.nextReplanS) this.replan();
    this.work.gravity(ship.x, ship.y, this.timeS);
    let ax = 0;
    let ay = 0;
    let endAx = 0;
    let endAy = 0;
    if (pilot.thrusting) {
      const { thrustN, ispS } = this.route.ship;
      const a = this.accel;
      ax = a * pilot.dirX;
      ay = a * pilot.dirY;
      const fuel = this.resources.fuel;
      const flowKgPerS = fuelFlowKgPerS(thrustN, ispS);
      fuel.ratePerS = -flowKgPerS;
      // The engine pushes harder at the end of the step: the ship is lighter by then (M(t+h)
      // from the mass rate of the burn and the flows; `flowResources` sets the exact mass
      // after). A tank that empties during the step gives no thrust at its end (Verlet then
      // averages half the push over the step; the fuel left is burnt all the same).
      const lasts = flowKgPerS * h < fuel.value;
      const endA = lasts
        ? thrustN / (ship.massKg + shipMassRateKgPerS(this.route.cargo, this.resources) * h)
        : 0;
      endAx = endA * pilot.dirX;
      endAy = endA * pilot.dirY;
      pilot.dvSpent += ((a + endA) / 2) * h;
      this.burn(flowKgPerS * h);
    }
    kick(ship, this.work, this.timeS, h, ax, ay, endAx, endAy);
    ship.thrustN = pilot.thrusting ? this.route.ship.thrustN : 0;
    if (pilot.thrusting) ship.heading = Math.atan2(pilot.dirY, pilot.dirX);
    else if (ship.vx !== 0 || ship.vy !== 0) ship.heading = Math.atan2(ship.vy, ship.vx);
    this.timeS += h;
    this.checkCapture();
  }

  /**
   * Burns `kg` of fuel (plan variable-mass D3), at most what the tank holds, and updates the
   * ship's mass. With the tank empty the engine stops for good: `drifting` (D13).
   */
  private burn(kg: number): void {
    const fuel = this.resources.fuel;
    const empties = kg >= fuel.value;
    fuel.value = empties ? 0 : fuel.value - kg;
    this.updateMass();
    if (empties) {
      this.pilot.phase = 'drifting';
      this.engineOff();
    }
  }

  /** The engine stops: no thrust, no burn. */
  private engineOff(): void {
    this.pilot.thrusting = false;
    this.ship.thrustN = 0;
    this.resources.fuel.ratePerS = 0;
  }

  /**
   * Delta-v the leg has left of its plan, m/s: the plan (`dvPlan`) less what was spent. The
   * fuel aboard does not cap it (see `beginLeg`): the tank emptying stops the engine instead.
   */
  private dvRemaining(): number {
    return Math.max(0, this.pilot.dvPlan - this.pilot.dvSpent);
  }

  /** The ship's mass from the cargo and the resources now (M(t), `shipMassKg`). */
  private updateMass(): void {
    this.ship.massKg = shipMassKg(this.route.cargo, this.loadout, this.resources);
  }

  /** Inside the capture radius of the gate body: docking begins. */
  private checkCapture(): void {
    const pilot = this.pilot;
    const distance = this.distanceToGate();
    pilot.closestM = Math.min(pilot.closestM, distance);
    const place = this.places[pilot.legIndex];
    if (pilot.phase !== 'flying' || distance > place.captureM) return;
    const body = this.gateBody();
    const p = this.system.positionOf(body, this.timeS);
    const v = this.system.velocityOf(body, this.timeS);
    pilot.phase = 'docking';
    pilot.thrusting = false;
    this.ship.thrustN = 0;
    pilot.fromX = this.ship.x - p.x;
    pilot.fromY = this.ship.y - p.y;
    pilot.fromVx = this.ship.vx - v.x;
    pilot.fromVy = this.ship.vy - v.y;
    pilot.dockStartS = this.timeS;
    pilot.dockDurationS = this.leg.dockS;
    const r = Math.hypot(pilot.fromX, pilot.fromY) || 1;
    pilot.parkX = (pilot.fromX / r) * place.parkM;
    pilot.parkY = (pilot.fromY / r) * place.parkM;
  }

  /**
   * Docking: the ship's offset from the gate body blends from where it was captured (keeping
   * its velocity at first, limited so it does not swing far out) to the parking point; at the
   * end the gate is reached.
   */
  private dock(): void {
    const pilot = this.pilot;
    const d = pilot.dockDurationS;
    const s = Math.min(1, (this.timeS - pilot.dockStartS) / d);
    // Cubic Hermite blend: from (offset, velocity) at capture to (park point, at rest).
    const h00 = 2 * s ** 3 - 3 * s ** 2 + 1;
    const h10 = s ** 3 - 2 * s ** 2 + s;
    const h01 = -2 * s ** 3 + 3 * s ** 2;
    const reach = Math.hypot(pilot.fromX, pilot.fromY);
    const swing = Math.hypot(pilot.fromVx, pilot.fromVy) * d;
    const k = swing > reach ? reach / swing : 1;
    const ox = h00 * pilot.fromX + h10 * d * k * pilot.fromVx + h01 * pilot.parkX;
    const oy = h00 * pilot.fromY + h10 * d * k * pilot.fromVy + h01 * pilot.parkY;
    this.placeAtGate(ox, oy);
    if (s >= 1) {
      const last = this.route.gates[pilot.legIndex].last === true;
      pilot.phase = last ? 'finished' : 'arrived';
      this.arrivals.push(pilot.legIndex);
    }
  }

  private placeAtGate(offsetX: number, offsetY: number): void {
    const body = this.gateBody();
    const p = this.system.positionOf(body, this.timeS);
    const v = this.system.velocityOf(body, this.timeS);
    this.ship.x = p.x + offsetX;
    this.ship.y = p.y + offsetY;
    this.ship.vx = v.x;
    this.ship.vy = v.y;
  }

  /**
   * Starts leg `index`: from a parking orbit (or the start orbit for leg 0), the arrival
   * planned for the leg's delta-v plan (plan variable-mass D16, D20): `AUTOPILOT.planFraction`
   * of the delta-v the fuel gives, at most of the leg's `dvBudget`.
   */
  private beginLeg(index: number): void {
    const pilot = this.pilot;
    if (index > 0) {
      // Leave the parking orbit of the previous gate: circular, counter-clockwise.
      const r = Math.hypot(pilot.parkX, pilot.parkY) || 1;
      const speed = Math.sqrt(this.system.gm[this.places[pilot.legIndex].index] / r);
      this.ship.vx += (-pilot.parkY / r) * speed;
      this.ship.vy += (pilot.parkX / r) * speed;
    }
    Object.assign(pilot, emptyPilot(), {
      phase: 'flying',
      legIndex: index,
      legStartS: this.timeS,
      fromX: this.ship.x,
      fromY: this.ship.y,
      fromVx: this.ship.vx,
      fromVy: this.ship.vy,
    } satisfies Partial<AutopilotState>);
    pilot.closestM = this.distanceToGate();
    // Less fuel, a slower transfer (D20); the budget caps the fastest one. Short of fuel even
    // for the slowest allowed transfer, the ship flies that one and drifts when the tank empties.
    pilot.dvPlan = AUTOPILOT.planFraction * Math.min(this.dvAvailable, this.leg.dvBudget);
    // Deep in a body's gravity (the Earth at the start, a giant planet after its moon): climb out first.
    this.work.gravity(this.ship.x, this.ship.y, this.timeS);
    const strongest = this.strongestPull();
    if (strongest.pull > this.accel) {
      pilot.stage = -1;
      pilot.climbBody = strongest.index;
    }
    const place = this.places[index];
    if (place.planetIndex >= 0) {
      // The standoff point is on the planet's side facing the ship.
      const planet = this.system.positionOf(this.system.bodies[place.planetIndex], this.timeS);
      const dx = this.ship.x - planet.x;
      const dy = this.ship.y - planet.y;
      const r = Math.hypot(dx, dy) || 1;
      pilot.wayX = dx / r;
      pilot.wayY = dy / r;
    }
    pilot.arrivalS = this.timeS + this.plannedFlightTime();
    pilot.nextReplanS = this.timeS;
  }

  /**
   * Delta-v leg `pilot.legIndex` needs from here, m/s (plan variable-mass D21, the gate card's
   * "need"): on a transfer leg the Lambert delta-v of the slowest allowed transfer
   * (`chooseTransfer`) with the autopilot's reserve (over `AUTOPILOT.planFraction`); null on
   * another leg (the forecast measures it by flying), while not flying, or when no transfer
   * of the window has a Lambert arc (unknown: the flight decides).
   */
  dvNeedMS(): number | null {
    const pilot = this.pilot;
    if (pilot.phase !== 'flying' || !this.places[pilot.legIndex].transfer) return null;
    const dv = this.chooseTransfer(0).dv;
    return Number.isFinite(dv) ? dv / AUTOPILOT.planFraction : null;
  }

  /**
   * A transfer leg's flight (D20): of the arrivals `AUTOPILOT.minTransferS` ..
   * `maxTransferS` after the leg began (after now, if the ship is so late that a
   * `minTransferS` transfer no longer fits), the earliest whose Lambert delta-v from here
   * (`transferDv`) is within `planDv`, m/s; with none, the cheapest of them (the slowest
   * allowed transfer, about a Hohmann one). Returns its time from now and delta-v, s and m/s
   * (Infinity if no arrival of the window has an arc).
   */
  private chooseTransfer(planDv: number): { timeS: number; dv: number } {
    // The window counts from the leg's start (the climb and the departure wait come out of it);
    // a ship so late that not even a `minTransferS` transfer fits in it any more (it lost its
    // schedule) counts a fresh window from now.
    const late =
      this.timeS + AUTOPILOT.minTransferS > this.pilot.legStartS + AUTOPILOT.maxTransferS;
    const origin = late ? this.timeS : this.pilot.legStartS;
    const grid: { timeS: number; dv: number }[] = [];
    for (
      let t = AUTOPILOT.minTransferS;
      t <= AUTOPILOT.maxTransferS;
      t += AUTOPILOT.transferGridS
    ) {
      const timeS = origin + t - this.timeS;
      if (timeS > 0) grid.push({ timeS, dv: this.transferDv(timeS) });
    }
    let slowest = 0;
    grid.forEach((cell, i) => {
      if (cell.dv < grid[slowest].dv) slowest = i;
    });
    for (let i = 0; i <= slowest; i++) {
      if (grid[i].dv > planDv) continue;
      if (i === 0) return grid[0];
      let low = grid[i - 1].timeS;
      let high = grid[i].timeS;
      for (let k = 0; k < AUTOPILOT.transferIterations; k++) {
        const middle = (low + high) / 2;
        if (this.transferDv(middle) > planDv) low = middle;
        else high = middle;
      }
      return { timeS: high, dv: this.transferDv(high) };
    }
    return grid[slowest];
  }

  /**
   * Lambert delta-v of a transfer from here to the gate body `timeS` from now, m/s: the
   * velocity change to leave on the arc around the leg's central body (`GatePlace.centralIndex`,
   * the Sun) plus the one to match the body's velocity on arrival, as impulses; Infinity when
   * there is no such arc.
   */
  private transferDv(timeS: number): number {
    const arc = this.lambertTo(this.gateBody(), 0, timeS);
    if (!arc) return Number.POSITIVE_INFINITY;
    const departure = this.departureDv(arc);
    return (
      Math.hypot(departure.x, departure.y) +
      Math.hypot(arc.arriveVx - arc.v2x, arc.arriveVy - arc.v2y)
    );
  }

  /**
   * Velocity change that puts the ship on `arc` from here, m/s. Within a planet's sphere of
   * influence (the Earth on the way out from the Moon) the arc's velocity is what is left
   * after climbing out of the planet's gravity: the ship needs the speed against the planet
   * that leaves it with that excess, sqrt(v_inf^2 + 2 GM / r), along the excess (patched
   * conics; burning deep in the well is cheaper, the Oberth effect).
   */
  private departureDv(arc: TransferArc): { x: number; y: number } {
    const place = this.places[this.pilot.legIndex];
    const central = this.system.bodies[place.centralIndex];
    const c = this.system.velocityOf(central, this.timeS);
    const planet = this.departurePlanet();
    if (planet < 0) {
      return { x: arc.v1x - (this.ship.vx - c.x), y: arc.v1y - (this.ship.vy - c.y) };
    }
    const body = this.system.bodies[planet];
    const p = this.system.positionOf(body, this.timeS);
    const v = this.system.velocityOf(body, this.timeS);
    // The excess speed against the planet, and the speed it takes from here.
    const ex = arc.v1x - (v.x - c.x);
    const ey = arc.v1y - (v.y - c.y);
    const excess = Math.hypot(ex, ey);
    if (excess === 0) return { x: v.x - this.ship.vx, y: v.y - this.ship.vy };
    const r = Math.hypot(this.ship.x - p.x, this.ship.y - p.y);
    const speed = Math.sqrt(excess * excess + (2 * this.system.gm[planet]) / r);
    return {
      x: (ex / excess) * speed - (this.ship.vx - v.x),
      y: (ey / excess) * speed - (this.ship.vy - v.y),
    };
  }

  /**
   * Whether a burn along (`dirX`, `dirY`) would now lead the ship into the body it leaves (the
   * previous gate, or the start body): close to it (it pulls with over
   * `AUTOPILOT.departPullFraction` of the engine) and the burn points less than
   * `AUTOPILOT.departMinCos` away from it - from the parking orbit's far side the ship would
   * dive past the body and its gravity would throw the burn away.
   */
  private departureBlocked(dirX: number, dirY: number): boolean {
    const pilot = this.pilot;
    const body =
      pilot.legIndex === 0
        ? this.system.get(this.route.ship.start.around)
        : this.system.bodies[this.places[pilot.legIndex - 1].index];
    const p = this.system.positionOf(body, this.timeS);
    const dx = this.ship.x - p.x;
    const dy = this.ship.y - p.y;
    const r = Math.hypot(dx, dy) || 1;
    const pull = (G * body.massKg) / (r * r);
    if (pull <= AUTOPILOT.departPullFraction * this.accel) return false;
    return (dx * dirX + dy * dirY) / r < AUTOPILOT.departMinCos;
  }

  /**
   * Index of the planet (a body orbiting the leg's central body, not the gate body) whose
   * sphere of influence (a (m / M)^0.4) the ship is in, or -1.
   */
  private departurePlanet(): number {
    const place = this.places[this.pilot.legIndex];
    const central = this.system.bodies[place.centralIndex];
    const positions = this.predictWork.positions;
    this.system.fillPositions(this.timeS, positions);
    let found = -1;
    this.system.bodies.forEach((body, i) => {
      // Bodies without a parent orbit the root (the Sun at the origin).
      const orbitsCentral =
        central.parent === undefined ? body.parent === undefined : body.parent === central.id;
      if (!orbitsCentral || i === place.index || body.periodS === 0) return;
      const soi = body.orbitRadiusM * (body.massKg / central.massKg) ** 0.4;
      const r = Math.hypot(positions[i * 2] - this.ship.x, positions[i * 2 + 1] - this.ship.y);
      if (r < soi) found = i;
    });
    return found;
  }

  /**
   * The Lambert arc around the leg's central body from the ship now to `body`'s position
   * `timeS` from now (moved by `offsetM` along `pilot.wayX`, `wayY` plus `extraX`, `extraY`, m),
   * with the body's velocity then; velocities relative to the central body, m/s. Null if there
   * is no such arc (or it dives into the central body).
   */
  private lambertTo(
    body: Body,
    offsetM: number,
    timeS: number,
    extraX = 0,
    extraY = 0,
  ): TransferArc | null {
    const place = this.places[this.pilot.legIndex];
    const central = this.system.bodies[place.centralIndex];
    const arrivalS = this.timeS + timeS;
    const c0 = this.system.positionOf(central, this.timeS);
    const c1 = this.system.positionOf(central, arrivalS);
    const cv1 = this.system.velocityOf(central, arrivalS);
    const p = this.system.positionOf(body, arrivalS);
    const v = this.system.velocityOf(body, arrivalS);
    const arc = solveLambert(
      this.ship.x - c0.x,
      this.ship.y - c0.y,
      p.x - c1.x + this.pilot.wayX * offsetM + extraX,
      p.y - c1.y + this.pilot.wayY * offsetM + extraY,
      timeS,
      this.system.gm[place.centralIndex],
      central.radiusM,
    );
    return arc && { ...arc, arriveVx: v.x - cv1.x, arriveVy: v.y - cv1.y };
  }

  /**
   * Cruise of a transfer leg (stage 0): Lambert from here to the aim at the planned arrival,
   * the engine fired along the velocity change it asks for (`AUTOPILOT.cruiseOnMS`). The aim
   * stops short of the body (`aimAt`) and the arc passes it by the braking distance, so that
   * the arrival burn - a constant braking at `AUTOPILOT.brakeShare` of the engine - ends there
   * at rest. Once that burn is due returns false: stage 2, the rendezvous guidance flies the
   * rest. An update without an arc coasts and tries again `AUTOPILOT.minReplanS` later.
   */
  private cruise(): boolean {
    const pilot = this.pilot;
    const place = this.places[pilot.legIndex];
    const timeToGo = pilot.arrivalS - this.timeS;
    const body = this.gateBody();
    const aimM = AUTOPILOT.aimCaptureShare * place.captureM;
    const accel = this.accel;
    // The aim and the braking depend on the arrival speed and side, which depend on the arc:
    // from the last update's (the first update starts from the arc to the body itself).
    let arc: TransferArc | null = null;
    let brakeS = pilot.arriveSpeedMS / (AUTOPILOT.brakeShare * accel);
    for (let round = pilot.arriveSpeedMS > 0 ? 1 : 0; round < 2 && timeToGo > 0; round++) {
      // Coasting, the ship passes the stop point by half the braking time at the arrival speed.
      const speed = pilot.arriveSpeedMS;
      brakeS = speed / (AUTOPILOT.brakeShare * accel);
      const pass = (speed * brakeS) / 2;
      arc =
        round === 0
          ? this.lambertTo(body, 0, timeToGo)
          : this.lambertTo(body, aimM, timeToGo, -pilot.wayX * pass, -pilot.wayY * pass);
      if (!arc) break;
      const ux = arc.v2x - arc.arriveVx;
      const uy = arc.v2y - arc.arriveVy;
      const u = Math.hypot(ux, uy);
      pilot.arriveSpeedMS = u;
      if (u > 0) {
        pilot.wayX = -ux / u;
        pilot.wayY = -uy / u;
      }
    }
    if (timeToGo <= brakeS) {
      pilot.stage = 2;
      return false;
    }
    if (!arc) {
      // No arc this update (`lambertTo` found none): coast on and try again soon. The arrival
      // burn still hands over to stage 2 on time, by the last arc's arrival speed.
      pilot.thrusting = false;
      pilot.nextReplanS =
        this.timeS +
        Math.max(AUTOPILOT.cruiseBurnReplanS, Math.min(AUTOPILOT.minReplanS, timeToGo - brakeS));
      return true;
    }
    const change = this.departureDv(arc);
    const dvx = change.x;
    const dvy = change.y;
    const dv = Math.hypot(dvx, dvy);
    pilot.thrusting = dv > (pilot.thrusting ? AUTOPILOT.cruiseOffMS : AUTOPILOT.cruiseOnMS);
    if (pilot.thrusting && this.departureBlocked(dvx / dv, dvy / dv)) {
      // Still on the parking orbit's wrong side: coast round to where the burn leads away.
      pilot.thrusting = false;
      pilot.nextReplanS = this.timeS + AUTOPILOT.minReplanS;
      return true;
    }
    if (pilot.thrusting) {
      pilot.dirX = dvx / dv;
      pilot.dirY = dvy / dv;
      pilot.nextReplanS =
        this.timeS +
        Math.min(AUTOPILOT.minReplanS, Math.max(AUTOPILOT.cruiseBurnReplanS, dv / accel));
    } else {
      const interval = Math.min(
        AUTOPILOT.cruiseMaxReplanS,
        Math.max(AUTOPILOT.minReplanS, AUTOPILOT.replanFraction * timeToGo),
      );
      // Wake up for the arrival burn on time.
      pilot.nextReplanS =
        this.timeS + Math.max(AUTOPILOT.cruiseBurnReplanS, Math.min(interval, timeToGo - brakeS));
    }
    return true;
  }

  /**
   * Flight time to the aim for the delta-v the leg has left of its plan (`dvRemaining`), s. On
   * a transfer leg the Lambert transfer it affords (`chooseTransfer`). Otherwise (to the gate
   * body, or the standoff point) a straight "accelerate -
   * coast - brake" flight (`straightFlightTime`). On a physics leg, if the guidance would need
   * more than that delta-v for this time (`effortDv`: gravity and the ship's own velocity
   * included), the time is stretched until it would not, at most `AUTOPILOT.maxStretch` times.
   */
  private plannedFlightTime(): number {
    if (this.places[this.pilot.legIndex].transfer) {
      return this.chooseTransfer(this.dvRemaining()).timeS;
    }
    const dv = Math.max(AUTOPILOT.minPlanShare * this.leg.dvBudget, this.dvRemaining());
    const straight = this.straightFlightTime(dv);
    if (this.leg.mode === 'rail' || this.effortDv(straight) <= dv) return straight;
    let low = straight;
    let high = straight * AUTOPILOT.maxStretch;
    if (this.effortDv(high) > dv) return high;
    for (let i = 0; i < AUTOPILOT.stretchIterations; i++) {
      const middle = (low + high) / 2;
      if (this.effortDv(middle) > dv) low = middle;
      else high = middle;
    }
    return high;
  }

  /**
   * Straight-line flight time for delta-v `dv`, s: distance to where the aim will be, seen
   * from the body the ship leaves (the ship moves with it: 30 km/s around the Sun with the
   * Earth); a few rounds, as that point depends on the time.
   */
  private straightFlightTime(dv: number): number {
    const from =
      this.pilot.legIndex === 0
        ? this.system.get(this.route.ship.start.around)
        : this.system.bodies[this.places[this.pilot.legIndex - 1].index];
    const fromNow = this.system.positionOf(from, this.timeS);
    const offsetX = this.ship.x - fromNow.x;
    const offsetY = this.ship.y - fromNow.y;
    const here = this.aimAt(this.timeS);
    let duration = flightTime(
      Math.hypot(here.x - this.ship.x, here.y - this.ship.y),
      dv,
      this.accel,
    );
    for (let i = 0; i < 8; i++) {
      const p = this.aimAt(this.timeS + duration);
      const q = this.system.positionOf(from, this.timeS + duration);
      const distance = Math.hypot(p.x - q.x - offsetX, p.y - q.y - offsetY);
      duration = flightTime(distance, dv, this.accel);
    }
    return duration;
  }

  /**
   * Delta-v the guidance would need to reach the aim in `timeToGoS`, m/s: the least-effort
   * profile (`guidanceEffort`) from the miss of an engine-off prediction, times
   * `AUTOPILOT.effortFactor` (full-or-nothing burns spend less than it).
   */
  private effortDv(timeToGoS: number): number {
    const predicted = { x: this.ship.x, y: this.ship.y, vx: this.ship.vx, vy: this.ship.vy };
    coast(
      predicted,
      this.predictWork,
      this.timeS,
      timeToGoS,
      AUTOPILOT.predictionMaxStepS,
      AUTOPILOT.predictionOrbitFraction,
    );
    const aim = this.aimAt(this.timeS + timeToGoS);
    const effort = guidanceEffort(
      aim.x - predicted.x,
      aim.y - predicted.y,
      aim.vx - predicted.vx,
      aim.vy - predicted.vy,
      timeToGoS,
    );
    return AUTOPILOT.effortFactor * effort;
  }

  /** The body that pulls the ship hardest now (after `work.gravity`) and its pull, m/s^2. */
  private strongestPull(): { index: number; pull: number } {
    let best = { index: 0, pull: 0 };
    const positions = this.work.positions;
    this.system.gm.forEach((gm, index) => {
      const dx = positions[index * 2] - this.ship.x;
      const dy = positions[index * 2 + 1] - this.ship.y;
      const pull = gm / (dx * dx + dy * dy);
      if (pull > best.pull) best = { index, pull };
    });
    return best;
  }

  /**
   * Where the guidance aims at `timeS`: the gate body; on a transfer leg the point short of it
   * on the side the ship comes from (`AUTOPILOT.aimCaptureShare`); on a moon leg in stage 0
   * the standoff point by its planet (moving with the planet). Position and velocity, m and m/s.
   */
  private aimAt(timeS: number): { x: number; y: number; vx: number; vy: number } {
    const pilot = this.pilot;
    const place = this.places[pilot.legIndex];
    if (place.transfer) {
      // Short of the body on the side the ship comes from (`cruise`).
      const body = this.gateBody();
      const p = this.system.positionOf(body, timeS);
      const v = this.system.velocityOf(body, timeS);
      const d = AUTOPILOT.aimCaptureShare * place.captureM;
      return { x: p.x + pilot.wayX * d, y: p.y + pilot.wayY * d, vx: v.x, vy: v.y };
    }
    if (place.planetIndex >= 0 && pilot.stage === 0) {
      const planet = this.system.bodies[place.planetIndex];
      const p = this.system.positionOf(planet, timeS);
      const v = this.system.velocityOf(planet, timeS);
      return {
        x: p.x + pilot.wayX * place.standoffM,
        y: p.y + pilot.wayY * place.standoffM,
        vx: v.x,
        vy: v.y,
      };
    }
    const body = this.gateBody();
    const p = this.system.positionOf(body, timeS);
    const v = this.system.velocityOf(body, timeS);
    return { x: p.x, y: p.y, vx: v.x, vy: v.y };
  }

  /**
   * Guidance update: predicts where the ship would be at the planned arrival with the engine
   * off, and fires the engine (full or nothing) towards the correction the guidance law asks
   * for (`autopilot.ts`). Plans the arrival again when it is too close to make. On a moon leg,
   * once at the standoff point, aims the fall instead (`aimFall`).
   */
  private replan(): void {
    const pilot = this.pilot;
    const place = this.places[pilot.legIndex];
    if (pilot.stage === -1) {
      if (this.climbOut()) return;
      pilot.stage = 0;
      pilot.arrivalS = this.timeS + this.plannedFlightTime();
    }
    if (place.planetIndex >= 0 && pilot.stage === 0) {
      const aim = this.aimAt(this.timeS);
      const off = Math.hypot(aim.x - this.ship.x, aim.y - this.ship.y);
      if (off < AUTOPILOT.standoffTolerance * place.standoffM) {
        // At the standoff point: drop when the fall would pass near enough the moon for the
        // engine to close the miss; until then hold the point (wait for the moon to come round).
        if (this.dropWindow()) pilot.stage = 1;
        else pilot.arrivalS = Math.max(pilot.arrivalS, this.timeS + AUTOPILOT.holdAimS);
      }
    }
    if (pilot.stage === 1) {
      this.aimFall();
      return;
    }
    if (place.transfer && pilot.stage === 0 && this.cruise()) return;
    let timeToGo = pilot.arrivalS - this.timeS;
    if (timeToGo < AUTOPILOT.minTimeToGoS) {
      const remaining = this.dvRemaining();
      const aim = this.aimAt(this.timeS);
      const distance = Math.hypot(aim.x - this.ship.x, aim.y - this.ship.y);
      const speed = Math.hypot(aim.vx - this.ship.vx, aim.vy - this.ship.vy);
      // From here: brake what the ship has relative to the aim plus a fresh short flight.
      timeToGo = Math.max(
        AUTOPILOT.minTimeToGoS * 2,
        flightTime(distance, Math.max(remaining, speed), this.accel),
      );
      pilot.arrivalS = this.timeS + timeToGo;
    }
    const predicted = { x: this.ship.x, y: this.ship.y, vx: this.ship.vx, vy: this.ship.vy };
    coast(
      predicted,
      this.predictWork,
      this.timeS,
      timeToGo,
      AUTOPILOT.predictionMaxStepS,
      AUTOPILOT.predictionOrbitFraction,
    );
    const aim = this.aimAt(pilot.arrivalS);
    const a = guidance(
      aim.x - predicted.x,
      aim.y - predicted.y,
      aim.vx - predicted.vx,
      aim.vy - predicted.vy,
      timeToGo,
      AUTOPILOT.velocityWeight,
    );
    this.command(a, AUTOPILOT.onFraction, AUTOPILOT.offFraction);
    this.scheduleReplan(timeToGo);
  }

  /**
   * Stage -1 of a leg that begins deep in a body's gravity: full thrust along the velocity
   * relative to that body (the cheapest way up) until it pulls with less than
   * `AUTOPILOT.climbPullFraction` of the engine. Returns false then (the leg goes on with
   * stage 0).
   */
  private climbOut(): boolean {
    const pilot = this.pilot;
    const body = this.system.bodies[pilot.climbBody];
    const p = this.system.positionOf(body, this.timeS);
    const v = this.system.velocityOf(body, this.timeS);
    const r = Math.hypot(this.ship.x - p.x, this.ship.y - p.y);
    const pull = this.system.gm[pilot.climbBody] / (r * r);
    if (pull < AUTOPILOT.climbPullFraction * this.accel) return false;
    const vx = this.ship.vx - v.x;
    const vy = this.ship.vy - v.y;
    const speed = Math.hypot(vx, vy) || 1;
    pilot.thrusting = true;
    pilot.dirX = vx / speed;
    pilot.dirY = vy / speed;
    pilot.nextReplanS = this.timeS + AUTOPILOT.minReplanS;
    return true;
  }

  /**
   * Whether a fall from here (engine off) passes the moon closer than the engine can make up
   * on the way (`AUTOPILOT.dropReachShare` of a full burn's sideways reach until then).
   */
  private dropWindow(): boolean {
    const place = this.places[this.pilot.legIndex];
    const closest = coastToClosest(
      { x: this.ship.x, y: this.ship.y, vx: this.ship.vx, vy: this.ship.vy },
      this.predictWork,
      this.timeS,
      AUTOPILOT.interceptHorizonS,
      AUTOPILOT.predictionMaxStepS,
      AUTOPILOT.interceptOrbitFraction,
      place.index,
    );
    const t = closest.timeS - this.timeS;
    return closest.distanceM <= AUTOPILOT.dropReachShare * 0.5 * this.accel * t * t;
  }

  /**
   * Stage 1 of a moon leg: predicts where the coasting ship passes closest to the moon and
   * fires the engine to close that miss (position only: the docking absorbs the speed).
   */
  private aimFall(): void {
    const pilot = this.pilot;
    const place = this.places[pilot.legIndex];
    const closest = coastToClosest(
      { x: this.ship.x, y: this.ship.y, vx: this.ship.vx, vy: this.ship.vy },
      this.predictWork,
      this.timeS,
      AUTOPILOT.interceptHorizonS,
      AUTOPILOT.predictionMaxStepS,
      AUTOPILOT.interceptOrbitFraction,
      place.index,
    );
    const timeToGo = Math.max(AUTOPILOT.minReplanS, closest.timeS - this.timeS);
    pilot.arrivalS = this.timeS + timeToGo;
    const body = this.system.positionOf(this.gateBody(), closest.timeS);
    const a = guidance(body.x - closest.ship.x, body.y - closest.ship.y, 0, 0, timeToGo, 0);
    this.command(a, AUTOPILOT.interceptOnFraction, AUTOPILOT.interceptOffFraction);
    this.scheduleReplan(timeToGo);
  }

  /**
   * Fires the engine at full thrust along `a` (m/s^2) if it asks for at least `on` of full
   * acceleration (`off` while already firing), else coasts.
   */
  private command(a: { x: number; y: number }, on: number, off: number): void {
    const pilot = this.pilot;
    const asked = Math.hypot(a.x, a.y);
    const threshold = (pilot.thrusting ? off : on) * this.accel;
    pilot.thrusting = asked >= threshold && asked > 0;
    if (pilot.thrusting) {
      pilot.dirX = a.x / asked;
      pilot.dirY = a.y / asked;
    }
  }

  private scheduleReplan(timeToGo: number): void {
    this.pilot.nextReplanS =
      this.timeS +
      Math.min(
        AUTOPILOT.maxReplanS,
        Math.max(AUTOPILOT.minReplanS, AUTOPILOT.replanFraction * timeToGo),
      );
  }

  /**
   * A rail leg (D3, for a leg the autopilot cannot fly): the ship follows a smooth curve from
   * where the leg began to the capture radius of the gate body at the planned arrival, ignoring
   * gravity, and spends the planned delta-v (`dvPlan`) evenly, burning the fuel it takes at
   * the ship's mass (the rocket equation); then docks as usual.
   */
  private followRail(h: number): void {
    const pilot = this.pilot;
    const total = pilot.arrivalS - pilot.legStartS;
    const before = Math.min(1, (this.timeS - pilot.legStartS) / total);
    this.timeS = Math.min(this.timeS + h, pilot.arrivalS);
    const s = Math.min(1, (this.timeS - pilot.legStartS) / total);
    const body = this.gateBody();
    const place = this.places[pilot.legIndex];
    const p = this.system.positionOf(body, pilot.arrivalS);
    const v = this.system.velocityOf(body, pilot.arrivalS);
    const dx = pilot.fromX - p.x;
    const dy = pilot.fromY - p.y;
    const r = Math.hypot(dx, dy) || 1;
    const endX = p.x + (dx / r) * place.captureM * 0.99;
    const endY = p.y + (dy / r) * place.captureM * 0.99;
    const h00 = 2 * s ** 3 - 3 * s ** 2 + 1;
    const h10 = s ** 3 - 2 * s ** 2 + s;
    const h01 = -2 * s ** 3 + 3 * s ** 2;
    const h11 = s ** 3 - s ** 2;
    this.ship.x = h00 * pilot.fromX + h10 * total * pilot.fromVx + h01 * endX + h11 * total * v.x;
    this.ship.y = h00 * pilot.fromY + h10 * total * pilot.fromVy + h01 * endY + h11 * total * v.y;
    const d00 = (6 * s ** 2 - 6 * s) / total;
    const d10 = (3 * s ** 2 - 4 * s + 1) / total;
    const d01 = (-6 * s ** 2 + 6 * s) / total;
    const d11 = (3 * s ** 2 - 2 * s) / total;
    this.ship.vx = d00 * pilot.fromX + d10 * total * pilot.fromVx + d01 * endX + d11 * total * v.x;
    this.ship.vy = d00 * pilot.fromY + d10 * total * pilot.fromVy + d01 * endY + d11 * total * v.y;
    this.ship.heading = Math.atan2(this.ship.vy, this.ship.vx);
    // Thrust shows during the first and last quarter ("accelerate - coast - brake").
    pilot.thrusting = s < 0.25 || s > 0.75;
    this.ship.thrustN = pilot.thrusting ? this.route.ship.thrustN : 0;
    const dv = pilot.dvPlan * (s - before);
    const kg = fuelForDvKg(this.route.ship.ispS, this.ship.massKg, dv);
    pilot.dvSpent += dv;
    if (h > 0) this.resources.fuel.ratePerS = -kg / h;
    this.burn(kg);
    if (pilot.phase === 'flying' && s >= 1) this.checkCapture();
  }

  /**
   * Resources over `simDtS` simulated seconds: the flows of the cargo aboard on this leg
   * (`stepLife`: `evaluateFlows`, the greenhouse dying without power), then the death check
   * (D14: a resource at 0).
   */
  private flowResources(simDtS: number): void {
    stepLife(this.resources, this.loadout, this.leg, this.life, simDtS);
    this.updateMass();
    if (!this.mortal) {
      for (const id of FLOW_IDS) {
        if (this.resources[id].value <= 0 && !this.depleted[id]) {
          this.depleted[id] = { timeS: this.timeS, x: this.ship.x, y: this.ship.y };
        }
      }
      return;
    }
    const cause = resourceDeath(this.resources);
    if (cause) this.die(cause);
  }
}

/** The pace of Run at a moment of a flight (`Simulation.pace`). */
export interface PaceState {
  /** Simulated seconds per real second now. */
  timeScale: number;
  /** Distance to the closest `home`, `gate` or `parent` body, m. */
  distanceM: number;
  /** The ship's speed against that body, m/s. */
  speedMS: number;
  /** The engine's acceleration, m/s^2. */
  accel: number;
}

/**
 * Real seconds of Run until `days` simulated days from a moment with pace `pace`, at most: the
 * time scale grows with the distance to the `home`, `gate` and `parent` bodies, so this
 * takes the scale at the farthest the ship could be by then (flying straight away from that
 * body at its speed now, the engine pushing all the way; the approach scale there, the slowest
 * for that distance) - never less than the scale now.
 * The alarm's real-seconds clause (`isAlarm`) reads it; pure, so the balance tools use it too.
 */
export function realSecondsAhead(pace: PaceState, days: number): number {
  const t = days * DAY_S;
  const farthest = pace.distanceM + pace.speedMS * t + 0.5 * pace.accel * t * t;
  return t / Math.max(pace.timeScale, timeScaleAt(farthest));
}

/**
 * Time scale for the ship's distances, simulated s per real s: grows with the logarithm of the
 * distance (GDD D9, "logarithmically"), so the voyage is slow near the places of the voyage and
 * fast in open space. `gateDistanceM` - to the body of the gate the ship flies to (floor
 * `MIN_TIME_SCALE`: the approach is slow); `otherDistanceM` - to the nearest other `home`,
 * `gate` or `parent` body (floor `DEPARTURE_MIN_TIME_SCALE`: leaving one is quicker); the
 * smaller of the two scales wins. With one distance (the other far away) it is the approach
 * scale, the slowest for that distance. At the approach floor within 5e8 m of the gate body
 * (the Moon leg); 1e10 m out 585 000 (the Mars approach); 1e11 m out 1 035 000 (the cruise).
 * OWNER: physics - replace the formula and the constants above.
 */
export function timeScaleAt(gateDistanceM: number, otherDistanceM = Infinity): number {
  return Math.min(
    logScale(gateDistanceM, MIN_TIME_SCALE),
    logScale(otherDistanceM, DEPARTURE_MIN_TIME_SCALE),
  );
}

/** `TIME_SCALE_PER_DECADE` per decade of `distanceM` beyond the reference, `floor`..max. */
function logScale(distanceM: number, floor: number): number {
  const scale = TIME_SCALE_PER_DECADE * Math.log10(Math.max(1, distanceM) / TIME_SCALE_REFERENCE_M);
  return Math.min(MAX_TIME_SCALE, Math.max(floor, scale));
}

function emptyPilot(): AutopilotState {
  return {
    phase: 'flying',
    legIndex: 0,
    stage: 0,
    climbBody: 0,
    wayX: 1,
    wayY: 0,
    legStartS: 0,
    arrivalS: 0,
    nextReplanS: 0,
    thrusting: false,
    dirX: 1,
    dirY: 0,
    dvSpent: 0,
    dvPlan: 0,
    closestM: Number.MAX_VALUE,
    arriveSpeedMS: 0,
    fromX: 0,
    fromY: 0,
    fromVx: 0,
    fromVy: 0,
    dockStartS: 0,
    dockDurationS: 0,
    parkX: 0,
    parkY: 0,
  };
}

/**
 * The ship at the start: on a circular orbit around `config.start.around`, counter-clockwise,
 * moving with that body, weighing `massKg` (the cargo's start mass). OWNER: physics - initial
 * conditions.
 */
function initialShip(system: SolarSystem, config: ShipConfig, massKg: number): ShipState {
  const { around, distanceM, angleRad } = config.start;
  const body = system.get(around);
  const p = system.positionOf(body, 0);
  const v = system.velocityOf(body, 0);
  const orbitalSpeed = Math.sqrt((G * body.massKg) / distanceM);
  const vx = v.x - orbitalSpeed * Math.sin(angleRad);
  const vy = v.y + orbitalSpeed * Math.cos(angleRad);
  return {
    x: p.x + distanceM * Math.cos(angleRad),
    y: p.y + distanceM * Math.sin(angleRad),
    vx,
    vy,
    massKg,
    thrustN: 0,
    heading: Math.atan2(vy, vx),
  };
}

function cloneLife(life: LifeState): LifeState {
  return { ...life, offline: [...life.offline] };
}

function cloneResources(resources: Resources): Resources {
  const copy = {} as Resources;
  for (const id of RESOURCE_IDS) copy[id] = { ...resources[id] };
  return copy;
}
