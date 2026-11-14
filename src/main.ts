import Phaser from 'phaser';
import { DEBUG, GAME_HEIGHT, GAME_WIDTH } from '@/config';
import { cutscenes } from '@/content/cutscenes';
import { endings } from '@/content/endings';
import { ship } from '@/content/simulation/ship';
import { solarSystem } from '@/content/simulation/solar-system';
import { actOrder, acts } from '@/content/story';
import { services } from '@/core/services';
import { installDebugHooks } from '@/debug/hooks';
import { BootScene } from '@/scenes/BootScene';
import { DebugScene } from '@/scenes/DebugScene';
import { EndingScene } from '@/scenes/EndingScene';
import { MainMenuScene } from '@/scenes/MainMenuScene';
import { NavigationScene } from '@/scenes/NavigationScene';
import { PauseScene } from '@/scenes/PauseScene';
import { PhaserSceneDriver } from '@/scenes/PhaserSceneDriver';
import { SettingsScene } from '@/scenes/SettingsScene';
import { StubScene } from '@/scenes/StubScene';
import { UiScene } from '@/scenes/UiScene';
import { WorldScene } from '@/scenes/WorldScene';
import { WorldCutsceneStage } from '@/world/WorldCutsceneApi';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#000000',
  // Nearest-neighbour textures, no antialiasing, positions rounded to whole pixels.
  render: { pixelArt: true },
  // Scaling: whole-number zoom. NONE mode keeps the
  // 640x360 canvas and MAX_ZOOM multiplies its CSS size by the largest whole factor that fits
  // the #game element (100% of the window), so every game pixel is an exact square of screen
  // pixels: 1000x600 -> x1, 1280x720 -> x2, 1920x1080 -> x3, with black margins around.
  // Phaser computes MAX_ZOOM once at start, so the window resize listener below recomputes it.
  // Fallback if this misbehaves: { mode: Phaser.Scale.FIT, autoCenter: CENTER_BOTH } (fills
  // the window at a fractional factor; pixelArt keeps it crisp but pixels vary in size).
  scale: {
    mode: Phaser.Scale.NONE,
    zoom: Phaser.Scale.MAX_ZOOM,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  physics: { default: 'arcade' },
  // The first scene in the list starts first; later scenes draw above earlier ones. Panel
  // scenes (Stub, Pause, Settings, Navigation) bring themselves to the top when they open.
  scene: [
    BootScene,
    MainMenuScene,
    StubScene,
    WorldScene,
    EndingScene,
    UiScene,
    PauseScene,
    SettingsScene,
    NavigationScene,
    // The debug overlay (F3, ?overlay=1) last: above everything, panels included.
    DebugScene,
  ],
});

// The story flow moves scenes through this driver (src/core does not import Phaser); the story
// registries are handed over here because src/core never imports content at run time.
services.flow.attach(new PhaserSceneDriver(game), { acts, actOrder, endings });
// Cutscenes act on the world through this stage; the registry is handed over here for the same
// reason (src/core never imports content at run time).
services.cutscenes.attach(new WorldCutsceneStage(game), cutscenes);
// Music and sound effects play through Phaser's sound manager, created inside `new Phaser.Game`.
services.audio.attach(game.sound);
// The ship simulation gets the solar system and the ship from content, same reason.
services.simulation.attach({ bodies: solarSystem, ship });
// Game-time services advance on every game step, not in a scene: panels pause the world scene,
// but fades and the ship simulation keep running. Stops while the game itself is
// paused (hidden tab).
game.events.on(Phaser.Core.Events.STEP, (_time: number, delta: number) => {
  services.audio.tick(delta);
  services.simulation.tick(delta);
});

// Registered after Phaser's own resize listener, which refreshes the parent size first.
// Do not move this to `game.scale.on('resize')`: setMaxZoom emits RESIZE itself (recursion).
window.addEventListener('resize', () => game.scale.setMaxZoom());

if (DEBUG) installDebugHooks(game, services);
