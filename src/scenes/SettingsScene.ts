import type Phaser from 'phaser';
import {
  LANGUAGE_NAMES,
  LANGUAGES,
  pseudo,
  tr,
  type DisplayLanguage,
  type LocalText,
} from '@/core/locale/text';
import { services } from '@/core/services';
import { formatText } from '@/core/text/format';
import { SceneKey } from '@/scenes/keys';
import type { Point } from '@/world/Actor';
import { PanelScene } from '@/ui/PanelScene';
import { Button } from '@/ui/kit/Button';
import { drawSelection } from '@/ui/kit/shapes';
import { createText } from '@/ui/kit/text';
import { theme } from '@/ui/theme';

/** A volume the settings panel changes. */
export type VolumeSetting = 'music' | 'sfx';
/** What a row of the settings panel changes: a volume or the language. */
export type SettingsRow = VolumeSetting | 'language';

/** One row as shown, for the smoke tool. */
export interface SettingsRowInfo {
  setting: SettingsRow;
  /** The label and the value as shown ("Music", "70%"; "Language", "English"). */
  label: string;
  value: string;
}

/** What `SettingsScene.debugInfo()` returns. */
export interface SettingsDebugInfo {
  /** Volumes as stored in the settings, 0..1. */
  music: number;
  sfx: number;
  /** The language shown now (`services.locale.language`). */
  language: DisplayLanguage;
  /** Selected row: 0 Music, 1 SFX, 2 Language, 3 Back. */
  selected: number;
  /** The panel's title, its rows top to bottom and the Back button's label, as shown. */
  title: string;
  rows: SettingsRowInfo[];
  back: string;
  /** Button centres in game pixels, for `h.click(x, y)`. */
  buttons: {
    musicDown: Point;
    musicUp: Point;
    sfxDown: Point;
    sfxUp: Point;
    languageDown: Point;
    languageUp: Point;
    back: Point;
  };
}

/**
 * Rows of the panel, top to bottom; Up/Down moves between them. Labels max 13: the room left
 * of the "-" button. OWNER: script - the labels.
 */
const ROWS = [
  { setting: 'music', label: { en: 'Music', uk: 'Музика', max: 13 } },
  { setting: 'sfx', label: { en: 'SFX', uk: 'Ефекти', max: 13 } },
  { setting: 'language', label: { en: 'Language', uk: 'Мова', max: 13 } },
] as const satisfies readonly { setting: SettingsRow; label: LocalText }[];
/** The panel's title (title glyphs, max 14) and the Back button (96 px, max 10). OWNER: script */
const TITLE: LocalText = { en: 'Settings', uk: 'Налаштування', max: 14 };
const BACK_LABEL: LocalText = { en: 'Back', uk: 'Назад', max: 10 };
/** A volume as shown: `{percent}` 0..100. OWNER: script */
// budget: 7 chars, between "-" and "+" ("100%")
const PERCENT: LocalText = { en: '{percent}%', uk: '{percent}%' };
/** Change of a volume per "+" / "-" press. */
const STEP = 0.1;
/**
 * The value column of the `pseudo` row: the language's name in itself, like the others
 * (`LANGUAGE_NAMES`).
 */
const PSEUDO_NAME = 'Pseudo';
/** Wide enough for the labels (13 glyphs), the marker and the widest value column. */
const PANEL_WIDTH = 288;
const PANEL_HEIGHT = 164;
/** Distance between row centres, px. */
const ROW_SPACING = 28;
/** Size of the "-" and "+" buttons, px. */
const SMALL_BUTTON = { width: 24, height: 20 };
/**
 * Width of the value column between "-" and "+", px: the longest language name ("Українська",
 * 10 glyphs) and a glyph of air.
 */
const VALUE_WIDTH = 88;
/** Size of the Back button, px. */
const BACK_BUTTON = { width: 96, height: 24 };
/** Room left of the row labels for the selection arrow, px. */
const MARKER_GAP = 12;
/** The selected row's band: its height, how far it reaches past the content, its arrow, px. */
const BAND_HEIGHT = 24;
const BAND_OVERHANG = 4;
const ARROW_X = 6;

/**
 * Settings panel: music and sound effects volume, each with "-" / "+" (step 10%)
 * and the value in percent; the language, "-" / "+" cycling `LANGUAGES` (each shown by its own
 * name); and Back. Keyboard: Up/Down selects a row, Left/Right changes it, Enter on Back or Esc
 * closes. Values are saved at once (`services.audio.setMusicVolume`,
 * `services.locale.setLanguage`). Opens over the main menu or over the pause menu with `open()`;
 * close it before the panel under it. A language change rebuilds it in place (`PanelScene`),
 * keeping the selected row; the screen under it rebuilds itself too.
 */
export class SettingsScene extends PanelScene {
  protected rebuildOnLanguageChange = true;
  private selected = 0;
  private rows: {
    setting: SettingsRow;
    label: Phaser.GameObjects.Text;
    value: Phaser.GameObjects.Text;
    down: Button;
    up: Button;
  }[] = [];
  private back?: Button;
  /** The band under the selected row (`theme.selection`). */
  private band?: Phaser.GameObjects.Graphics;
  /** Left edge and width of the band, px. */
  private bandSpan = { x: 0, width: 0 };
  /** The title as drawn by `addPanel`. */
  private shownTitle = '';

  constructor() {
    super(SceneKey.Settings);
  }

  protected build(): void {
    const area = this.addPanel({ title: tr(TITLE), width: PANEL_WIDTH, height: PANEL_HEIGHT });
    this.shownTitle = tr(TITLE);
    const right = area.right;
    const upX = right - SMALL_BUTTON.width / 2;
    const valueX = upX - SMALL_BUTTON.width / 2 - VALUE_WIDTH / 2;
    const downX = valueX - VALUE_WIDTH / 2 - SMALL_BUTTON.width / 2;
    const labelX = area.x + MARKER_GAP;
    // Under the rows: created first.
    this.band = this.add.graphics();
    this.bandSpan = { x: area.x - BAND_OVERHANG, width: area.width + BAND_OVERHANG * 2 };

    this.rows = ROWS.map(({ setting, label }, index) => {
      const y = area.y + SMALL_BUTTON.height / 2 + index * ROW_SPACING;
      return {
        setting,
        label: createText(this, labelX, y, tr(label), 'body').setOrigin(0, 0.5),
        value: createText(this, valueX, y, '', 'body').setOrigin(0.5),
        down: new Button(this, downX, y, '-', () => this.change(index, -1), SMALL_BUTTON),
        up: new Button(this, upX, y, '+', () => this.change(index, 1), SMALL_BUTTON),
      };
    });
    this.back = new Button(
      this,
      area.centerX,
      area.bottom - BACK_BUTTON.height / 2,
      tr(BACK_LABEL),
      () => this.close(),
      BACK_BUTTON,
    );

    this.select(this.rebuilding ? this.selected : 0);
    this.refresh();
    this.onTeardown(() => {
      this.rows = [];
      this.back = undefined;
      this.band = undefined;
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
      language: services.locale.language,
      selected: this.selected,
      title: this.shownTitle,
      rows: this.rows.map(({ setting, label, value }) => ({
        setting,
        label: label.text,
        value: value.text,
      })),
      back: this.back?.label ?? '',
      buttons: {
        musicDown: center(this.rows[0]?.down),
        musicUp: center(this.rows[0]?.up),
        sfxDown: center(this.rows[1]?.down),
        sfxUp: center(this.rows[1]?.up),
        languageDown: center(this.rows[2]?.down),
        languageUp: center(this.rows[2]?.up),
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
    // A row stands on the band; Back, a button, lights up as under the pointer.
    const row = this.rows[this.selected];
    const band = this.band?.clear();
    if (row && band) {
      const { x, width } = this.bandSpan;
      const height = BAND_HEIGHT;
      const top = row.label.y - height / 2;
      drawSelection(band, x, top, width, height, ARROW_X, theme.selection.enabled, height / 2 - 3);
    }
    this.back?.setFocused(!row);
  }

  /**
   * Moves the value of row `index` one step up (+1) or down (-1), saves and applies it: a
   * volume by 10%, the language to the next or previous of `LANGUAGES` (which rebuilds the panel
   * at once, `languageChanged`).
   */
  private change(index: number, direction: 1 | -1): void {
    const row = this.rows[index];
    if (!row) return;
    this.select(index);
    if (row.setting === 'language') {
      services.locale.setLanguage(stepLanguage(services.locale.language, direction));
      this.refresh();
      return;
    }
    const current = services.settings.get(row.setting);
    // Round to whole steps: 0.1 additions drift (0.7 + 0.1 = 0.7999...).
    const next = Math.round((current + direction * STEP) * 10) / 10;
    if (row.setting === 'music') services.audio.setMusicVolume(next);
    else services.audio.setSfxVolume(next);
    this.refresh();
  }

  private refresh(): void {
    for (const row of this.rows) {
      if (row.setting === 'language') {
        row.value.setText(languageName(services.locale.language));
        continue;
      }
      const percent = Math.round(services.settings.get(row.setting) * 100);
      row.value.setText(formatText(tr(PERCENT), { percent }));
    }
  }
}

/**
 * The language after `language` in `LANGUAGES` (+1) or before it (-1), wrapping around; from
 * `pseudo` (not in the list) the first one (+1) or the last (-1).
 */
function stepLanguage(language: DisplayLanguage, direction: 1 | -1): DisplayLanguage {
  const count = LANGUAGES.length;
  const index = LANGUAGES.findIndex((other) => other === language);
  if (index < 0) return LANGUAGES[direction > 0 ? 0 : count - 1];
  return LANGUAGES[(index + direction + count) % count];
}

/** A language as the settings row shows it: its own name, not translated. */
function languageName(language: DisplayLanguage): string {
  return language === 'pseudo' ? pseudo(PSEUDO_NAME) : LANGUAGE_NAMES[language];
}
