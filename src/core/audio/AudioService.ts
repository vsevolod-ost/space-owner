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
  /**
   * A second loop of the same length and tempo, started together with the track (so it stays in
   * time) and silent until `setLayer(true)` raises it: act 2's alarm drums over the flight melody.
   */
  layer?: AudioKey;
  /** Start where this track stopped last time instead of from the beginning; default false. */
  resume?: boolean;
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
  /** Whether the layer of the current music is raised (`setLayer`). */
  layerOn: boolean;
  /** Tracks still sounding: the current one and those fading out, with their layers. */
  tracks: {
    key: string;
    gain: number;
    volume: number;
    /** Position in the loop and the loop's length, s. */
    seek: number;
    duration: number;
    layer?: { key: string; gain: number; volume: number; seek: number; duration: number };
  }[];
}

/** Sound instance as every Phaser sound manager creates it (they all have `volume`). */
type Sound = Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound | Phaser.Sound.NoAudioSound;

/** A gain (0..1) and its fade. */
interface Fade {
  gain: number;
  /** Gain the fade moves to. */
  target: number;
  /** Gain change per ms; 0 when not fading. */
  speed: number;
}

/** The layer of a track: its loudness is the track's gain times its own. */
interface Layer extends Fade {
  key: AudioKey;
  sound: Sound;
}

/** One music track and its fade: `gain` (0..1) times the music volume is its loudness. */
interface Track extends Fade {
  key: AudioKey;
  sound: Sound;
  /** Stop and destroy the sound when the gain reaches 0. */
  stopAtZero: boolean;
  layer?: Layer;
}

const DEFAULT_FADE_MS = 500;
const DEFAULT_STOP_FADE_MS = 250;

/** Moves `fade` toward its target by `dtMs`. */
function step(fade: Fade, dtMs: number): void {
  const delta = fade.speed * dtMs;
  fade.gain =
    fade.gain < fade.target
      ? Math.min(fade.target, fade.gain + delta)
      : Math.max(fade.target, fade.gain - delta);
  if (fade.gain === fade.target) fade.speed = 0;
}

/** Sets the target of `fade`, reached in `fadeMs` for a full 0..1 fade (at once when 0). */
function aim(fade: Fade, target: number, fadeMs: number): void {
  fade.target = target;
  if (fadeMs <= 0 || fade.gain === target) {
    fade.gain = target;
    fade.speed = 0;
  } else {
    // Full fades take fadeMs; a fade from halfway takes half of it.
    fade.speed = 1 / fadeMs;
  }
}

/** Playback position of a looping sound within its length, s. */
function positionOf(sound: Sound): number {
  return sound.duration > 0 ? sound.seek % sound.duration : 0;
}

/**
 * Music and sound effects over Phaser's sound manager, which main.ts hands over with
 * `attach(game.sound)`. One music track at a time: `playMusic` crossfades to a new track and
 * leaves the same track playing. A track may carry a layer (`MusicOptions.layer`): a second
 * loop started with it in the same instant, raised and lowered by `setLayer` without restarting
 * either. A track faded out remembers where it was, for `MusicOptions.resume`. Volumes are the
 * player's settings (`services.settings`); this service is the only code that changes them, so
 * set them here, not in settings.
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
  private wanted: { key: AudioKey; options: MusicOptions; layerOn: boolean } | null = null;
  /** Where each track was when it began to fade out, s (for `MusicOptions.resume`). */
  private readonly positions = new Map<AudioKey, number>();

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

  /** Options the current music was asked for with (to ask for it again later), or null. */
  get currentMusicOptions(): MusicOptions | null {
    return this.wanted?.options ?? null;
  }

  /**
   * Plays music `key`, crossfading from the previous track over `fadeMs`. The track that
   * already plays is left alone (not restarted), so locations sharing a track continue it.
   */
  playMusic(key: AudioKey, options: MusicOptions = {}): void {
    const wanted = this.wanted;
    const current = this.tracks[0];
    if (wanted?.key === key && current?.key === key && !current.stopAtZero) {
      // A layer asked for now joins the playing track, in time with it.
      if (options.layer && !current.layer) {
        wanted.options = { ...wanted.options, layer: options.layer };
        this.addLayer(current, options.layer, positionOf(current.sound), wanted.layerOn);
      }
      return;
    }
    // The same track asked for again (fading out, or not started yet) keeps its raised layer.
    const layerOn = wanted?.key === key ? wanted.layerOn : false;
    this.wanted = { key, options, layerOn };
    this.startWanted();
  }

  /**
   * Raises (`on`) or lowers the layer of the current music over `fadeMs`; the track and the
   * layer keep playing in time. Returns false, doing nothing, when the music has no layer.
   */
  setLayer(on: boolean, fadeMs = DEFAULT_FADE_MS): boolean {
    const wanted = this.wanted;
    const layer = wanted?.options.layer;
    if (!wanted || !layer || !this.sound?.game.cache.audio.exists(layer)) return false;
    if (wanted.layerOn === on) return true;
    wanted.layerOn = on;
    const track = this.tracks[0];
    if (track?.key === wanted.key && track.layer) {
      aim(track.layer, on ? 1 : 0, fadeMs);
      this.apply(track);
    }
    return true;
  }

  /** Whether the layer of the current music is raised. */
  get layerOn(): boolean {
    return this.wanted?.layerOn ?? false;
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
      const layerMoves = track.layer !== undefined && track.layer.speed !== 0;
      if (track.speed === 0 && !layerMoves) continue;
      step(track, dtMs);
      if (track.layer) step(track.layer, dtMs);
      this.apply(track);
      if (track.gain === 0 && track.stopAtZero) this.remove(track);
    }
  }

  /** State for the smoke tool and the console: `window.nasa.services.audio.debugInfo()`. */
  debugInfo(): AudioDebugInfo {
    return {
      music: this.currentMusic,
      locked: this.sound?.locked ?? true,
      layerOn: this.layerOn,
      tracks: this.tracks.map(({ key, gain, sound, layer }) => ({
        key,
        gain,
        volume: sound.volume,
        seek: positionOf(sound),
        duration: sound.duration,
        layer: layer && {
          key: layer.key,
          gain: layer.gain,
          volume: layer.sound.volume,
          seek: positionOf(layer.sound),
          duration: layer.sound.duration,
        },
      })),
    };
  }

  /** Starts (or crossfades to) the wanted music, if the sound manager can play now. */
  private startWanted(): void {
    const sound = this.sound;
    const wanted = this.wanted;
    if (!sound || sound.locked || !wanted) return;
    const { key, options, layerOn } = wanted;
    const fadeMs = options.fadeMs ?? DEFAULT_FADE_MS;

    // The same track may still be fading out (back and forth through a door): fade it back in.
    let track = this.tracks.find((candidate) => candidate.key === key);
    for (const other of this.tracks) if (other !== track) this.fadeOut(other, fadeMs);
    if (track) {
      track.stopAtZero = false;
      this.fadeTo(track, 1, fadeMs);
      if (track.layer) aim(track.layer, layerOn ? 1 : 0, fadeMs);
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
      const seek = options.resume ? (this.positions.get(key) ?? 0) : 0;
      this.positions.delete(key);
      // Both loops start in the same call, so they start at the same audio clock time.
      created.play({ seek });
      if (options.layer) this.addLayer(started, options.layer, seek, layerOn);
      this.fadeTo(track, 1, fadeMs);
    }
    this.tracks = [track, ...this.tracks.filter((other) => other !== track)];
  }

  /** Starts layer `key` of `track` at `seek` (the track's own position), raised or silent. */
  private addLayer(track: Track, key: AudioKey, seek: number, on: boolean): void {
    if (!this.sound || !this.exists(key)) return;
    const sound = this.sound.add(key, { loop: true, volume: 0 }) as Sound;
    sound.play({ seek });
    const gain = on ? 1 : 0;
    track.layer = { key, sound, gain, target: gain, speed: 0 };
    this.apply(track);
  }

  private fadeOut(track: Track, fadeMs: number): void {
    // Where the player stopped hearing it in full: the resume point.
    if (!track.stopAtZero) this.positions.set(track.key, positionOf(track.sound));
    track.stopAtZero = true;
    this.fadeTo(track, 0, fadeMs);
  }

  /** Starts moving `track` to gain `target` over `fadeMs` (at once when 0). */
  private fadeTo(track: Track, target: number, fadeMs: number): void {
    aim(track, target, fadeMs);
    if (track.speed !== 0) return;
    this.apply(track);
    if (target === 0 && track.stopAtZero) this.remove(track);
  }

  private apply(track: Track): void {
    const volume = track.gain * this.musicVolume;
    track.sound.setVolume(volume);
    track.layer?.sound.setVolume(volume * track.layer.gain);
  }

  private remove(track: Track): void {
    track.sound.stop();
    track.sound.destroy();
    track.layer?.sound.stop();
    track.layer?.sound.destroy();
    this.tracks = this.tracks.filter((other) => other !== track);
  }

  private exists(key: AudioKey): boolean {
    if (this.sound?.game.cache.audio.exists(key)) return true;
    console.warn(`AudioService: no sound '${key}' is loaded (src/assets/audio.ts)`);
    return false;
  }
}
