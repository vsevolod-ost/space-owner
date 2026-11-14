/**
 * Plays cutscenes. No Phaser here: the scenes layer attaches a `CutsceneStage`
 * (src/world/WorldCutsceneApi.ts) that builds the API and stops the player's input, the same
 * pattern as `FlowService.attach(driver)`.
 *
 * `CutsceneId` is imported with `import type` only (see src/core/cutscene/types.ts): the
 * registry itself is handed over in `attach`, so core never imports content at run time.
 */
import type { CutsceneId } from '@/content/cutscenes';
import { CancelToken, CutsceneCancelled } from '@/core/cutscene/cancel';
import type { Cutscene, CutsceneApi } from '@/core/cutscene/types';
import type { EventBus } from '@/core/events/EventBus';
import type { GameEvents } from '@/core/events/events';

/** Lock reason put on the world's controls while a cutscene plays. */
export const CUTSCENE_LOCK = 'cutscene';

/** What `CutsceneService` needs from the scenes; implemented by `WorldCutsceneStage`. */
export interface CutsceneStage {
  /**
   * A fresh API on the running world, for one cutscene. Its steps check `token` and reject
   * with `CutsceneCancelled` once it is cancelled (see src/core/cutscene/cancel.ts).
   */
  createApi(token: CancelToken): CutsceneApi;
  /** A cutscene starts: lock the player's input (reason `CUTSCENE_LOCK`). */
  begin(): void;
  /** A cutscene ended (or failed): unlock the input, give the camera back to the hero. */
  end(): void;
}

/**
 * Runs cutscenes one at a time. `play(id)` locks the hero's input, emits `cutsceneStarted`,
 * runs the script, then unlocks and emits `cutsceneEnded` (also when the script throws).
 * A `play` while another cutscene runs is queued: it starts when the running one ends.
 * `cancel()` stops the running cutscene and drops the queue (death, back to the menu).
 */
export class CutsceneService {
  private stage: CutsceneStage | null = null;
  private library: Readonly<Record<string, Cutscene>> = {};
  /** Cutscenes playing (first, once started) or queued, oldest first. */
  private runs: CancelToken[] = [];
  /** The run whose script is executing now, or null. */
  private active: CancelToken | null = null;
  /** End of the last queued cutscene; the next `play` starts after it. */
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly events: EventBus<GameEvents>) {}

  /**
   * Connects the scenes and the cutscene registry; main.ts calls this once, right after
   * creating the Phaser game: `services.cutscenes.attach(new WorldCutsceneStage(game), cutscenes)`.
   */
  attach(stage: CutsceneStage, library: Readonly<Record<string, Cutscene>>): void {
    this.stage = stage;
    this.library = library;
  }

  /** Whether a cutscene is playing or waiting in the queue. */
  get isPlaying(): boolean {
    return this.runs.length > 0;
  }

  /** Id of the cutscene playing now, or null. */
  get current(): string | null {
    return this.active?.cutsceneId ?? null;
  }

  /**
   * Plays cutscene `id` (src/content/cutscenes) and resolves when it has ended, or has been
   * cancelled (`cancel`). Called while another one plays, it waits for that one first.
   * Rejects if the id is unknown or the script throws; the input is unlocked either way.
   *
   * ```ts
   * 'trigger-center': { kind: 'trigger', once: true, run: (ctx) => ctx.cutscenes.play('demo-arrival') },
   * ```
   */
  play(id: CutsceneId): Promise<void> {
    const cutscene = Object.hasOwn(this.library, id) ? this.library[id] : undefined;
    if (!cutscene) return Promise.reject(new Error(`CutsceneService: unknown cutscene "${id}"`));
    const stage = this.requireStage();
    const token = new CancelToken(id);
    this.runs.push(token);
    const run = this.tail.then(() => this.runOne(token, cutscene, stage));
    this.tail = run.catch(() => undefined);
    return run;
  }

  /**
   * Stops the cutscene playing now and drops the queued ones; nothing happens if none plays.
   * At once: `isPlaying` turns false, the input is unlocked and `cutsceneEnded` is emitted for
   * the running one. Its script stops at its current or next API step (the step rejects with
   * `CutsceneCancelled`, which ends the cutscene quietly; `play` resolves). The scene driver
   * calls this before it replaces the world with the end screen or the menu.
   */
  cancel(): void {
    const runs = this.runs;
    if (runs.length === 0) return;
    this.runs = [];
    for (const token of runs) token.cancel();
    const active = this.active;
    if (!active) return;
    this.active = null;
    this.finish(active, this.requireStage());
  }

  private async runOne(
    token: CancelToken,
    cutscene: Cutscene,
    stage: CutsceneStage,
  ): Promise<void> {
    // Cancelled while it waited in the queue: it never starts.
    if (token.cancelled) return;
    this.active = token;
    try {
      stage.begin();
      this.events.emit('cutsceneStarted', { cutsceneId: token.cutsceneId });
      // Raced against the token: after a cancel the queue moves on even if the script waits on
      // something outside the API, and whatever the script does later is ignored.
      await token.race(cutscene.run(stage.createApi(token)));
    } catch (error) {
      // A cancelled script stops by throwing CutsceneCancelled from its step: a normal end.
      if (!(error instanceof CutsceneCancelled)) throw error;
    } finally {
      // After cancel() the run has already been finished there.
      if (!token.cancelled) {
        this.active = null;
        this.runs = this.runs.filter((run) => run !== token);
        this.finish(token, stage);
      }
    }
  }

  /** Unlocks the input and tells listeners that cutscene `token` has ended. */
  private finish(token: CancelToken, stage: CutsceneStage): void {
    stage.end();
    this.events.emit('cutsceneEnded', { cutsceneId: token.cutsceneId });
  }

  private requireStage(): CutsceneStage {
    if (!this.stage) throw new Error('CutsceneService: no CutsceneStage attached (see main.ts)');
    return this.stage;
  }
}
