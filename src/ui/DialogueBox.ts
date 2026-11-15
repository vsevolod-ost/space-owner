import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '@/config';
import { characters } from '@/content/characters';
import type { DialogueRunner, DialogueStep } from '@/core/dialogue/DialogueRunner';
import type { Speaker } from '@/core/dialogue/types';
import type { Controls } from '@/core/input/controls';
import { tr } from '@/core/locale/text';
import { ChoiceList } from '@/ui/kit/ChoiceList';
import { Panel } from '@/ui/kit/Panel';
import { fillArrow, strokeChamfered } from '@/ui/kit/shapes';
import { createText } from '@/ui/kit/text';
import { theme } from '@/ui/theme';

/** Typewriter speed of dialogue text, characters per second. */
export const TEXT_SPEED_CPS = 40;
/** Height of the dialogue window at the bottom of the screen, px (full screen width). */
export const DIALOGUE_BOX_HEIGHT = 96;
/** Size the portrait is drawn at, px; portrait art is made at this size. */
export const PORTRAIT_SIZE = 48;
/** Width of the choice list above the window, px (without the panel padding). */
const CHOICES_WIDTH = 240;
/** Space between the speaker's name and the text, px. */
const NAME_GAP = 8;
/** Blink period of the "more" marker shown when a line is fully typed, ms. */
const MARKER_BLINK_MS = 500;
/** Long side of the "more" arrow in the corner, px. */
const MARKER_SIZE = 7;

/** What `DialogueBox.debugInfo()` returns. */
export interface DialogueBoxInfo {
  /** Id of the node on screen. */
  nodeId: string;
  speaker: Speaker;
  /** The whole line, typed out or not. */
  text: string;
  /** Whether the typewriter is still running on the page on screen. */
  typing: boolean;
  /** Index of the page on screen (a line too long for the window is split into pages). */
  page: number;
  /** Number of pages of the line. */
  pages: number;
  /** The choice list, once it is shown (after the line is typed out), or null. */
  choices: { items: string[]; selected: number } | null;
}

/**
 * The dialogue window: a panel across the bottom of the screen with the speaker's portrait
 * (48x48, left), name and the line typed out at `TEXT_SPEED_CPS`. `confirm` (Enter, Space) or
 * a click first finishes the typing, then moves on; at a node with choices a `ChoiceList`
 * opens above the window once the line is typed out. A line taller than the window is split
 * into pages that are typed one after another (the "more" marker blinks under each page but
 * the last of a choice node). The narrator has no portrait and no name.
 *
 * Drives a started `DialogueRunner` until its end, then `finished` resolves (it rejects if
 * a node's `when`, `effect` or `next` throws). UiScene creates it in `openDialogue`; other
 * code opens dialogues through `ui.openDialogue(id, ctx)`, not with this class.
 */
export class DialogueBox {
  /** Resolves when the dialogue has ended (or the box was destroyed). */
  readonly finished: Promise<void>;

  private readonly panel: Panel;
  private readonly portrait: Phaser.GameObjects.Image;
  /** The bezel around the portrait. */
  private readonly portraitFrame: Phaser.GameObjects.Graphics;
  private readonly name: Phaser.GameObjects.Text;
  private readonly body: Phaser.GameObjects.Text;
  private readonly marker: Phaser.GameObjects.Graphics;
  private choicesPanel?: Panel;
  private choiceList?: ChoiceList;

  private step: DialogueStep = { kind: 'end' };
  /** The current line, wrapped and split into pages; each page's lines joined by `\n`. */
  private pages: string[] = [''];
  private pageIndex = 0;
  /** The page on screen (`pages[pageIndex]`). */
  private fullText = '';
  private shownChars = 0;
  private typingMs = 0;
  private blinkMs = 0;
  /** Game frame in which the current line appeared: `confirm` in that frame is ignored. */
  private shownFrame = -1;
  /** The dialogue has ended (or the box was destroyed): no more input, `finished` resolved. */
  private closed = false;
  /** The window's parts are gone. */
  private destroyed = false;
  private resolveFinished!: () => void;
  private rejectFinished!: (error: unknown) => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly controls: Controls,
    private readonly runner: DialogueRunner,
    private readonly depth: number,
  ) {
    this.finished = new Promise((resolve, reject) => {
      this.resolveFinished = resolve;
      this.rejectFinished = reject;
    });
    const top = GAME_HEIGHT - DIALOGUE_BOX_HEIGHT;
    const pad = theme.panelPadding;
    // Same depth for all parts: what is created later draws on top, so the panel comes first.
    this.panel = new Panel(scene, 0, top, GAME_WIDTH, DIALOGUE_BOX_HEIGHT).setDepth(depth);
    this.panel.setInteractive().on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.confirm());
    const look = theme.panel;
    this.portraitFrame = scene.add.graphics().setDepth(depth).setVisible(false);
    const frameSize = PORTRAIT_SIZE + 4;
    strokeChamfered(
      this.portraitFrame,
      pad - 2,
      top + pad - 2,
      frameSize,
      frameSize,
      1,
      look.shade,
      look.light,
    );
    strokeChamfered(
      this.portraitFrame,
      pad - 1,
      top + pad - 1,
      frameSize - 2,
      frameSize - 2,
      0,
      look.outline,
    );
    this.portrait = scene.add
      .image(pad, top + pad, '__DEFAULT')
      .setOrigin(0)
      .setDepth(depth)
      .setVisible(false);
    this.name = createText(scene, 0, top + pad, '', 'title', {
      color: theme.text.highlight,
    }).setDepth(depth);
    this.body = createText(scene, 0, 0, '', 'body', { lineSpacing: theme.lineSpacing }).setDepth(
      depth,
    );
    this.marker = scene.add.graphics().setDepth(depth).setVisible(false);
    fillArrow(
      this.marker,
      GAME_WIDTH - pad - MARKER_SIZE,
      GAME_HEIGHT - pad - Math.ceil(MARKER_SIZE / 2),
      'down',
      theme.selection.enabled.arrow,
      MARKER_SIZE,
    );

    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    this.show(runner.current());
  }

  /** The node on screen, for `UiScene.debugInfo()`; null once the dialogue has ended. */
  debugInfo(): DialogueBoxInfo | null {
    const step = this.step;
    if (this.closed || step.kind === 'end') return null;
    const list = this.choiceList;
    return {
      nodeId: step.nodeId,
      speaker: step.speaker,
      text: step.text,
      typing: this.isTyping(),
      page: this.pageIndex,
      pages: this.pages.length,
      choices: list ? { items: list.items, selected: list.selectedIndex } : null,
    };
  }

  /** Whether the window is on screen (an ended dialogue stays until `destroy`). */
  get shown(): boolean {
    return !this.destroyed;
  }

  /** Removes the window; `finished` resolves if the dialogue had not ended yet. */
  destroy(): void {
    this.end();
    if (this.destroyed) return;
    this.destroyed = true;
    const parts = [
      this.panel,
      this.portraitFrame,
      this.portrait,
      this.name,
      this.body,
      this.marker,
    ];
    for (const part of parts) {
      part.destroy();
    }
  }

  /**
   * Ends the dialogue but leaves the last line on screen: the owner destroys the window after
   * `finished`, in the same frame as the next dialogue opens, so lines said one after another
   * never leave a frame without the window.
   */
  private end(): void {
    if (this.closed) return;
    this.closed = true;
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
    this.clearChoices();
    this.marker.setVisible(false);
    this.resolveFinished();
  }

  private update(_time: number, delta: number): void {
    if (this.closed) return;
    if (this.isTyping()) {
      this.typingMs += delta;
      this.reveal(Math.floor((this.typingMs * TEXT_SPEED_CPS) / 1000));
    } else if (this.step.kind === 'line' || this.hasNextPage()) {
      this.blinkMs = (this.blinkMs + delta) % (MARKER_BLINK_MS * 2);
      this.marker.setVisible(this.blinkMs < MARKER_BLINK_MS);
    }
    if (this.controls.justPressed('confirm')) this.confirm();
  }

  /** Enter, Space or a click: finish the typing, else turn the page, else move past a line. */
  private confirm(): void {
    if (this.closed || this.scene.game.loop.frame === this.shownFrame) return;
    if (this.isTyping()) this.reveal(this.fullText.length);
    else if (this.hasNextPage()) this.showPage(this.pageIndex + 1);
    else if (this.step.kind === 'line') this.run(() => this.runner.advance());
  }

  /** Calls the runner; an error in the dialogue's own code ends the dialogue with it. */
  private run(move: () => DialogueStep): void {
    let next: DialogueStep;
    try {
      next = move();
    } catch (error) {
      this.rejectFinished(error);
      this.end();
      return;
    }
    this.show(next);
  }

  private show(step: DialogueStep): void {
    this.step = step;
    this.clearChoices();
    this.marker.setVisible(false);
    if (step.kind === 'end') {
      this.end();
      return;
    }
    const pad = theme.panelPadding;
    const top = GAME_HEIGHT - DIALOGUE_BOX_HEIGHT + pad;
    const character = step.speaker === 'narrator' ? null : characters[step.speaker];
    const portrait = character ? (step.portrait ?? character.portrait) : undefined;

    if (portrait) {
      this.portrait.setTexture(portrait).setDisplaySize(PORTRAIT_SIZE, PORTRAIT_SIZE);
    }
    this.portrait.setVisible(portrait !== undefined);
    this.portraitFrame.setVisible(portrait !== undefined);
    const left = portrait ? pad + PORTRAIT_SIZE + pad : pad;
    this.name.setText(character ? tr(character.name) : '').setPosition(left, top);
    const textTop = character ? top + theme.fontSize.title + NAME_GAP : top;

    // Wrap the whole line once, then type it out: wrapping a growing text would make words
    // jump to the next line halfway through.
    this.body.setPosition(left, textTop).setWordWrapWidth(GAME_WIDTH - left - pad);
    const lines = this.body.getWrappedText(step.text);
    this.body.setWordWrapWidth(null);
    const perPage = this.linesThatFit(GAME_HEIGHT - pad - textTop);
    this.pages = [];
    for (let i = 0; i < lines.length; i += perPage) {
      this.pages.push(lines.slice(i, i + perPage).join('\n'));
    }
    if (this.pages.length === 0) this.pages.push('');
    this.showPage(0);
  }

  /** Starts typing page `index` of the current line. */
  private showPage(index: number): void {
    this.pageIndex = index;
    this.fullText = this.pages[index] ?? '';
    this.body.setText('');
    this.marker.setVisible(false);
    this.shownChars = 0;
    this.typingMs = 0;
    this.blinkMs = 0;
    this.shownFrame = this.scene.game.loop.frame;
    this.reveal(0);
  }

  /** How many lines of body text fit into `height` px (at least one), measured on the text. */
  private linesThatFit(height: number): number {
    let count = 1;
    while (
      this.body.setText(
        Array<string>(count + 1)
          .fill('M')
          .join('\n'),
      ).height <= height
    ) {
      count++;
    }
    this.body.setText('');
    return count;
  }

  /** Whether the line has a page after the one on screen. */
  private hasNextPage(): boolean {
    return this.pageIndex < this.pages.length - 1;
  }

  /** Shows the first `count` characters; at the end of the line opens the choices, if any. */
  private reveal(count: number): void {
    this.shownChars = Math.min(count, this.fullText.length);
    this.body.setText(this.fullText.slice(0, this.shownChars));
    if (
      !this.isTyping() &&
      !this.hasNextPage() &&
      this.step.kind === 'choices' &&
      !this.choiceList
    ) {
      this.openChoices(this.step.choices);
    }
  }

  private isTyping(): boolean {
    return this.step.kind !== 'end' && this.shownChars < this.fullText.length;
  }

  private openChoices(items: readonly string[]): void {
    const pad = theme.panelPadding;
    // The panel first: at the same depth, what is created later draws on top.
    const panel = new Panel(this.scene, 0, 0, 0, 0).setDepth(this.depth);
    const list = new ChoiceList(this.scene, 0, 0, this.controls, { width: CHOICES_WIDTH });
    list.setChoices(items).setDepth(this.depth);
    const width = CHOICES_WIDTH + pad * 2;
    const height = Math.round(list.height) + pad * 2;
    const left = GAME_WIDTH - width;
    const top = GAME_HEIGHT - DIALOGUE_BOX_HEIGHT - height;
    panel.setPosition(left, top).resize(width, height);
    list.setPosition(left + pad, top + pad);
    list.once(ChoiceList.CHOSEN, (index: number) => this.run(() => this.runner.choose(index)));
    this.choicesPanel = panel;
    this.choiceList = list;
  }

  private clearChoices(): void {
    this.choiceList?.destroy();
    this.choicesPanel?.destroy();
    this.choiceList = undefined;
    this.choicesPanel = undefined;
  }
}
