import Phaser from 'phaser';
import { audio, images, maps, spritesheets } from '@/assets';
import type { MapEntry } from '@/assets';
import { GAME_HEIGHT, GAME_WIDTH } from '@/config';
import { services } from '@/core/services';
import { animationKey, characters } from '@/content/characters';
import type { CharacterDef, CharacterId, Direction } from '@/content/characters';
import { isLocationId } from '@/content/locations';
import { isActId } from '@/content/story';
import { readStartParams } from '@/debug/startParams';
import { SceneKey } from '@/scenes/keys';
import { DEFAULT_SPAWN } from '@/scenes/WorldScene';
import { FONT_FAMILY } from '@/ui/kit/text';

const BAR_WIDTH = 240;
const BAR_HEIGHT = 8;
/** How long to wait for the web font before starting anyway with a fallback font. */
const FONT_TIMEOUT_MS = 3000;

/**
 * Loads every asset registry and the font, creates character animations, launches the UI layer
 * (`UiScene`), the alarm's timer bar (`AlarmBarScene`) and the debug overlay (`DebugScene`), then opens the menu, or what the URL asks
 * for (src/debug/startParams.ts): `?act=<id>` starts an act, `?location=<id>&spawn=<name>`
 * opens a location.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  /** Started in preload so the font downloads alongside the assets, awaited in create. */
  private fontLoad: Promise<FontFace[]> = Promise.resolve([]);

  preload(): void {
    this.fontLoad = document.fonts.load(`16px "${FONT_FAMILY}"`);
    this.showProgressBar();

    for (const [key, { path }] of Object.entries(images)) {
      this.load.image(key, path);
    }
    for (const [key, { path, frameWidth, frameHeight }] of Object.entries(spritesheets)) {
      this.load.spritesheet(key, path, { frameWidth, frameHeight });
    }
    for (const [key, { paths }] of Object.entries(audio)) {
      this.load.audio(key, [...paths]);
    }
    for (const [key, { path }] of Object.entries(maps as Record<string, MapEntry>)) {
      this.load.tilemapTiledJSON(key, path);
    }
  }

  async create(): Promise<void> {
    this.createCharacterAnimations();
    await waitForFont(this.fontLoad);
    // The UI layer (toasts, fader, dialogue) runs above every scene for the whole game.
    this.scene.launch(SceneKey.Ui);
    // The station alarm's timer bar (act 2); draws nothing without an alarm.
    this.scene.launch(SceneKey.AlarmBar);
    // The debug overlay too; it draws nothing until F3 or `?overlay=1`.
    this.scene.launch(SceneKey.Debug);
    this.startFirstScene();
  }

  private startFirstScene(): void {
    const params = readStartParams();
    if (params?.act !== undefined) {
      if (isActId(params.act)) {
        void services.flow.startAct(params.act);
        return;
      }
      console.warn(`Unknown act "${params.act}" in the URL; opening the menu`);
    } else if (params?.location !== undefined) {
      if (isLocationId(params.location)) {
        void services.flow.goTo(params.location, params.spawn ?? DEFAULT_SPAWN);
        return;
      }
      console.warn(`Unknown location "${params.location}" in the URL; opening the menu`);
    }
    this.scene.start(SceneKey.MainMenu);
  }

  private showProgressBar(): void {
    const x = Math.round((GAME_WIDTH - BAR_WIDTH) / 2);
    const y = Math.round((GAME_HEIGHT - BAR_HEIGHT) / 2);
    this.add.rectangle(x, y, BAR_WIDTH, BAR_HEIGHT).setOrigin(0).setStrokeStyle(1, 0xffffff);
    const fill = this.add.rectangle(x, y, 0, BAR_HEIGHT, 0xffffff).setOrigin(0);
    this.load.on(Phaser.Loader.Events.PROGRESS, (progress: number) => {
      fill.width = Math.round(BAR_WIDTH * progress);
    });
  }

  /** Creates `<id>-idle-<dir>` and `<id>-walk-<dir>` for every character with a sprite sheet. */
  private createCharacterAnimations(): void {
    for (const [id, def] of Object.entries(characters) as [CharacterId, CharacterDef][]) {
      // A character without a sheet (the ship's computer) only speaks: no animations.
      if (def.spritesheet === undefined) continue;
      for (const [direction, row] of Object.entries(def.rows) as [Direction, number][]) {
        const first = row * def.framesPerRow;
        this.anims.create({
          key: animationKey(id, 'idle', direction),
          frames: [{ key: def.spritesheet, frame: first + def.idleFrame }],
        });
        this.anims.create({
          key: animationKey(id, 'walk', direction),
          frames: this.anims.generateFrameNumbers(def.spritesheet, {
            frames: def.walkFrames.map((column) => first + column),
          }),
          frameRate: def.walkFrameRate,
          repeat: -1,
        });
      }
    }
  }
}

/**
 * Resolves once the game font is ready, or after FONT_TIMEOUT_MS - a missing font must never
 * block the game. Phaser draws text with the canvas API, which does not wait for web fonts.
 */
async function waitForFont(fontLoad: Promise<FontFace[]>): Promise<void> {
  const timeout = new Promise<'timeout'>((resolve) => {
    setTimeout(() => resolve('timeout'), FONT_TIMEOUT_MS);
  });
  try {
    const result = await Promise.race([fontLoad, timeout]);
    if (result === 'timeout' || result.length === 0) {
      console.warn(`Font "${FONT_FAMILY}" did not load; text uses a fallback font.`);
    }
  } catch (error) {
    console.warn(`Font "${FONT_FAMILY}" failed to load:`, error);
  }
}
