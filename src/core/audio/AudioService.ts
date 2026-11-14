// The only Phaser import in src/core: type-only, erased at build time, so core keeps no
// run-time dependency on Phaser and can run in node without a browser (the simulation is
// developed that way). The sound manager itself arrives through `attach`.
import type Phaser from 'phaser';
import type { AudioKey } from '@/assets';
import type { SettingsService } from '@/core/settings/SettingsService';

/** Options of `AudioService.playMusic`. */
export interface MusicOptions {
  /** Whether the track repeats; default true. */
  loop?: boolean;
  /** Crossfade from the previous track (also this track's fade in), ms; default 500. */
  fadeMs?: number;
}

/** Options of `AudioService.playSfx`. */
export interface SfxOptions {
  /** Loudness of this sound, 0..1, multiplied by the player's SFX volume; default 1. */
  volume?: number;
}

/** What `AudioService.debugInfo()` returns. */
export interface AudioDebugInfo {
  /** Key of the music that plays (or waits for the unlock), or null. */
  music: AudioKey | null;
  /** Whether the browser still blocks sound until the first click or key press. */
  locked: boolean;
  /** Tracks still sounding: the current one and those fading out. */
  tracks: { key: string; gain: number; volume: number }[];
}

/** Sound instance as every Phaser sound manager creates it (they all have `volume`). */
type Sound = Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound | Phaser.Sound.NoAudioSound;

/** One music track and its fade: `gain` (0..1) times the music volume is its loudness. */
interface Track {
  key: AudioKey;
  sound: Sound;
  gain: number;
  /** Gain the fade moves to. */
  target: number;
  /** Gain change per ms; 0 when not fading. */
  speed: number;
  /** Stop and destroy the sound when the gain reaches 0. */
  stopAtZero: boolean;
}

const DEFAULT_FADE_MS = 500;
const DEFAULT_STOP_FADE_MS = 250;

/**
 * Music and sound effects over Phaser's sound manager, which main.ts hands over with
 * `attach(game.sound)`. One music track at a time: `playMusic` crossfades to a new track and
 * leaves the same track playing. Volumes are the player's settings (`services.settings`); this
 * service is the only code that changes them, so set them here, not in settings.
 *
 * Fades are counted in game time by `tick(dtMs)`, called every game step from main.ts (the
 * sound manager has no tweens, and a scene's tweens stop with the scene).
 *
 * Browsers keep sound blocked until the first click or key press: music asked for before that
 * starts when the block lifts; sound effects asked for before that are skipped. Unknown keys
 * warn and do nothing.
 */
export class AudioService {
  private sound?: Phaser.Sound.BaseSoundManager;
  /** Fading-in or playing track first, then tracks fading out. */
  private tracks: Track[] = [];
  /** The music that should play; may wait for the unlock or for `attach`. */
  private wanted: { key: AudioKey; options: MusicOptions } | null = null;

  constructor(private readonly settings: SettingsService) {}

  /** Connects the service to Phaser's sound manager (`game.sound`); call once in main.ts. */
  attach(sound: Phaser.Sound.BaseSoundManager): void {
    this.sound = sound;
    if (sound.locked) sound.once('unlocked', () => this.startWanted());
    else this.startWanted();
  }

  /** The music volume from the settings, 0..1. */
  get musicVolume(): number {
    return this.settings.get('music');
  }

  /** The sound effects volume from the settings, 0..1. */
  get sfxVolume(): number {
    return this.settings.get('sfx');
  }

  /** Key of the music that plays (or will once sound unlocks), or null. */
  get currentMusic(): AudioKey | null {
    return this.wanted?.key ?? null;
  }

  /**
   * Plays music `key`, crossfading from the previous track over `fadeMs`. The track that
   * already plays is left alone (not restarted), so locations sharing a track continue it.
   */
  playMusic(key: AudioKey, options: MusicOptions = {}): void {
    if (this.wanted?.key === key && this.tracks[0]?.key === key && !this.tracks[0].stopAtZero) {
      return;
    }
    this.wanted = { key, options };
    this.startWanted();
  }

  /** Fades the music out over `fadeMs` and stops it. */
  stopMusic(fadeMs = DEFAULT_STOP_FADE_MS): void {
    this.wanted = null;
    for (const track of this.tracks) this.fadeOut(track, fadeMs);
  }

  /** Plays a sound effect once. Skipped while the browser still blocks sound. */
  playSfx(key: AudioKey, options: SfxOptions = {}): void {
    const sound = this.sound;
    if (!sound || sound.locked || !this.exists(key)) return;
    sound.play(key, { volume: (options.volume ?? 1) * this.sfxVolume });
  }

  /** Sets and stores the music volume (0..1) and applies it at once. */
  setMusicVolume(volume: number): void {
    this.settings.set('music', volume);
    for (const track of this.tracks) this.apply(track);
  }

  /** Sets and stores the sound effects volume (0..1); applies to the next effects. */
  setSfxVolume(volume: number): void {
    this.settings.set('sfx', volume);
  }

  /** Advances the fades by `dtMs` milliseconds; main.ts calls it on every game step. */
  tick(dtMs: number): void {
    for (const track of [...this.tracks]) {
      if (track.speed === 0) continue;
      const step = track.speed * dtMs;
      track.gain =
        track.gain < track.target
          ? Math.min(track.target, track.gain + step)
          : Math.max(track.target, track.gain - step);
      if (track.gain === track.target) track.speed = 0;
      this.apply(track);
      if (track.gain === 0 && track.stopAtZero) this.remove(track);
    }
  }

  /** State for the smoke tool and the console: `window.nasa.services.audio.debugInfo()`. */
  debugInfo(): AudioDebugInfo {
    return {
      music: this.currentMusic,
      locked: this.sound?.locked ?? true,
      tracks: this.tracks.map(({ key, gain, sound }) => ({ key, gain, volume: sound.volume })),
    };
  }

  /** Starts (or crossfades to) the wanted music, if the sound manager can play now. */
  private startWanted(): void {
    const sound = this.sound;
    const wanted = this.wanted;
    if (!sound || sound.locked || !wanted) return;
    const { key, options } = wanted;
    const fadeMs = options.fadeMs ?? DEFAULT_FADE_MS;

    // The same track may still be fading out (back and forth through a door): fade it back in.
    let track = this.tracks.find((candidate) => candidate.key === key);
    for (const other of this.tracks) if (other !== track) this.fadeOut(other, fadeMs);
    if (track) {
      track.stopAtZero = false;
      this.fadeTo(track, 1, fadeMs);
    } else {
      if (!this.exists(key)) {
        this.wanted = null;
        return;
      }
      const created = sound.add(key, { loop: options.loop ?? true, volume: 0 }) as Sound;
      const started: Track = {
        key,
        sound: created,
        gain: 0,
        target: 0,
        speed: 0,
        stopAtZero: false,
      };
      track = started;
      // A non-looping track that finishes must leave the list, or the next playMusic of the
      // same key would find it and play nothing.
      created.once('complete', () => {
        if (this.wanted?.key === key) this.wanted = null;
        if (this.tracks.includes(started)) this.remove(started);
      });
      created.play();
      this.fadeTo(track, 1, fadeMs);
    }
    this.tracks = [track, ...this.tracks.filter((other) => other !== track)];
  }

  private fadeOut(track: Track, fadeMs: number): void {
    track.stopAtZero = true;
    this.fadeTo(track, 0, fadeMs);
  }

  /** Starts moving `track` to gain `target` over `fadeMs` (at once when 0). */
  private fadeTo(track: Track, target: number, fadeMs: number): void {
    track.target = target;
    if (fadeMs <= 0 || track.gain === target) {
      track.gain = target;
      track.speed = 0;
      this.apply(track);
      if (target === 0 && track.stopAtZero) this.remove(track);
      return;
    }
    // Full fades take fadeMs; a fade from halfway takes half of it.
    track.speed = 1 / fadeMs;
  }

  private apply(track: Track): void {
    track.sound.setVolume(track.gain * this.musicVolume);
  }

  private remove(track: Track): void {
    track.sound.stop();
    track.sound.destroy();
    this.tracks = this.tracks.filter((other) => other !== track);
  }

  private exists(key: AudioKey): boolean {
    if (this.sound?.game.cache.audio.exists(key)) return true;
    console.warn(`AudioService: no sound '${key}' is loaded (src/assets/audio.ts)`);
    return false;
  }
}
