import Phaser from 'phaser';
import { services } from '@/core/services';
import { ABORT_CAUSE } from '@/core/voyage/flightSummary';
import { SceneKey } from '@/scenes/keys';
import type { SettingsScene } from '@/scenes/SettingsScene';
import type { Point } from '@/world/Actor';
import { PanelScene } from '@/ui/PanelScene';
import { ChoiceList } from '@/ui/kit/ChoiceList';

/** What `PauseScene.debugInfo()` returns. */
export interface PauseDebugInfo {
  /** The options, top to bottom, and the selected one. */
  choices: { items: string[]; selected: number };
}

/** An option of the pause menu. OWNER: script - the words (also matched below). */
type PauseChoice = 'Resume' | 'Settings' | 'Return to warehouse' | 'Main menu';

/** Options of the pause menu, in this order; "Return to warehouse" only during a voyage. */
const CHOICES: readonly PauseChoice[] = ['Resume', 'Settings', 'Return to warehouse', 'Main menu'];
const PANEL_WIDTH = 224;
/** Height of the panel without its option list (title, padding), px. */
const PANEL_FRAME_HEIGHT = 48;
/** Width of the option list, px. */
const CHOICES_WIDTH = 176;

/**
 * Pause menu: Esc in the world opens it, the world is paused under it. Resume
 * (or Esc again) closes it; Settings opens the settings panel over it; "Return to warehouse",
 * shown only while a voyage is under way (act 2), gives the voyage up: the death loop with
 * cause `abort` (`flow.die`, GDD `win-fail-vs-death`); Main menu leaves the game (the save
 * stays). Opened by `WorldScene` with `open()`.
 */
export class PauseScene extends PanelScene {
  private choices?: ChoiceList;
  /** The options shown now (`CHOICES` for this moment). */
  private shown: PauseChoice[] = [];

  constructor() {
    super(SceneKey.Pause);
  }

  protected build(): void {
    const voyage = services.simulation.isUnderWay;
    this.shown = CHOICES.filter((choice) => voyage || choice !== 'Return to warehouse');
    const list = new ChoiceList(this, 0, 0, this.controls, { width: CHOICES_WIDTH });
    list.setChoices(this.shown);
    const height = PANEL_FRAME_HEIGHT + Math.ceil(list.height);
    // OWNER: script - the panel's title.
    const area = this.addPanel({ title: 'Paused', width: PANEL_WIDTH, height });
    // The panel was drawn after the list: bring the list back on top.
    this.children.bringToTop(list);
    list.setPosition(Math.round(area.centerX - CHOICES_WIDTH / 2), area.y);
    list.on(ChoiceList.CHOSEN, (index: number) => this.choose(index));
    this.choices = list;
    // "Paused" means the ship's clock stops too (it runs only while the navigation panel is
    // open, which it cannot be under this menu; the hold makes it explicit).
    services.simulation.hold('pause');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.choices = undefined;
      services.simulation.release('pause');
    });
  }

  /** State for the smoke tool and the console: `window.nasa.game.scene.getScene('Pause')`. */
  debugInfo(): PauseDebugInfo {
    return {
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
    switch (this.shown[index]) {
      case 'Resume':
        this.close();
        break;
      case 'Settings':
        // Opens over this panel; closing it comes back here.
        void (this.scene.get(SceneKey.Settings) as SettingsScene).open();
        break;
      case 'Return to warehouse':
        // Close the panel first, as for the menu; `die` replaces the world.
        this.close();
        void services.flow.die(ABORT_CAUSE);
        break;
      case 'Main menu':
        // Close the panel first: the driver must not find the world paused under it.
        this.close();
        services.flow.toMainMenu();
        break;
    }
  }
}
