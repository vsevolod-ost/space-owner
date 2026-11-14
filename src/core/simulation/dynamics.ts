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
 * One Velocity Verlet step of `h` s from `timeS`: the position moves with the velocity and the
 * acceleration at the start (gravity plus the engine's `startAx`, `startAy`, m/s^2); gravity is
 * then taken at the new position and time t + h, and the velocity changes by the mean of the
 * start and end accelerations (the engine's at the end is `endAx`, `endAy`: it differs from the
 * start one when the mass changes during the step). `work.gravity` must have been called for
 * this position and `timeS`; on return it holds gravity at the new position and t + h (two
 * gravity calls per step: the caller's and this one's).
 * OWNER: physics - the integrator.
 */
export function kick(
  state: Kinematics,
  work: Workspace,
  timeS: number,
  h: number,
  startAx: number,
  startAy: number,
  endAx: number,
  endAy: number,
): void {
  const ax0 = work.ax + startAx;
  const ay0 = work.ay + startAy;
  state.x += (state.vx + 0.5 * ax0 * h) * h;
  state.y += (state.vy + 0.5 * ay0 * h) * h;
  work.gravity(state.x, state.y, timeS + h);
  state.vx += 0.5 * (ax0 + work.ax + endAx) * h;
  state.vy += 0.5 * (ay0 + work.ay + endAy) * h;
}

/**
 * Where the ship would be after `durationS` s with the engine off, from `state` at `timeS`:
 * the "zero-effort" prediction of the autopilot. Changes `state` in place. Gravity at the end of
 * one step serves as the start of the next: nothing else moves the ship or uses `work` here.
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
  work.gravity(state.x, state.y, t);
  while (t < end) {
    const h = Math.min(substepFor(work, maxSubstepS, orbitFraction), end - t);
    kick(state, work, t, h, 0, 0, 0, 0);
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
  work.gravity(ship.x, ship.y, t);
  for (;;) {
    // `work` holds gravity and body positions at (ship, t): the last `kick` left them there.
    const dx = work.positions[bodyIndex * 2] - ship.x;
    const dy = work.positions[bodyIndex * 2 + 1] - ship.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < best.distanceM) best = { timeS: t, ship: { ...ship }, distanceM: distance };
    else if (distance > 2 * best.distanceM) break;
    if (t >= end) break;
    const h = Math.min(substepFor(work, maxSubstepS, orbitFraction), end - t);
    kick(ship, work, t, h, 0, 0, 0, 0);
    t += h;
  }
  return best;
}
