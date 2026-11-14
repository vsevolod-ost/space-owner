import Phaser from 'phaser';
import { services } from '@/core/services';
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

/** Options of the pause menu, in this order. */
const CHOICES = ['Resume', 'Settings', 'Main menu'] as const;
const PANEL_WIDTH = 224;
const PANEL_HEIGHT = 96;
/** Width of the option list, px. */
const CHOICES_WIDTH = 120;

/**
 * Pause menu: Esc in the world opens it, the world is paused under it. Resume
 * (or Esc again) closes it; Settings opens the settings panel over it; Main menu leaves the
 * game (the save stays). Opened by `WorldScene` with `open()`.
 */
export class PauseScene extends PanelScene {
  private choices?: ChoiceList;

  constructor() {
    super(SceneKey.Pause);
  }

  protected build(): void {
    const area = this.addPanel({ title: 'Paused', width: PANEL_WIDTH, height: PANEL_HEIGHT });
    const list = new ChoiceList(this, 0, 0, this.controls, { width: CHOICES_WIDTH });
    list.setChoices(CHOICES);
    list.setPosition(Math.round(area.centerX - CHOICES_WIDTH / 2), area.y);
    list.on(ChoiceList.CHOSEN, (index: number) => this.choose(index));
    this.choices = list;
    // "Paused" means the ship's clock stops too; other panels (navigation, settings) let it run.
    const simulationWasRunning = services.simulation.isRunning;
    if (simulationWasRunning) services.simulation.pause();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.choices = undefined;
      if (simulationWasRunning) services.simulation.resume();
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
    switch (CHOICES[index]) {
      case 'Resume':
        this.close();
        break;
      case 'Settings':
        // Opens over this panel; closing it comes back here.
        void (this.scene.get(SceneKey.Settings) as SettingsScene).open();
        break;
      case 'Main menu':
        // Close the panel first: the driver must not find the world paused under it.
        this.close();
        services.flow.toMainMenu();
        break;
    }
  }
}
