# How the story is put together

The game is a list of **acts**. An act shows its title on a black screen, then runs a short
script that puts the hero in a location and saves a **checkpoint**. From there the story goes on
in the world: doors, interactables, triggers, dialogues and cutscenes move it forward, start the
next act or end the game; a voyage lost in act 2 runs the **death loop** back to the warehouse.
Everything goes through `services.flow` (`src/core/flow/FlowService.ts`).

## Where things are

| File                               | What it is                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `src/content/story/<id>.ts`        | One act. File name = act id.                                                     |
| `src/content/story/index.ts`       | Registry of acts **in story order**; `debrief` (death loop place), `landingAct`. |
| `src/content/story/types.ts`       | `Act` and `FlowApi` (what an act's script may call).                             |
| `src/content/endings.ts`           | Endings: the title and text of the end screen.                                   |
| `src/content/cutscenes/debrief.ts` | The scientists' debrief after a lost voyage; its lines by cause.                 |
| `src/core/flow/FlowService.ts`     | New game, continue, acts, checkpoints, death loop, endings, menu.                |
| `src/core/flow/runFlags.ts`        | Names of the `run.*` flags.                                                      |
| `src/scenes/EndingScene.ts`        | The end screen: title, text, tier line, "Fly again", "Main menu".                |
| `src/scenes/PauseScene.ts`         | The pause menu (Esc in the world).                                               |
| `src/scenes/PhaserSceneDriver.ts`  | Moves the scenes for `FlowService`. You do not call it yourself.                 |

## Acts

```ts
// src/content/story/act1.ts
import type { Act } from '@/content/story/types';

/** Act 1: the warehouse, where the cargo is chosen. */
export const act1: Act = {
  title: 'Act 1',
  async start(flow) {
    await flow.goTo('warehouse', 'spawn-default');
    flow.checkpoint();
  },
};
```

Then list it in `src/content/story/index.ts` at its place in the story:

```ts
export const acts = { prologue, act1, act2, act3 } as const satisfies Record<string, Act>;
```

How an act runs (`services.flow.startAct('act1')`):

1. The screen fades to black and the act's `title` shows on it for 1.5 s. The hero cannot move.
2. `start(flow)` runs while the screen is still black. It **must** end in one of:
   - `await flow.goTo(location, spawn)` - the screen fades in on that location;
   - `flow.finish(endingId)` - the end screen.
     An act that does neither leaves the screen black.
3. `flow.checkpoint()` **after** `goTo` has resolved saves the game there (see below).

What `flow` offers an act: `goTo`, `startVoyage`, `checkpoint`, `finish`.
`startVoyage()` starts the voyage for the act with a new seed for its events (act 2 does: `goTo`
the ship deck, `startVoyage()`, `checkpoint()`); "Continue" from that checkpoint starts it again
with the same seed; see docs/HOWTO-simulation.md. If the player leaves the
act while its script still runs (main menu during the title, another act, an ending), the
script's later calls are ignored, so it cannot pull the player back.

Ways to start an act:

- **New game** in the menu starts the first act of the registry (`prologue`).
- A **door** with `act`: `'door-warehouse': { kind: 'door', act: 'act1' }` in `home.ts`.
  A door need not be in a gap of a wall: any rectangle the hero can walk into works.
- From any script: `ctx.flow.startAct('act2')` in an interactable or trigger,
  `services.flow.startAct('act2')` in a dialogue effect, or `services.flow.nextAct()` (the act
  after the current one in the registry order).
- From the URL, for testing: `?act=act2` (an unknown id warns and opens the menu).

## Checkpoints (saving)

There is one save slot in `localStorage` (key `space-owner.save`). `checkpoint()` writes the
current act, location, spawn, all story flags and whether a voyage is under way (no simulation
state: "Continue" starts the voyage again from its start with the same cargo and seed), and
shows a "Checkpoint" toast. A save of another version (`SAVE_VERSION`) counts as none. Nothing else saves the game: put a checkpoint wherever losing progress would
hurt - at the start of every act, before a dangerous place, after an important choice.

```ts
// an interactable that saves: a save station
'save-station': { kind: 'interactable', run: (ctx) => ctx.flow.checkpoint() },
```

The hero reappears at the checkpoint's **spawn point**, not where he stood when it was saved.
If the browser cannot store the save (private mode, full storage) the game goes on unsaved and
the console shows a warning.

## The death loop (GDD D7, plan D18)

A death always shows on the navigation panel. Most happen there, while time runs (resources, drift);
an event's answer or its alarm running out at a deck station can kill too (plan act2-stations:
events are answered at the deck's stations, not on the panel), and then the station's card
closes and the panel opens by itself on LOST (`src/scenes/stationFlow.ts`). There is no death
screen: `FlowService` hears `voyageEnded` with `died`, lets the panel show LOST for 1 s
(`LOSS_BEAT_MS`, the summary is taken at once) and runs `flow.die(cause)`:

1. a `FlightSummary` (`src/core/voyage/flightSummary.ts`) is taken while the voyage exists:
   cause, last gate reached, the body flown to, the leg and how far along it, the day;
2. the simulation stops, all holds reset, a new session begins (the act 2 script goes quiet,
   a running cutscene is cancelled);
3. the `run.*` flags are written (below) and `flightLost` is emitted;
4. `goTo` the place in `debrief` (`src/content/story/index.ts`): the warehouse's `debrief`
   spawn, before the scientists' booth, in act 1, without the act's title; the screen stays
   black;
5. a checkpoint there (no voyage in it: "Continue" comes back to the warehouse);
6. the `debrief` cutscene: the scientists stand at `post-1` and `post-2`, three lines by
   cause (`LINES` in `src/content/cutscenes/debrief.ts`; `{cause}`, `{gate}`, `{next}`,
   `{day}` from the `run.*` flags; an unknown cause gets `GENERIC`);
7. a fade, and the hero stands at the hatch (`spawn-hatch`) with the cargo still aboard.

The warehouse's arrival cutscene does not replay (its trigger is `once`); the prologue is not
repeated. During a voyage the pause menu also has **Return to warehouse**: the same loop with
cause `abort`. From the console: `nasa.services.flow.die('abort')` (any cause string works;
the debrief says what it has lines for).

### State tiers (plan D17)

| Flags                                                                                                 | What                      | Cleared               |
| ----------------------------------------------------------------------------------------------------- | ------------------------- | --------------------- |
| `cargo.<id>`                                                                                          | crates aboard             | never by a death      |
| `advice.*`                                                                                            | what the advisers said    | never by a death      |
| `run.attempt`, `lastCause`, `lastGate`, `bestGate`, `seed`, `lastDay`, `lastGateName`, `lastNextName` | the count across attempts | only by New game      |
| `voyage.*`, `event.*`                                                                                 | the voyage under way      | at every voyage start |

`run.attempt` is unset (attempt 1) in a new game and grows by one with every death, abort or
Fly again; gates are indices (`-1`: none reached), `run.bestGate` is the highest gate any voyage
reached or landed at. The voyage's own flags, for texts and conditions: `voyage.gateIndex`,
`voyage.gate` (body of the last gate reached), `voyage.day`, `voyage.nextGate`,
`voyage.legProgress` (0-100); after Stop `voyage.stopGate`, `voyage.stopBody`,
`voyage.stopName`, `voyage.o2Days`; after a death `voyage.cause`; `event.<id>` (the chosen answer) and
`event.<id>.hit` (it went wrong). They stay readable in the colony and on the end screen, and go
at the next voyage's start. Other flags (`warehouse.arrivalSeen`, the prologue's)
live on like `cargo.*`. New game clears everything.

## Endings

Stop at a gate lands the ship: after a moment on the panel act 3 starts (`landingAct` in
`src/content/story/index.ts`) with the title card "<Body> · day N" and the colony, painted and
built by the `voyage.stopBody` and `cargo.*` flags (`src/content/locations/colony.ts`). Its
`overlook` calls `flow.finish('colony-<body>')`: the end screen (`EndingScene`) with the
body's title and text, the line of the colony's tier (`colonyFit`, `src/core/voyage/colony.ts`)
and "Fly again" (back to the warehouse at the hatch, cargo and `run.*` kept) / "Main menu".
The texts live in `src/content/endings.ts`: one entry per colony site, and three common tier
lines (`TIER_LINES`) that an entry may replace with its own `tiers`:

```ts
export const endings = {
  'colony-mars': { title: 'Mars', text: '[TODO: a colony under a butterscotch sky]' },
  // ...
} as const satisfies Record<`colony-${ColonyBodyId}`, Ending>;
```

The ids are checked by the compiler: a misspelt ending id does not build.

## Restarts and the story

"Continue" in the main menu (`continueGame()`) loads the last checkpoint - act, location, spawn
and **all flags as they were when it was saved**. Anything the player did after the checkpoint
is forgotten, including flags set since then. A checkpoint taken during a voyage starts the
voyage again from its start with the same cargo and `run.seed`. A death needs no checkpoint to
come back from: the death loop keeps the flags it should and saves itself.

"New game" deletes the save and clears all flags. "Main menu" from the pause menu or the end
screen drops the game in progress; the save stays, so "Continue" brings back the last checkpoint.

## Pause

Esc in the world opens the pause menu (not during a cutscene, a dialogue or a location change).
The world stops under it. Options: Resume (or Esc again), Settings (the settings panel, opened
over the pause menu: docs/HOWTO-audio.md), Return to warehouse (only while a voyage is under
way: the death loop with cause `abort`), Main menu.

## Testing quickly

- `?act=<id>` starts an act with its title: `?act=act3` opens the colony.
- `?location=<id>&spawn=<name>` opens a location outside the story (act `debug`); a checkpoint
  saved there is saved with act `debug`.
- In the console (`?debug=1` or dev build): `nasa.services.flow.die('abort')`,
  `nasa.services.flow.lastFlight`,
  `nasa.services.flow.checkpoint()`, `nasa.services.save.load()`, `nasa.services.state.current`.
