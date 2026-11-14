/**
 * Registry of single images. The object key is the texture key used in code (`ImageKey`);
 * `path` is relative to `public/`. BootScene loads everything listed here.
 *
 * To replace a placeholder, overwrite the file with real art of the same size - no code
 * changes. To add an image, put the file into `public/assets/` and add a line here.
 */
export const images = {
  'menu-background': { path: 'assets/menu/background.png' },
  'menu-logo': { path: 'assets/menu/logo.png' },
  'button-normal': { path: 'assets/ui/button-normal.png' },
  'button-hover': { path: 'assets/ui/button-hover.png' },
  'button-pressed': { path: 'assets/ui/button-pressed.png' },
  'ui-panel': { path: 'assets/ui/panel.png' },
  'cursor-interact': { path: 'assets/ui/cursor-interact.png' },
  'portrait-hero': { path: 'assets/portraits/hero.png' },
  'portrait-engineer': { path: 'assets/portraits/engineer.png' },
  'portrait-captain': { path: 'assets/portraits/captain.png' },
  'location-demo-corridor': { path: 'assets/images/locations/demo-corridor.png' },
  'location-demo-room': { path: 'assets/images/locations/demo-room.png' },
  'location-ship-deck': { path: 'assets/images/locations/ship-deck.png' },
} as const satisfies Record<string, ImageEntry>;

/** One entry of the image registry. */
export interface ImageEntry {
  /** File path relative to `public/`. */
  path: string;
}
