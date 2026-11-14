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
}

/** State of the ship: position and velocity relative to the Sun, mass, engine, direction. */
export interface ShipState {
  /** Position, m. */
  x: number;
  y: number;
  /** Velocity, m/s. */
  vx: number;
  vy: number;
  massKg: number;
  /** Current engine thrust, N; 0 = engine off. */
  thrustN: number;
  /** Direction the ship points (and pushes when thrusting), radians from +x. */
  heading: number;
}

/**
 * Every ship resource, in the order the navigation panel lists them. To add one, add its id
 * here and its start values in src/content/simulation/ship.ts (the compiler asks for them);
 * the panel shows a bar for it by itself.
 */
export const RESOURCE_IDS = ['oxygen', 'fuel', 'heat', 'power', 'water', 'food', 'comms'] as const;

/** Id of a ship resource. */
export type ResourceId = (typeof RESOURCE_IDS)[number];

/** One resource: amount now, the most it holds, and its change per simulated second. */
export interface Resource {
  /** Amount now, 0..max (any unit; the panel shows value / max). */
  value: number;
  max: number;
  /** Change per simulated second: negative drains it, positive fills it (heat grows). */
  ratePerS: number;
}

/** All ship resources. */
export type Resources = Record<ResourceId, Resource>;

/**
 * Everything the simulation is at one moment: what `Simulation.step` returns, what the
 * navigation panel draws and what a checkpoint saves (`GameSave.simulation`).
 */
export interface SimulationSnapshot {
  /** Simulated time since the start of the voyage, s. Body positions follow from it. */
  timeS: number;
  /** Simulated seconds per real second in the last step (the "T x" in the panel). */
  timeScale: number;
  ship: ShipState;
  resources: Resources;
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
  massKg: number;
  /** Thrust while the engine is on ("Thrust on" in the panel), N. */
  thrustN: number;
  start: ShipStart;
  /** Resources at the start of the voyage. */
  resources: Resources;
}

/** What `SimulationService.attach` gets from content (main.ts). */
export interface SimulationContent {
  /** Bodies of the solar system; a parent must come before its moons. */
  bodies: readonly Body[];
  ship: ShipConfig;
}

/** Whether `data` (e.g. `GameSave.simulation` from localStorage) looks like a snapshot. */
export function isSimulationSnapshot(data: unknown): data is SimulationSnapshot {
  if (typeof data !== 'object' || data === null) return false;
  const snapshot = data as Partial<Record<keyof SimulationSnapshot, unknown>>;
  const ship = snapshot.ship as Partial<Record<keyof ShipState, unknown>> | undefined;
  return (
    typeof snapshot.timeS === 'number' &&
    typeof snapshot.timeScale === 'number' &&
    typeof ship === 'object' &&
    ship !== null &&
    ['x', 'y', 'vx', 'vy', 'massKg', 'thrustN', 'heading'].every(
      (key) => typeof ship[key as keyof ShipState] === 'number',
    ) &&
    typeof snapshot.resources === 'object' &&
    snapshot.resources !== null &&
    RESOURCE_IDS.every((id) => isResource((snapshot.resources as Record<string, unknown>)[id]))
  );
}

function isResource(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const resource = data as Partial<Record<keyof Resource, unknown>>;
  return (
    typeof resource.value === 'number' &&
    typeof resource.max === 'number' &&
    typeof resource.ratePerS === 'number'
  );
}
