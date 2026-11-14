/**
 * The story flow. No Phaser here: scenes move through the attached `SceneDriver`
 * (src/scenes/PhaserSceneDriver.ts), and the act and ending registries are handed over in
 * `attach` - src/core imports content with `import type` only, so it has no runtime
 * dependency on it (same pattern as `CutsceneService.attach(stage, library)`).
 */
import type { CutsceneId } from '@/content/cutscenes';
import type { Ending, EndingId } from '@/content/endings';
import type { ActId } from '@/content/story';
import type { Act, FlowApi } from '@/content/story/types';
import type { EventBus } from '@/core/events/EventBus';
import type { CutsceneService } from '@/core/cutscene/CutsceneService';
import type { GameEvents } from '@/core/events/events';
import { RUN_FLAGS } from '@/core/flow/runFlags';
import type { SceneDriver } from '@/core/flow/SceneDriver';
import type { SimulationService } from '@/core/simulation/SimulationService';
import type { GameSave, GameState } from '@/core/state/GameState';
import type { SaveService } from '@/core/state/SaveService';
import { resolveText } from '@/core/text/format';
import { type FlightSummary, summarizeFlight } from '@/core/voyage/flightSummary';
import { newSeed, SEED_LIMIT } from '@/core/voyage/random';
import type { VoyageOutcome } from '@/core/voyage/Voyage';

/** Act id used when a location is opened outside the story (`?location=<id>`). */
const NO_ACT = 'debug';
/** Text of the toast shown when a checkpoint is saved. */
const CHECKPOINT_TOAST = 'Checkpoint';
/**
 * Real time the navigation panel shows a lost voyage (LOST, the cause) before the death loop
 * takes the player away, ms (GDD `loop-scene-format` A: at most 2 s from the loss to the first
 * debrief line, with the fade and `RITUAL_MS` in src/content/cutscenes/debrief.ts).
 * OWNER: design
 */
const LOSS_BEAT_MS = 1000;
/**
 * Real time the navigation panel shows a landing (LANDED) before the landing's title card
 * takes over, ms. OWNER: design
 */
const LANDING_BEAT_MS = 1000;
/** Flag prefixes of the current voyage's state, deleted at every start of a voyage (D17). */
const VOYAGE_FLAG_PREFIXES = ['voyage.', 'event.'] as const;

/** The story content `FlowService` runs; main.ts passes the registries from src/content. */
export interface FlowContent {
  /** Acts by id (src/content/story). */
  acts: Readonly<Record<string, Act>>;
  /** Act ids in story order: "New game" starts the first. */
  actOrder: readonly string[];
  /** End screens by id (src/content/endings.ts). */
  endings: Readonly<Record<string, Ending>>;
  /** Where a lost voyage takes the player (`die`); without it `die` only warns. */
  debrief?: DebriefPlace;
  /**
   * The act a landing (Stop at a gate) starts: the colony, act 3 (plan S11). Without it a
   * landing only warns.
   */
  landingAct?: string;
}

/**
 * Where a death or an abort takes the player (plan D18, GDD `loop-return-point` A): act `act`
 * (no title card), spawn `spawn` of `location`, and cutscene `cutscene` (the scientists'
 * debrief, which ends with the hero at the hatch). src/content/story/index.ts sets it.
 */
export interface DebriefPlace {
  act: string;
  location: string;
  spawn: string;
  cutscene: string;
  /** Spawn at the hatch, where "Fly again" from the end screen puts the hero (`flyAgain`). */
  hatch: string;
}

/** Options of `FlowService.goTo`. */
export interface GoToOptions {
  /**
   * The screen stays black after the new location loads; whoever asked fades it in (a
   * cutscene's `fadeIn`; `die` makes sure with `SceneDriver.reveal`).
   */
  dark?: boolean;
}

/**
 * The game as a whole: new game, continue, acts with their title cards, moving between
 * locations, checkpoints (autosave), the death loop (`die`: the voyage lost, the scientists'
 * debrief, back to the warehouse with the cargo kept) and endings, back to the main menu. It
 * updates `GameState.current` and asks the attached `SceneDriver` to move the scenes.
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
  /** Seed every voyage takes (`?seed=`, `fixSeed`), or null for a new one per voyage. */
  private fixedSeed: number | null = null;
  /** Summary of the last voyage lost (`die`) in this page's life, or null. */
  private lastLost: FlightSummary | null = null;

  constructor(
    private readonly state: GameState,
    private readonly save: SaveService,
    private readonly events: EventBus<GameEvents>,
    private readonly simulation: SimulationService,
    private readonly cutscenes: CutsceneService,
  ) {
    events.on('voyageEnded', ({ outcome }) => this.onVoyageEnded(outcome));
  }

  /**
   * Connects the scenes and the story content; main.ts calls this once, right after creating
   * the Phaser game: `services.flow.attach(new PhaserSceneDriver(game), { acts, actOrder,
   * endings, debrief, landingAct })`.
   */
  attach(driver: SceneDriver, content: FlowContent): void {
    this.driver = driver;
    this.content = content;
  }

  /**
   * Fixes the seed of the voyage's events (`?seed=<n>` in src/main.ts, plan D10): every voyage
   * started from now on rolls with it, a fresh start included. null: a new seed per fresh start.
   */
  fixSeed(seed: number | null): void {
    this.fixedSeed = seed === null ? null : Math.abs(Math.floor(seed)) % SEED_LIMIT;
  }

  /** Summary of the last voyage lost (`die`) since the page loaded, or null (debug, smoke). */
  get lastFlight(): FlightSummary | null {
    return this.lastLost;
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
   * Loads the last checkpoint: flags, act and position, and opens its location. A save taken
   * during a voyage (act 2) starts the voyage again from its start with the same cargo and
   * `run.seed` (plan D17: the save holds no simulation). Without a usable save it only warns
   * (the menu disables "Continue" then).
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
    if (save.voyage) this.startVoyage(true);
    return this.goTo(save.locationId, save.spawn);
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
    await driver.showActTitle(resolveText(act.title, this.state));
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
   * current act) and runs the driver's transition (`options.dark`: the screen stays black). A
   * call made while a transition runs is ignored and gets the running transition's promise - a
   * door the hero still touches must not fire twice.
   */
  goTo(location: string, spawn: string, options: GoToOptions = {}): Promise<void> {
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
    const transition: Promise<void> = driver.goTo(location, spawn, options).finally(() => {
      if (this.transition === transition) this.transition = null;
    });
    this.transition = transition;
    return transition;
  }

  /**
   * Saves the game where the hero is now (with the mark that a voyage is under way - started
   * and not ended, see `continueGame`), emits `checkpointSaved` and shows a toast.
   * Needs a position: call it after `goTo` has resolved. A storage error (quota, private mode)
   * only warns - the game goes on unsaved.
   */
  checkpoint(): void {
    if (!this.state.current) {
      console.warn('FlowService.checkpoint: no game in progress, nothing saved');
      return;
    }
    this.state.voyage = this.simulation.isUnderWay;
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

  /**
   * The voyage is lost - the crew died of `cause` (a `DeathCause`; called on `voyageEnded`), or
   * the player gave up (`abort`, the pause menu) - and the death loop runs (plan D18, GDD D7;
   * after a death the panel first shows the loss for a moment, `onVoyageEnded`):
   * 1. the `FlightSummary` is taken while the voyage still exists;
   * 2. the simulation stops, every hold is reset, a new session begins (the act 2 script and
   *    its holds do not outlive the death; a running cutscene is cancelled);
   * 3. the `run.*` flags (`RUN_FLAGS`): attempt +1, last cause, gate, day, best gate; then
   *    `flightLost`;
   * 4. `goTo` the debrief place (`FlowContent.debrief`: the warehouse's `debrief` spawn) in its
   *    act (act 1), no title card, the screen left black;
   * 5. `checkpoint()` there (the save holds no voyage: Continue comes back to the warehouse);
   * 6. the debrief cutscene: the scientists explain what happened, then
   * 7. the hero stands at the hatch, the cargo still in its bays (`cargo.*`, `advice.*` and
   *    `run.*` flags are kept; `voyage.*` and `event.*` go at the next voyage's start).
   * Resolves when the cutscene has ended (or the player has left meanwhile).
   */
  die(cause: string): Promise<void> {
    return this.deathLoop(this.summarize(cause));
  }

  /** The `FlightSummary` of the voyage now (step 1 of `die`). */
  private summarize(cause: string): FlightSummary {
    const { simulation } = this;
    return summarizeFlight(
      simulation.voyage,
      cause,
      simulation.content?.gates ?? [],
      simulation.system,
    );
  }

  /** Steps 2-7 of `die` for a summary taken already. */
  private async deathLoop(summary: FlightSummary): Promise<void> {
    const session = this.beginSession();
    this.recordRun(summary);
    this.lastLost = summary;
    this.events.emit('flightLost', { summary: { ...summary } });
    const debrief = this.content.debrief;
    if (!debrief) {
      console.warn('FlowService.die: no debrief place attached (see main.ts)');
      return;
    }
    if (!(await this.backToWarehouse(session, debrief, debrief.spawn, { dark: true }))) return;
    try {
      await this.cutscenes.play(debrief.cutscene as CutsceneId);
    } catch (error) {
      console.error('FlowService.die: the debrief cutscene failed', error);
    }
    // The cutscene fades in itself; if it failed, the screen must not stay black.
    if (session === this.session) await this.requireDriver().reveal();
  }

  /**
   * Steps 4-5 of `die`, shared with `flyAgain`: the hero goes to spawn `spawn` of the debrief
   * place's location in its act (no title card) and a checkpoint is saved there (no voyage
   * in it). The flags stay as they are: the cargo (`cargo.*`), `advice.*` and `run.*` are kept.
   * Resolves false when the player left meanwhile (another session).
   */
  private async backToWarehouse(
    session: number,
    place: DebriefPlace,
    spawn: string,
    options: GoToOptions = {},
  ): Promise<boolean> {
    this.actId = place.act;
    await this.goTo(place.location, spawn, options);
    if (session !== this.session) return false;
    this.checkpoint();
    return true;
  }

  /**
   * "Fly again" on the end screen (plan D19): back to the warehouse at the hatch (the debrief
   * place's `hatch` spawn, act 1, no title card, no debrief) with the cargo still in the bays
   * and the `run.*` flags kept (attempt +1, best gate raised by the landing); a checkpoint is
   * saved there. The landed voyage's `voyage.*` flags go at the next voyage's start.
   */
  async flyAgain(): Promise<void> {
    const debrief = this.content.debrief;
    if (!debrief) {
      console.warn('FlowService.flyAgain: no debrief place attached (see main.ts)');
      return;
    }
    const session = this.beginSession();
    const flags = this.state.flags;
    const attempt = flags.get(RUN_FLAGS.attempt);
    const best = flags.get(RUN_FLAGS.bestGate);
    const landed = flags.get('voyage.stopGate');
    flags.set(RUN_FLAGS.attempt, (typeof attempt === 'number' ? attempt : 1) + 1);
    if (typeof landed === 'number') {
      flags.set(RUN_FLAGS.bestGate, Math.max(landed, typeof best === 'number' ? best : -1));
    }
    await this.backToWarehouse(session, debrief, debrief.hatch);
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

  /**
   * What the voyage's end leads to, unless the player left meanwhile (main menu: a new
   * session). A landing (Stop at a gate): the panel shows LANDED for `LANDING_BEAT_MS`, then
   * the landing act starts (`FlowContent.landingAct`: the colony, act 3; its title card reads
   * "<Body> · day N" from the `voyage.*` flags). A death: the summary is taken at once, the
   * panel shows the loss for `LOSS_BEAT_MS`, then the death loop runs (`die`).
   */
  private onVoyageEnded(outcome: VoyageOutcome): void {
    if (outcome.kind === 'landed') {
      const act = this.content.landingAct;
      if (act === undefined) {
        console.warn('FlowService: no landing act attached (see main.ts)');
        return;
      }
      const session = this.session;
      setTimeout(() => {
        if (session === this.session) void this.startAct(act as ActId);
      }, LANDING_BEAT_MS);
      return;
    }
    const summary = this.summarize(outcome.cause);
    const session = this.session;
    setTimeout(() => {
      if (session === this.session) void this.deathLoop(summary);
    }, LOSS_BEAT_MS);
  }

  /** The `run.*` flags after a lost voyage (plan D17: kept until New game). */
  private recordRun(summary: FlightSummary): void {
    const flags = this.state.flags;
    const attempt = flags.get(RUN_FLAGS.attempt);
    const best = flags.get(RUN_FLAGS.bestGate);
    flags.set(RUN_FLAGS.attempt, (typeof attempt === 'number' ? attempt : 1) + 1);
    flags.set(RUN_FLAGS.lastCause, summary.cause);
    flags.set(RUN_FLAGS.lastGate, summary.gate);
    flags.set(RUN_FLAGS.bestGate, Math.max(summary.gate, typeof best === 'number' ? best : -1));
    flags.set(RUN_FLAGS.lastDay, summary.day);
    flags.set(RUN_FLAGS.lastGateName, summary.gateName);
    flags.set(RUN_FLAGS.lastNextName, summary.nextName);
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
   * finish (its scene was replaced) no longer blocks `goTo`, the running and queued cutscenes
   * are cancelled, and the voyage stops with its holds reset (an act or `continueGame` starts
   * a new one).
   */
  private beginSession(): number {
    this.session += 1;
    this.transition = null;
    this.cutscenes.cancel();
    this.simulation.stop();
    this.simulation.resetHolds();
    return this.session;
  }

  /**
   * Starts the voyage of act 2 (plan D17): deletes the flags of the last voyage (`voyage.*`,
   * `event.*`), takes the seed - the fixed one (`?seed=`), else the saved `run.seed` when
   * `keepSeed` (Continue: the same rolls), else a new one - stores it in `run.seed`, and starts
   * the simulation with the cargo of the `cargo.<id>` flags.
   */
  private startVoyage(keepSeed: boolean): void {
    const flags = this.state.flags;
    for (const prefix of VOYAGE_FLAG_PREFIXES) flags.deletePrefix(prefix);
    const saved = flags.get(RUN_FLAGS.seed);
    const seed = this.fixedSeed ?? (keepSeed && typeof saved === 'number' ? saved : newSeed());
    flags.set(RUN_FLAGS.seed, seed);
    this.simulation.start(seed);
  }

  /** The `FlowApi` an act script gets: its calls work only while `session` is current. */
  private apiFor(session: number): FlowApi {
    const live = () => session === this.session;
    return {
      goTo: (location, spawn) => (live() ? this.goTo(location, spawn) : Promise.resolve()),
      startVoyage: () => {
        if (live()) this.startVoyage(false);
      },
      checkpoint: () => {
        if (live()) this.checkpoint();
      },
      finish: (ending) => {
        if (live()) this.finish(ending);
      },
    };
  }

  private requireDriver(): SceneDriver {
    if (!this.driver) throw new Error('FlowService: no SceneDriver attached (see main.ts)');
    return this.driver;
  }
}
