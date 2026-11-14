/**
 * Cancelling a cutscene. When the player dies or leaves for the menu in the middle
 * of a cutscene, `CutsceneService.cancel()` cancels the token of the running script: its next
 * API step (or the one it is waiting on) rejects with `CutsceneCancelled`, the script stops
 * there and `CutsceneService` ends it quietly. No Phaser here.
 */

/** Thrown into a cutscene script by its API steps once the cutscene has been cancelled. */
export class CutsceneCancelled extends Error {
  constructor(cutsceneId: string) {
    super(`cutscene "${cutsceneId}" was cancelled`);
    this.name = 'CutsceneCancelled';
  }
}

/**
 * Cancel flag of one cutscene run, handed to its API (`CutsceneStage.createApi`). The API
 * checks it before every step (`throwIfCancelled`) and races every waiting step against it
 * (`race`), so a script never goes on, and never hangs, after a cancel.
 */
export class CancelToken {
  private cancelledFlag = false;
  private readonly listeners = new Set<() => void>();

  /** @param cutsceneId id of the cutscene this token belongs to (for the error message). */
  constructor(readonly cutsceneId: string) {}

  /** Whether `cancel()` has been called. */
  get cancelled(): boolean {
    return this.cancelledFlag;
  }

  /** Cancels the run: waiting steps reject with `CutsceneCancelled`. Calling it again does nothing. */
  cancel(): void {
    if (this.cancelledFlag) return;
    this.cancelledFlag = true;
    for (const listener of [...this.listeners]) listener();
    this.listeners.clear();
  }

  /** Throws `CutsceneCancelled` if the run has been cancelled. */
  throwIfCancelled(): void {
    if (this.cancelledFlag) throw new CutsceneCancelled(this.cutsceneId);
  }

  /**
   * Settles like `step`, unless the run is cancelled first: then rejects with
   * `CutsceneCancelled` at once (whatever `step` does later is ignored).
   */
  race<T>(step: Promise<T>): Promise<T> {
    if (this.cancelledFlag) {
      step.catch(() => undefined);
      return Promise.reject(new CutsceneCancelled(this.cutsceneId));
    }
    return new Promise<T>((resolve, reject) => {
      const onCancel = () => reject(new CutsceneCancelled(this.cutsceneId));
      this.listeners.add(onCancel);
      step.then(
        (value) => {
          this.listeners.delete(onCancel);
          resolve(value);
        },
        (error: unknown) => {
          this.listeners.delete(onCancel);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  }
}
