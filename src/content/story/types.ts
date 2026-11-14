/**
 * The story model: the game is a list of acts (./index.ts); each act shows its title
 * and then runs a short script that puts the hero somewhere and saves a checkpoint. From there
 * the story goes on in the world: doors, interactables, dialogues and cutscenes call
 * `services.flow` (`startAct`, `gameOver`, `finish`). How to write one: docs/HOWTO-story.md.
 */
import type { EndingId } from '@/content/endings';
import type { LocationId } from '@/content/locations';

/**
 * What an act's script may ask the story flow to do (a part of `FlowService`). Calls made after
 * the player has left the act (main menu, an ending, another act started) are ignored, so a
 * script never pulls the player back from the menu.
 */
export interface FlowApi {
  /** Moves the hero to spawn `spawn` of `location`; resolves when the new location is shown. */
  goTo(location: LocationId, spawn: string): Promise<void>;
  /**
   * Starts the ship simulation of this act from the start of the voyage
   * (src/content/simulation); it runs until the player leaves the act. Call after `goTo`,
   * before `checkpoint`, so the save holds it.
   */
  startSimulation(): void;
  /** Saves the game here (localStorage) and shows a "Checkpoint" toast. Call after `goTo`. */
  checkpoint(): void;
  /** Ends the game with ending `ending` (the end screen with its title and text). */
  finish(ending: EndingId): void;
  /** The hero died or the mission failed: the end screen of `reason`, with "Retry". */
  gameOver(reason: EndingId): void;
}

/**
 * One act of the story. The registry key in ./index.ts is its id (`ActId`), used in saves, in
 * `?act=<id>` and in door bindings `{ kind: 'door', act: 'act2' }`.
 */
export interface Act {
  /** Title card shown on a black screen before `start` (FlowService.startAct). */
  title: string;
  /**
   * Runs after the title, while the screen is still black: must end with `flow.goTo` (the
   * screen fades in on the new location) or with `flow.finish`/`flow.gameOver`.
   */
  start(flow: FlowApi): Promise<void>;
}
