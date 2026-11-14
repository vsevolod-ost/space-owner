import Phaser from 'phaser';

/** Outline of a `w` x `h` rectangle at `(left, top)` with its corners cut by `cut` px. */
export function cutCorners(
  left: number,
  top: number,
  w: number,
  h: number,
  cut: number,
): Phaser.Math.Vector2[] {
  const right = left + w;
  const bottom = top + h;
  return [
    [left + cut, top],
    [right - cut, top],
    [right, top + cut],
    [right, bottom - cut],
    [right - cut, bottom],
    [left + cut, bottom],
    [left, bottom - cut],
    [left, top + cut],
  ].map(([x, y]) => new Phaser.Math.Vector2(x, y));
}
