/**
 * Registry of sounds and music. The object key is the audio key (`AudioKey`).
 * `paths` lists the same sound in several formats (`ogg`, `mp3`); Phaser picks the first one
 * the browser can play. Placeholders are `wav` only; real files may add `ogg` and `mp3`.
 */
export const audio = {
  'ui-click': { paths: ['assets/audio/ui-click.wav'] },
  'sfx-door': { paths: ['assets/audio/sfx-door.wav'] },
  'sfx-alarm': { paths: ['assets/audio/sfx-alarm.wav'] },
  'music-demo': { paths: ['assets/audio/music-demo.wav'] },
} as const satisfies Record<string, AudioEntry>;

/** One entry of the audio registry. */
export interface AudioEntry {
  /** File paths relative to `public/`, one per format, preferred first. */
  paths: readonly string[];
}
