/** Asset registries and the key types derived from them. */
import { audio } from '@/assets/audio';
import { images } from '@/assets/images';
import { maps } from '@/assets/maps';
import { spritesheets } from '@/assets/spritesheets';

export { audio, images, maps, spritesheets };
export type { AudioEntry } from '@/assets/audio';
export type { ImageEntry } from '@/assets/images';
export type { MapEntry } from '@/assets/maps';
export type { SpritesheetEntry } from '@/assets/spritesheets';

/** Texture key of a single image. */
export type ImageKey = keyof typeof images;
/** Texture key of a sprite sheet. */
export type SpritesheetKey = keyof typeof spritesheets;
/** Key of a sound or music track. */
export type AudioKey = keyof typeof audio;
/** Key of a Tiled map. */
export type MapKey = keyof typeof maps;
