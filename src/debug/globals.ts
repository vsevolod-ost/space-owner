/**
 * Window globals for the browser console and the smoke tool (tools/smoke.mjs).
 * Set only in debug mode (see `DEBUG` in src/config.ts). No Phaser import, so src/core may
 * use `recordEvent` too.
 */

import type { Services } from '@/core/services';

/** One EventBus event as recorded for the smoke tool. */
export interface RecordedEvent {
  name: string;
  payload: unknown;
  /** `performance.now()` at the moment of emit, ms. */
  t: number;
}

/** One "scene is ready" signal; `seq` grows by one with every signal. */
export interface ReadySignal {
  key: string;
  seq: number;
  t: number;
}

/** What `window.nasa` holds: the services (src/core/services.ts) and the Phaser game. */
export interface NasaDebugHandle {
  services: Services;
  game: unknown;
}

declare global {
  interface Window {
    /** Key of the scene that became ready last, or null after it shut down. */
    __nasaReady?: string | null;
    /** Number of ready signals so far. */
    __nasaReadySeq?: number;
    /** Every ready signal, in order: lets the smoke tool see scenes that start in parallel. */
    __nasaReadyLog?: ReadySignal[];
    /** Every EventBus event, in order (debug mode only). */
    __nasaEvents?: RecordedEvent[];
    /** Services and game for the console and the smoke tool (debug mode only). */
    nasa?: NasaDebugHandle;
  }
}

/**
 * Events not recorded: they come several times a second for the whole act and would grow the
 * list without bound. Read their source instead (`services.simulation.snapshot()`).
 */
const UNRECORDED_EVENTS: ReadonlySet<string> = new Set(['simulationTick']);

/**
 * Appends an event to `window.__nasaEvents` when debug hooks are installed (except
 * `UNRECORDED_EVENTS`); else no-op.
 */
export function recordEvent(name: string, payload: unknown): void {
  if (UNRECORDED_EVENTS.has(name)) return;
  window.__nasaEvents?.push({ name, payload, t: performance.now() });
}
