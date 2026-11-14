import type { ImageKey } from '@/assets';
import type { Choice, Dialogue, DialogueNode, Speaker } from '@/core/dialogue/types';
import type { GameState } from '@/core/state/GameState';
import { resolveText } from '@/core/text/format';

/** A line to show; `advance()` moves on. */
export interface DialogueLine {
  kind: 'line';
  /** Id of the node being shown. */
  nodeId: string;
  speaker: Speaker;
  /** Portrait set on the node, if any (the window falls back to the speaker's). */
  portrait?: ImageKey;
  text: string;
}

/** A line followed by options; `choose(index)` picks one of `choices`. */
export interface DialogueChoices extends Omit<DialogueLine, 'kind'> {
  kind: 'choices';
  /** Texts of the visible options, in order; `choose` takes an index into this list. */
  choices: string[];
}

/** The dialogue is over. */
export interface DialogueEnd {
  kind: 'end';
}

/** What the runner is at: `DialogueRunner.current()`. */
export type DialogueStep = DialogueLine | DialogueChoices | DialogueEnd;

/**
 * Walks a dialogue (plain TS, no Phaser; the window is src/ui/DialogueBox.ts). Entering a node
 * checks its `when`: false skips it along `next`, true runs its `effect` once. Choices whose
 * `when` is false are hidden; a node whose choices are all hidden is shown as a plain line.
 * Texts that are functions of the state are read once on entering the node, after its `effect`.
 *
 * ```ts
 * const runner = new DialogueRunner(services.state);
 * runner.start(dialogues['engineer-advice']);
 * runner.current(); // { kind: 'line', nodeId: 'greeting', speaker: 'engineer', text: ... }
 * runner.advance(); // or runner.choose(1) at a 'choices' step
 * ```
 */
export class DialogueRunner {
  private dialogue: Dialogue | null = null;
  private nodeId: string | null = null;
  /** Choices of the current node that passed their `when`, fixed when the node was entered. */
  private visible: Choice[] = [];
  /** Text of the current node and of its visible choices, read when the node was entered. */
  private texts: { line: string; choices: string[] } = { line: '', choices: [] };

  constructor(private readonly state: GameState) {}

  /** Starts `dialogue` from its `start` node (skipping nodes whose `when` is false). */
  start(dialogue: Dialogue): DialogueStep {
    this.dialogue = dialogue;
    this.enter(dialogue.start);
    return this.current();
  }

  /** Where the dialogue is now. Before `start` and after the last node: `{ kind: 'end' }`. */
  current(): DialogueStep {
    const node = this.node();
    if (!node || this.nodeId === null) return { kind: 'end' };
    const line = {
      nodeId: this.nodeId,
      speaker: node.speaker ?? 'narrator',
      text: this.texts.line,
      ...(node.portrait ? { portrait: node.portrait } : {}),
    };
    if (this.visible.length === 0) return { kind: 'line', ...line };
    return { kind: 'choices', ...line, choices: this.texts.choices };
  }

  /** Moves past a line to the node's `next` (or to the end). Throws at a `choices` step. */
  advance(): DialogueStep {
    const node = this.node();
    if (!node) return this.current();
    if (this.visible.length > 0) {
      throw new Error(`DialogueRunner.advance: node "${this.nodeId}" waits for a choice`);
    }
    this.enter(this.nextOf(node));
    return this.current();
  }

  /**
   * Picks option `index` of the current `choices` step: runs its `effect`, then goes to its
   * `next` (default: the node's `next`; neither ends the dialogue).
   */
  choose(index: number): DialogueStep {
    const node = this.node();
    const choice = this.visible[index];
    if (!node || !choice) {
      throw new Error(`DialogueRunner.choose(${index}): no such choice at "${this.nodeId}"`);
    }
    choice.effect?.(this.state);
    this.enter(choice.next ?? this.nextOf(node));
    return this.current();
  }

  private node(): DialogueNode | null {
    if (!this.dialogue || this.nodeId === null) return null;
    return this.dialogue.nodes[this.nodeId] ?? null;
  }

  private nextOf(node: DialogueNode): string | undefined {
    return typeof node.next === 'function' ? node.next(this.state) : node.next;
  }

  /** Enters `id`, skipping nodes whose `when` is false; undefined ends the dialogue. */
  private enter(id: string | undefined): void {
    const dialogue = this.dialogue;
    this.visible = [];
    this.nodeId = null;
    if (!dialogue) return;
    // Skipping can only visit every node once before it must be looping.
    let budget = Object.keys(dialogue.nodes).length + 1;
    let nextId = id;
    while (nextId !== undefined) {
      const node = dialogue.nodes[nextId];
      if (!node) throw new Error(`Dialogue has no node "${nextId}"`);
      if (!node.when || node.when(this.state)) {
        this.nodeId = nextId;
        node.effect?.(this.state);
        this.visible = (node.choices ?? []).filter((c) => !c.when || c.when(this.state));
        this.texts = {
          line: resolveText(node.text, this.state),
          choices: this.visible.map((choice) => resolveText(choice.text, this.state)),
        };
        return;
      }
      budget -= 1;
      if (budget <= 0) throw new Error(`Dialogue skips nodes in a loop at "${nextId}"`);
      nextId = this.nextOf(node);
    }
  }
}
