import type { CutsceneService } from '@/core/cutscene/CutsceneService';
import type { FlowService } from '@/core/flow/FlowService';
import type { Controls } from '@/core/input/controls';
import type { GameState } from '@/core/state/GameState';
import type { UiScene } from '@/scenes/UiScene';
import type { WorldScene } from '@/scenes/WorldScene';

/** What interactable and trigger scripts of a location get (`run: (ctx) => ...`). */
export interface WorldContext {
  /** The running world scene (hero, NPCs, camera). */
  scene: WorldScene;
  /** Story flags and the current position: `ctx.state.flags.set('metCaptain', true)`. */
  state: GameState;
  /** The UI layer above the world: `ctx.ui.toast('A dusty terminal.')`. */
  ui: UiScene;
  /** The world's input: `lock(reason)` stops the hero (dialogue, cutscene), `unlock` frees it. */
  controls: Controls;
  /** Cutscenes: `run: (ctx) => ctx.cutscenes.play('demo-arrival')` (same as `services.cutscenes`). */
  cutscenes: CutsceneService;
  /**
   * The story flow (same as `services.flow`): `ctx.flow.gameOver('death-generic')`,
   * `ctx.flow.startAct('act2')`, `ctx.flow.checkpoint()`.
   */
  flow: FlowService;
}
