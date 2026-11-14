/**
 * The story model: the game is a list of acts (./index.ts); each act shows its title
 * and then runs a short script that puts the hero somewhere and saves a checkpoint. From there
 * the story goes on in the world: doors, interactables, dialogues and cutscenes call
 * `services.flow` (`startAct`, `finish`). A lost voyage runs the death loop
 * (`services.flow.die`, `debrief` in ./index.ts). How to write one: docs/HOWTO-story.md.
 */
import type { CutsceneId } from '@/content/cutscenes';
import type { EndingId } from '@/content/endings';
import type { LocationId } from '@/content/locations';
import type { ActId } from '@/content/story';
import type { StateText } from '@/core/text/format';

/**
 * What an act's script may ask the story flow to do (a part of `FlowService`). Calls made after
 * the player has left the act (main menu, an ending, another act started) are ignored, so a
 * script never pulls the player back from the menu.
 */
export interface FlowApi {
  /** Moves the hero to spawn `spawn` of `location`; resolves when the new location is shown. */
  goTo(location: LocationId, spawn: string): Promise<void>;
  /**
   * Starts the voyage of this act from its start (plan D17): the cargo of the `cargo.<id>`
   * flags, flags `voyage.*` and `event.*` deleted, a new seed for the events in `run.seed`
   * (`?seed=` fixes it). It runs until the player leaves the act. Call after `goTo`, before
   * `checkpoint`: "Continue" from that checkpoint starts it again with the same seed.
   */
  startVoyage(): void;
  /** Saves the game here (localStorage) and shows a "Checkpoint" toast. Call after `goTo`. */
  checkpoint(): void;
  /** Ends the game with ending `ending` (the end screen with its title and text). */
  finish(ending: EndingId): void;
}

/**
 * One act of the story. The registry key in ./index.ts is its id (`ActId`), used in saves, in
 * `?act=<id>` and in door bindings `{ kind: 'door', act: 'act2' }`.
 */
export interface Act {
  /**
   * Title card shown on a black screen before `start` (FlowService.startAct); a function of
   * the state is read when the card shows (act 3: "<Body> · day N" of the landing).
   */
  title: StateText;
  /**
   * Runs after the title, while the screen is still black: must end with `flow.goTo` (the
   * screen fades in on the new location) or with `flow.finish`.
   */
  start(flow: FlowApi): Promise<void>;
}

/**
 * Where a lost voyage takes the player (plan D18, `FlowService.die`): act `act` without its
 * title card, spawn `spawn` of `location`, then cutscene `cutscene` (the scientists' debrief).
 */
export interface Debrief {
  act: ActId;
  location: LocationId;
  spawn: string;
  cutscene: CutsceneId;
  /** Spawn at the hatch: where "Fly again" on the end screen puts the hero. */
  hatch: string;
}
