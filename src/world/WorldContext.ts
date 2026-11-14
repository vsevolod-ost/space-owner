import type { StationAlarmService } from '@/core/alarm/StationAlarmService';
import type { CutsceneService } from '@/core/cutscene/CutsceneService';
import type { FlowService } from '@/core/flow/FlowService';
import type { Controls } from '@/core/input/controls';
import type { GameState } from '@/core/state/GameState';
import type { VoyageService } from '@/core/voyage/VoyageService';
import type { UiScene } from '@/scenes/UiScene';
import type { WorldScene } from '@/scenes/WorldScene';

/** What interactable and trigger scripts of a location get (`run: (ctx) => ...`). */
export interface WorldContext {
  /** The running world scene (hero, NPCs, camera). */
  scene: WorldScene;
  /** Story flags and the current position: `ctx.state.flags.set('engineer.met', true)`. */
  state: GameState;
  /** The UI layer above the world: `ctx.ui.toast('Locked.')`. */
  ui: UiScene;
  /** The world's input: `lock(reason)` stops the hero (dialogue, cutscene), `unlock` frees it. */
  controls: Controls;
  /** Cutscenes: `run: (ctx) => ctx.cutscenes.play('warehouse-arrival')` (same as `services.cutscenes`). */
  cutscenes: CutsceneService;
  /**
   * The story flow (same as `services.flow`): `ctx.flow.startAct('act2')`,
   * `ctx.flow.checkpoint()`, `ctx.flow.finish('colony-mars')`.
   */
  flow: FlowService;
  /**
   * The voyage's data (same as `services.voyage`): the cargo registry and what is aboard -
   * `ctx.voyage.count('oxygen')`, `ctx.voyage.item('fuel').label`.
   */
  voyage: VoyageService;
  /**
   * The station alarm of act 2 (same as `services.stationAlarm`): `ctx.stationAlarm.alarm` is
   * the event to answer now and its deck station, or null.
   */
  stationAlarm: StationAlarmService;
}
