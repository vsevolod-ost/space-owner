import Phaser from 'phaser';
import type { ImageKey } from '@/assets';
import { theme } from '@/ui/theme';

/** Texture of every panel: `public/assets/ui/panel.png`, 24x24, 8 px corners and edges. */
const TEXTURE: ImageKey = 'ui-panel';

/**
 * Framed background of any size, stretched from `ui/panel.png` as a 9-slice: the corners stay
 * as drawn, the edges and the centre stretch. Positioned by its top-left corner; the size is
 * rounded to whole pixels and is never smaller than the two borders.
 *
 * ```ts
 * const panel = new Panel(this, 120, 80, 400, 200);
 * panel.resize(400, 240);
 * ```
 */
export class Panel extends Phaser.GameObjects.NineSlice {
  constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number) {
    const border = theme.panelBorder;
    super(
      scene,
      Math.round(x),
      Math.round(y),
      TEXTURE,
      undefined,
      clampSize(width),
      clampSize(height),
      border,
      border,
      border,
      border,
    );
    this.setOrigin(0);
    if (theme.panelTint !== 0xffffff) this.setTint(theme.panelTint);
    scene.add.existing(this);
  }

  /** Changes the size, keeping the top-left corner. */
  resize(width: number, height: number): this {
    this.setSize(clampSize(width), clampSize(height));
    return this;
  }
}

function clampSize(size: number): number {
  return Math.max(Math.round(size), theme.panelBorder * 2);
}
