// OWNER: physics - Lambert's problem for the autopilot's long transfers (plan variable-mass S4,
// D10, D20). Pure functions over plain numbers, flat (2-D) model: no Phaser, run by the Node
// tools too (docs/HOWTO-simulation.md).

/** Bisection rounds of the solver: the bracket shrinks 2^-80, far below the double's precision. */
const LAMBERT_ITERATIONS = 80;
/** Lowest universal variable z tried (a fast hyperbolic transfer); the solver widens it if needed. */
const LAMBERT_Z_LOW = -40;
/** Transfers within this angle (rad) of 0 or 2 pi are degenerate (the two points coincide). */
const LAMBERT_MIN_ANGLE = 1e-9;
/**
 * Within this angle (rad) of pi the universal-variable formula loses its precision (its
 * f and g go to 0/0: a 180-degree transfer, where the slowest transfers to Mars lie), so the
 * first guess there is interpolated between the solutions this far on either side.
 */
const LAMBERT_NEAR_PI = 1e-3;
/**
 * The answer is checked by flying it (Kepler propagation, `propagateKepler`): the end may miss
 * the second point by at most this share of r1 + r2 (about 400 m between the Earth and Mars),
 * else up to `LAMBERT_REFINE_ROUNDS` Newton rounds on the first velocity correct it.
 */
const LAMBERT_TOLERANCE = 1e-9;
const LAMBERT_REFINE_ROUNDS = 8;
/** Step of the Newton rounds' finite differences, as a share of the first velocity. */
const LAMBERT_JACOBIAN_STEP = 1e-7;
/** Rounds of the Kepler propagation's safeguarded Newton (it converges in well under 20). */
const KEPLER_ITERATIONS = 100;

/** Velocities at both ends of a transfer orbit (`solveLambert`), m/s. */
export interface LambertSolution {
  /** Velocity leaving the first point. */
  v1x: number;
  v1y: number;
  /** Velocity arriving at the second point. */
  v2x: number;
  v2y: number;
}

/** A position and velocity in the plane, m and m/s. */
interface PlaneState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * Lambert's problem around one body of gravitational parameter `gm` (m^3/s^2): the orbit that
 * leaves (`x1`, `y1`) and reaches (`x2`, `y2`) after `durationS` seconds (m, relative to the
 * body), flown counter-clockwise like the planets and in less than one revolution. Universal
 * variables (Bate, Mueller, White; Curtis, algorithm 5.2) with bisection on z, so it never
 * diverges. Near a 180-degree transfer the formula is ill-conditioned (in the plane the
 * problem is not): there the guess is interpolated between the solutions `LAMBERT_NEAR_PI` to
 * either side. Every answer is then flown (`propagateKepler`) and corrected by Newton rounds
 * until it ends within `LAMBERT_TOLERANCE` of the second point; the arriving velocity is the
 * flown one. Returns null when there is no such orbit (a duration of 0, coincident points, a
 * long way round too fast for any counter-clockwise orbit of under one revolution), when the
 * arc passes its periapsis closer than `minRadiusM` (through the body: a long way round near
 * 2 pi in a short time is such a dive, a near-parabola grazing the centre) or the answer does
 * not check out.
 */
export function solveLambert(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  durationS: number,
  gm: number,
  minRadiusM = 0,
): LambertSolution | null {
  const r1 = Math.hypot(x1, y1);
  const r2 = Math.hypot(x2, y2);
  if (!(durationS > 0) || r1 === 0 || r2 === 0) return null;
  const angle = sweepAngle(x1, y1, x2, y2);
  if (angle < LAMBERT_MIN_ANGLE || angle > 2 * Math.PI - LAMBERT_MIN_ANGLE) return null;
  let guess: { vx: number; vy: number } | null;
  if (Math.abs(angle - Math.PI) < LAMBERT_NEAR_PI) {
    // The second point turned to pi -+ LAMBERT_NEAR_PI, solved there, and the first velocity
    // interpolated by the angle: an error of the order of LAMBERT_NEAR_PI^2, which Newton removes.
    const side = (to: number) => {
      const turn = to - angle;
      const c = Math.cos(turn);
      const s = Math.sin(turn);
      return universalLambert(x1, y1, c * x2 - s * y2, s * x2 + c * y2, to, durationS, gm);
    };
    const below = side(Math.PI - LAMBERT_NEAR_PI);
    const above = side(Math.PI + LAMBERT_NEAR_PI);
    if (!below || !above) return null;
    const w = (angle - (Math.PI - LAMBERT_NEAR_PI)) / (2 * LAMBERT_NEAR_PI);
    guess = {
      vx: below.v1x + (above.v1x - below.v1x) * w,
      vy: below.v1y + (above.v1y - below.v1y) * w,
    };
  } else {
    const solution = universalLambert(x1, y1, x2, y2, angle, durationS, gm);
    guess = solution && { vx: solution.v1x, vy: solution.v1y };
  }
  const solution = guess && refineLambert(x1, y1, x2, y2, guess.vx, guess.vy, durationS, gm);
  if (!solution || periapsisOnArc(x1, y1, solution, angle, gm) < minRadiusM) return null;
  return solution;
}

/**
 * The lowest distance from the body on the arc that leaves (`x1`, `y1`) with `solution`'s
 * first velocity and sweeps `angle` (rad), m: the periapsis if the arc passes it; else
 * Infinity (only its ends come near, and the caller has them).
 */
function periapsisOnArc(
  x1: number,
  y1: number,
  solution: LambertSolution,
  angle: number,
  gm: number,
): number {
  const r1 = Math.hypot(x1, y1);
  const { v1x: vx, v1y: vy } = solution;
  const h = x1 * vy - y1 * vx;
  // Eccentricity vector (points at the periapsis).
  const ex = (vy * h) / gm - x1 / r1;
  const ey = (-vx * h) / gm - y1 / r1;
  const e = Math.hypot(ex, ey);
  if (e === 0) return r1; // A circle: the same distance all along.
  const periapsis = (h * h) / gm / (1 + e);
  // True anomaly of the first point; the arc passes the periapsis if it sweeps through 2 pi.
  const anomaly = sweepAngle(ex, ey, x1, y1);
  return anomaly + angle >= 2 * Math.PI ? periapsis : Number.POSITIVE_INFINITY;
}

/** Angle from (x1, y1) to (x2, y2) counter-clockwise, 0..2 pi. */
function sweepAngle(x1: number, y1: number, x2: number, y2: number): number {
  const angle = Math.atan2(x1 * y2 - y1 * x2, x1 * x2 + y1 * y2);
  return angle < 0 ? angle + 2 * Math.PI : angle;
}

/**
 * The universal-variable Lambert solution for a transfer of `angle` (rad) - unchecked: loses
 * its precision near pi (`LAMBERT_NEAR_PI`) and returns garbage where no orbit exists.
 */
function universalLambert(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  angle: number,
  durationS: number,
  gm: number,
): LambertSolution | null {
  const r1 = Math.hypot(x1, y1);
  const r2 = Math.hypot(x2, y2);
  const a = Math.sin(angle) * Math.sqrt((r1 * r2) / (1 - Math.cos(angle)));
  const sqrtGmT = Math.sqrt(gm) * durationS;
  // y(z) >= 0 is needed; F(z) = time of flight error, increasing in z on the zero-revolution
  // branch (z < 4 pi^2).
  const yOf = (z: number) => r1 + r2 + (a * (z * stumpffS(z) - 1)) / Math.sqrt(stumpffC(z));
  const fOf = (z: number) => {
    const y = yOf(z);
    if (y < 0) return Number.NEGATIVE_INFINITY;
    const c = stumpffC(z);
    return (y / c) ** 1.5 * stumpffS(z) + a * Math.sqrt(y) - sqrtGmT;
  };
  let low = LAMBERT_Z_LOW;
  // Just below 4 pi^2 (one revolution), where C(z) is still accurate enough for the sign.
  let high = 4 * Math.PI * Math.PI * (1 - 1e-6);
  for (let i = 0; i < 20 && fOf(low) > 0; i++) low *= 2;
  if (fOf(low) > 0 || fOf(high) < 0) return null;
  for (let i = 0; i < LAMBERT_ITERATIONS; i++) {
    const middle = (low + high) / 2;
    if (fOf(middle) < 0) low = middle;
    else high = middle;
  }
  const z = (low + high) / 2;
  const y = yOf(z);
  if (!(y > 0)) return null;
  const f = 1 - y / r1;
  const g = a * Math.sqrt(y / gm);
  const gDot = 1 - y / r2;
  if (!(Math.abs(g) > 0)) return null;
  const solution = {
    v1x: (x2 - f * x1) / g,
    v1y: (y2 - f * y1) / g,
    v2x: (gDot * x2 - x1) / g,
    v2y: (gDot * y2 - y1) / g,
  };
  return Object.values(solution).every(Number.isFinite) ? solution : null;
}

/**
 * Checks a first velocity (`vx`, `vy`) by flying it for `durationS` (`propagateKepler`) and
 * corrects it by Newton rounds (2x2, finite differences) until the end is within
 * `LAMBERT_TOLERANCE` of (`x2`, `y2`); the orbit must be counter-clockwise and the flight
 * shorter than its period (under one revolution). Null when it does not converge.
 */
function refineLambert(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  vx: number,
  vy: number,
  durationS: number,
  gm: number,
): LambertSolution | null {
  const tolerance = LAMBERT_TOLERANCE * (Math.hypot(x1, y1) + Math.hypot(x2, y2));
  for (let round = 0; round <= LAMBERT_REFINE_ROUNDS; round++) {
    const end = propagateKepler({ x: x1, y: y1, vx, vy }, durationS, gm);
    if (!end) return null;
    const missX = end.x - x2;
    const missY = end.y - y2;
    if (Math.hypot(missX, missY) <= tolerance) {
      if (!oneCounterClockwiseArc(x1, y1, vx, vy, durationS, gm)) return null;
      return { v1x: vx, v1y: vy, v2x: end.vx, v2y: end.vy };
    }
    if (round === LAMBERT_REFINE_ROUNDS) break;
    const step = LAMBERT_JACOBIAN_STEP * Math.hypot(vx, vy);
    const byX = propagateKepler({ x: x1, y: y1, vx: vx + step, vy }, durationS, gm);
    const byY = propagateKepler({ x: x1, y: y1, vx, vy: vy + step }, durationS, gm);
    if (!byX || !byY || !(step > 0)) return null;
    // d(end) / d(v1), columns: by vx, by vy.
    const a = (byX.x - end.x) / step;
    const b = (byY.x - end.x) / step;
    const c = (byX.y - end.y) / step;
    const d = (byY.y - end.y) / step;
    const det = a * d - b * c;
    if (!Number.isFinite(det) || det === 0) return null;
    vx -= (d * missX - b * missY) / det;
    vy -= (a * missY - c * missX) / det;
    if (!Number.isFinite(vx) || !Number.isFinite(vy)) return null;
  }
  return null;
}

/** Whether leaving (`x`, `y`) at (`vx`, `vy`) is a counter-clockwise orbit not closed in `durationS`. */
function oneCounterClockwiseArc(
  x: number,
  y: number,
  vx: number,
  vy: number,
  durationS: number,
  gm: number,
): boolean {
  if (!(x * vy - y * vx > 0)) return false;
  const alpha = 2 / Math.hypot(x, y) - (vx * vx + vy * vy) / gm;
  // An ellipse (alpha > 0): under one revolution means shorter than the period.
  return alpha <= 0 || durationS < (2 * Math.PI) / (Math.sqrt(gm) * alpha ** 1.5);
}

/**
 * Two-body (Kepler) flight of `state` around a body of `gm` for `durationS` seconds: universal
 * variables (Curtis, algorithms 3.3-3.4) with a safeguarded Newton on chi - the time of flight
 * grows with chi (its derivative is the distance), so a bracket always holds the root. Null if
 * it fails (an overflow on an extreme hyperbola).
 */
function propagateKepler(state: PlaneState, durationS: number, gm: number): PlaneState | null {
  const r0 = Math.hypot(state.x, state.y);
  const sqrtGm = Math.sqrt(gm);
  const radial = (state.x * state.vx + state.y * state.vy) / r0;
  const alpha = 2 / r0 - (state.vx * state.vx + state.vy * state.vy) / gm;
  const b = (r0 * radial) / sqrtGm;
  const target = sqrtGm * durationS;
  /** Time of flight to chi minus the one asked (x sqrt(gm)), and its derivative (distance). */
  const timeError = (chi: number) => {
    const z = alpha * chi * chi;
    const c = stumpffC(z);
    const s = stumpffS(z);
    return {
      error: b * chi * chi * c + (1 - alpha * r0) * chi * chi * chi * s + r0 * chi - target,
      slope: b * chi * (1 - z * s) + (1 - alpha * r0) * chi * chi * c + r0,
    };
  };
  // Not finite counts as too far (an overflow lies beyond the root).
  const beyond = (chi: number) => {
    const { error } = timeError(chi);
    return !Number.isFinite(error) || error > 0;
  };
  let low = 0;
  let high = Math.max(target / r0, sqrtGm * Math.abs(alpha) * durationS, 1e-12);
  for (let i = 0; i < 200 && !beyond(high); i++) high *= 2;
  if (!beyond(high)) return null;
  let chi = Math.min(high, Math.max(low, sqrtGm * Math.abs(alpha) * durationS));
  if (!(chi > low && chi < high)) chi = (low + high) / 2;
  for (let i = 0; i < KEPLER_ITERATIONS; i++) {
    const { error, slope } = timeError(chi);
    if (!Number.isFinite(error) || error > 0) high = chi;
    else low = chi;
    if (error === 0) break;
    let next = chi - error / slope;
    if (!(next > low && next < high)) next = (low + high) / 2;
    if (Math.abs(next - chi) <= 1e-15 * Math.max(1, Math.abs(chi))) {
      chi = next;
      break;
    }
    chi = next;
  }
  const z = alpha * chi * chi;
  const c = stumpffC(z);
  const s = stumpffS(z);
  const f = 1 - (chi * chi * c) / r0;
  const g = durationS - (chi * chi * chi * s) / sqrtGm;
  const x = f * state.x + g * state.vx;
  const y = f * state.y + g * state.vy;
  const r = Math.hypot(x, y);
  const fDot = (sqrtGm / (r * r0)) * (alpha * chi * chi * chi * s - chi);
  const gDot = 1 - (chi * chi * c) / r;
  const end = {
    x,
    y,
    vx: fDot * state.x + gDot * state.vx,
    vy: fDot * state.y + gDot * state.vy,
  };
  return Object.values(end).every(Number.isFinite) ? end : null;
}

/** Stumpff function C(z) (series near 0). */
function stumpffC(z: number): number {
  if (z > 1e-6) return (1 - Math.cos(Math.sqrt(z))) / z;
  if (z < -1e-6) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
  return 1 / 2 - z / 24 + (z * z) / 720;
}

/** Stumpff function S(z) (series near 0). */
function stumpffS(z: number): number {
  if (z > 1e-6) {
    const s = Math.sqrt(z);
    return (s - Math.sin(s)) / (s * s * s);
  }
  if (z < -1e-6) {
    const s = Math.sqrt(-z);
    return (Math.sinh(s) - s) / (s * s * s);
  }
  return 1 / 6 - z / 120 + (z * z) / 5040;
}
