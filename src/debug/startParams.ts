/**
 * Start parameters in the page URL, read by BootScene; work in dev and in builds:
 * `?location=<id>&spawn=<name>` opens a location directly, skipping the menu (outside the
 * story: act `debug`); `?act=<id>` starts an act with its title card. `act` wins if both are
 * given. `?overlay=1` turns the debug overlay on from the start (src/scenes/DebugScene.ts).
 * `?seed=<n>` fixes the seed of the voyage's events (plan D10; read on its own, `readSeedParam`).
 */

/** What the URL asks for; all unchecked strings. */
export interface StartParams {
  /** Act to start (`?act=act2`). */
  act?: string;
  /** Location to open (`?location=warehouse`). */
  location?: string;
  /** Spawn object name in `location`, or undefined for the location's default. */
  spawn?: string;
}

/** Returns the start parameters from the URL, or null when neither `act` nor `location` is set. */
export function readStartParams(search: string = window.location.search): StartParams | null {
  const params = new URLSearchParams(search);
  const act = params.get('act') || undefined;
  const location = params.get('location') || undefined;
  if (!act && !location) return null;
  return { act, location, spawn: params.get('spawn') || undefined };
}

/** Whether the URL asks for the debug overlay at start (`?overlay=1`); `?debug=1` does not. */
export function readOverlayParam(search: string = window.location.search): boolean {
  return new URLSearchParams(search).get('overlay') === '1';
}

/**
 * The seed `?seed=<n>` fixes for every voyage's events (plan D10: smoke and balance runs), a
 * whole number >= 0, or null when absent or not one. Works with or without `act`/`location`.
 */
export function readSeedParam(search: string = window.location.search): number | null {
  const raw = new URLSearchParams(search).get('seed');
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const seed = Number(raw);
  return Number.isSafeInteger(seed) ? seed : null;
}
