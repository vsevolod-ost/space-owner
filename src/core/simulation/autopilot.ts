import type { Body } from '@/core/simulation/types';

// OWNER: physics - every number and formula of the autopilot. First draft by the programmer,
// tuned by `npm run voyage-check` (docs/HOWTO-simulation.md). Change them freely; after a
// change run `npm run voyage-check` and keep every leg within the convergence criteria.

/**
 * Tuning of the autopilot. `Simulation` reads it on every guidance update; the voyage check may
 * change it for experiments.
 */
export const AUTOPILOT = {
  /**
   * Share of the delta-v the fuel gives (at most of the leg's `dvBudget`) the autopilot plans
   * to spend on a leg (plan variable-mass D16, D20); the rest is the reserve for gravity it did
   * not foresee and for the burns being longer than impulses. The fuel this takes follows from
   * the rocket equation (`rocket.ts`, plan variable-mass D3).
   */
  planFraction: 0.85,
  /**
   * Planning a straight leg (not a transfer, see `minTransferS`: the Moon): the guidance's
   * least-effort delta-v (`guidanceEffort`) times this is about what the full-or-nothing burns
   * spend (measured: 0.76-0.82 between planets). When that is more than the plan, the flight
   * time is stretched, at most `maxStretch` times, in `stretchIterations` rounds of bisection.
   */
  effortFactor: 0.8,
  maxStretch: 1.4,
  stretchIterations: 10,
  /** A leg plans at least this share of `dvBudget`, even when the climb-out spent more. */
  minPlanShare: 0.3,
  /**
   * The engine fires (always at full thrust) while the guidance asks for at least this share of
   * full acceleration, and stops when the request falls below `offFraction`: full burn, coast,
   * full burn - the "accelerate - coast - brake" profile.
   */
  onFraction: 0.6,
  offFraction: 0.4,
  /**
   * Weight of matching the gate body's velocity (1) against only hitting its position (0).
   * Below 1 the ship arrives faster than the body moves and the docking absorbs the rest.
   */
  velocityWeight: 1,
  /** Guidance update interval: this share of the time left to the planned arrival, within s. */
  replanFraction: 0.02,
  minReplanS: 1800,
  maxReplanS: 6 * 3600,
  /** Longest step of the zero-effort prediction, s, and its share of the dynamical time. */
  predictionMaxStepS: 6 * 3600,
  predictionOrbitFraction: 0.02,
  /**
   * When the planned arrival is this close (s) and the ship is not captured, the arrival is
   * planned again from where the ship is.
   */
  minTimeToGoS: 3 * 3600,
  /**
   * Moon legs (a moon whose planet pulls harder than the engine at the moon's orbit): the
   * ship first stops at a standoff point where the planet pulls with this share of the engine's
   * acceleration, then aims its fall at the moon.
   */
  standoffPullFraction: 0.5,
  /**
   * A leg that begins where a body pulls harder than the engine (the Earth at the start,
   * a giant planet after one of its moons) first climbs out along the velocity until that body pulls with less
   * than this share of the engine's acceleration.
   */
  climbPullFraction: 0.5,
  /** The standoff point counts as reached within this share of its distance to the planet. */
  standoffTolerance: 0.3,

  /**
   * At the standoff point the ship drops only when the engine-off fall passes the moon within
   * this share of what a full burn can shift it sideways by then (0.5 a t^2); otherwise it holds
   * the point, aiming this many seconds ahead, and looks again at the next update.
   */
  dropReachShare: 0.25,
  holdAimS: 12 * 3600,
  /** Aiming the fall: how far ahead the prediction looks for the closest approach, s. */
  interceptHorizonS: 20 * 86_400,
  /** Aiming the fall: the engine fires above this share of full acceleration, stops below. */
  interceptOnFraction: 0.2,
  interceptOffFraction: 0.1,
  /** Aiming the fall: the prediction's share of the dynamical time (finer: the aim is tight). */
  interceptOrbitFraction: 0.005,

  /**
   * Transfer legs (a gate body that orbits the Sun, plan variable-mass S4, D10, D20): the ship
   * flies a Lambert arc around the Sun - a departure burn, a long coast with small corrections,
   * an arrival burn. The flight time is the shortest whose Lambert delta-v (departure plus
   * arrival, `transferDv`) fits the plan, between `minTransferS` and the slowest allowed
   * transfer: the cheapest one up to `maxTransferS` (about a Hohmann transfer, 259 days to
   * Mars; with the Moon leg the whole voyage stays under about 300 days, plan D8). Times are
   * tried every `transferGridS`, then refined in `transferIterations` bisection rounds.
   */
  minTransferS: 100 * 86_400,
  maxTransferS: 290 * 86_400,
  transferGridS: 5 * 86_400,
  transferIterations: 12,
  /**
   * Cruise of a transfer: every guidance update solves Lambert from where the ship is to the
   * aim at the planned arrival and fires the engine along the velocity change it asks for once
   * that is over `cruiseOnMS` (m/s), until it is under `cruiseOffMS`. While it fires, the next
   * update comes when the engine would have given the change asked for, at least
   * `cruiseBurnReplanS` later (and at most `minReplanS`).
   */
  cruiseOnMS: 20,
  cruiseOffMS: 2,
  cruiseBurnReplanS: 60,
  /**
   * Departure of a transfer from a parking orbit: while the body left behind pulls with over
   * `departPullFraction` of the engine's acceleration, the departure burn waits on the orbit
   * until it points within acos(`departMinCos`) of straight away from that body (at most about
   * two thirds of an orbit, a few days of a transfer of hundreds).
   */
  departPullFraction: 0.2,
  departMinCos: 0.5,
  /** Cruise of a transfer: the longest interval between guidance updates while coasting, s. */
  cruiseMaxReplanS: 2 * 86_400,
  /**
   * Arrival of a transfer: the arrival burn brakes the speed against the gate body at this
   * share of the engine's acceleration (the full-or-nothing burns of the guidance law then have
   * room to correct), so it begins that braking time before the planned arrival; from then on
   * the rendezvous guidance (`guidance`) flies the rest.
   */
  brakeShare: 0.7,
  /**
   * Arrival of a transfer: the ship aims to stop at this share of the capture radius from the
   * gate body, on the side it comes from - so it is captured nearly at rest, having braked
   * (aiming at the body itself it would be captured before the arrival burn, which the docking
   * would then absorb for free).
   */
  aimCaptureShare: 0.99,
};

/** Capture radius as a share of the gate body's Hill sphere (the Moon: about 6e7 m). */
const CAPTURE_HILL_FRACTION = 1;
/** Capture radius is never more than this share of the distance to the body's parent. */
const CAPTURE_PARENT_FRACTION = 0.5;
/**
 * Parking orbit radius: where the body pulls with this share of the engine's acceleration, so
 * the ship can leave it; within 2 body radii and half the capture radius.
 */
const PARK_PULL_FRACTION = 0.5;

/**
 * Radius around a gate body inside which the autopilot counts the ship as arrived and docking
 * pulls it in, m: a share of the body's Hill sphere (where its gravity beats its parent's),
 * never more than half the distance to its parent. `parent` is the body it orbits (the Sun for
 * a planet).
 */
export function captureRadius(body: Body, parent: Body): number {
  const hill = body.orbitRadiusM * Math.cbrt(body.massKg / (3 * parent.massKg));
  return Math.min(CAPTURE_HILL_FRACTION * hill, CAPTURE_PARENT_FRACTION * body.orbitRadiusM);
}

/** Radius of the parking orbit at a gate body, m (see `PARK_PULL_FRACTION`). */
export function parkingRadius(gm: number, radiusM: number, capture: number, accel: number): number {
  const balance = Math.sqrt(gm / (PARK_PULL_FRACTION * accel));
  return Math.max(2 * radiusM, Math.min(balance, 0.5 * capture));
}

/**
 * Time of a straight "accelerate - coast - brake" flight over `distanceM` with acceleration
 * `accel` that spends `dv` of delta-v, s; with enough delta-v for no coast it is the
 * brachistochrone 2 sqrt(d / a).
 */
export function flightTime(distanceM: number, dv: number, accel: number): number {
  const brachistochrone = 2 * Math.sqrt(distanceM / accel);
  if (dv >= accel * brachistochrone) return brachistochrone;
  const burn = dv / (2 * accel);
  const cruise = accel * burn;
  return 2 * burn + (distanceM - accel * burn * burn) / cruise;
}

/** The brachistochrone (full burn, flip, full brake) time over `distanceM`, s. */
export function brachistochroneTime(distanceM: number, accel: number): number {
  return 2 * Math.sqrt(distanceM / accel);
}

/**
 * The guidance law ("zero-effort miss / zero-effort velocity"): the acceleration that would
 * take the ship to the target's position (and velocity, by `velocityWeight` 0..1) in `timeToGoS`
 * with the least effort, from the miss of a flight with the engine off. Returns m/s^2.
 */
export function guidance(
  missX: number,
  missY: number,
  velocityMissX: number,
  velocityMissY: number,
  timeToGoS: number,
  velocityWeight: number,
): { x: number; y: number } {
  const t = timeToGoS;
  const w = velocityWeight;
  // Rendezvous (w = 1): 6 ZEM / t^2 - 2 ZEV / t; intercept (w = 0): 3 ZEM / t^2.
  const kp = 3 + 3 * w;
  const kv = 2 * w;
  return {
    x: (kp * missX) / (t * t) - (kv * velocityMissX) / t,
    y: (kp * missY) / (t * t) - (kv * velocityMissY) / t,
  };
}

/**
 * Delta-v of the least-effort flight that closes a miss (`missX`, `missY`, m) and a velocity
 * miss (`velocityMissX`, `velocityMissY`, m/s) in `timeToGoS`: the integral of |a| over the
 * linear acceleration profile of the guidance law (rendezvous, no gravity), m/s.
 */
export function guidanceEffort(
  missX: number,
  missY: number,
  velocityMissX: number,
  velocityMissY: number,
  timeToGoS: number,
): number {
  const t = timeToGoS;
  // a(s) = c1 + c2 s for s in 0..t: c1 is the guidance law now, c2 closes the velocity miss
  // (c1 t + c2 t^2 / 2 = velocity miss).
  const c1x = (6 * missX) / (t * t) - (2 * velocityMissX) / t;
  const c1y = (6 * missY) / (t * t) - (2 * velocityMissY) / t;
  const c2x = (2 * (velocityMissX - c1x * t)) / (t * t);
  const c2y = (2 * (velocityMissY - c1y * t)) / (t * t);
  const samples = 32;
  let total = 0;
  for (let i = 0; i < samples; i++) {
    const s = ((i + 0.5) / samples) * t;
    total += Math.hypot(c1x + c2x * s, c1y + c2y * s);
  }
  return (total * t) / samples;
}
