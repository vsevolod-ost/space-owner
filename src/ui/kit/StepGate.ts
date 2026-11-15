import Phaser from 'phaser';

/**
 * Ignores input for the rest of the game step that is running when it is closed, so the press
 * that opened a list or a dialogue does not also act on it.
 *
 * Why not "the frame it opened in": `game.loop.frame` counts up after a step's scene updates, so
 * between two steps it already holds the number of the next one. Something opened between
 * steps (an awaited script, a promise, the smoke tool) would then ignore the whole next step,
 * dropping a press made after it opened. The gate opens again at the next step's `PRE_STEP`,
 * before any scene reads its presses, whenever it was closed.
 *
 * ```ts
 * private readonly gate = new StepGate(scene.game);
 * show(): void { this.gate.close(); }
 * update(): void { if (!this.gate.isClosed && controls.justPressed('confirm')) this.choose(); }
 * ```
 */
export class StepGate {
  private closed = false;

  constructor(private readonly game: Phaser.Game) {}

  /** Whether input is ignored now: the step the gate was closed in is still running. */
  get isClosed(): boolean {
    return this.closed;
  }

  /** Ignores input until the next game step starts. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.game.events.once(Phaser.Core.Events.PRE_STEP, this.open, this);
  }

  private open(): void {
    this.closed = false;
  }
}
