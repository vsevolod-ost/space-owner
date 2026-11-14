import type { Body, Vec2 } from '@/core/simulation/types';

/**
 * The bodies of the solar system on static circular orbits: where each body is at a given
 * simulated time. Bodies do not attract each other - only the ship feels gravity
 * (`Simulation`).
 */
export class SolarSystem {
  /** All bodies, in the order given. */
  readonly bodies: readonly Body[];
  private readonly byId: ReadonlyMap<string, Body>;

  constructor(bodies: readonly Body[]) {
    this.bodies = bodies;
    this.byId = new Map(bodies.map((body) => [body.id, body]));
    for (const body of bodies) {
      if (body.parent !== undefined && !this.byId.has(body.parent)) {
        throw new Error(`SolarSystem: body "${body.id}" orbits unknown body "${body.parent}"`);
      }
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
