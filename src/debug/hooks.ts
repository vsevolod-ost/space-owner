import Phaser from 'phaser';
import type { NasaDebugHandle } from '@/debug/globals';

/**
 * Installs the debug globals (src/debug/globals.ts) and the scene readiness signal.
 * Every scene signals "ready" right after its `create()` returns: `window.__nasaReady` gets
 * its key, `window.__nasaReadySeq` grows. When that scene shuts down, `__nasaReady` resets to
 * null, so a wait after a restart never matches the old value.
 */
export function installDebugHooks(game: Phaser.Game, services: NasaDebugHandle['services']): void {
  window.__nasaReady = null;
  window.__nasaReadySeq = 0;
  window.__nasaReadyLog = [];
  window.__nasaEvents = [];
  window.nasa = { services, game };

  game.events.once(Phaser.Core.Events.READY, () => {
    for (const scene of game.scene.getScenes(false)) {
      const key = scene.sys.settings.key;
      scene.events.on(Phaser.Scenes.Events.CREATE, () => signalReady(key));
      scene.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
        if (window.__nasaReady === key) window.__nasaReady = null;
      });
    }
  });
}

function signalReady(key: string): void {
  const seq = (window.__nasaReadySeq ?? 0) + 1;
  window.__nasaReadySeq = seq;
  window.__nasaReady = key;
  window.__nasaReadyLog?.push({ key, seq, t: performance.now() });
}
