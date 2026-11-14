/** Scene keys: switch scenes through these, never through string literals. */
export const SceneKey = {
  Boot: 'Boot',
  MainMenu: 'MainMenu',
  Stub: 'Stub',
  World: 'World',
  Ending: 'Ending',
  Pause: 'Pause',
  Settings: 'Settings',
  Navigation: 'Navigation',
  Ui: 'Ui',
  Debug: 'Debug',
} as const;

/** Key of any registered scene. */
export type SceneKey = (typeof SceneKey)[keyof typeof SceneKey];

/**
 * Layers that run for the whole game above every other scene (launched by BootScene): the UI
 * and the debug overlay. Panels do not pause them and scene changes do not stop them.
 */
export const OVERLAY_SCENES: readonly SceneKey[] = [SceneKey.Ui, SceneKey.Debug];

/** Whether `key` is one of the `OVERLAY_SCENES`. */
export function isOverlayScene(key: string): boolean {
  return (OVERLAY_SCENES as readonly string[]).includes(key);
}
