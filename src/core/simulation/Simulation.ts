import { G } from '@/core/simulation/constants';
import type { SolarSystem } from '@/core/simulation/SolarSystem';
import type {
  Body,
  Resources,
  ShipConfig,
  ShipState,
  SimulationSnapshot,
  Vec2,
} from '@/core/simulation/types';
import { RESOURCE_IDS } from '@/core/simulation/types';

// OWNER: physics - every constant and formula in this file is a first draft by the programmer;
// replace them freely. Keep the contract: `step(realDtS)` advances the world by one frame and
// returns a JSON-safe `SimulationSnapshot` (docs/HOWTO-simulation.md).

/** How many bodies pull the ship (the design document: "at most 3 gravity sources"). */
const GRAVITY_SOURCES = 3;
/** Longest integration substep, simulated s: a frame's time is split into steps this long. */
const MAX_SUBSTEP_S = 60;
/** Time scale: simulated seconds per real second for every factor of 10 in distance. */
const TIME_SCALE_PER_DECADE = 20_000;
/** Time scale: distance at which the scale would be 0, m. */
const TIME_SCALE_REFERENCE_M = 1e6;
/** Time scale limits, simulated seconds per real second. */
const MIN_TIME_SCALE = 100;
const MAX_TIME_SCALE = 200_000;

/**
 * The ship flying through the solar system: flat model, bodies on static orbits
 * (`SolarSystem`), the ship pulled by the strongest gravity sources and pushed by its engine,
 * resources running down. No Phaser: `SimulationService` drives it from the game loop.
 */
export class Simulation {
  private timeS: number;
  private timeScale = MIN_TIME_SCALE;
  private readonly ship: ShipState;
  private readonly resources: Resources;

  /**
   * Starts from `snapshot` (a saved game) or, without one, at the start of the voyage
   * described by `config`.
   */
  constructor(
    private readonly system: SolarSystem,
    private readonly config: ShipConfig,
    snapshot?: SimulationSnapshot,
  ) {
    if (snapshot) {
      this.timeS = snapshot.timeS;
      this.timeScale = snapshot.timeScale;
      this.ship = { ...snapshot.ship };
      // A resource added after the game was saved starts from its config values.
      this.resources = cloneResources({ ...config.resources, ...snapshot.resources });
    } else {
      this.timeS = 0;
      this.ship = initialShip(system, config);
      this.resources = cloneResources(config.resources);
      this.timeScale = timeScaleAt(this.distanceToNearestBody());
    }
  }

  /**
   * Advances the simulation by `realDtS` real seconds (one frame) and returns the new state.
   * The simulated time of the step is `realDtS * timeScale`.
   */
  step(realDtS: number): SimulationSnapshot {
    this.timeScale = timeScaleAt(this.distanceToNearestBody());
    const simDtS = realDtS * this.timeScale;
    const substeps = Math.max(1, Math.ceil(simDtS / MAX_SUBSTEP_S));
    const h = simDtS / substeps;
    for (let i = 0; i < substeps; i++) this.integrate(h);
    this.drainResources(simDtS);
    return this.snapshot();
  }

  /** The current state as a new plain object (safe to keep and to save as JSON). */
  snapshot(): SimulationSnapshot {
    return {
      timeS: this.timeS,
      timeScale: this.timeScale,
      ship: { ...this.ship },
      resources: cloneResources(this.resources),
    };
  }

  /** Simulated time since the start of the voyage, s. */
  get time(): number {
    return this.timeS;
  }

  /** Whether the engine is on. */
  get thrustOn(): boolean {
    return this.ship.thrustN > 0;
  }

  /** Turns the engine on (the config's thrust) or off. */
  setThrust(on: boolean): void {
    this.ship.thrustN = on ? this.config.thrustN : 0;
  }

  /** Distance from the ship to the closest body's centre, m. */
  distanceToNearestBody(): number {
    let nearest = Infinity;
    for (const body of this.system.bodies) {
      const p = this.system.positionOf(body, this.timeS);
      nearest = Math.min(nearest, Math.hypot(p.x - this.ship.x, p.y - this.ship.y));
    }
    return nearest;
  }

  /**
   * One explicit Euler step of `h` simulated seconds: forces at the current position move the
   * velocity, the old velocity moves the position.
   * OWNER: physics - force model and integrator (Euler drifts; symplectic Euler or RK4 hold
   * orbits better).
   */
  private integrate(h: number): void {
    const ship = this.ship;
    const acceleration = this.gravityAt(ship, this.timeS);
    // Autopilot stub: the ship always points along its velocity around the Sun (prograde).
    // OWNER: physics - steering (a heading the player sets, prograde relative to a planet...).
    if (ship.vx !== 0 || ship.vy !== 0) ship.heading = Math.atan2(ship.vy, ship.vx);
    if (ship.thrustN > 0) {
      const a = ship.thrustN / ship.massKg;
      acceleration.x += a * Math.cos(ship.heading);
      acceleration.y += a * Math.sin(ship.heading);
    }
    ship.x += ship.vx * h;
    ship.y += ship.vy * h;
    ship.vx += acceleration.x * h;
    ship.vy += acceleration.y * h;
    this.timeS += h;
  }

  /**
   * Gravity acceleration at `point`, m/s^2, from the `GRAVITY_SOURCES` bodies that pull
   * hardest there (G M / r^2). Picked by pull, not by distance: near the Earth the Sun is
   * farther than the Moon or Venus but pulls the ship far harder than they do.
   * OWNER: physics - which bodies count; a body's surface (no crash test yet: r is unlimited).
   */
  private gravityAt(point: Vec2, timeS: number): Vec2 {
    const pulls = this.system.bodies.map((body: Body) => {
      const p = this.system.positionOf(body, timeS);
      const dx = p.x - point.x;
      const dy = p.y - point.y;
      const r = Math.hypot(dx, dy);
      const a = r > 0 ? (G * body.massKg) / (r * r) : 0;
      return { a, ux: r > 0 ? dx / r : 0, uy: r > 0 ? dy / r : 0 };
    });
    pulls.sort((p, q) => q.a - p.a);
    const total = { x: 0, y: 0 };
    for (const pull of pulls.slice(0, GRAVITY_SOURCES)) {
      total.x += pull.a * pull.ux;
      total.y += pull.a * pull.uy;
    }
    return total;
  }

  /**
   * Changes every resource by `ratePerS` for `simDtS` simulated seconds, within 0..max.
   * OWNER: physics - resource model (fuel burnt by thrust, heat from the Sun's distance,
   * comms from the Earth's distance, what happens at 0).
   */
  private drainResources(simDtS: number): void {
    for (const id of RESOURCE_IDS) {
      const resource = this.resources[id];
      resource.value = Math.min(
        resource.max,
        Math.max(0, resource.value + resource.ratePerS * simDtS),
      );
    }
  }
}

/**
 * Time scale for a distance to the nearest body, simulated s per real s: grows with the
 * logarithm of the distance (the design document: "logarithmically"), so the voyage is slow
 * near planets and fast in open space. Near the Earth (6e7 m) about 36 000 (10 h per second),
 * between planets (3e10 m) about 90 000 (1 day per second).
 * OWNER: physics - replace the formula and the constants above.
 */
export function timeScaleAt(distanceM: number): number {
  const scale = TIME_SCALE_PER_DECADE * Math.log10(Math.max(1, distanceM) / TIME_SCALE_REFERENCE_M);
  return Math.min(MAX_TIME_SCALE, Math.max(MIN_TIME_SCALE, scale));
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

function cloneResources(resources: Resources): Resources {
  const copy = {} as Resources;
  for (const id of RESOURCE_IDS) copy[id] = { ...resources[id] };
  return copy;
}
