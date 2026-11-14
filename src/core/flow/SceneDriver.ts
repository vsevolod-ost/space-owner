/**
 * What the story flow needs from the scenes. src/core does not import Phaser, so
 * `FlowService` moves scenes only through this interface; `PhaserSceneDriver`
 * (src/scenes/PhaserSceneDriver.ts) implements it and main.ts attaches it with
 * `services.flow.attach(new PhaserSceneDriver(game), { acts, actOrder, endings })`. Ids are
 * plain strings here; the driver checks them.
 */
export interface SceneDriver {
  /**
   * Shows location `location` with the hero at spawn `spawn`: fades the current screen out,
   * loads the location and fades it in. Resolves when the fade-in is over.
   */
  goTo(location: string, spawn: string): Promise<void>;
  /**
   * Fades the screen to black and shows an act title card on it; resolves when the title is
   * gone. The screen stays black, so the act's following `goTo` fades in on its location.
   */
  showActTitle(title: string): Promise<void>;
  /** Replaces whatever runs (world, panels, menu) with the end screen of ending `ending`. */
  showEnding(ending: string): void;
  /** Closes the game (world, panels, dialogue, title) and opens the main menu. */
  toMainMenu(): void;
  /** Shows a short message at the bottom of the screen for a moment. */
  toast(text: string): void;
}
