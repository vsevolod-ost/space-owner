# Architecture

How the game is put together: the layers and which may import which, the scenes, the services,
how a location loads, where state lives, and the debug tools. The "how to add X" guides are in
the [HOWTO files](../README.md#documentation); this page is the map behind them.

Stack: TypeScript, [Phaser 4.2](https://phaser.io) (WebGL, Arcade physics), Vite. The game renders
at 640×360 (`GAME_WIDTH`, `GAME_HEIGHT` in `src/config.ts`, the only place the size is set) and
is scaled up by a whole factor.

## Layers

```
src/
  core/      model and services: state, flags, save, flow, dialogue runner, cutscene service,
             audio, simulation, input actions. No Phaser (one `import type`, see below).
  content/   the game itself as typed data and scripts: locations, characters, dialogues,
             cutscenes, story acts, endings, the solar system and the ship.
  assets/    registries of files in public/assets (images, sprite sheets, audio, maps).
  scenes/    Phaser scenes (view and input) and PhaserSceneDriver.
  ui/        UI kit (panel, button, text, label, toast, choice list, fader), PanelScene, theme,
             the dialogue window.
  world/     what WorldScene is made of: the location loader, actors, player, interactables,
             keyboard controls, the world context and the cutscene stage.
  debug/     URL start parameters and the `window.nasa` hooks.
  config.ts  resolution, tile size, debug flag.
  main.ts    creates the Phaser game and wires the services to it.
```

### The dependency rule

| Layer                   | May import at run time                                                              | May import as `import type` |
| ----------------------- | ----------------------------------------------------------------------------------- | --------------------------- |
| `core`                  | other `core` modules, `config`, `debug/globals` (the event recorder)                | `content`, `assets`, Phaser |
| `content`               | other `content` modules (registries import their entries), pure helpers from `core` | anything                    |
| `scenes`, `ui`, `world` | `core`, `content`, `assets`, each other, Phaser                                     | anything                    |
| `assets`                | nothing                                                                             | -                           |
| `main.ts`               | everything: it is the one place that hands content to core                          | -                           |

- **Core never imports Phaser.** The single exception is `import type Phaser from 'phaser'` in
  `src/core/audio/AudioService.ts`; it is erased at build time. Anything core needs from the
  engine goes through an interface that a scene-side class implements: `SceneDriver`
  (`src/core/flow/SceneDriver.ts`, implemented by `src/scenes/PhaserSceneDriver.ts`),
  `CutsceneStage` (implemented by `src/world/WorldCutsceneApi.ts`), the sound manager handed to
  `AudioService`, and `Controls` (`src/core/input/controls.ts`, implemented by
  `src/world/KeyboardControls.ts`).
- **Core never imports content at run time.** It uses content _types_ (`LocationId`,
  `DialogueId`, `ActId`, ...) to check ids, but the registries themselves arrive through
  `attach` calls in `src/main.ts`: `flow.attach(driver, { acts, actOrder, endings })`,
  `cutscenes.attach(stage, cutscenes)`, `audio.attach(game.sound)`,
  `simulation.attach({ bodies: solarSystem, ship })`. So core can be read, and later tested,
  without the game's content or the engine.
- **Lint enforces both rules.** `eslint.config.js` sets `@typescript-eslint/no-restricted-imports`
  for `src/core/**/*.ts`: a run-time import of `phaser`, `@/content`, `@/assets`, `@/scenes`,
  `@/ui`, `@/world` (or anything under them), `@/debug/hooks` or `@/debug/startParams` fails
  `npm run lint`; `import type` passes. `@/config` and `@/debug/globals` stay allowed. Relative
  paths that climb out of `core` are not caught: always use the `@/` alias.
- **Content modules reference each other with `import type`** (a location names a dialogue by
  its id, typed by `import type { DialogueId }`), so there are no import cycles at run time. A
  registry file (`content/*/index.ts`) imports its entries as values.
- **Content may use pure core helpers**: `defineDialogue` (`core/dialogue/types.ts`), `DAY_S`
  (`core/simulation/constants.ts`). One location script opens a panel scene by its key
  (`src/content/locations/ship-deck.ts` imports `SceneKey` from `src/scenes/keys.ts`, a module
  with no Phaser import); keep such references to scene keys only.

## How a frame flows

```
keyboard / mouse
  -> scene (WorldScene, UiScene, a panel) reads actions from its Controls
  -> calls a service (services.flow.goTo, ui.openDialogue, services.cutscenes.play, ...)
     or a binding's script from content (ctx => ...)
  -> the service changes state (GameState, flags, simulation) and emits an event on services.events
  -> UI and other scenes react to the event (UiScene shows the "E" hint on interactableFocused,
     NavigationScene redraws on simulationTick, the overlay reads state four times a second)
  -> services that must move scenes call back through SceneDriver (PhaserSceneDriver)
```

Key input reaches the game on the next game step: a scene sees a press in the `update` after the
browser's key event, and what it changes shows a frame later.

## Scenes

Registered in this order in `src/main.ts` (later scenes draw above earlier ones); keys in
`src/scenes/keys.ts` (`SceneKey`). Switch scenes through `SceneKey`, never string literals.

| Key          | Class (`src/scenes/`) | What it is                                                         | Started by                                                                     |
| ------------ | --------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `Boot`       | `BootScene`           | Loads every asset registry and the font, creates the animations    | Phaser (first in the list)                                                     |
| `MainMenu`   | `MainMenuScene`       | Continue / New Game / Settings / About                             | Boot (no URL parameters), `PhaserSceneDriver.toMainMenu`                       |
| `Stub`       | `StubScene`           | Placeholder panel ("About"); smallest `PanelScene` example         | MainMenu                                                                       |
| `World`      | `WorldScene`          | The current location: background, walls, hero, NPCs, interactables | `PhaserSceneDriver.goTo` (from `flow.goTo`); restarted for every location      |
| `Ending`     | `EndingScene`         | End screen: death or ending, Retry from checkpoint / Main menu     | `PhaserSceneDriver.showEnding` (from `flow.gameOver` / `flow.finish`)          |
| `Ui`         | `UiScene`             | Overlay: "E" hint, toasts, dialogue window, act titles, fader      | Boot (`scene.launch`), runs for the whole game                                 |
| `Pause`      | `PauseScene`          | Pause menu (panel): Resume / Settings / Main menu                  | World on Esc when the hero's controls are not locked                           |
| `Settings`   | `SettingsScene`       | Music and SFX volume (panel)                                       | MainMenu, Pause                                                                |
| `Navigation` | `NavigationScene`     | Solar system map, ship, resources, thrust (panel)                  | the navigation station on the ship deck (`src/content/locations/ship-deck.ts`) |
| `Debug`      | `DebugScene`          | Debug overlay (F3, `?overlay=1`)                                   | Boot (`scene.launch`), runs for the whole game                                 |

Boot with `?act=<id>` calls `flow.startAct`, with `?location=<id>` calls `flow.goTo`; otherwise
it starts MainMenu. The menu's New Game and Continue call `flow.newGame()` /
`flow.continueGame()`; the end screen's Retry calls `flow.retry()`.

**Overlay scenes.** `Ui` and `Debug` are listed in `OVERLAY_SCENES` (`src/scenes/keys.ts`):
they run for the whole game above everything else. Panels do not pause them and scene changes do
not stop them (`PanelScene.open` and `PhaserSceneDriver` skip every key for which
`isOverlayScene(key)` is true). A new always-on layer must be added to `OVERLAY_SCENES`, or the
next panel pauses it and the next location change stops it.

**Panels** (`Stub`, `Pause`, `Settings`, `Navigation`) extend `PanelScene` (`src/ui/PanelScene.ts`):
`open(data)` pauses every running non-overlay scene, turns off UiScene's input and resolves when
the panel closes; panels stack. See [HOWTO-ui.md](HOWTO-ui.md).

## Services

Created once in `src/core/services.ts` before Phaser starts; every scene imports the `services`
object. No DI container, no Phaser registry.

| `services.`  | Class                                   | One line                                                                                 |
| ------------ | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| `events`     | `EventBus<GameEvents>` (`core/events`)  | Typed event bus; all events and payloads are listed in `core/events/events.ts`.          |
| `state`      | `GameState` (`core/state`)              | Story flags (`state.flags`), the current act/location/spawn (`state.current`), the save. |
| `flow`       | `FlowService` (`core/flow`)             | New game, continue, retry, acts, `goTo`, checkpoints, deaths, endings, main menu.        |
| `cutscenes`  | `CutsceneService` (`core/cutscene`)     | Plays cutscene scripts one at a time (`play(id)`, queued), cancels them on leaving.      |
| `save`       | `SaveService` (`core/state`)            | The single save slot in `localStorage` (`space-owner.save`).                               |
| `settings`   | `SettingsService` (`core/settings`)     | Music and SFX volume in `localStorage` (`space-owner.settings`), apart from the save.      |
| `audio`      | `AudioService` (`core/audio`)           | Music with crossfade, sound effects, volumes; over Phaser's sound manager.               |
| `simulation` | `SimulationService` (`core/simulation`) | Runs the act 2 ship simulation: start, pause, resume, stop, tick, snapshot, thrust.      |

Not a service but core too: `DialogueRunner` (`core/dialogue`, one per open dialogue, created by
`UiScene.openDialogue`) and the `Controls` interface (`core/input/controls.ts`: actions
`moveUp/Down/Left/Right`, `interact` (E), `cancel` (Esc), `confirm` (Enter, Space); scenes ask
for actions, not keys).

`main.ts` also subscribes to `game.events` `STEP` and calls `services.audio.tick(delta)` and
`services.simulation.tick(delta)` there, not in a scene: panels pause the world scene, but fades
and the simulation keep running.

## Location lifecycle

```
services.flow.goTo(location, spawn)           core/flow/FlowService.ts
  sets state.current { actId, locationId, spawn }; ignores a second goTo while one runs
  -> SceneDriver.goTo                         scenes/PhaserSceneDriver.ts
       closes open panels, locks the hero ('transition'),
       UiScene fader fades to black (250 ms; at once from Boot),
       stops every non-overlay scene, starts World with { locationId, spawn }
  -> WorldScene.init / create                 scenes/WorldScene.ts
       loadLocation                           world/LocationLoader.ts
         background image (the world size), the Tiled map's `collisions` -> static walls,
         `objects` -> MapObject list (the image layer is ignored); checks bindings
       NPC actors from `npc` bindings, the hero at the spawn, colliders, camera follow
       Interactables: doors, NPCs, interactables, triggers from the location's `bindings`
       audio.playMusic(def.music) when the location has one
       events.emit('locationEntered', { locationId, spawn })
  -> fader fades in (250 ms), goTo's promise resolves
```

What a location is made of: `src/content/locations/<id>.ts` (`LocationDef`: title, background,
map, music, bindings by object name), the map `public/assets/maps/<id>.tmj` (geometry and names
only) and the background image. See [HOWTO-location.md](HOWTO-location.md).

## Where state lives

| What                 | Where                                                       | Persists                         |
| -------------------- | ----------------------------------------------------------- | -------------------------------- |
| Story flags          | `services.state.flags` (`Flags`), keys like `engineer.met`  | in the save, at checkpoints      |
| Act, location, spawn | `services.state.current` (set by `FlowService`)             | in the save, at checkpoints      |
| Ship simulation      | `SimulationService` (a `Simulation` and its snapshot)       | snapshot in the save             |
| The save             | `localStorage` `space-owner.save` (`SaveService`, version 1)  | until New Game                   |
| Volumes              | `localStorage` `space-owner.settings` (`SettingsService`)     | always; New Game keeps them      |
| Scene-local state    | the scene instance (hero position, open dialogue, controls) | no; lost when the scene restarts |

Only `flow.checkpoint()` writes the save. Continue and Retry are one mechanism: load the last
checkpoint (flags as they were then, the simulation snapshot) and `goTo` its spawn.

## Sessions and acts

The story is a list of acts in `src/content/story/index.ts` (prologue, act 1, act 2, act 3), in
story order. `flow.startAct(id)` shows the act's title on a black screen (`showActTitle`) and
runs `act.start(flowApi)`, which must `goTo` a location (then usually `checkpoint()`) or end the
game. Every new game, continue, act start, ending or return to the menu starts a new **session**:
the `FlowApi` given to an act belongs to its session, so a script still running from an act the
player has left cannot pull them back (its late calls are ignored). Leaving for an ending or the
menu also cancels a playing cutscene. See [HOWTO-story.md](HOWTO-story.md).

## The simulation's lifecycle

`FlowService` owns it. An act starts it through `flow.startSimulation()` (act 2: `goTo` the ship
deck, `startSimulation()`, `checkpoint()`); every new session stops it. A checkpoint stores
`simulation.snapshot()` in the save; Continue restores it with `start(snapshot)`. The STEP hook
in `main.ts` ticks it every frame, also while a panel pauses the world; only the pause menu
pauses it. It emits `simulationTick` about four times a second (not every frame); that event is
not recorded in `window.__nasaEvents`. The model is plain TypeScript in `src/core/simulation`
with `// OWNER: physics` marks; see [HOWTO-simulation.md](HOWTO-simulation.md).

## Content and engine

**Content** is what the team adds without changing how the game works: everything in
`src/content/` (locations, characters, dialogues, cutscenes, acts, endings, solar system, ship),
asset registry entries in `src/assets/`, files in `public/assets/` (art, sound, Tiled maps) and
theme values in `src/ui/theme.ts`.

**Engine** is the rest: `src/core/` (including the simulation formulas, which the physics owner
changes), `src/scenes/`, `src/ui/`, `src/world/`, `src/debug/`, `main.ts`, `tools/`. New kinds
of behaviour (a new binding kind, a new cutscene API call, a new panel) are engine changes.

## Naming conventions

- Classes and the files that hold one class: PascalCase (`FlowService.ts`, `WorldScene.ts`).
- Modules of functions or constants: camelCase (`controls.ts`, `startParams.ts`, `keys.ts`).
- Content and asset files: kebab-case (`demo-room.ts`, `demo-engineer.ts`, `music-demo.wav`).
- Content ids are the object keys of their registries (`locations`, `dialogues`, `cutscenes`,
  `acts`, `endings`, `images`, `audio`, ...); types derive from them (`LocationId = keyof typeof
locations`). No `id` or `key` fields: a typo in an id is a compile error.
- Map object names: `spawn-default`, `spawn-from-<location>`, `door-<location>`,
  `npc-<character>`, `point-<what>`, `trigger-<what>`. Flags: `<area>.<fact>` (`engineer.met`).
- Asset keys: `location-<id>`, `portrait-<character>`, `npc-<character>` sheets, `music-*`,
  `sfx-*`, `ui-*`.
- Named exports only (no `export default`); a short JSDoc on every export; the `@/` alias means
  `src/`.

## Debug surface

- **URL parameters** (dev and production builds): `?location=<id>&spawn=<name>` opens a
  location outside the story (act `debug`); `?act=<id>` starts an act with its title (wins over
  `location`); `?overlay=1` turns on the overlay at start; `?debug=1` exposes `window.nasa` in a
  production build (it is always there in `npm run dev`). Read in `src/debug/startParams.ts` and
  `src/config.ts` (`DEBUG`).
- **`window.nasa`** = `{ services, game }` (`src/debug/hooks.ts`). From the browser console:
  `nasa.services.state.flags.toRecord()`, `nasa.services.flow.gameOver('death-generic')`,
  `nasa.services.save.load()`, `nasa.services.audio.debugInfo()`,
  `nasa.services.simulation.snapshot()`, and every scene's `debugInfo()`:
  `nasa.game.scene.getScene('World').debugInfo()` (also `MainMenu`, `Ui`, `Pause`, `Settings`,
  `Navigation`, `Ending`, `Debug`). Debug mode also records every event in
  `window.__nasaEvents` and scene readiness in `window.__nasaReadyLog`, for the smoke tool.
- **Overlay** (`DebugScene`, F3 or `?overlay=1`): FPS, location and spawn, the hero's feet in
  map pixels (the numbers Tiled uses), the focused object, act, music, simulation time scale and
  day, flag count and the last 5 changed flags. Draws above everything, the fader included.
- **Smoke** (`npm run smoke`, `tools/smoke.mjs`): builds the game, serves the production build
  with `vite preview`, opens it in headless Chromium with `debug=1` and runs a scenario from
  `tools/smoke/scenarios/`; fails on any console error, page error or failed request. See
  [CONTRIBUTING.md](CONTRIBUTING.md#checks).
