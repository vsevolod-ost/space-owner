/**
 * Registry of sounds and music. The object key is the audio key (`AudioKey`).
 * `paths` lists the same sound in several formats (`ogg`, `mp3`); Phaser picks the first one
 * the browser can play. Placeholders are `wav` only; real files may add `ogg` and `mp3`.
 */
export const audio = {
  'ui-click': { paths: ['assets/audio/ui-click.wav'] },
  'sfx-door': { paths: ['assets/audio/sfx-door.wav'] },
  'sfx-alarm': { paths: ['assets/audio/sfx-alarm.wav'] },
  // The music is the sound designer's, mp3 only so far, numbered by act in the delivery
  // (`00.mp3`..`04.mp3`, `al1.mp3`). OWNER: art
  // Prologue (the hero's flat): 63 s, fades in from silence.
  'music-prologue': { paths: ['assets/audio/music-prologue.mp3'] },
  // Act 1 theme (the warehouse): 35 s.
  'music-act1': { paths: ['assets/audio/music-act1.mp3'] },
  // Act 2 on the ship deck, calm flight: 44.5 s.
  'music-flight': { paths: ['assets/audio/music-flight.mp3'] },
  // Station alarm of act 2: 12 s, from its start at every alarm; the flight track comes back
  // where it stopped.
  'music-alarm': { paths: ['assets/audio/music-alarm.mp3'] },
  // Act 3 (the colony): 44.5 s, the same length and tempo as `music-flight`.
  'music-act3': { paths: ['assets/audio/music-act3.mp3'] },
  // The end screen: 51 s, silent at both ends.
  'music-ending': { paths: ['assets/audio/music-ending.mp3'] },
} as const satisfies Record<string, AudioEntry>;

/** One entry of the audio registry. */
export interface AudioEntry {
  /** File paths relative to `public/`, one per format, preferred first. */
  paths: readonly string[];
}
