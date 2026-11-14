import { StationAlarmService } from '@/core/alarm/StationAlarmService';
import { AudioService } from '@/core/audio/AudioService';
import { CutsceneService } from '@/core/cutscene/CutsceneService';
import { EventBus } from '@/core/events/EventBus';
import type { GameEvents } from '@/core/events/events';
import { FlowService } from '@/core/flow/FlowService';
import { SettingsService } from '@/core/settings/SettingsService';
import { SimulationService } from '@/core/simulation/SimulationService';
import { GameState } from '@/core/state/GameState';
import { SaveService } from '@/core/state/SaveService';
import { getStorage } from '@/core/storage';
import { VoyageService } from '@/core/voyage/VoyageService';

/**
 * Creates the game services. Called once below; everything else imports `services`.
 */
export function createServices() {
  const events = new EventBus<GameEvents>();
  const storage = getStorage();
  const state = new GameState(events);
  const save = new SaveService(storage);
  const settings = new SettingsService(storage);
  const voyage = new VoyageService(state);
  const simulation = new SimulationService(events, state, voyage);
  const cutscenes = new CutsceneService(events);
  const stationAlarm = new StationAlarmService(events, simulation, voyage);
  return {
    /** Game event bus: scenes and services talk through it. */
    events,
    /** Story flags and the current position of the running game. */
    state,
    /**
     * The story flow: new game, continue, acts, locations, checkpoints, endings; needs
     * `flow.attach(driver, content)` in main.ts.
     */
    flow: new FlowService(state, save, events, simulation, cutscenes),
    /** Scripted scenes (`play(id)`); needs `cutscenes.attach(stage, registry)` in main.ts. */
    cutscenes,
    /** The saved game in localStorage. */
    save,
    /**
     * Player settings (volumes) in localStorage. Read them here; change volumes through
     * `audio.setMusicVolume` / `setSfxVolume`, which also apply them.
     */
    settings,
    /** Music and sound effects; needs `audio.attach(game.sound)` in main.ts. */
    audio: new AudioService(settings),
    /**
     * The ship simulation of act 2 (src/core/simulation, docs/HOWTO-simulation.md); needs
     * `simulation.attach(content)` in main.ts and is stepped from the game loop there.
     */
    simulation,
    /**
     * The voyage's data: the cargo registry and what the `cargo.<id>` flags put aboard
     * (src/core/voyage); needs `voyage.attach(cargo, voyageEvents, colony)` in main.ts. Location
     * bindings get it as `voyage`.
     */
    voyage,
    /**
     * The station alarm of act 2: the countdown to answer the open event at its deck station
     * (src/core/alarm); stepped from the game loop in main.ts after `simulation`.
     */
    stationAlarm,
  };
}

/** Everything `createServices` returns. */
export type Services = ReturnType<typeof createServices>;

/** The game's services, created when this module is first imported (before Phaser starts). */
export const services: Services = createServices();
