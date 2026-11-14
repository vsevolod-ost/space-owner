/**
 * Player input as actions, not keys. Scenes ask `controls.isDown('moveLeft')`, never
 * about a key, so a gamepad or rebinding is added in one place. No Phaser here: the keyboard
 * implementation is src/world/KeyboardControls.ts.
 */

/** Everything the player can do with the keyboard. */
export type Action =
  'moveUp' | 'moveDown' | 'moveLeft' | 'moveRight' | 'interact' | 'cancel' | 'confirm';

/** Actions that move or act in the world; a lock (dialogue, cutscene) blocks these. */
export const GAMEPLAY_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  'moveUp',
  'moveDown',
  'moveLeft',
  'moveRight',
  'interact',
]);

/**
 * Default keys per action, as Phaser key code names (`Phaser.Input.Keyboard.KeyCodes`).
 * `interact` is E only: Space closes the last dialogue line and must not reopen it at once.
 */
export const KEY_BINDINGS: Readonly<Record<Action, readonly string[]>> = {
  moveUp: ['UP', 'W'],
  moveDown: ['DOWN', 'S'],
  moveLeft: ['LEFT', 'A'],
  moveRight: ['RIGHT', 'D'],
  interact: ['E'],
  cancel: ['ESC'],
  confirm: ['ENTER', 'SPACE'],
};

/** A 2D direction; `getMoveVector()` returns it normalised (length 1 or 0). */
export interface Vector2 {
  x: number;
  y: number;
}

/** Input as the game sees it. */
export interface Controls {
  /** Whether a key bound to the action is held now. False for gameplay actions while locked. */
  isDown(action: Action): boolean;
  /**
   * Whether the action was pressed since the previous frame. Every caller in the same frame
   * gets the same answer (reading it does not consume it). False for gameplay actions while
   * locked.
   */
  justPressed(action: Action): boolean;
  /** Movement direction from the move actions, diagonal normalised; zero while locked. */
  getMoveVector(): Vector2;
  /**
   * Blocks gameplay actions (movement, interact) until every reason is unlocked; `confirm`
   * and `cancel` keep working for dialogue and menus. Reasons are a set: `lock('dialogue')`
   * twice needs one `unlock('dialogue')`.
   */
  lock(reason: string): void;
  /** Removes one lock reason; unknown reasons are ignored. */
  unlock(reason: string): void;
  /** Whether any lock reason is active. */
  isLocked(): boolean;
}

/** Turns held directions into a vector of length 1 (or 0 when nothing or opposites are held). */
export function moveVector(up: boolean, down: boolean, left: boolean, right: boolean): Vector2 {
  const x = (right ? 1 : 0) - (left ? 1 : 0);
  const y = (down ? 1 : 0) - (up ? 1 : 0);
  if (x !== 0 && y !== 0) return { x: x * Math.SQRT1_2, y: y * Math.SQRT1_2 };
  return { x, y };
}
