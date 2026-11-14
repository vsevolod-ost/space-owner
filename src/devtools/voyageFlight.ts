import type { Simulation } from '@/core/simulation/Simulation';

/** Real seconds per frame the headless flights step with (the game's 60 fps). */
export const FRAME_S = 1 / 60;
/** A leg that has not arrived after this much simulated time is given up, s. */
const LEG_LIMIT_S = 1000 * 86_400;

/** What one leg of a headless flight gave (`flyLeg`). */
export interface LegResult {
  /** Whether the gate was reached (docking finished). */
  arrived: boolean;
  /** Autopilot phase at the end (`arrived`, `finished`, or why it stopped). */
  phase: string;
  /** Simulated time of the leg, s. */
  simS: number;
  /** Real seconds of Run it took at the current time-scale constants (60 frames a second). */
  realS: number;
  /** Real seconds of it within 10 capture radii of the gate body (the slow approach). */
  approachS: number;
  /** Distance to the gate body's centre when captured (closest on the leg), m. */
  captureM: number;
  /** Delta-v spent on the leg, m/s. */
  dv: number;
  /** Fuel charges left at the end. */
  fuelLeft: number;
}

/**
 * Flies `simulation`, which is at the start of leg `leg` (or parked before it is departed by
 * the caller), frame by frame as the game would until the gate is reached or the leg fails.
 */
export function flyLeg(simulation: Simulation, leg: number): LegResult {
  const startS = simulation.time;
  const capture = simulation.captureRadiusOf(leg);
  let realS = 0;
  let approachS = 0;
  for (;;) {
    const near = simulation.distanceToGate() < 10 * capture;
    simulation.advance(FRAME_S);
    realS += FRAME_S;
    if (near) approachS += FRAME_S;
    const pilot = simulation.autopilot;
    const done = pilot.phase === 'arrived' || pilot.phase === 'finished';
    if (done || pilot.phase === 'drifting' || simulation.time - startS > LEG_LIMIT_S) {
      const snapshot = simulation.snapshot();
      return {
        arrived: done && pilot.legIndex === leg,
        phase: pilot.phase,
        simS: simulation.time - startS,
        realS,
        approachS,
        captureM: pilot.closestM,
        dv: pilot.dvSpent,
        fuelLeft: snapshot.resources.fuel.value,
      };
    }
  }
}
