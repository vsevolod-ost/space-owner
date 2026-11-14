import type { SolarSystem } from '@/core/simulation/SolarSystem';

// OWNER: physics - the force model and the integrator of the ship. Pure functions over plain
// numbers; `Simulation` and the autopilot's predictions both use them, so a prediction flies
// exactly the physics the ship flies (docs/HOWTO-simulation.md).

/** How many bodies pull the ship (the design document: "at most 3 gravity sources"). */
export const GRAVITY_SOURCES = 3;
/**
 * Substep length as a fraction of the shortest dynamical time sqrt(r^3 / GM) of the pulling
 * bodies: about 1/1250 of an orbit at the ship's distance, so a parking orbit stays closed.
 */
const SUBSTEP_ORBIT_FRACTION = 0.005;
/** Shortest and longest integration substep, simulated s. */
export const MIN_SUBSTEP_S = 1;
export const MAX_SUBSTEP_S = 3600;

/** Position and velocity of the ship, m and m/s (Sun-centred). */
export interface Kinematics {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * Scratch buffers for one solar system, so the integrator does not allocate per substep.
 * One per `Simulation` (and one per prediction) - not shared between them.
 */
export class Workspace {
  /** Body positions at the last `gravity` call: x, y pairs. */
  readonly positions: Float64Array;
  private readonly pulls: Float64Array;
  /** Result of the last `gravity` call: acceleration, m/s^2, and the dynamical time, s. */
  ax = 0;
  ay = 0;
  dynamicalS = Infinity;

  constructor(readonly system: SolarSystem) {
    this.positions = new Float64Array(system.bodies.length * 2);
    this.pulls = new Float64Array(system.bodies.length);
  }

  /**
   * Gravity at (`x`, `y`) at time `timeS` into `ax`, `ay`: the sum of G M / r^2 of the
   * `GRAVITY_SOURCES` bodies that pull hardest there (picked by pull, not by distance: near the
   * Earth the Sun is farther than the Moon but pulls far harder). Also `dynamicalS`, the
   * shortest sqrt(r^3 / GM) among them, which sets the substep. Inside a body r counts as the
   * body's radius (no crash test: a prediction that dives through a planet stays finite).
   * OWNER: physics - which bodies count.
   */
  gravity(x: number, y: number, timeS: number): void {
    const { system, positions, pulls } = this;
    const gm = system.gm;
    const radii = system.radii;
    const n = gm.length;
    system.fillPositions(timeS, positions);
    for (let i = 0; i < n; i++) {
      const dx = positions[i * 2] - x;
      const dy = positions[i * 2 + 1] - y;
      const r2 = Math.max(dx * dx + dy * dy, radii[i] * radii[i]);
      pulls[i] = r2 > 0 ? gm[i] / r2 : 0;
    }
    let ax = 0;
    let ay = 0;
    let dynamical = Infinity;
    for (let k = 0; k < GRAVITY_SOURCES && k < n; k++) {
      let best = -1;
      for (let i = 0; i < n; i++)
        if (pulls[i] > 0 && (best < 0 || pulls[i] > pulls[best])) best = i;
      if (best < 0) break;
      const dx = positions[best * 2] - x;
      const dy = positions[best * 2 + 1] - y;
      const r = Math.sqrt(dx * dx + dy * dy);
      const a = pulls[best];
      if (r > 0) {
        ax += (a * dx) / r;
        ay += (a * dy) / r;
      }
      dynamical = Math.min(dynamical, Math.sqrt(Math.max(r, radii[best]) / a));
      pulls[best] = -1;
    }
    this.ax = ax;
    this.ay = ay;
    this.dynamicalS = dynamical;
  }
}

/**
 * Substep length after a `gravity` call, s: a fraction of the dynamical time, within
 * `MIN_SUBSTEP_S`..`maxS` (`orbitFraction` of it; predictions use a coarser one).
 */
export function substepFor(
  work: Workspace,
  maxS = MAX_SUBSTEP_S,
  orbitFraction = SUBSTEP_ORBIT_FRACTION,
): number {
  const h = orbitFraction * work.dynamicalS;
  return Math.min(maxS, Math.max(MIN_SUBSTEP_S, h));
}

/**
 * One semi-implicit (symplectic) Euler step of `h` s: gravity at the current position plus the
 * engine's acceleration (`thrustAx`, `thrustAy`, m/s^2) change the velocity, the new velocity
 * moves the position. `work.gravity` must have been called for this position and time.
 * OWNER: physics - the integrator (RK4 or leapfrog would be more exact per step).
 */
export function kick(
  state: Kinematics,
  work: Workspace,
  thrustAx: number,
  thrustAy: number,
  h: number,
): void {
  state.vx += (work.ax + thrustAx) * h;
  state.vy += (work.ay + thrustAy) * h;
  state.x += state.vx * h;
  state.y += state.vy * h;
}

/**
 * Where the ship would be after `durationS` s with the engine off, from `state` at `timeS`:
 * the "zero-effort" prediction of the autopilot. Changes `state` in place.
 */
export function coast(
  state: Kinematics,
  work: Workspace,
  timeS: number,
  durationS: number,
  maxSubstepS: number,
  orbitFraction: number,
): void {
  let t = timeS;
  const end = timeS + durationS;
  while (t < end) {
    work.gravity(state.x, state.y, t);
    const h = Math.min(substepFor(work, maxSubstepS, orbitFraction), end - t);
    kick(state, work, 0, 0, h);
    t += h;
  }
}

/** Where and when a coasting ship passes closest to a body (`coastToClosest`). */
export interface ClosestApproach {
  /** Simulated time of the closest approach, s. */
  timeS: number;
  /** The ship then, m and m/s. */
  ship: Kinematics;
  /** Its distance to the body's centre then, m. */
  distanceM: number;
}

/**
 * Flies `state` with the engine off for up to `durationS` s from `timeS` and returns where it
 * passes closest to body `bodyIndex` (stops once the distance grows again past twice the least
 * one). Does not change `state`.
 */
export function coastToClosest(
  state: Kinematics,
  work: Workspace,
  timeS: number,
  durationS: number,
  maxSubstepS: number,
  orbitFraction: number,
  bodyIndex: number,
): ClosestApproach {
  const ship = { ...state };
  let t = timeS;
  const end = timeS + durationS;
  let best: ClosestApproach = { timeS, ship: { ...ship }, distanceM: Infinity };
  for (;;) {
    work.gravity(ship.x, ship.y, t);
    const dx = work.positions[bodyIndex * 2] - ship.x;
    const dy = work.positions[bodyIndex * 2 + 1] - ship.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < best.distanceM) best = { timeS: t, ship: { ...ship }, distanceM: distance };
    else if (distance > 2 * best.distanceM) break;
    if (t >= end) break;
    const h = Math.min(substepFor(work, maxSubstepS, orbitFraction), end - t);
    kick(ship, work, 0, 0, h);
    t += h;
  }
  return best;
}
