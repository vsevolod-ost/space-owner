import { G } from '@/core/simulation/constants';
import type { Body, Vec2 } from '@/core/simulation/types';

/**
 * The bodies of the solar system on static circular orbits: where each body is at a given
 * simulated time. Bodies do not attract each other - only the ship feels gravity
 * (`Simulation`).
 */
export class SolarSystem {
  /** All bodies, in the order given. */
  readonly bodies: readonly Body[];
  /** G M of every body, m^3/s^2, in the order of `bodies` (for the integrator). */
  readonly gm: Float64Array;
  /** Radius of every body, m, in the order of `bodies`. */
  readonly radii: Float64Array;
  private readonly byId: ReadonlyMap<string, Body>;
  private readonly parentIndex: Int32Array;

  constructor(bodies: readonly Body[]) {
    this.bodies = bodies;
    this.byId = new Map(bodies.map((body) => [body.id, body]));
    this.gm = Float64Array.from(bodies, (body) => G * body.massKg);
    this.radii = Float64Array.from(bodies, (body) => body.radiusM);
    this.parentIndex = Int32Array.from(bodies, (body, index) => {
      if (body.parent === undefined) return -1;
      const parent = bodies.findIndex((other) => other.id === body.parent);
      if (parent < 0) {
        throw new Error(`SolarSystem: body "${body.id}" orbits unknown body "${body.parent}"`);
      }
      if (parent >= index) {
        throw new Error(`SolarSystem: body "${body.id}" comes before its parent "${body.parent}"`);
      }
      return parent;
    });
  }

  /** Index of the body with id `id` in `bodies`; throws if there is none. */
  indexOf(id: string): number {
    return this.bodies.indexOf(this.get(id));
  }

  /**
   * Positions of all bodies at `timeS` into `out` (x, y pairs in the order of `bodies`, length
   * 2 n): the same as `positionOf` for each body, without allocating (the integrator calls it
   * on every substep).
   */
  fillPositions(timeS: number, out: Float64Array): void {
    const bodies = this.bodies;
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      const angle = angleAt(body, timeS);
      const parent = this.parentIndex[i];
      const cx = parent < 0 ? 0 : out[parent * 2];
      const cy = parent < 0 ? 0 : out[parent * 2 + 1];
      out[i * 2] = cx + body.orbitRadiusM * Math.cos(angle);
      out[i * 2 + 1] = cy + body.orbitRadiusM * Math.sin(angle);
    }
  }

  /** The body with id `id`; throws if there is none. */
  get(id: string): Body {
    const body = this.byId.get(id);
    if (!body) throw new Error(`SolarSystem: unknown body "${id}"`);
    return body;
  }

  /**
   * Position of `body` at simulated time `timeS`, m: a circle of `orbitRadiusM` around its
   * parent's position (or the origin), angle `phaseRad + 2 pi t / periodS`.
   */
  positionOf(body: Body, timeS: number): Vec2 {
    const center =
      body.parent === undefined ? { x: 0, y: 0 } : this.positionOf(this.get(body.parent), timeS);
    const angle = angleAt(body, timeS);
    return {
      x: center.x + body.orbitRadiusM * Math.cos(angle),
      y: center.y + body.orbitRadiusM * Math.sin(angle),
    };
  }

  /** Velocity of `body` at time `timeS`, m/s (the derivative of `positionOf`). */
  velocityOf(body: Body, timeS: number): Vec2 {
    const base =
      body.parent === undefined ? { x: 0, y: 0 } : this.velocityOf(this.get(body.parent), timeS);
    if (body.periodS === 0) return base;
    const omega = (2 * Math.PI) / body.periodS;
    const angle = angleAt(body, timeS);
    return {
      x: base.x - body.orbitRadiusM * omega * Math.sin(angle),
      y: base.y + body.orbitRadiusM * omega * Math.cos(angle),
    };
  }
}

function angleAt(body: Body, timeS: number): number {
  const phase = body.phaseRad ?? 0;
  return body.periodS === 0 ? phase : phase + (2 * Math.PI * timeS) / body.periodS;
}
