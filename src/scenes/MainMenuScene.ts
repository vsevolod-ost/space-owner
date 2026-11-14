import Phaser from 'phaser';
import type { ImageKey } from '@/assets';
import { GAME_HEIGHT, GAME_WIDTH } from '@/config';
import { services } from '@/core/services';
import { SceneKey } from '@/scenes/keys';
import type { SettingsScene } from '@/scenes/SettingsScene';
import type { StubScene } from '@/scenes/StubScene';
import { Button } from '@/ui/kit/Button';
import { Panel } from '@/ui/kit/Panel';
import { theme } from '@/ui/theme';

const BACKGROUND: ImageKey = 'menu-background';
const LOGO: ImageKey = 'menu-logo';
/** Logo centre (art is 320x100). */
const LOGO_Y = 70;
/** Centre of the first button (art is 160x36). */
const FIRST_BUTTON_Y = 160;
const BUTTON_SPACING = 44;
/** Button art size; the panel behind the buttons is fitted to it. */
const BUTTON_WIDTH = 160;
const BUTTON_HEIGHT = 36;

/** State of one menu button, for the smoke tool and the console. */
export interface MenuButtonInfo {
  label: string;
  /** Centre in game pixels: pass to `h.click(x, y)`. */
  x: number;
  y: number;
  enabled: boolean;
}

/** What `MainMenuScene.debugInfo()` returns. */
export interface MainMenuDebugInfo {
  /** Whether "Continue" is active (a save exists). */
  continueEnabled: boolean;
  /** Buttons from top to bottom. */
  buttons: MenuButtonInfo[];
}

/** Main menu: logo and the list of menu items. */
export class MainMenuScene extends Phaser.Scene {
  private buttons: Button[] = [];
  private continueButton?: Button;

  constructor() {
    super(SceneKey.MainMenu);
  }

  create(): void {
    const centerX = GAME_WIDTH / 2;

    this.add.image(centerX, GAME_HEIGHT / 2, BACKGROUND);
    this.add.image(centerX, LOGO_Y, LOGO);

    // To add a menu item, append it to this list.
    // Once the real scene exists, replace openStub with a transition to it.
    const items = [
      { label: 'Continue', onClick: () => this.continueGame() },
      { label: 'New Game', onClick: () => this.newGame() },
      { label: 'Settings', onClick: () => this.openSettings() },
      { label: 'About', onClick: () => this.openStub('About') },
    ];

    const panelTop = FIRST_BUTTON_Y - BUTTON_HEIGHT / 2 - theme.panelPadding;
    const panelHeight =
      (items.length - 1) * BUTTON_SPACING + BUTTON_HEIGHT + theme.panelPadding * 2;
    const panelWidth = BUTTON_WIDTH + theme.panelPadding * 2;
    new Panel(this, centerX - panelWidth / 2, panelTop, panelWidth, panelHeight);

    this.buttons = items.map(
      ({ label, onClick }, index) =>
        new Button(this, centerX, FIRST_BUTTON_Y + index * BUTTON_SPACING, label, onClick),
    );
    this.continueButton = this.buttons[0].setEnabled(services.save.hasSave());
  }

  /** Menu state for the smoke tool and the console: `window.nasa.game.scene.getScene(...)`. */
  debugInfo(): MainMenuDebugInfo {
    return {
      continueEnabled: this.continueButton?.isEnabled() ?? false,
      buttons: this.buttons.map((button) => ({
        label: button.label,
        x: button.x,
        y: button.y,
        enabled: button.isEnabled(),
      })),
    };
  }

  /** Starts over: the old save is deleted, the first act starts. */
  private newGame(): void {
    void services.flow.newGame();
  }

  /** Loads the last checkpoint. */
  private continueGame(): void {
    if (!services.save.hasSave()) {
      this.continueButton?.setEnabled(false);
      return;
    }
    void services.flow.continueGame();
  }

  /** Opens the settings panel over the menu; the menu is paused until it closes. */
  private openSettings(): void {
    void (this.scene.get(SceneKey.Settings) as SettingsScene).open();
  }

  /** Opens the stub panel over the menu; the menu is paused until it closes. */
  private openStub(title: string, details?: string): void {
    void (this.scene.get(SceneKey.Stub) as StubScene).open({ title, details });
  }
}
