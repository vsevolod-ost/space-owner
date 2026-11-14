/**
 * Global game settings. The internal resolution lives only here: every layout, camera and
 * placeholder size is derived from these constants (tools/placeholders.py mirrors them).
 */

/** Internal render width in pixels. The canvas is scaled up to the window by whole steps. */
export const GAME_WIDTH = 640;
/** Internal render height in pixels. */
export const GAME_HEIGHT = 360;
/** Grid step for Tiled maps and for laying out locations, in pixels. */
export const TILE_SIZE = 16;

const params = new URLSearchParams(window.location.search);

/**
 * Debug mode: always on in `npm run dev`, and in any build with `?debug=1` in the URL.
 * Exposes `window.nasa` and the smoke-test hooks (see src/debug/hooks.ts).
 */
export const DEBUG = import.meta.env.DEV || params.get('debug') === '1';
