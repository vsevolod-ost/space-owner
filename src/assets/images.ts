/**
 * Registry of single images. The object key is the texture key used in code (`ImageKey`);
 * `path` is relative to `public/`. BootScene loads everything listed here.
 *
 * To replace a placeholder, overwrite the file with real art of the same size - no code
 * changes. To add an image, put the file into `public/assets/` and add a line here.
 * OWNER: art - every file listed here is a placeholder to draw (sizes and the art order in
 * docs/HOWTO-art.md).
 */
export const images = {
  'menu-background': { path: 'assets/menu/background.png' },
  'menu-logo': { path: 'assets/menu/logo.png' },
  /** Real art: the ship (344x150, transparent), right of the menu buttons. */
  'menu-ship': { path: 'assets/menu/ship.png' },
  'button-normal': { path: 'assets/ui/button-normal.png' },
  'button-hover': { path: 'assets/ui/button-hover.png' },
  'button-pressed': { path: 'assets/ui/button-pressed.png' },
  'ui-panel': { path: 'assets/ui/panel.png' },
  'cursor-interact': { path: 'assets/ui/cursor-interact.png' },
  'portrait-hero': { path: 'assets/portraits/hero.png' },
  'portrait-hero-resolute': { path: 'assets/portraits/hero-resolute.png' },
  'portrait-hero-tired': { path: 'assets/portraits/hero-tired.png' },
  'portrait-engineer': { path: 'assets/portraits/engineer.png' },
  'portrait-engineer-worried': { path: 'assets/portraits/engineer-worried.png' },
  'portrait-astronomer': { path: 'assets/portraits/astronomer.png' },
  'portrait-astronomer-worried': { path: 'assets/portraits/astronomer-worried.png' },
  'portrait-computer': { path: 'assets/portraits/computer.png' },
  'location-home': { path: 'assets/images/locations/home.png' },
  'location-warehouse': { path: 'assets/images/locations/warehouse.png' },
  'location-ship-deck': { path: 'assets/images/locations/ship-deck.png' },
  // The colony: the picture of its body (real art, nothing built on it), then the base over it.
  'location-colony-moon': { path: 'assets/images/locations/colony-moon.png' },
  'location-colony-mars': { path: 'assets/images/locations/colony-mars.png' },
  /** Real art: the Moon with a whole colony drawn in, shown for a full colony there. */
  'location-colony-moon-built': { path: 'assets/images/locations/colony-moon-built.png' },
  /** Real art: Mars with a whole colony drawn in, shown for a full colony there. */
  'location-colony-mars-built': { path: 'assets/images/locations/colony-mars-built.png' },
  'location-colony-base': { path: 'assets/images/locations/colony-base.png' },
  /** Real art: the prologue's title card (the hero on the roof at night). */
  'card-prologue': { path: 'assets/images/cards/prologue.png' },
  /** Empty cargo crate (32x32); the item icon from `items` is drawn on it. */
  crate: { path: 'assets/sprites/crate.png' },
  /** Generic colony module (64x48), used for colony items without their own building. */
  'colony-module': { path: 'assets/sprites/colony/module.png' },
  // Colony buildings of single items (up to 64x64).
  'colony-greenhouse': { path: 'assets/sprites/colony/greenhouse.png' },
  'colony-solar': { path: 'assets/sprites/colony/solar.png' },
  'colony-reactor': { path: 'assets/sprites/colony/reactor.png' },
  'colony-battery': { path: 'assets/sprites/colony/battery.png' },
  'colony-regolith': { path: 'assets/sprites/colony/regolith.png' },
  'colony-ice': { path: 'assets/sprites/colony/ice.png' },
  'colony-thermal': { path: 'assets/sprites/colony/thermal.png' },
  // Objects in the colony sky per body (up to 64x64).
  'colony-sky-moon': { path: 'assets/sprites/colony/sky-moon.png' },
  'colony-sky-mars': { path: 'assets/sprites/colony/sky-mars.png' },
} as const satisfies Record<string, ImageEntry>;

/** One entry of the image registry. */
export interface ImageEntry {
  /** File path relative to `public/`. */
  path: string;
}
