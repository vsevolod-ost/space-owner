/**
 * The dialogue model: a dialogue is a typed object of nodes; conditions and
 * effects are plain functions over the `GameState`. No Phaser here - the window that shows a
 * dialogue is src/ui/DialogueBox.ts. How to write one: docs/HOWTO-dialogue.md.
 *
 * `CharacterId` and `ImageKey` come from src/content and src/assets. src/core may import them
 * with `import type` only: types are erased at build time, so core keeps no runtime dependency
 * on content or assets. Never import a value from there into src/core.
 */
import type { ImageKey } from '@/assets';
import type { CharacterId } from '@/content/characters';
import type { GameState } from '@/core/state/GameState';

/** Who says a line: a registered character, or `'narrator'` (no name, no portrait). */
export type Speaker = CharacterId | 'narrator';

/** A condition over the game state: `(s) => s.flags.get('engineer.met') === true`. */
export type DialogueCondition = (state: GameState) => boolean;

/** A change to the game state: `(s) => s.flags.set('engineer.met', true)`. */
export type DialogueEffect = (state: GameState) => void;

/** One option the player can pick at a node with `choices`. */
export interface Choice<N extends string = string> {
  /** What the option says. */
  text: string;
  /** Node to go to; default: the node's own `next`, and without one the dialogue ends. */
  next?: N;
  /** The option is shown only while this is true; default: always shown. */
  when?: DialogueCondition;
  /** Runs once when the player picks the option, before moving on. */
  effect?: DialogueEffect;
}

/** One line of a dialogue, optionally followed by choices. */
export interface DialogueNode<N extends string = string> {
  /** Who speaks; default `'narrator'`. */
  speaker?: Speaker;
  /** Portrait to show; default: the speaker's portrait from src/content/characters.ts. */
  portrait?: ImageKey;
  /** The line itself, in English like every string in the game. */
  text: string;
  /**
   * Node after this one: an id, or a function of the state that returns one. No `next` (and
   * no choices) ends the dialogue.
   */
  next?: N | ((state: GameState) => N);
  /** Options shown after the line. Hidden ones (`when` false) are left out. */
  choices?: readonly Choice<N>[];
  /**
   * The node is shown only while this is true; otherwise it is skipped as if the player had
   * read it: the dialogue goes on to `next` (and ends without one). Its `effect` does not run.
   */
  when?: DialogueCondition;
  /** Runs once each time the node is entered (not when it is skipped). */
  effect?: DialogueEffect;
}

/**
 * A whole dialogue: the node it starts at and its nodes by id. Its id is its key in the
 * registry src/content/dialogues/index.ts (`DialogueId`). `N` is the union of node ids; write
 * dialogues with `defineDialogue` so a misspelt `next` or `start` is a compile error.
 */
export interface Dialogue<N extends string = string> {
  /** Id of the first node. */
  start: N;
  /** Nodes by id. */
  nodes: Readonly<Record<N, DialogueNode<N>>>;
}

/**
 * Declares a dialogue with checked node ids: the node ids are taken from the keys of `nodes`,
 * and `start`, every `next` and every choice's `next` must be one of them.
 *
 * ```ts
 * export const demoEngineer = defineDialogue({
 *   start: 'hello',
 *   nodes: { hello: { speaker: 'engineer', text: 'Hi!' } },
 * });
 * ```
 */
export function defineDialogue<N extends string>(dialogue: {
  start: NoInfer<N>;
  nodes: Readonly<Record<N, DialogueNode<NoInfer<N>>>>;
}): Dialogue<N> {
  return dialogue;
}
