import type Phaser from 'phaser';
import { theme } from '@/ui/theme';

/** Font family of all game text; declared with `@font-face` in index.html. */
export const FONT_FAMILY = 'Press Start 2P';

/** Text styles of the game. Add a variant here instead of styling text in place. */
export type TextVariant = 'title' | 'body' | 'small';

/** Sizes and colours come from the theme (sizes there are multiples of 8, see theme.ts). */
const VARIANTS: Record<TextVariant, Phaser.Types.GameObjects.Text.TextStyle> = {
  title: { fontSize: `${theme.fontSize.title}px`, color: theme.text.normal },
  body: { fontSize: `${theme.fontSize.body}px`, color: theme.text.normal },
  small: { fontSize: `${theme.fontSize.body}px`, color: theme.text.dim },
};

/**
 * Creates a text object in the game font. Coordinates are rounded to whole pixels and the text
 * renders at resolution 1, so it stays as sharp as the rest of the pixel art.
 * Use `setOrigin` on the result to align it; origins are rounded by `roundPixels`.
 */
export function createText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  variant: TextVariant = 'body',
  style: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.GameObjects.Text {
  return scene.add.text(Math.round(x), Math.round(y), text, {
    fontFamily: `"${FONT_FAMILY}"`,
    resolution: 1,
    ...VARIANTS[variant],
    ...style,
  });
}
