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
import type { SolarSystem } from '@/core/simulation/SolarSystem';
import type {
  AutopilotState,
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

/**
 * Time scale (GDD D9: logarithmic in the distance to the nearest `home`, `gate` or `parent`
 * body): simulated seconds per real second for every factor of 10 in that distance beyond
 * `TIME_SCALE_REFERENCE_M`, within `MIN_TIME_SCALE`..`MAX_TIME_SCALE`. Tuned with
 * `npm run voyage-check` to the pace of GDD `res-balance`: the whole voyage about 250 s of Run,
 * no leg over 90 s, at least 2-3 s of slow approach to every gate before the capture radius.
 * The flight itself does not depend on these constants (only how long it takes in real time);
 * a leg's docking lasts `dockS` simulated seconds, sized in src/content/voyage/legs.ts to about
 * 0.9 real s at these constants - resize it after changing them.
 */
const TIME_SCALE_PER_DECADE = 300_000;
/** Time scale: distance at which the logarithmic part is 0, m. */
const TIME_SCALE_REFERENCE_M = 5e8;
/** Time scale limits, simulated seconds per real second (12 000: 200 minutes a second). */
const MIN_TIME_SCALE = 12_000;
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
    const accel = route.ship.thrustN / route.ship.massKg;
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
      this.loadout = loadoutOf(route.cargo, snapshot.cargo);
      this.resources = cloneResources({
        ...startResources(route.cargo, this.loadout),
        ...snapshot.resources,
      });
      this.pilot = { ...snapshot.autopilot };
      this.life = cloneLife(snapshot.life);
    } else {
      this.timeS = 0;
      this.pendingS = 0;
      this.ship = initialShip(system, route.ship);
      this.loadout = from;
      this.resources = startResources(route.cargo, from);
      this.pilot = emptyPilot();
      this.life = freshLife();
      this.beginLeg(0);
      this.timeScale = timeScaleAt(this.distanceToNearestPacer());
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
    this.timeScale = timeScaleAt(this.distanceToNearestPacer());
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
   * approximation, GDD `evt-asteroid`), stocks within 0..max (fuel at 0 on a leg leaves the ship
   * drifting, D13; a resource at 0 kills as usual), items offline, the event's own death.
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
          this.pilot.thrusting = false;
          this.ship.thrustN = 0;
        },
        die: (cause) => this.die(cause),
      },
      eventId,
      effect,
    );
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
    this.pilot.thrusting = false;
    this.ship.thrustN = 0;
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

  /** Distance from the ship to the closest `home`, `gate` or `parent` body, m. */
  distanceToNearestPacer(): number {
    return this.nearestPacer().distanceM;
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
    switch (pilot.phase) {
      case 'flying':
        if (this.leg.mode === 'rail') this.followRail(h);
        else this.fly(h);
        break;
      case 'drifting':
        this.work.gravity(this.ship.x, this.ship.y, this.timeS);
        kick(this.ship, this.work, 0, 0, h);
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
    if (pilot.thrusting) {
      const a = this.accel;
      ax = a * pilot.dirX;
      ay = a * pilot.dirY;
      this.burn(a * h);
    }
    kick(ship, this.work, ax, ay, h);
    ship.thrustN = pilot.thrusting ? this.route.ship.thrustN : 0;
    if (pilot.thrusting) ship.heading = Math.atan2(pilot.dirY, pilot.dirX);
    else if (ship.vx !== 0 || ship.vy !== 0) ship.heading = Math.atan2(ship.vy, ship.vx);
    this.timeS += h;
    this.checkCapture();
  }

  /**
   * Spends `dv` of delta-v from the fuel charges (D13: one charge = the leg's planned delta-v,
   * `chargeDv`). With no charge left the engine stops for good: `drifting`.
   */
  private burn(dv: number): void {
    const pilot = this.pilot;
    const fuel = this.resources.fuel;
    pilot.dvSpent += dv;
    fuel.value -= dv / chargeDv(this.leg);
    if (fuel.value <= 0) {
      fuel.value = 0;
      pilot.phase = 'drifting';
      pilot.thrusting = false;
      this.ship.thrustN = 0;
    }
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
   * planned for the leg's delta-v (`AUTOPILOT.planFraction` of `dvBudget`).
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
   * Flight time to the aim (the gate body, or the standoff point) for the delta-v the leg has
   * left of its plan (`AUTOPILOT.planFraction` of `dvBudget`), s: a straight "accelerate -
   * coast - brake" flight (`straightFlightTime`). On a physics leg, if the guidance would need
   * more than that delta-v for this time (`effortDv`: gravity and the ship's own velocity
   * included), the time is stretched until it would not, at most `AUTOPILOT.maxStretch` times.
   */
  private plannedFlightTime(): number {
    const dv = Math.max(
      AUTOPILOT.minPlanShare * this.leg.dvBudget,
      chargeDv(this.leg) - this.pilot.dvSpent,
    );
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
   * Where the guidance aims at `timeS`: the gate body, or on a moon leg in stage 0 the standoff
   * point by its planet (moving with the planet). Position and velocity, m and m/s.
   */
  private aimAt(timeS: number): { x: number; y: number; vx: number; vy: number } {
    const pilot = this.pilot;
    const place = this.places[pilot.legIndex];
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
    let timeToGo = pilot.arrivalS - this.timeS;
    if (timeToGo < AUTOPILOT.minTimeToGoS) {
      const remaining = Math.max(0, chargeDv(this.leg) - pilot.dvSpent);
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
   * gravity, and spends the planned delta-v evenly; then docks as usual.
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
    this.burn(chargeDv(this.leg) * (s - before));
    if (pilot.phase === 'flying' && s >= 1) this.checkCapture();
  }

  /**
   * Resources over `simDtS` simulated seconds: the flows of the cargo aboard on this leg
   * (`stepLife`: `evaluateFlows`, the greenhouse dying without power), then the death check
   * (D14: a resource at 0).
   */
  private flowResources(simDtS: number): void {
    stepLife(this.resources, this.loadout, this.leg, this.life, simDtS);
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
 * time scale grows with the distance to the nearest `home`, `gate` or `parent` body, so this
 * takes the scale at the farthest the ship could be by then (flying straight away from that
 * body at its speed now, the engine pushing all the way) - never less than the scale now.
 * The alarm's real-seconds clause (`isAlarm`) reads it; pure, so the balance tools use it too.
 */
export function realSecondsAhead(pace: PaceState, days: number): number {
  const t = days * DAY_S;
  const farthest = pace.distanceM + pace.speedMS * t + 0.5 * pace.accel * t * t;
  return t / Math.max(pace.timeScale, timeScaleAt(farthest));
}

/**
 * Time scale for a distance to the nearest `home`, `gate` or `parent` body, simulated s per
 * real s: grows with the logarithm of the distance (GDD D9, "logarithmically"), so the voyage is
 * slow near the places of the voyage and fast in open space. Within about 550 000 km of them it
 * is the minimum, 12 000 (the Moon leg); 1e10 m out 390 000 (the Mars leg); 1e12 m out 990 000.
 * OWNER: physics - replace the formula and the constants above.
 */
export function timeScaleAt(distanceM: number): number {
  const scale = TIME_SCALE_PER_DECADE * Math.log10(Math.max(1, distanceM) / TIME_SCALE_REFERENCE_M);
  return Math.min(MAX_TIME_SCALE, Math.max(MIN_TIME_SCALE, scale));
}

/**
 * Delta-v the autopilot plans to spend on `leg`, m/s: `AUTOPILOT.planFraction` of its
 * `dvBudget` (the rest is the reserve for gravity it did not foresee). One fuel charge is this
 * much delta-v on the leg (D13), so a leg flown as planned burns one charge.
 */
export function chargeDv(leg: LegDef): number {
  return AUTOPILOT.planFraction * leg.dvBudget;
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
    closestM: Number.MAX_VALUE,
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
 * moving with that body. OWNER: physics - initial conditions.
 */
function initialShip(system: SolarSystem, config: ShipConfig): ShipState {
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
    massKg: config.massKg,
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
