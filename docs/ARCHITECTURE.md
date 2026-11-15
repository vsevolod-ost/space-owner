# Architecture

How the game is put together: the layers and which may import which, the scenes, the services,
how a location loads, where state lives, and the debug tools. The "how to add X" guides are in
the [HOWTO files](../README.md#documentation); this page is the map behind them.

References like "plan S8" / "plan D14" and "GDD `res-list`" / "GDD D12" in the code and the
docs point to the architect's working notes (the implementation plan and the game design
document), which are not in the repository; the code and these docs are authoritative.

Stack: TypeScript, [Phaser 4.2](https://phaser.io) (WebGL, Arcade physics), Vite. The game renders
at 640×360 (`GAME_WIDTH`, `GAME_HEIGHT` in `src/config.ts`, the only place the size is set) and
is scaled up by a whole factor.

## Layers

```
src/
  core/      model and services: state, flags, save, flow, dialogue runner, cutscene service,
             audio, simulation, voyage (cargo, flows, gates, forecast, events, colony tiers),
             text formatting, locale (text pairs, `tr`, the language service, body names),
             input actions. No Phaser (one `import type`, see below).
  content/   the game itself as typed data and scripts: locations, characters, dialogues,
             cutscenes, story acts, endings, the solar system and the ship, and the voyage
             (content/voyage: gates, legs, cargo, events, colony sites).
  assets/    registries of files in public/assets (images, sprite sheets, audio, maps).
  scenes/    Phaser scenes (view and input) and PhaserSceneDriver.
  ui/        UI kit (panel, button, text, label, toast, choice list, fader), PanelScene, theme,
             the dialogue window.
  world/     what WorldScene is made of: the location loader, actors, player, interactables,
             keyboard controls, the world context and the cutscene stage.
  debug/     URL start parameters and the `window.nasa` hooks.
  devtools/  headless Node tools over core + content: `npm run voyage-check`, `npm run balance`.
             Not in the bundle (nothing imports them); own tsconfig (Node types).
  config.ts  resolution, tile size, debug flag.
  main.ts    creates the Phaser game and wires the services to it.
```

### The dependency rule

| Layer                   | May import at run time                                                                                                                 | May import as `import type` |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `core`                  | other `core` modules, `config`, `debug/globals` (the event recorder)                                                                   | `content`, `assets`, Phaser |
| `content`               | other `content` modules (registries import their entries), pure helpers from `core` (`core/locale/text`, `core/locale/names` included) | anything                    |
| `scenes`, `ui`, `world` | `core`, `content`, `assets`, each other, Phaser                                                                                        | anything                    |
| `assets`                | nothing                                                                                                                                | -                           |
| `devtools`              | `core`, `content`, Node; never `config`, `core/services`, the event bus (they read `window` on load)                                   | anything                    |
| `main.ts`               | everything: it is the one place that hands content to core                                                                             | -                           |

- **Core never imports Phaser.** The single exception is `import type Phaser from 'phaser'` in
  `src/core/audio/AudioService.ts`; it is erased at build time. Anything core needs from the
  engine goes through an interface that a scene-side class implements: `SceneDriver`
  (`src/core/flow/SceneDriver.ts`, implemented by `src/scenes/PhaserSceneDriver.ts`),
  `CutsceneStage` (implemented by `src/world/WorldCutsceneApi.ts`), the sound manager handed to
  `AudioService`, and `Controls` (`src/core/input/controls.ts`, implemented by
  `src/world/KeyboardControls.ts`).
- **Core never imports content at run time.** It uses content _types_ (`LocationId`,
  `DialogueId`, `ActId`, ...) to check ids, but the registries themselves arrive through
  `attach` calls in `src/main.ts`:
  `flow.attach(driver, { acts, actOrder, endings, debrief, landingAct })`,
  `cutscenes.attach(stage, cutscenes)`, `audio.attach(game.sound)`,
  `simulation.attach({ bodies: solarSystem, ship, gates, legs })`,
  `voyage.attach(cargo, voyageEvents, colony)`. So core can be read, and tested headless (the
  devtools do), without the game's content or the engine.
- **Lint enforces both rules.** `eslint.config.js` sets `@typescript-eslint/no-restricted-imports`
  for `src/core/**/*.ts`: a run-time import of `phaser`, `@/content`, `@/assets`, `@/scenes`,
  `@/ui`, `@/world` (or anything under them), `@/debug/hooks` or `@/debug/startParams` fails
  `npm run lint`; `import type` passes. `@/config` and `@/debug/globals` stay allowed. Relative
  paths that climb out of `core` are not caught: always use the `@/` alias.
- **Content modules reference each other with `import type`** (a location names a dialogue by
  its id, typed by `import type { DialogueId }`), so there are no import cycles at run time. A
  registry file (`content/*/index.ts`) imports its entries as values.
- **Content may use pure core helpers**: `defineDialogue` (`core/dialogue/types.ts`), `DAY_S`
  (`core/simulation/constants.ts`), `formatText` (`core/text/format.ts`), `cargoFlag`
  (`core/voyage/loadout.ts`), and at run time `TODO` / `tr` from `core/locale/text.ts` and
  `bodyName` from `core/locale/names.ts` (both import nothing but types, so they load in the
  devtools' Node too; never import `core/locale/LocaleService.ts` from content). A location whose objects follow a registry that content may only
  import as a type (the warehouse's crates follow the cargo registry) gives `bindings` (or
  `background`) as a function of `{ voyage }`, which the world calls with `services.voyage`
  (`src/world/bindings.ts`). One location script opens a panel scene by its key
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

| Key            | Class (`src/scenes/`) | What it is                                                            | Started by                                                                     |
| -------------- | --------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `Boot`         | `BootScene`           | Loads every asset registry and the font, creates the animations       | Phaser (first in the list)                                                     |
| `MainMenu`     | `MainMenuScene`       | Continue / New Game / Settings / About                                | Boot (no URL parameters), `PhaserSceneDriver.toMainMenu`                       |
| `Stub`         | `StubScene`           | Placeholder panel ("About"); smallest `PanelScene` example            | MainMenu                                                                       |
| `World`        | `WorldScene`          | The current location: background, walls, hero, NPCs, interactables    | `PhaserSceneDriver.goTo` (from `flow.goTo`); restarted for every location      |
| `Ending`       | `EndingScene`         | End screen of an ending: title, text, tier line, Fly again, Main menu | `PhaserSceneDriver.showEnding` (from `flow.finish`)                            |
| `Ui`           | `UiScene`             | Overlay: "E" hint, toasts, dialogue window, act titles, fader         | Boot (`scene.launch`), runs for the whole game                                 |
| `Pause`        | `PauseScene`          | Pause menu: Resume / Settings / (Return to warehouse) / Main menu     | World on Esc when the hero's controls are not locked                           |
| `Settings`     | `SettingsScene`       | Music and SFX volume (panel)                                          | MainMenu, Pause                                                                |
| `Navigation`   | `NavigationScene`     | Gate ribbon, system map, resources, gate cards, alarm flash           | the navigation station on the ship deck (`src/content/locations/ship-deck.ts`) |
| `EventStation` | `EventStationScene`   | A voyage event's card at its deck station (airlock, radio, ...)       | the alarm's deck station (`ship-deck.ts`)                                      |
| `AlarmBar`     | `AlarmBarScene`       | Act 2's station alarm: event, station, seconds left, countdown bar    | Boot (`scene.launch`), runs for the whole game                                 |
| `Debug`        | `DebugScene`          | Debug overlay (F3, `?overlay=1`)                                      | Boot (`scene.launch`), runs for the whole game                                 |

Boot with `?act=<id>` calls `flow.startAct`, with `?location=<id>` calls `flow.goTo`; otherwise
it starts MainMenu. The menu's New Game and Continue call `flow.newGame()` /
`flow.continueGame()`. A lost voyage (`voyageEnded` with `died`, or "Return to warehouse")
runs `flow.die(cause)`: the death loop to the warehouse and the scientists' debrief
(docs/HOWTO-story.md).

**Overlay scenes.** `Ui`, `AlarmBar` and `Debug` are listed in `OVERLAY_SCENES` (`src/scenes/keys.ts`):
they run for the whole game above everything else (`AlarmBar` and `Debug` re-raise themselves
over panels that open, `AlarmBar` only during an alarm and under `Debug`). Panels do not pause them and scene changes do
not stop them (`PanelScene.open` and `PhaserSceneDriver` skip every key for which
`isOverlayScene(key)` is true). A new always-on layer must be added to `OVERLAY_SCENES`, or the
next panel pauses it and the next location change stops it.

**Panels** (`Stub`, `Pause`, `Settings`, `Navigation`, `EventStation`) extend `PanelScene` (`src/ui/PanelScene.ts`):
`open(data)` pauses every running non-overlay scene, turns off UiScene's input and resolves when
the panel closes; panels stack. See [HOWTO-ui.md](HOWTO-ui.md).

## Services

Created once in `src/core/services.ts` before Phaser starts; every scene imports the `services`
object. No DI container, no Phaser registry.

| `services.`    | Class                                   | One line                                                                                               |
| -------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `events`       | `EventBus<GameEvents>` (`core/events`)  | Typed event bus; all events and payloads are listed in `core/events/events.ts`.                        |
| `state`        | `GameState` (`core/state`)              | Story flags (`state.flags`), the current act/location/spawn (`state.current`), the save.               |
| `flow`         | `FlowService` (`core/flow`)             | New game, continue, acts, `goTo`, checkpoints, the death loop, endings, main menu.                     |
| `cutscenes`    | `CutsceneService` (`core/cutscene`)     | Plays cutscene scripts one at a time (`play(id)`, queued), cancels them on leaving.                    |
| `save`         | `SaveService` (`core/state`)            | The single save slot in `localStorage` (`space-owner.save`).                                           |
| `settings`     | `SettingsService` (`core/settings`)     | Music and SFX volume and the language in `localStorage` (`space-owner.settings`), apart from the save. |
| `locale`       | `LocaleService` (`core/locale`)         | The language `tr` shows; `setLanguage` stores it and emits `languageChanged`.                          |
| `audio`        | `AudioService` (`core/audio`)           | Music with crossfade, sound effects, volumes; over Phaser's sound manager.                             |
| `simulation`   | `SimulationService` (`core/simulation`) | Runs the act 2 ship simulation: start, hold/release, stop, tick, snapshot, clone.                      |
| `voyage`       | `VoyageService` (`core/voyage`)         | Cargo, event and colony registries; what `cargo.<id>` puts aboard; colony tiers.                       |
| `stationAlarm` | `StationAlarmService` (`core/alarm`)    | Act 2's alarm: the open event's deck station and real-time countdown; the timeout.                     |

Not a service but core too: `DialogueRunner` (`core/dialogue`, one per open dialogue, created by
`UiScene.openDialogue`) and the `Controls` interface (`core/input/controls.ts`: actions
`moveUp/Down/Left/Right`, `interact` (E), `cancel` (Esc), `confirm` (Enter, Space); scenes ask
for actions, not keys).

`main.ts` also subscribes to `game.events` `STEP` and calls `services.audio.tick(delta)`,
`services.simulation.tick(delta)` and `services.stationAlarm.tick(delta)` there, not in a scene: panels pause the world scene, but fades
keep running and the simulation advances while the navigation panel is open.

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
         background layers (`backgroundOf`: one image, a list, or built from `{ voyage }`;
         the first layer's size is the world size), the Tiled map's `collisions` -> static
         walls, `objects` -> MapObject list (the image layer is ignored); checks bindings
         (`bindingsOf`: an object, or built once from `{ voyage }`)
       NPC actors from `npc` bindings whose `when` holds, the hero at the spawn, colliders,
       camera follow
       Props (world/Props.ts): pictures of `prop` objects and interactables with `prop`,
         background layers shown, all re-read from the state; the HOLD strip (`showHold`)
       Interactables: doors, NPCs, interactables, triggers from the location's `bindings`
       audio.playMusic(def.music) when the location has one
       events.emit('locationEntered', { locationId, spawn })
  -> fader fades in (250 ms), goTo's promise resolves
```

**Deferred rebuild.** Every `flagChanged` marks the world dirty; `WorldScene.update` rebuilds on
the next frame with no dialogue open and no cutscene playing (a panel pauses the scene, so it
waits for the panel too): NPCs and objects whose `when` changed appear or go, props and background layers
are re-read, the HOLD strip refreshes. The hero and the NPCs keep their positions; the scene is
not restarted. `WorldScene.debugInfo()` has `rebuilds` and `rebuildPending`.

What a location is made of: `src/content/locations/<id>.ts` (`LocationDef`: title, background,
map, music, `showHold`, bindings by object name), the map `public/assets/maps/<id>.tmj`
(geometry and names only; the four maps of the game are generated by `tools/make_maps.py`) and
the background images. See [HOWTO-location.md](HOWTO-location.md).

## Where state lives

| What                 | Where                                                        | Persists                         |
| -------------------- | ------------------------------------------------------------ | -------------------------------- |
| Story flags          | `services.state.flags` (`Flags`), keys like `engineer.met`   | in the save, at checkpoints      |
| Act, location, spawn | `services.state.current` (set by `FlowService`)              | in the save, at checkpoints      |
| Voyage (act 2)       | `SimulationService` (a `Voyage` and its `Simulation`)        | no: `voyage: true` + `run.seed`  |
| The save             | `localStorage` `space-owner.save` (`SaveService`, version 2) | until New Game                   |
| Volumes              | `localStorage` `space-owner.settings` (`SettingsService`)    | always; New Game keeps them      |
| Scene-local state    | the scene instance (hero position, open dialogue, controls)  | no; lost when the scene restarts |

Only `flow.checkpoint()` writes the save. Continue loads the last checkpoint (flags as they were
then; a voyage under way starts again from its start with the same seed) and `goTo`s its spawn.
Flag tiers (plan D17): `cargo.*`, `advice.*` survive deaths, `run.*` lives until New game,
`voyage.*` / `event.*` are deleted at every voyage start (docs/HOWTO-story.md).

## Sessions and acts

The story is a list of acts in `src/content/story/index.ts` (prologue, act 1, act 2, act 3), in
story order. `flow.startAct(id)` shows the act's title on a black screen (`showActTitle`) and
runs `act.start(flowApi)`, which must `goTo` a location (then usually `checkpoint()`) or end the
game. Every new game, continue, act start, ending or return to the menu starts a new **session**:
the `FlowApi` given to an act belongs to its session, so a script still running from an act the
player has left cannot pull them back (its late calls are ignored). Every new session also
cancels a playing cutscene and drops the queued ones. See [HOWTO-story.md](HOWTO-story.md).

## The simulation's lifecycle

`FlowService` owns it. An act starts it through `flow.startVoyage()` (act 2: `goTo` the ship
deck, `startVoyage()`, `checkpoint()`); every new session stops it. A checkpoint does not store
it, only marks the save (`voyage: true`, while the voyage is under way: not after Stop or a
death); Continue starts the voyage again with the same
`run.seed` (plan D17). The STEP hook
in `main.ts` ticks it every frame, but simulated time advances only while no hold reason is set
(`hold(reason)` / `release(reason)`): the navigation panel releases `panel` while it is open; a
gate holds `gate`, an open event `event`, the pause menu `pause`, a hidden tab `blur`. Every new session resets the holds. It emits `simulationTick` about four times a second (not every frame); that event is
not recorded in `window.__nasaEvents`. The model is plain TypeScript in `src/core/simulation`
with `// OWNER: physics` marks; see [HOWTO-simulation.md](HOWTO-simulation.md).

## The voyage and how act 2 ends

Three layers, none with Phaser:

- `Simulation` (`core/simulation`): the physics of one flight - bodies, the ship, the
  autopilot (Lambert transfers), the ship's mass M(t) and its fuel in kilograms burnt by the
  rocket equation, the resource flows per substep, deaths. Deterministic: the same
  start flies the same, whatever the frame rate ([HOWTO-simulation.md](HOWTO-simulation.md)).
- `Voyage` (`core/voyage/Voyage.ts`): drives a `Simulation` through the gate chain - parks at a
  gate, `goOn()` / `stopHere()`, rolls and applies the events with the run's seed, computes the
  gate forecast on a headless copy, and ends `landed` or `died` (`VoyageOutcome`). The pure
  parts beside it: `flows.ts` (resources, deaths, alarm), `loadout.ts` (cargo flags to a
  loadout), `forecast.ts`, `voyageEvents.ts`, `colony.ts` (tiers), `random.ts` (seeded rolls).
- `SimulationService` (`services.simulation`): runs the `Voyage` in the game - start, the hold
  reasons, the per-frame tick from `main.ts`, the bus events (`gateReached`, `voyageEvent`,
  `shipAlarm`, `voyageEnded`, ...) and the `voyage.*` / `event.*` flag mirrors. `VoyageService`
  (`services.voyage`) holds the registries and answers what is aboard.
- `StationAlarmService` (`services.stationAlarm`, `core/alarm/`): while the voyage waits for an
  answer (phase `event`, which happens only while the navigation panel is open), an alarm is on for
  the open event: its deck station (`station` of the event; `{ bayOf }` is resolved to
  `bay-access-N` by the hold, `core/alarm/station.ts`) and a real-time countdown
  (`STATION_TIMER_S`, standing under `pause` and `blur`). Bus events `stationAlarm { eventId, station,
active }` and `stationAlarmTimedOut`; when the timer runs out the event's `timeoutChoice` is
  answered with its bad outcome forced (`answerEvent(id, { forceHit: true })`). The scenes
  around it: `NavigationScene` flashes the alarm and closes (`ALARM_FLASH_MS`), the deck's
  stations open `EventStationScene` with the card (`ship-deck.ts`), `AlarmBarScene` draws the
  timer, `src/ui/StationMarker.ts` the pointer over the station, `src/scenes/stationFlow.ts`
  puts results on the deck as toasts and opens the panel on LOST after a death at a station,
  `src/scenes/stationSound.ts` raises the drum layer of the deck's music
  ([HOWTO-voyage.md](HOWTO-voyage.md#events-on-the-way)).

The devtools (`src/devtools/`) build the same `Voyage` from the same content in Node: what
`npm run voyage-check` and `npm run balance` say is what the game does
([HOWTO-voyage.md](HOWTO-voyage.md#how-to-balance)).

How the voyage ends is `FlowService`'s (it listens to `voyageEnded`):

- **Landing** (Stop at a gate): the panel shows LANDED for `LANDING_BEAT_MS`, then
  `startAct(landingAct)` - act 3, the colony, with the title "<Body> · day N". Its `overlook`
  calls `flow.finish('colony-<body>')`: `SceneDriver.showEnding` and `EndingScene` (title, text,
  tier line, "Fly again" / "Main menu"). **Fly again** (`flow.flyAgain()`): `run.attempt` + 1,
  `run.bestGate` raised, back to the warehouse at the hatch (act 1, no title) with the cargo,
  and a checkpoint.
- **Death** (or "Return to warehouse" in the pause menu, cause `abort`): the flight summary is
  taken at once, the panel shows LOST for `LOSS_BEAT_MS`, then `flow.die(cause)` - the death
  loop: `run.*` flags, the warehouse's `debrief` spawn on a black screen, a checkpoint, the
  scientists' debrief cutscene, the hero at the hatch. There is no game over
  ([HOWTO-story.md](HOWTO-story.md#the-death-loop-gdd-d7-plan-d18)).

Both are guarded by the session: leaving for the menu during the beat cancels them.

## Text and languages

Every visible string is a `LocalText` pair `{ en: '...', uk: TODO, max? }` written where it is
used (`src/core/locale/text.ts`); `tr(pair)` returns the current language's string (English
while `uk` is `TODO`) and is called when the text is built or drawn, never at module level.
Pairs travel as pairs through content and core (event texts, the voyage's results, body names
by id through `bodyName` in `core/locale/names.ts`, which `main.ts` fills from the solar
system); the view calls `tr`. The UI kit and `SceneDriver` take finished strings. Core itself
calls `tr` only in `resolveText` (`core/text/format.ts`) and for the checkpoint toast
(`FlowService`).

`LocaleService` (`services.locale`) picks the language at start: `?lang=` (applied in `main.ts`,
not stored) over the language saved in the settings over the browser's languages (the first of
`navigator.languages` that is Ukrainian or English decides) over `en`. `setLanguage` stores
`en`/`uk`, sets `document.documentElement.lang` and emits `languageChanged`; the settings panel
and the scenes visible under it rebuild their text on it (`PanelScene.rebuildOnLanguageChange`).
`pseudo` (only `?lang=pseudo` or `nasa.services.locale.setLanguage('pseudo')`) is a test
language. Details: [HOWTO-localization.md](HOWTO-localization.md).

## Content and engine

**Content** is what the team adds without changing how the game works: everything in
`src/content/` (locations, characters, dialogues, cutscenes, acts, endings, solar system, ship,
the voyage's gates, legs, cargo, events and colony sites),
asset registry entries in `src/assets/`, files in `public/assets/` (art, sound, Tiled maps) and
theme values in `src/ui/theme.ts`.

**Engine** is the rest: `src/core/` (including the simulation formulas, which the physics owner
changes), `src/scenes/`, `src/ui/`, `src/world/`, `src/debug/`, `src/devtools/`, `main.ts`,
`tools/`. Every number and text meant for the team carries an `OWNER: physics|design|script|art`
comment: `grep -rn "OWNER:" src` is the work list. New kinds
of behaviour (a new binding kind, a new cutscene API call, a new panel) are engine changes.

## Naming conventions

- Classes and the files that hold one class: PascalCase (`FlowService.ts`, `WorldScene.ts`).
- Modules of functions or constants: camelCase (`controls.ts`, `startParams.ts`, `keys.ts`).
- Content and asset files: kebab-case (`ship-deck.ts`, `engineer-advice.ts`, `music-act1.mp3`).
- Content ids are the object keys of their registries (`locations`, `dialogues`, `cutscenes`,
  `acts`, `endings`, `images`, `audio`, ...); types derive from them (`LocationId = keyof typeof
locations`). No `id` or `key` fields: a typo in an id is a compile error.
- Map object names: `spawn-default`, `spawn-from-<location>`, `door-<location>`,
  `npc-<character>`, `point-<what>`, `trigger-<what>`; places made from a registry:
  `crate-<cargo id>` (`crate-fuel-1..3`), `bay-<n>`, `build-<n>`, `post-<n>`. Flags:
  `<area>.<fact>` (`engineer.met`); tiers `cargo.*`, `advice.*`, `run.*`, `voyage.*`,
  `event.*`.
- Asset keys: `location-<id>`, `portrait-<character>`, `npc-<character>` sheets, `music-*`,
  `sfx-*`, `ui-*`.
- Named exports only (no `export default`); a short JSDoc on every export; the `@/` alias means
  `src/`.

## Debug surface

- **URL parameters** (dev and production builds): `?location=<id>&spawn=<name>` opens a
  location outside the story (act `debug`); `?act=<id>` starts an act with its title (wins over
  `location`); `?overlay=1` turns on the overlay at start; `?debug=1` exposes `window.nasa` in a
  production build (it is always there in `npm run dev`). Read in `src/debug/startParams.ts` and
  `src/config.ts` (`DEBUG`). `?seed=<n>` fixes the seed of the voyage's events
  (`readSeedParam`; the smoke scenarios use 1). `?lang=en|uk|pseudo` shows that language for
  the page load without storing it (`readLangParam`; `h.goto` in the smoke tool adds `lang=en`).
- **`window.nasa`** = `{ services, game }` (`src/debug/hooks.ts`). From the browser console:
  `nasa.services.state.flags.toRecord()`, `nasa.services.flow.die('abort')`,
  `nasa.services.save.load()`, `nasa.services.audio.debugInfo()`,
  `nasa.services.simulation.snapshot()`, `nasa.services.simulation.voyage`,
  `nasa.services.simulation.setDebugWarp(20)` (the flight 20 times faster),
  `nasa.services.stationAlarm.debugInfo()` / `.setDebugTimer(ms)` (the alarm's timer),
  `nasa.services.flow.setDebugLossBeat(ms)` (how long the panel shows LOST),
  `nasa.services.locale.debugInfo()` / `.setLanguage('pseudo')`, and every scene's
  `debugInfo()`:
  `nasa.game.scene.getScene('World').debugInfo()` (also `MainMenu`, `Ui`, `Pause`, `Settings`,
  `Navigation`, `EventStation`, `AlarmBar`, `Ending`, `Debug`). Debug mode also records every event in
  `window.__nasaEvents` and scene readiness in `window.__nasaReadyLog`, for the smoke tool.
- **Overlay** (`DebugScene`, F3 or `?overlay=1`): FPS, location and spawn, the hero's feet in
  map pixels (the numbers Tiled uses), the focused object, act, music, simulation time scale,
  day and hold reasons, flag count and the last 5 changed flags. Draws above everything, the fader included.
- **Smoke** (`npm run smoke`, `tools/smoke.mjs`): builds the game, serves the production build
  with `vite preview`, opens it in headless Chromium with `debug=1` and runs a scenario from
  `tools/smoke/scenarios/`; fails on any console error, page error or failed request.
  `npm run smoke:all` (`tools/smoke-all.mjs`) runs every scenario, several at once. See
  [CONTRIBUTING.md](CONTRIBUTING.md#checks).
