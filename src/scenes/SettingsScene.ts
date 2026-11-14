import Phaser from 'phaser';
import { services } from '@/core/services';
import { SceneKey } from '@/scenes/keys';
import type { Point } from '@/world/Actor';
import { PanelScene } from '@/ui/PanelScene';
import { Button } from '@/ui/kit/Button';
import { createText } from '@/ui/kit/text';
import { theme } from '@/ui/theme';

/** A volume the settings panel changes. */
export type VolumeSetting = 'music' | 'sfx';

/** What `SettingsScene.debugInfo()` returns. */
export interface SettingsDebugInfo {
  /** Volumes as stored in the settings, 0..1. */
  music: number;
  sfx: number;
  /** Selected row: 0 Music, 1 SFX, 2 Back. */
  selected: number;
  /** Button centres in game pixels, for `h.click(x, y)`. */
  buttons: { musicDown: Point; musicUp: Point; sfxDown: Point; sfxUp: Point; back: Point };
}

/** Rows of the panel, top to bottom; Up/Down moves between them. */
const ROWS = [
  { setting: 'music', label: 'Music' },
  { setting: 'sfx', label: 'SFX' },
] as const satisfies readonly { setting: VolumeSetting; label: string }[];
/** Change of a volume per "+" / "-" press. */
const STEP = 0.1;
const PANEL_WIDTH = 256;
const PANEL_HEIGHT = 136;
/** Distance between row centres, px. */
const ROW_SPACING = 28;
/** Size of the "-" and "+" buttons, px. */
const SMALL_BUTTON = { width: 24, height: 20 };
/** Width of the column with the percentage between "-" and "+", px. */
const VALUE_WIDTH = 56;
/** Size of the Back button, px. */
const BACK_BUTTON = { width: 96, height: 24 };
/** Distance from the selection marker to what it marks, px. */
const MARKER_GAP = 12;

/**
 * Settings panel: music and sound effects volume, each with "-" / "+" (step 10%)
 * and the value in percent, and Back. Keyboard: Up/Down selects a row, Left/Right changes it,
 * Enter on Back or Esc closes. Values are saved at once (`services.audio.setMusicVolume`).
 * Opens over the main menu or over the pause menu with `open()`; close it before the panel
 * under it.
 */
export class SettingsScene extends PanelScene {
  private selected = 0;
  private rows: {
    setting: VolumeSetting;
    label: Phaser.GameObjects.Text;
    value: Phaser.GameObjects.Text;
    down: Button;
    up: Button;
  }[] = [];
  private back?: Button;
  private marker?: Phaser.GameObjects.Text;

  constructor() {
    super(SceneKey.Settings);
  }

  protected build(): void {
    const area = this.addPanel({ title: 'Settings', width: PANEL_WIDTH, height: PANEL_HEIGHT });
    const right = area.right;
    const upX = right - SMALL_BUTTON.width / 2;
    const valueX = upX - SMALL_BUTTON.width / 2 - VALUE_WIDTH / 2;
    const downX = valueX - VALUE_WIDTH / 2 - SMALL_BUTTON.width / 2;
    const labelX = area.x + MARKER_GAP;

    this.rows = ROWS.map(({ setting, label }, index) => {
      const y = area.y + SMALL_BUTTON.height / 2 + index * ROW_SPACING;
      return {
        setting,
        label: createText(this, labelX, y, label, 'body').setOrigin(0, 0.5),
        value: createText(this, valueX, y, '', 'body').setOrigin(0.5),
        down: new Button(this, downX, y, '-', () => this.change(index, -1), SMALL_BUTTON),
        up: new Button(this, upX, y, '+', () => this.change(index, 1), SMALL_BUTTON),
      };
    });
    this.back = new Button(
      this,
      area.centerX,
      area.bottom - BACK_BUTTON.height / 2,
      'Back',
      () => this.close(),
      BACK_BUTTON,
    );
    this.marker = createText(this, area.x, 0, '>', 'body', { color: theme.text.highlight });
    this.marker.setOrigin(0, 0.5);

    this.select(0);
    this.refresh();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.rows = [];
      this.back = undefined;
      this.marker = undefined;
    });
  }

  update(): void {
    super.update();
    const controls = this.controls;
    if (controls.justPressed('moveUp')) this.select(this.selected - 1);
    if (controls.justPressed('moveDown')) this.select(this.selected + 1);
    if (this.selected < this.rows.length) {
      if (controls.justPressed('moveLeft')) this.change(this.selected, -1);
      if (controls.justPressed('moveRight')) this.change(this.selected, 1);
    } else if (controls.justPressed('confirm')) {
      services.audio.playSfx('ui-click');
      this.close();
    }
  }

  /** State for the smoke tool and the console: `window.nasa.game.scene.getScene('Settings')`. */
  debugInfo(): SettingsDebugInfo {
    const center = (button?: Button): Point => ({ x: button?.x ?? -1, y: button?.y ?? -1 });
    return {
      music: services.settings.get('music'),
      sfx: services.settings.get('sfx'),
      selected: this.selected,
      buttons: {
        musicDown: center(this.rows[0]?.down),
        musicUp: center(this.rows[0]?.up),
        sfxDown: center(this.rows[1]?.down),
        sfxUp: center(this.rows[1]?.up),
        back: center(this.back),
      },
    };
  }

  /** Selects a row (the last one is Back), wrapping around. */
  private select(index: number): void {
    const count = this.rows.length + 1;
    this.selected = (index + count) % count;
    this.rows.forEach((row, i) =>
      row.label.setColor(i === this.selected ? theme.text.highlight : theme.text.normal),
    );
    const row = this.rows[this.selected];
    if (row) this.marker?.setPosition(row.label.x - MARKER_GAP, row.label.y);
    else if (this.back) {
      this.marker?.setPosition(this.back.x - BACK_BUTTON.width / 2 - MARKER_GAP, this.back.y);
    }
  }

  /** Moves volume of row `index` one step up (+1) or down (-1), saves and applies it. */
  private change(index: number, direction: 1 | -1): void {
    const row = this.rows[index];
    if (!row) return;
    this.select(index);
    const current = services.settings.get(row.setting);
    // Round to whole steps: 0.1 additions drift (0.7 + 0.1 = 0.7999...).
    const next = Math.round((current + direction * STEP) * 10) / 10;
    if (row.setting === 'music') services.audio.setMusicVolume(next);
    else services.audio.setSfxVolume(next);
    this.refresh();
  }

  private refresh(): void {
    for (const row of this.rows) {
      row.value.setText(`${Math.round(services.settings.get(row.setting) * 100)}%`);
    }
  }
}
