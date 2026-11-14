import Phaser from 'phaser';
import type { AudioKey } from '@/assets';
import type { MusicOptions } from '@/core/audio/AudioService';
import { services } from '@/core/services';

/** Music of a station alarm over music without a layer (the fallback). OWNER: art */
const ALARM_MUSIC: AudioKey = 'music-alarm';

/**
 * Every switch between flight and alarm, ms: the drum layer in and out, and the crossfade to the
 * fallback alarm music and back (0.2 s, as promised to the composer in the team document).
 * OWNER: design
 */
const FADE_MS = 200;

/**
 * Sound of the station alarm (plan act2-stations D12, idea act2-music-layers; main.ts calls it
 * once). Two states of act 2 for the composer: calm flight (the location's music) and alarm
 * (for as long as `services.stationAlarm.alarm` is set). Every switch takes 0.2 s.
 *
 * When the music has a layer (`musicLayer` of the location: the drums of the flight melody),
 * the alarm raises the layer and the end of it lowers it; the melody never stops and the drums
 * stay in time with it. Otherwise the alarm crossfades to `music-alarm`, from its start each
 * time, and its end brings the track from before back where it stopped, with its own options
 * (or stops the music if none played).
 *
 * The state is applied on every game step, not only when the alarm starts: music that changes
 * during an alarm (the deck's own track arriving after a location change) gets the alarm too.
 * Back-to-back alarms (the next event of the queue) stay in the alarm state, since an end and a
 * start in the same step are never seen apart.
 */
export function attachStationSound(game: Phaser.Game): void {
  /** The alarm state now: by the layer, by the fallback track, or none. */
  let mode: 'layer' | 'track' | null = null;
  /** Music before the fallback alarm track began (null: none played). */
  let before: { key: AudioKey; options: MusicOptions } | null = null;

  game.events.on(Phaser.Core.Events.POST_STEP, () => {
    const { audio, stationAlarm } = services;
    if (stationAlarm.alarm) {
      // The fallback track is on and nothing has replaced it.
      if (mode === 'track' && audio.currentMusic === ALARM_MUSIC) return;
      // setLayer does nothing when the layer is already up.
      if (audio.setLayer(true, FADE_MS)) {
        mode = 'layer';
        before = null;
        return;
      }
      const key = audio.currentMusic;
      before =
        key && key !== ALARM_MUSIC ? { key, options: audio.currentMusicOptions ?? {} } : null;
      mode = 'track';
      audio.playMusic(ALARM_MUSIC, { fadeMs: FADE_MS });
    } else if (mode !== null) {
      if (mode === 'layer') audio.setLayer(false, FADE_MS);
      else if (before)
        audio.playMusic(before.key, { ...before.options, fadeMs: FADE_MS, resume: true });
      else audio.stopMusic();
      mode = null;
      before = null;
    }
  });
}
