import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '@/config';
import { dialogues } from '@/content/dialogues';
import type { DialogueId } from '@/content/dialogues';
import { DialogueRunner } from '@/core/dialogue/DialogueRunner';
import { defineDialogue } from '@/core/dialogue/types';
import type { Dialogue, Speaker } from '@/core/dialogue/types';
import { services } from '@/core/services';
import type { StateText } from '@/core/text/format';
import type { Controls } from '@/core/input/controls';
import type { Point } from '@/world/Actor';
import { KeyboardControls } from '@/world/KeyboardControls';
import { SceneKey } from '@/scenes/keys';
import { DialogueBox } from '@/ui/DialogueBox';
import type { DialogueBoxInfo } from '@/ui/DialogueBox';
import { ChoiceList } from '@/ui/kit/ChoiceList';
import { Fader } from '@/ui/kit/Fader';
import { Label } from '@/ui/kit/Label';
import { Panel } from '@/ui/kit/Panel';
import { Toast } from '@/ui/kit/Toast';
import { theme } from '@/ui/theme';

/** Distance of the toast's bottom edge from the bottom of the screen, px. */
const TOAST_MARGIN = 16;
/** Gap between the hint and the top of the focused object, px. */
const HINT_GAP = 4;
/** Width of the debug choice list, px. */
const DEBUG_CHOICES_WIDTH = 160;

/** Lock reason `openDialogue` puts on the world's controls. */
const DIALOGUE_LOCK = 'dialogue';
/** Dialogue id reported (events, debugInfo) for a single line shown by `say`. */
export const SAY_DIALOGUE_ID = 'say';
/** Dialogue id reported (events, debugInfo) by `openDialogueDef` when the caller gives none. */
export const CODE_DIALOGUE_ID = 'code';
/** How long a title (`showTitle`) takes to appear and to disappear, ms. */
const TITLE_FADE_MS = 300;

/** Draw order inside UiScene, bottom to top. */
export const UiDepth = {
  hint: 0,
  dialogue: 10,
  toast: 20,
  fader: 100,
  /** Titles show over the black screen of the fader. */
  title: 110,
} as const;

/** What `UiScene.debugInfo()` returns. */
export interface UiDebugInfo {
  /** Text of the toast on screen, or null. */
  toast: string | null;
  /** Name of the object the "E" hint is shown over, or null when it is hidden. */
  hint: string | null;
  /** Opacity of the fader: 0 clear, 1 black. */
  fader: number;
  /** The debug choice list (`debugShowChoices`) on screen, or null. */
  choices: { items: string[]; selected: number } | null;
  /**
   * The open dialogue: its id (a `DialogueId` for `openDialogue`, `SAY_DIALOGUE_ID` for `say`,
   * the given id or `CODE_DIALOGUE_ID` for `openDialogueDef`) and the node on screen, or null.
   */
  dialogue: ({ id: string } & DialogueBoxInfo) | null;
  /** Text of the title on screen (`showTitle`), or null. */
  title: string | null;
}

/** What `openDialogue` needs from its caller: the controls to lock while the dialogue runs. */
export interface DialogueHost {
  /** The world's input (`ctx.controls` in location scripts); locked with reason `dialogue`. */
  controls: Controls;
}

/**
 * The UI layer: a scene above the world that draws in screen coordinates, so the
 * world camera does not move it. BootScene launches it and it runs for the whole game, above
 * the menu and the world, until panel scenes are opened over it. Holds the "E" interaction
 * hint, toasts, the fader and the dialogue window (`openDialogue`). Has its own keyboard
 * (`controls`), which is never locked, for dialogue and choice lists. Layout: docs/HOWTO-ui.md.
 */
export class UiScene extends Phaser.Scene {
  private hint?: Label;
  private hintTarget: string | null = null;
  private toastView?: Toast;
  private faderView?: Fader;
  private keyboard?: KeyboardControls;
  private debugChoices?: ChoiceList;
  private debugChoicesPanel?: Panel;
  private dialogue?: { id: string; box: DialogueBox };
  private title?: Label;
  /** A toast asked for before `create` ran. */
  private pendingToast: string | null = null;
  private readyWaiters: (() => void)[] = [];

  constructor() {
    super(SceneKey.Ui);
  }

  create(): void {
    this.keyboard = new KeyboardControls(this);
    this.hint = new Label(this, 0, 0, 'E', { originX: 0.5, originY: 1 })
      .setDepth(UiDepth.hint)
      .setVisible(false);
    this.toastView = new Toast(
      this,
      GAME_WIDTH / 2,
      GAME_HEIGHT - TOAST_MARGIN,
      GAME_WIDTH - 64,
    ).setDepth(UiDepth.toast);
    this.faderView = new Fader(this).setDepth(UiDepth.fader);
    this.hintTarget = null;

    const off = services.events.on('interactableFocused', ({ name }) => {
      this.hintTarget = name;
      if (!name) this.hint?.setVisible(false);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      off();
      this.hint = undefined;
      this.toastView = undefined;
      this.faderView = undefined;
      this.keyboard = undefined;
      this.debugChoices = undefined;
      this.debugChoicesPanel = undefined;
      this.title = undefined;
      // Ends a running dialogue: its openDialogue resolves and unlocks the world.
      this.dialogue?.box.destroy();
    });

    if (this.pendingToast !== null) this.toast(this.pendingToast);
    this.pendingToast = null;
    const waiters = this.readyWaiters;
    this.readyWaiters = [];
    for (const resolve of waiters) resolve();
  }

  /** Resolves once the scene has been created (BootScene launches it a frame before use). */
  whenReady(): Promise<void> {
    if (this.faderView) return Promise.resolve();
    return new Promise((resolve) => this.readyWaiters.push(resolve));
  }

  /**
   * Full-screen fade above the world, toasts and the hint (cutscenes use it:
   * `await ui.fader.fadeOut(500)`). Available after `create`; see `whenReady`.
   */
  get fader(): Fader {
    if (!this.faderView) throw new Error('UiScene.fader used before the scene was created');
    return this.faderView;
  }

  /** This scene's keyboard: for dialogue and choice lists; never locked by the world. */
  get controls(): Controls {
    if (!this.keyboard) throw new Error('UiScene.controls used before the scene was created');
    return this.keyboard;
  }

  /** Shows `text` at the bottom of the screen for two seconds, replacing the previous toast. */
  toast(text: string): void {
    if (!this.toastView) {
      this.pendingToast = text;
      return;
    }
    this.toastView.show(text);
  }

  /**
   * Runs dialogue `id` in the window at the bottom of the screen and resolves when it ends.
   * While it runs, `host.controls` is locked (reason `dialogue`: the hero cannot walk, and E
   * cannot start the dialogue again) and the "E" hint is hidden; `dialogueStarted` and
   * `dialogueEnded` are emitted around it. A second call waits for the open dialogue to end.
   * Rejects if the dialogue's own code (`when`, `effect`, `next`) throws.
   *
   * ```ts
   * run: async (ctx) => {
   *   await ctx.ui.openDialogue('engineer-advice', ctx);
   * },
   * ```
   */
  openDialogue(id: DialogueId, host: DialogueHost): Promise<void> {
    return this.runDialogue(id, dialogues[id], host);
  }

  /**
   * Runs a dialogue built by code (not in the registry; e.g. a cargo stand whose choices depend
   * on the hold) exactly like `openDialogue`: same window, lock, events and queueing. `id` is
   * what events and `debugInfo` report; default `CODE_DIALOGUE_ID`.
   *
   * ```ts
   * run: (ctx) => ctx.ui.openDialogueDef(defineDialogue({ start: 'a', nodes: { a: { text: 'Hi' } } }), ctx),
   * ```
   */
  openDialogueDef(dialogue: Dialogue, host: DialogueHost, id = CODE_DIALOGUE_ID): Promise<void> {
    return this.runDialogue(id, dialogue, host);
  }

  /** Whether a dialogue (`openDialogue`, `openDialogueDef` or `say`) is on screen. */
  get isDialogueOpen(): boolean {
    return this.dialogue !== undefined;
  }

  /**
   * Shows one line by `speaker` (a character or `'narrator'`) in the dialogue window and
   * resolves when the player closes it: a one-node dialogue with id `SAY_DIALOGUE_ID`, locked
   * and announced like `openDialogue`. `text` may be a function of the state (read when the
   * line shows). Cutscenes use it for `api.say`.
   */
  say(speaker: Speaker, text: StateText, host: DialogueHost): Promise<void> {
    const line = defineDialogue({ start: 'line', nodes: { line: { speaker, text } } });
    return this.runDialogue(SAY_DIALOGUE_ID, line, host);
  }

  /**
   * Shows `text` large in the middle of the screen, above everything including the fader (so
   * it reads over a black screen), for `ms` in all: it fades in, stays, fades out, and the
   * promise resolves when it is gone. A new title replaces one still on screen.
   */
  async showTitle(text: string, ms: number): Promise<void> {
    await this.whenReady();
    this.title?.destroy();
    const title = new Label(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, text, {
      variant: 'title',
      wrapWidth: GAME_WIDTH - 96,
    }).setDepth(UiDepth.title);
    this.title = title;
    const fade = Math.min(TITLE_FADE_MS, Math.max(0, Math.floor(ms / 2)));
    const hold = Math.max(0, ms - fade * 2);
    title.setAlpha(fade > 0 ? 0 : 1);
    await new Promise<void>((resolve) => {
      const done = () => {
        if (title.active) title.destroy();
        if (this.title === title) this.title = undefined;
        resolve();
      };
      title.once(Phaser.GameObjects.Events.DESTROY, resolve);
      this.tweens.chain({
        targets: title,
        tweens: [
          { alpha: 1, duration: fade },
          { alpha: 0, duration: fade, delay: hold },
        ],
        onComplete: done,
      });
    });
  }

  /**
   * Clears everything shown over the game: hint, toast, title, debug choices, and ends an open
   * dialogue (its `openDialogue` resolves). The fader is left as it is. Used when the game is
   * left for the menu or an end screen.
   */
  hideAll(): void {
    this.hintTarget = null;
    this.hint?.setVisible(false);
    this.toastView?.hide();
    this.title?.destroy();
    this.title = undefined;
    this.debugChoices?.destroy();
    this.debugChoicesPanel?.destroy();
    this.debugChoices = undefined;
    this.debugChoicesPanel = undefined;
    this.dialogue?.box.destroy();
  }

  private async runDialogue(id: string, dialogue: Dialogue, host: DialogueHost): Promise<void> {
    await this.whenReady();
    while (this.dialogue) await this.dialogue.box.finished.catch(() => undefined);
    const runner = new DialogueRunner(services.state);
    host.controls.lock(DIALOGUE_LOCK);
    this.hint?.setVisible(false);
    services.events.emit('dialogueStarted', { dialogueId: id });
    let box: DialogueBox | undefined;
    try {
      runner.start(dialogue);
      box = new DialogueBox(this, this.controls, runner, UiDepth.dialogue);
      this.dialogue = { id, box };
      await box.finished;
    } finally {
      box?.destroy();
      if (this.dialogue?.box === box) this.dialogue = undefined;
      host.controls.unlock(DIALOGUE_LOCK);
      services.events.emit('dialogueEnded', { dialogueId: id });
    }
  }

  /**
   * Places the "E" hint above `anchor` (screen pixels: the top centre of the focused object),
   * or hides it with null. WorldScene calls this every frame; the hint shows only while an
   * object is focused (`interactableFocused`).
   */
  placeHint(anchor: Point | null): void {
    const hint = this.hint;
    if (!hint) return;
    if (!anchor || !this.hintTarget || this.dialogue) {
      hint.setVisible(false);
      return;
    }
    hint.setPosition(Math.round(anchor.x), Math.round(anchor.y - HINT_GAP)).setVisible(true);
  }

  /**
   * Shows a choice list on a panel in the middle of the screen and resolves with the chosen
   * index. A test hook for the smoke tool and the console (the dialogue window builds its own).
   */
  debugShowChoices(items: string[]): Promise<number> {
    this.debugChoices?.destroy();
    this.debugChoicesPanel?.destroy();
    // Same depth: what is created later draws on top, so the panel comes first.
    const panel = new Panel(this, 0, 0, 0, 0).setDepth(UiDepth.dialogue);
    const list = new ChoiceList(this, 0, 0, this.controls, { width: DEBUG_CHOICES_WIDTH });
    list.setChoices(items).setDepth(UiDepth.dialogue);
    const pad = theme.panelPadding;
    const width = DEBUG_CHOICES_WIDTH + pad * 2;
    const height = list.height + pad * 2;
    const left = Math.round((GAME_WIDTH - width) / 2);
    const top = Math.round((GAME_HEIGHT - height) / 2);
    panel.setPosition(left, top).resize(width, height);
    list.setPosition(left + pad, top + pad);
    this.debugChoices = list;
    this.debugChoicesPanel = panel;
    return new Promise((resolve) => {
      list.once(ChoiceList.CHOSEN, (index: number) => {
        list.destroy();
        panel.destroy();
        if (this.debugChoices === list) {
          this.debugChoices = undefined;
          this.debugChoicesPanel = undefined;
        }
        resolve(index);
      });
    });
  }

  /** Centre of a row of the debug choice list in game pixels, for `h.click`. */
  debugChoiceCenter(index: number): Point | null {
    return this.debugChoices?.rowCenter(index) ?? null;
  }

  /** State for the smoke tool and the console: `window.nasa.game.scene.getScene('Ui')`. */
  debugInfo(): UiDebugInfo {
    const choices = this.debugChoices;
    return {
      toast: this.toastView?.message ?? null,
      hint: this.hint?.visible ? this.hintTarget : null,
      fader: this.faderView?.alpha ?? 0,
      choices: choices ? { items: choices.items, selected: choices.selectedIndex } : null,
      dialogue: this.dialogueInfo(),
      title: this.title?.text ?? null,
    };
  }

  private dialogueInfo(): UiDebugInfo['dialogue'] {
    const info = this.dialogue?.box.debugInfo();
    return this.dialogue && info ? { id: this.dialogue.id, ...info } : null;
  }
}
