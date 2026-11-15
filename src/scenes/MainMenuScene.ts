import Phaser from 'phaser';
import type { ImageKey } from '@/assets';
import type { Controls } from '@/core/input/controls';
import { GAME_HEIGHT, GAME_WIDTH } from '@/config';
import { tr, type LocalText } from '@/core/locale/text';
import { services } from '@/core/services';
import { SceneKey } from '@/scenes/keys';
import type { SettingsScene } from '@/scenes/SettingsScene';
import type { StubScene } from '@/scenes/StubScene';
import { Button } from '@/ui/kit/Button';
import { KeyboardControls } from '@/world/KeyboardControls';
import { theme } from '@/ui/theme';

const LOGO: ImageKey = 'menu-logo';
const SHIP: ImageKey = 'menu-ship';
/** Logo centre (art is 320x100). */
const LOGO_Y = 70;
/** Centre x of the button column, left of the ship. OWNER: design */
const BUTTONS_X = 136;
/** Centre of the first button (160x36). */
const FIRST_BUTTON_Y = 160;
const BUTTON_SPACING = 44;
/** Right edge of the ship (art is 344x150), right of the buttons. OWNER: design */
const SHIP_RIGHT = GAME_WIDTH - 16;
/** Bottom edge of the ship. OWNER: design */
const SHIP_BOTTOM = GAME_HEIGHT - 24;
/** The buttons' labels; max 18: the button's 160 px. OWNER: script */
const LABELS = {
  continue: { en: 'Continue', uk: 'Продовжити', max: 18 },
  newGame: { en: 'New Game', uk: 'Нова гра', max: 18 },
  settings: { en: 'Settings', uk: 'Налаштування', max: 18 },
  about: { en: 'About', uk: 'Про гру', max: 18 },
} as const satisfies Record<string, LocalText>;
/** Heading of the About panel (`StubScene`): title glyphs, max 24. OWNER: script */
const ABOUT_TITLE: LocalText = { en: 'About', uk: 'Про гру', max: 24 };
/** Text of the About panel: what the game is and who made it; five lines of up to 40 fit. */
const ABOUT_DETAILS: LocalText = {
  en: [
    'A space mission design game',
    'NASA Space Apps Challenge 2026',
    'Team: V. Ostapenko, E. Dmytrenko,',
    'Ye. Gaidai, A. Ninovskyy, P. Hrebelnyi',
    'Open source, Apache-2.0 licence',
  ].join('\n'),
  uk: [
    'Гра про проєктування космічної місії',
    'NASA Space Apps Challenge 2026',
    'Команда: В. Остапенко, Е. Дмитренко,',
    'Є. Гайдай, А. Ніньовський, П. Гребельний',
    'Відкритий код, ліцензія Apache-2.0',
  ].join('\n'),
};
/** The ship bobs up by this much and back, px, once per period, ms. OWNER: design */
const SHIP_BOB_PX = 6;
const SHIP_BOB_MS = 3500;
/** Number of stars; a share of them are near (bigger, faster, coloured). OWNER: design */
const STAR_COUNT = 80;
const NEAR_STAR_SHARE = 0.3;
/** Drift speed of far and near stars to the left, px/s. OWNER: design */
const FAR_SPEED: readonly [number, number] = [8, 20];
const NEAR_SPEED: readonly [number, number] = [32, 60];
/** A star leaves this far past the left edge before it comes back on the right, px. */
const STAR_MARGIN = 10;

/** One star of the menu's background. */
interface Star {
  graphics: Phaser.GameObjects.Graphics;
  /** Exact position; drawn at whole pixels. */
  x: number;
  y: number;
  /** Drift to the left, px/s. */
  speed: number;
  /** Twinkle rate, radians/s. */
  twinkle: number;
}

/** State of one menu button, for the smoke tool and the console. */
export interface MenuButtonInfo {
  /** The label as shown. */
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
  /** Index of the button the keyboard is on. */
  focused: number;
}

/**
 * Main menu: a gradient sky with drifting, twinkling stars, the logo, the ship bobbing on the
 * right and the list of menu items. Up/Down move the focus over the enabled buttons (it starts on
 * Continue when there is a save, else on New Game, and follows the pointer), `confirm` clicks
 * the focused one. A language change (from the settings opened over it, while
 * it is paused) rebuilds the buttons in place and keeps the focus.
 */
export class MainMenuScene extends Phaser.Scene {
  private buttons: Button[] = [];
  private continueButton?: Button;
  private stars: Star[] = [];
  private controls?: Controls;
  /** Index of the button the keyboard is on. */
  private focused = 0;

  constructor() {
    super(SceneKey.MainMenu);
  }

  create(): void {
    const sky = theme.menu.sky;
    this.add
      .graphics()
      .fillGradientStyle(sky.top, sky.top, sky.bottom, sky.bottom, 1)
      .fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.stars = Array.from({ length: STAR_COUNT }, () => this.addStar());

    this.add.image(GAME_WIDTH / 2, LOGO_Y, LOGO);
    const ship = this.add.image(SHIP_RIGHT, SHIP_BOTTOM, SHIP).setOrigin(1, 1);
    this.tweens.add({
      targets: ship,
      y: SHIP_BOTTOM - SHIP_BOB_PX,
      duration: SHIP_BOB_MS,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // The menu's own keyboard: presses made while a panel is over it are dropped on resume.
    this.controls = new KeyboardControls(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => (this.controls = undefined));
    this.buildButtons();
    this.focus(services.save.hasSave() ? 0 : 1);
    const off = services.events.on('languageChanged', () => this.buildButtons());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
  }

  /** (Re)creates the buttons in the current language; works while the menu is paused. */
  private buildButtons(): void {
    for (const button of this.buttons) button.destroy();
    // To add a menu item, append it to this list.
    // Once the real scene exists, replace openStub with a transition to it.
    const items = [
      { label: LABELS.continue, onClick: () => this.continueGame() },
      { label: LABELS.newGame, onClick: () => this.newGame() },
      { label: LABELS.settings, onClick: () => this.openSettings() },
      { label: LABELS.about, onClick: () => this.openStub(tr(ABOUT_TITLE), tr(ABOUT_DETAILS)) },
    ];
    this.buttons = items.map(
      ({ label, onClick }, index) =>
        new Button(this, BUTTONS_X, FIRST_BUTTON_Y + index * BUTTON_SPACING, tr(label), onClick),
    );
    this.continueButton = this.buttons[0].setEnabled(services.save.hasSave());
    this.buttons.forEach((button, index) => button.on(Button.HOVERED, () => this.focus(index)));
    this.focus(this.focused);
  }

  /** Puts the keyboard focus on button `index` and lights it up. */
  private focus(index: number): void {
    this.focused = index;
    this.buttons.forEach((button, i) => button.setFocused(i === index));
  }

  /** Moves the focus one enabled button up (-1) or down (1), wrapping around. */
  private stepFocus(direction: 1 | -1): void {
    const count = this.buttons.length;
    for (let i = 1; i <= count; i++) {
      const index = (((this.focused + direction * i) % count) + count) % count;
      if (this.buttons[index].isEnabled()) {
        this.focus(index);
        return;
      }
    }
  }

  /** Reads the keys; stars drift left, wrap around and twinkle. */
  update(time: number, delta: number): void {
    const controls = this.controls;
    if (controls?.justPressed('moveUp')) this.stepFocus(-1);
    else if (controls?.justPressed('moveDown')) this.stepFocus(1);
    else if (controls?.justPressed('confirm')) this.buttons[this.focused]?.click();
    const dt = delta / 1000;
    this.stars.forEach((star, i) => {
      star.x -= star.speed * dt;
      if (star.x < -STAR_MARGIN) {
        star.x = GAME_WIDTH + STAR_MARGIN;
        star.y = Phaser.Math.Between(0, GAME_HEIGHT);
      }
      const flicker = Math.sin((time / 1000) * star.twinkle + i) * 0.3 + 0.7;
      star.graphics.setAlpha(flicker).setPosition(Math.round(star.x), Math.round(star.y));
    });
  }

  /** Menu state for the smoke tool and the console: `window.nasa.game.scene.getScene(...)`. */
  debugInfo(): MainMenuDebugInfo {
    return {
      continueEnabled: this.continueButton?.isEnabled() ?? false,
      focused: this.focused,
      buttons: this.buttons.map((button) => ({
        label: button.label,
        x: button.x,
        y: button.y,
        enabled: button.isEnabled(),
      })),
    };
  }

  /** A star at a random place: far ones are white dots, near ones bigger, some a sparkle. */
  private addStar(): Star {
    const x = Phaser.Math.Between(0, GAME_WIDTH);
    const y = Phaser.Math.Between(0, GAME_HEIGHT);
    const near = Math.random() < NEAR_STAR_SHARE;
    const [slow, fast] = near ? NEAR_SPEED : FAR_SPEED;
    const alpha = Phaser.Math.FloatBetween(0.2, 1);
    const colors = theme.menu.nearStars;
    const color = near ? colors[Phaser.Math.Between(0, colors.length - 1)] : theme.menu.farStar;
    const graphics = this.add.graphics().fillStyle(color, alpha);
    if (near && Math.random() < 0.5) {
      // A sparkle: a 3x3 core and a thin cross.
      graphics.fillRect(-1, -1, 3, 3).fillStyle(theme.menu.farStar, alpha * 0.7);
      graphics.fillRect(-3, 0, 7, 1).fillRect(0, -3, 1, 7);
    } else {
      const size = near ? 2 : 1;
      graphics.fillRect(0, 0, size, size);
    }
    graphics.setPosition(x, y);
    return {
      graphics,
      x,
      y,
      speed: Phaser.Math.FloatBetween(slow, fast),
      twinkle: Phaser.Math.FloatBetween(2, 6),
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
