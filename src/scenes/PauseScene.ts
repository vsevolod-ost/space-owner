import { TODO, tr, type LocalText } from '@/core/locale/text';
import { services } from '@/core/services';
import { ABORT_CAUSE } from '@/core/voyage/flightSummary';
import { SceneKey } from '@/scenes/keys';
import type { SettingsScene } from '@/scenes/SettingsScene';
import type { Point } from '@/world/Actor';
import { PanelScene } from '@/ui/PanelScene';
import { ChoiceList } from '@/ui/kit/ChoiceList';

/** What `PauseScene.debugInfo()` returns. */
export interface PauseDebugInfo {
  /** The options as shown, top to bottom, and the selected one. */
  choices: { items: string[]; selected: number };
}

/** An option of the pause menu, an id (`CHOICE_LABELS` are the words). */
type PauseChoice = 'resume' | 'settings' | 'returnToWarehouse' | 'mainMenu';

/** Options of the pause menu, in this order; `returnToWarehouse` only during a voyage. */
const CHOICES: readonly PauseChoice[] = ['resume', 'settings', 'returnToWarehouse', 'mainMenu'];
/** The options as shown; they wrap at the list's width. OWNER: script */
const CHOICE_LABELS: Readonly<Record<PauseChoice, LocalText>> = {
  resume: { en: 'Resume', uk: TODO },
  settings: { en: 'Settings', uk: TODO },
  returnToWarehouse: { en: 'Return to warehouse', uk: TODO },
  mainMenu: { en: 'Main menu', uk: TODO },
};
/** The panel's title: title glyphs across the panel, max 12. OWNER: script */
const TITLE: LocalText = { en: 'Paused', uk: TODO, max: 12 };
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
 * stays). Opened by `WorldScene` with `open()`. A language change (from the settings opened
 * over it) rebuilds it in place, keeping the selected option.
 */
export class PauseScene extends PanelScene {
  protected rebuildOnLanguageChange = true;
  private choices?: ChoiceList;
  /** The option selected when the content was torn down, restored by a rebuild. */
  private keptSelection = 0;
  /** The options shown now (`CHOICES` for this moment). */
  private shown: PauseChoice[] = [];

  constructor() {
    super(SceneKey.Pause);
  }

  protected build(): void {
    const voyage = services.simulation.isUnderWay;
    this.shown = CHOICES.filter((choice) => voyage || choice !== 'returnToWarehouse');
    const list = new ChoiceList(this, 0, 0, this.controls, { width: CHOICES_WIDTH });
    list.setChoices(
      this.shown.map((choice) => tr(CHOICE_LABELS[choice])),
      this.rebuilding ? this.keptSelection : 0,
    );
    const height = PANEL_FRAME_HEIGHT + Math.ceil(list.height);
    const area = this.addPanel({ title: tr(TITLE), width: PANEL_WIDTH, height });
    // The panel was drawn after the list: bring the list back on top.
    this.children.bringToTop(list);
    list.setPosition(Math.round(area.centerX - CHOICES_WIDTH / 2), area.y);
    list.on(ChoiceList.CHOSEN, (index: number) => this.choose(index));
    this.choices = list;
    // "Paused" means the ship's clock stops too (it runs only while the navigation panel is
    // open, which it cannot be under this menu; the hold makes it explicit).
    services.simulation.hold('pause');
    this.onTeardown(() => {
      this.keptSelection = list.selectedIndex;
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
      case 'resume':
        this.close();
        break;
      case 'settings':
        // Opens over this panel; closing it comes back here.
        void (this.scene.get(SceneKey.Settings) as SettingsScene).open();
        break;
      case 'returnToWarehouse':
        // Close the panel first, as for the menu; `die` replaces the world.
        this.close();
        void services.flow.die(ABORT_CAUSE);
        break;
      case 'mainMenu':
        // Close the panel first: the driver must not find the world paused under it.
        this.close();
        services.flow.toMainMenu();
        break;
    }
  }
}
