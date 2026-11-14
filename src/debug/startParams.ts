/**
 * Start parameters in the page URL, read by BootScene; work in dev and in builds:
 * `?location=<id>&spawn=<name>` opens a location directly, skipping the menu (outside the
 * story: act `debug`); `?act=<id>` starts an act with its title card. `act` wins if both are
 * given. `?overlay=1` turns the debug overlay on from the start (src/scenes/DebugScene.ts).
 */

/** What the URL asks for; all unchecked strings. */
export interface StartParams {
  /** Act to start (`?act=act2`). */
  act?: string;
  /** Location to open (`?location=demo-room`). */
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
