import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '@/config';
import { endings, isEndingId } from '@/content/endings';
import type { Ending } from '@/content/endings';
import { services } from '@/core/services';
import { SceneKey } from '@/scenes/keys';
import type { Point } from '@/world/Actor';
import { KeyboardControls } from '@/world/KeyboardControls';
import { ChoiceList } from '@/ui/kit/ChoiceList';
import { Panel } from '@/ui/kit/Panel';
import { createText } from '@/ui/kit/text';
import { theme } from '@/ui/theme';

/** Data for `scene.start(SceneKey.Ending, data)`; `PhaserSceneDriver.showEnding` passes it. */
export interface EndingSceneData {
  /** Id in src/content/endings.ts; an unknown id shows the id itself as the heading. */
  endingId: string;
}

/** What `EndingScene.debugInfo()` returns. */
export interface EndingDebugInfo {
  endingId: string;
  title: string;
  text: string;
  /** The buttons, top to bottom, and the selected one. */
  choices: { items: string[]; selected: number };
}

/** Options under the text, in this order. */
const CHOICES = ['Retry from checkpoint', 'Main menu'] as const;
/** Top of the heading, px. */
const TITLE_Y = 72;
/** Gap between the heading and the text, and between the text and the options, px. */
const GAP = 24;
/** Width the text wraps at, px. */
const TEXT_WIDTH = 480;
/** Width of the option list, px. */
const CHOICES_WIDTH = 200;

/**
 * End screen of the game: the heading and text of an ending from
 * src/content/endings.ts and two options, "Retry from checkpoint" (`flow.retry()`) and "Main
 * menu" (`flow.toMainMenu()`), by keyboard (arrows, Enter) or mouse. A full scene, not a
 * panel: the world is stopped behind it. Started by `services.flow.finish` and `gameOver`.
 */
export class EndingScene extends Phaser.Scene {
  private endingId = '';
  private ending: Ending = { title: '', text: '' };
  private choices?: ChoiceList;

  constructor() {
    super(SceneKey.Ending);
  }

  init(data: EndingSceneData): void {
    this.endingId = data.endingId;
    this.ending = isEndingId(data.endingId)
      ? endings[data.endingId]
      : { title: data.endingId, text: '' };
  }

  create(): void {
    const centerX = GAME_WIDTH / 2;
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, theme.faderColor).setOrigin(0);

    const title = createText(this, centerX, TITLE_Y, this.ending.title, 'title').setOrigin(0.5, 0);
    const text = createText(this, centerX, title.y + Math.ceil(title.height) + GAP, '', 'small', {
      align: 'center',
      lineSpacing: theme.lineSpacing,
      wordWrap: { width: TEXT_WIDTH },
    })
      .setOrigin(0.5, 0)
      .setText(this.ending.text);

    const list = new ChoiceList(this, 0, 0, new KeyboardControls(this), { width: CHOICES_WIDTH });
    list.setChoices(CHOICES);
    const pad = theme.panelPadding;
    const left = Math.round(centerX - CHOICES_WIDTH / 2);
    const top = Math.round(text.y + Math.ceil(text.height) + GAP);
    // The panel goes first: what is created later draws on top.
    new Panel(this, left - pad, top - pad, CHOICES_WIDTH + pad * 2, list.height + pad * 2);
    this.children.bringToTop(list);
    list.setPosition(left, top);
    list.once(ChoiceList.CHOSEN, (index: number) => this.choose(index));
    this.choices = list;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.choices = undefined;
    });
  }

  /** State for the smoke tool and the console: `window.nasa.game.scene.getScene('Ending')`. */
  debugInfo(): EndingDebugInfo {
    return {
      endingId: this.endingId,
      title: this.ending.title,
      text: this.ending.text,
      choices: {
        items: this.choices?.items ?? [],
        selected: this.choices?.selectedIndex ?? -1,
      },
    };
  }

  /** Centre of option `index` in game pixels, for `h.click`. */
  debugChoiceCenter(index: number): Point | null {
    return this.choices?.rowCenter(index) ?? null;
  }

  private choose(index: number): void {
    if (CHOICES[index] === 'Retry from checkpoint') void services.flow.retry();
    else services.flow.toMainMenu();
  }
}
