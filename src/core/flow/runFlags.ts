/**
 * Names of the `run.*` flags (plan D17): the count across attempts, kept through deaths and
 * cleared only by New game. `FlowService` writes them; texts (the scientists' debrief) read
 * them.
 */
export const RUN_FLAGS = {
  /** Seed of the current voyage's events (plan D10). */
  seed: 'run.seed',
  /** Number of the attempt now: unset (1) on a new game, +1 after every death, abort or Fly again. */
  attempt: 'run.attempt',
  /** Cause of the last lost voyage: a `DeathCause` (`hypoxia`, `event:<id>`) or `abort`. */
  lastCause: 'run.lastCause',
  /** Index of the last gate the lost voyage reached, -1 before the first. */
  lastGate: 'run.lastGate',
  /** Highest gate index any voyage reached (-1: none yet). */
  bestGate: 'run.bestGate',
  /** Whole simulated day (from 0) the last voyage was lost; texts show it + 1, as the panel. */
  lastDay: 'run.lastDay',
  /** Id of the body of `lastGate` ('' before the first gate); texts name it with `bodyName`. */
  lastGateBody: 'run.lastGateBody',
  /** Id of the body the lost voyage was flying to. */
  lastNextBody: 'run.lastNextBody',
} as const;
