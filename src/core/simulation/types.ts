import type { LegConditions, LifeState } from '@/core/voyage/types';

/**
 * Data model of the ship simulation. Plain data, no Phaser: the save stores a
 * `SimulationSnapshot` as JSON, the navigation panel draws it. Units are SI - metres, seconds,
 * kilograms, newtons, radians. The model is flat (2D): the Sun is at the origin, x to the right,
 * y up, angles counter-clockwise from +x. How to change it: docs/HOWTO-simulation.md.
 */

/** A point or a vector in the plane of the solar system, metres (or m/s for velocities). */
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * What a body is for in the voyage:
 * - `home` - where the voyage starts (the Earth);
 * - `gate` - the body of one of the voyage's gates (`GateDef.body`);
 * - `parent` - a planet a gate body orbits (none on the route now; Jupiter would be one for Europa);
 * - `scenery` - drawn and pulling, but not a place of the voyage (the Sun, Mercury, Venus).
 * The time scale slows down near `home`, `gate` and `parent` bodies only (`timeScaleAt`).
 */
export type BodyRole = 'home' | 'gate' | 'parent' | 'scenery';

/**
 * A body of the solar system on a fixed circular orbit around its `parent` (static orbits, no
 * gravity between bodies). The Sun has no parent and orbit radius 0.
 */
export interface Body {
  /** Unique id; other bodies name it in `parent`. */
  id: string;
  /** Name shown in the navigation panel. */
  name: string;
  massKg: number;
  /** Radius of the circular orbit around `parent`, m (0 for the Sun). */
  orbitRadiusM: number;
  /** Time of one orbit, s (0 for a body that does not move). */
  periodS: number;
  /** Id of the body this one orbits; none = the origin (the Sun). */
  parent?: string;
  /** Colour in the navigation panel, 0xRRGGBB. */
  color: number;
  /** Angle on the orbit at time 0, radians; default 0. */
  phaseRad?: number;
  /** What the body is for in the voyage (`BodyRole`). */
  role: BodyRole;
  /** Radius of the body itself, m (the mean radius). */
  radiusM: number;
}

/**
 * One gate of the voyage (src/content/voyage/gates.ts): the ship flies to `body`, and there the
 * player chooses to stop or go on. Gates are flown in the order of the list.
 */
export interface GateDef {
  /** Id of the gate's body (a `Body` with role `gate`). */
  body: string;
  /** The last gate of the voyage: only "Stop" there. */
  last?: boolean;
}

/** How the ship flies a leg: by the autopilot on the integrator, or on a scripted rail. */
export type LegMode = 'physics' | 'rail';

/**
 * One leg of the voyage (src/content/voyage/legs.ts): leg `i` ends at gate `i`, leg 0 starts at
 * the ship's start (`ShipConfig.start`), leg `i` > 0 at gate `i - 1`.
 */
export interface LegDef extends LegConditions {
  /**
   * Delta-v budget of this leg, m/s: the autopilot plans to spend `AUTOPILOT.planFraction` of
   * it and keeps the rest as a reserve; the fuel that takes follows from the rocket equation
   * (`rocket.ts`). Short of fuel, the ship drifts (D13).
   */
  dvBudget: number;
  /**
   * How long the docking at the end of this leg lasts (the pull from the capture radius onto
   * the parking orbit), simulated s. Simulated, not real, time, so the flight does not depend
   * on the time-scale constants; the real duration follows from the time scale at the gate.
   */
  dockS: number;
  /** `physics` - the autopilot flies the integrator; `rail` - the ship follows a scripted path. */
  mode: LegMode;
}

/**
 * What the autopilot does now:
 * - `flying` - on the leg to gate `legIndex` (thrusting or coasting, see `thrusting`);
 * - `docking` - inside the gate's capture radius, pulled smoothly onto its parking orbit;
 * - `arrived` - parked at gate `legIndex`, waiting for `Simulation.departToNextGate`;
 * - `drifting` - out of fuel on the leg: the engine is off for good;
 * - `finished` - parked at the last gate.
 */
export type AutopilotPhase = 'flying' | 'docking' | 'arrived' | 'drifting' | 'finished';

/** State of the autopilot, part of the snapshot (plain data). */
export interface AutopilotState {
  phase: AutopilotPhase;
  /** Index of the gate the ship flies to (or is parked at). */
  legIndex: number;
  /**
   * Guidance stage on the leg: -1 - climbing out of the gravity of `climbBody`, which pulls
   * harder than the engine where the leg begins (full thrust along the velocity relative to
   * it); 0 - towards the gate
   * body (or, for a moon deep in its planet's gravity, towards a standoff point by the planet;
   * on a transfer leg, the Lambert cruise); 1 - from the standoff point, aiming the fall at the
   * moon; 2 - a transfer's arrival burn (the rendezvous guidance).
   */
  stage: number;
  /** Stage -1: index of the body the ship climbs away from (in `SimulationContent.bodies`). */
  climbBody: number;
  /**
   * Stage 0 of a moon leg: direction from the planet to the standoff point (unit vector); on a
   * transfer leg: direction from the gate body to the side the ship arrives from.
   */
  wayX: number;
  wayY: number;
  /** Simulated time the leg began, s. */
  legStartS: number;
  /** Planned time of arrival at the gate body, s (re-planned when missed). */
  arrivalS: number;
  /** Simulated time of the next guidance update, s. */
  nextReplanS: number;
  /** Whether the engine pushes now, and the unit direction it pushes in. */
  thrusting: boolean;
  dirX: number;
  dirY: number;
  /** Delta-v spent on this leg so far, m/s. */
  dvSpent: number;
  /**
   * Delta-v planned for this leg when it began, m/s: `AUTOPILOT.planFraction` of the delta-v
   * the fuel gave then, at most of the leg's `dvBudget` (plan variable-mass D16, D20).
   */
  dvPlan: number;
  /** Closest distance to the gate body's centre on this leg so far, m. */
  closestM: number;
  /**
   * Transfer leg (stage 0): the speed against the gate body the Lambert arc arrives with at
   * the last guidance update, m/s (the arrival burn brakes it); 0 before the first one.
   */
  arriveSpeedMS: number;
  /**
   * Rail legs: where the ship started the leg (position and velocity, m and m/s); docking:
   * where it was captured, relative to the gate body.
   */
  fromX: number;
  fromY: number;
  fromVx: number;
  fromVy: number;
  /** Docking: when it began and how long it takes, simulated s. */
  dockStartS: number;
  dockDurationS: number;
  /** Parking (docking, arrived): the ship's offset from the gate body, m. */
  parkX: number;
  parkY: number;
}

/** State of the ship: position and velocity relative to the Sun, mass, engine, direction. */
export interface ShipState {
  /** Position, m. */
  x: number;
  y: number;
  /** Velocity, m/s. */
  vx: number;
  vy: number;
  /**
   * Mass now, kg (M(t), plan variable-mass D15): `shipMassKg` of the cargo and the resources,
   * kept up to date on every substep. The engine's acceleration is its thrust over it.
   */
  massKg: number;
  /** Current engine thrust, N; 0 = engine off. */
  thrustN: number;
  /** Direction the ship points (and pushes when thrusting), radians from +x. */
  heading: number;
}

/**
 * Every ship resource, in the order the navigation panel lists them (D14, GDD `res-list`):
 * - `fuel` - kilograms of propellant; `ratePerS` is the engine's burn while it fires (kg/s);
 * - `oxygen`, `water`, `food` - days of stock for the one person aboard;
 * - `power` - days of stock at the ship's base load;
 * - `heat` - days the cabin stays warm without power (`frozen` at 0);
 * - `comms` - link to the Earth: 2 OK, 1 Weak, 0 Lost (from the leg, `LegConditions.comms`).
 * Start amounts come from the cargo aboard (src/content/voyage/cargo, `startResources`), the
 * flows per day from `evaluateFlows` (src/core/voyage/flows.ts).
 */
export const RESOURCE_IDS = ['oxygen', 'fuel', 'heat', 'power', 'water', 'food', 'comms'] as const;

/** Id of a ship resource. */
export type ResourceId = (typeof RESOURCE_IDS)[number];

/** One resource: amount now, the most it holds, and its change per simulated second. */
export interface Resource {
  /** Amount now, 0..max (kg, days or a level, see `RESOURCE_IDS`). */
  value: number;
  max: number;
  /** Change per simulated second: negative drains it, positive fills it (heat grows). */
  ratePerS: number;
}

/** All ship resources. */
export type Resources = Record<ResourceId, Resource>;

/**
 * Everything the simulation is at one moment: what `Simulation.step` returns, what the
 * navigation panel draws, what a copy is built from (`Simulation.clone`). Not saved: a save
 * taken during the voyage starts it again (plan D17).
 */
export interface SimulationSnapshot {
  /** Simulated time since the start of the voyage, s. Body positions follow from it. */
  timeS: number;
  /** Simulated seconds per real second in the last step (the "T x" in the panel). */
  timeScale: number;
  /**
   * Simulated time already granted by the time scale but not yet integrated, s: the
   * integrator advances in whole substeps, so the trajectory does not depend on frame times.
   */
  pendingS: number;
  ship: ShipState;
  resources: Resources;
  autopilot: AutopilotState;
  /** Copies of each kind of cargo aboard (`Loadout.counts`): the loadout is rebuilt from it. */
  cargo: Record<string, number>;
  /** Offline items, the death if any, the drift clock (`LifeState`). */
  life: LifeState;
}

/** Where the ship starts: on a circular orbit around a body (`Simulation` computes the state). */
export interface ShipStart {
  /** Id of the body the ship orbits at the start. */
  around: string;
  /** Distance from the body's centre, m. */
  distanceM: number;
  /** Angle from the body, radians from +x. */
  angleRad: number;
}

/** The ship as content describes it (src/content/simulation/ship.ts). */
export interface ShipConfig {
  /** Thrust of the engine when the autopilot fires it (always full or off), N. */
  thrustN: number;
  /**
   * Specific impulse of the engine, s: exhaust speed `ispS * G0` (plan variable-mass D3, D5).
   * The ship's mass is not here: it comes from the cargo (`shipMassKg`).
   */
  ispS: number;
  start: ShipStart;
}

/** What `SimulationService.attach` gets from content (main.ts). */
export interface SimulationContent {
  /** Bodies of the solar system; a parent must come before its moons. */
  bodies: readonly Body[];
  ship: ShipConfig;
  /** The gates in flight order (src/content/voyage/gates.ts). */
  gates: readonly GateDef[];
  /** One leg per gate, same order (src/content/voyage/legs.ts). */
  legs: readonly LegDef[];
}
