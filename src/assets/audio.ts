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
  // Act 1 theme (the warehouse), variant 1 of 2 from the sound designer; mp3 only so far.
  // OWNER: art
  'music-act1': { paths: ['assets/audio/music-act1.mp3'] },
  // Station alarm of act 2 over music without a drum layer (the fallback). OWNER: art
  'music-alarm': { paths: ['assets/audio/music-alarm.wav'] },
  // Act 2 on the ship deck: the calm flight melody and its drum layer, the same length and
  // tempo; the drums come in during a station alarm. OWNER: art
  'music-flight': { paths: ['assets/audio/music-flight.wav'] },
  'music-flight-drums': { paths: ['assets/audio/music-flight-drums.wav'] },
} as const satisfies Record<string, AudioEntry>;

/** One entry of the audio registry. */
export interface AudioEntry {
  /** File paths relative to `public/`, one per format, preferred first. */
  paths: readonly string[];
}
