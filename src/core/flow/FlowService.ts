/**
 * The story flow. No Phaser here: scenes move through the attached `SceneDriver`
 * (src/scenes/PhaserSceneDriver.ts), and the act and ending registries are handed over in
 * `attach` - src/core imports content with `import type` only, so it has no runtime
 * dependency on it (same pattern as `CutsceneService.attach(stage, library)`).
 */
import type { Ending, EndingId } from '@/content/endings';
import type { ActId } from '@/content/story';
import type { Act, FlowApi } from '@/content/story/types';
import type { EventBus } from '@/core/events/EventBus';
import type { GameEvents } from '@/core/events/events';
import type { SceneDriver } from '@/core/flow/SceneDriver';
import type { SimulationService } from '@/core/simulation/SimulationService';
import { isSimulationSnapshot } from '@/core/simulation/types';
import type { GameSave, GameState } from '@/core/state/GameState';
import type { SaveService } from '@/core/state/SaveService';

/** Act id used when a location is opened outside the story (`?location=<id>`). */
const NO_ACT = 'debug';
/** Text of the toast shown when a checkpoint is saved. */
const CHECKPOINT_TOAST = 'Checkpoint';

/** The story content `FlowService` runs; main.ts passes the registries from src/content. */
export interface FlowContent {
  /** Acts by id (src/content/story). */
  acts: Readonly<Record<string, Act>>;
  /** Act ids in story order: "New game" starts the first. */
  actOrder: readonly string[];
  /** End screens by id (src/content/endings.ts). */
  endings: Readonly<Record<string, Ending>>;
}

/**
 * The game as a whole: new game, continue, acts with their title cards, moving between
 * locations, checkpoints (autosave), deaths and endings, back to the main menu. It updates
 * `GameState.current` and asks the attached `SceneDriver` to move the scenes.
 *
 * "Continue" in the menu and "Retry from checkpoint" after a death are one mechanism: both load
 * the last checkpoint (`continueGame`).
 */
export class FlowService {
  private driver: SceneDriver | null = null;
  private content: FlowContent = { acts: {}, actOrder: [], endings: {} };
  private transition: Promise<void> | null = null;
  /** Act of the running game; null outside the story (menu, `?location=`). */
  private actId: string | null = null;
  /**
   * Grows whenever the player leaves what was running (new game, continue, another act, an
   * ending, the menu): an act script started earlier sees the change and its calls are ignored.
   */
  private session = 0;

  constructor(
    private readonly state: GameState,
    private readonly save: SaveService,
    private readonly events: EventBus<GameEvents>,
    private readonly simulation: SimulationService,
  ) {}

  /**
   * Connects the scenes and the story content; main.ts calls this once, right after creating
   * the Phaser game: `services.flow.attach(new PhaserSceneDriver(game), { acts, actOrder, endings })`.
   */
  attach(driver: SceneDriver, content: FlowContent): void {
    this.driver = driver;
    this.content = content;
  }

  /** Whether a `goTo` is running (from fade-out to the end of the fade-in). */
  get isTransitioning(): boolean {
    return this.transition !== null;
  }

  /** Starts the story over: deletes the save, clears the state, starts the first act. */
  newGame(): Promise<void> {
    this.beginSession();
    this.save.clear();
    this.state.reset();
    this.actId = null;
    const first = this.content.actOrder[0];
    if (first === undefined) return Promise.reject(new Error('FlowService.newGame: no acts'));
    return this.startAct(first as ActId);
  }

  /**
   * Loads the last checkpoint: flags, act, position and the ship simulation if the save has
   * one, and opens its location. Without a usable save it only warns (the menu disables
   * "Continue" then).
   */
  continueGame(): Promise<void> {
    const save = this.save.load();
    if (!save) {
      console.warn('FlowService.continueGame: no save to continue from');
      return Promise.resolve();
    }
    this.beginSession();
    this.state.loadFrom(save);
    this.actId = save.actId;
    if (save.simulation !== undefined) {
      if (isSimulationSnapshot(save.simulation)) this.simulation.start(save.simulation);
      else console.warn('FlowService.continueGame: the saved simulation is unreadable, dropped');
    }
    return this.goTo(save.locationId, save.spawn);
  }

  /** After a death: back to the last checkpoint (`continueGame`), or a new game without one. */
  retry(): Promise<void> {
    // Extension point: to keep some flags across a restart (e.g. "already died once"), read
    // them from this.state.flags here and set them again after continueGame's loadFrom.
    return this.save.hasSave() ? this.continueGame() : this.newGame();
  }

  /**
   * Starts act `id`: its title card on a black screen, then its `start` script (which goes to
   * a location and saves a checkpoint). Resolves when the script has finished.
   */
  async startAct(id: ActId): Promise<void> {
    const act = Object.hasOwn(this.content.acts, id) ? this.content.acts[id] : undefined;
    if (!act) throw new Error(`FlowService.startAct: unknown act "${id}"`);
    const driver = this.requireDriver();
    const session = this.beginSession();
    this.actId = id;
    if (this.state.current) this.state.current = { ...this.state.current, actId: id };
    await driver.showActTitle(act.title);
    if (session !== this.session) return;
    await act.start(this.apiFor(session));
  }

  /** Starts the act after the current one in story order; warns if this is the last. */
  nextAct(): Promise<void> {
    const order = this.content.actOrder;
    const index = this.actId === null ? -1 : order.indexOf(this.actId);
    const next = index >= 0 ? order[index + 1] : undefined;
    if (next === undefined) {
      console.warn(`FlowService.nextAct: no act after "${this.actId ?? 'none'}"`);
      return Promise.resolve();
    }
    return this.startAct(next as ActId);
  }

  /**
   * Moves the hero to spawn `spawn` of location `location`: sets `state.current` (with the
   * current act) and runs the driver's transition. A call made while a transition runs is
   * ignored and gets the running transition's promise - a door the hero still touches must not
   * fire twice.
   */
  goTo(location: string, spawn: string): Promise<void> {
    if (this.transition) {
      const target = this.state.current;
      if (target?.locationId !== location || target.spawn !== spawn) {
        console.warn(`FlowService.goTo(${location}, ${spawn}) ignored: a transition is running`);
      }
      return this.transition;
    }
    const driver = this.requireDriver();
    this.state.current = {
      actId: this.actId ?? this.state.current?.actId ?? NO_ACT,
      locationId: location,
      spawn,
    };
    const transition: Promise<void> = driver.goTo(location, spawn).finally(() => {
      if (this.transition === transition) this.transition = null;
    });
    this.transition = transition;
    return transition;
  }

  /**
   * Saves the game where the hero is now, with the ship simulation if one is started,
   * emits `checkpointSaved` and shows a toast.
   * Needs a position: call it after `goTo` has resolved. A storage error (quota, private mode)
   * only warns - the game goes on unsaved.
   */
  checkpoint(): void {
    if (!this.state.current) {
      console.warn('FlowService.checkpoint: no game in progress, nothing saved');
      return;
    }
    this.state.simulation = this.simulation.snapshot() ?? undefined;
    let save: GameSave;
    try {
      save = this.save.save(this.state);
    } catch (error) {
      console.warn('FlowService.checkpoint: the game could not be saved', error);
      return;
    }
    this.events.emit('checkpointSaved', { save });
    this.requireDriver().toast(CHECKPOINT_TOAST);
  }

  /** The hero died or the mission failed: emits `gameOver` and shows the end screen of `reason`. */
  gameOver(reason: EndingId): void {
    this.events.emit('gameOver', { reason });
    this.showEnding(reason);
  }

  /** The story is over: shows the end screen of ending `ending`. */
  finish(ending: EndingId): void {
    this.showEnding(ending);
  }

  /** Leaves the game for the main menu; the game in progress is dropped (the save stays). */
  toMainMenu(): void {
    this.beginSession();
    this.actId = null;
    this.state.reset();
    this.requireDriver().toMainMenu();
  }

  private showEnding(id: string): void {
    if (!Object.hasOwn(this.content.endings, id)) {
      console.warn(`FlowService: unknown ending "${id}" (src/content/endings.ts)`);
    }
    this.beginSession();
    this.requireDriver().showEnding(id);
  }

  /**
   * Starts a new session: act scripts of the old one go quiet, a transition that will never
   * finish (its scene was replaced) no longer blocks `goTo`, and the ship simulation stops
   * (`continueGame` restores it from the save, an act starts its own).
   */
  private beginSession(): number {
    this.session += 1;
    this.transition = null;
    this.simulation.stop();
    return this.session;
  }

  /** The `FlowApi` an act script gets: its calls work only while `session` is current. */
  private apiFor(session: number): FlowApi {
    const live = () => session === this.session;
    return {
      goTo: (location, spawn) => (live() ? this.goTo(location, spawn) : Promise.resolve()),
      startSimulation: () => {
        if (live()) this.simulation.start();
      },
      checkpoint: () => {
        if (live()) this.checkpoint();
      },
      finish: (ending) => {
        if (live()) this.finish(ending);
      },
      gameOver: (reason) => {
        if (live()) this.gameOver(reason);
      },
    };
  }

  private requireDriver(): SceneDriver {
    if (!this.driver) throw new Error('FlowService: no SceneDriver attached (see main.ts)');
    return this.driver;
  }
}
