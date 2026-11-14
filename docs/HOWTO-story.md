# How the story is put together

The game is a list of **acts**. An act shows its title on a black screen, then runs a short
script that puts the hero in a location and saves a **checkpoint**. From there the story goes on
in the world: doors, interactables, triggers, dialogues and cutscenes move it forward, start the
next act, kill the hero or end the game. Everything goes through `services.flow`
(`src/core/flow/FlowService.ts`).

## Where things are

| File                              | What it is                                                         |
| --------------------------------- | ------------------------------------------------------------------ |
| `src/content/story/<id>.ts`       | One act. File name = act id.                                       |
| `src/content/story/index.ts`      | Registry of acts **in story order**; the key is the act id.        |
| `src/content/story/types.ts`      | `Act` and `FlowApi` (what an act's script may call).               |
| `src/content/endings.ts`          | Endings and death reasons: the title and text of the end screen.   |
| `src/core/flow/FlowService.ts`    | New game, continue, acts, checkpoints, deaths, endings, main menu. |
| `src/scenes/EndingScene.ts`       | The end screen ("Retry from checkpoint" / "Main menu").            |
| `src/scenes/PauseScene.ts`        | The pause menu (Esc in the world).                                 |
| `src/scenes/PhaserSceneDriver.ts` | Moves the scenes for `FlowService`. You do not call it yourself.   |

## Acts

```ts
// src/content/story/act1.ts
import type { Act } from '@/content/story/types';

/** Act 1: the hero wakes up in the room. */
export const act1: Act = {
  title: 'Act 1',
  async start(flow) {
    await flow.goTo('demo-room', 'spawn-default');
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
   - `flow.finish(endingId)` or `flow.gameOver(reason)` - the end screen.
     An act that does neither leaves the screen black.
3. `flow.checkpoint()` **after** `goTo` has resolved saves the game there (see below).

What `flow` offers an act: `goTo`, `startSimulation`, `checkpoint`, `finish`, `gameOver`.
`startSimulation()` starts the ship simulation for the act (act 2 does: `goTo` the ship deck,
`startSimulation()`, `checkpoint()`); see docs/HOWTO-simulation.md. If the player leaves the
act while its script still runs (main menu during the title, another act, an ending), the
script's later calls are ignored, so it cannot pull the player back.

Ways to start an act:

- **New game** in the menu starts the first act of the registry (`prologue`).
- A **door** with `act`: `'door-ship': { kind: 'door', act: 'act2' }` in a location's bindings.
  A door need not be in a gap of a wall: any rectangle the hero can walk into works
  (`door-ship` in `demo-room` is a rectangle inside the room at its right edge, past the
  terminal).
- From any script: `ctx.flow.startAct('act2')` in an interactable or trigger,
  `services.flow.startAct('act2')` in a dialogue effect, or `services.flow.nextAct()` (the act
  after the current one in the registry order).
- From the URL, for testing: `?act=act2` (an unknown id warns and opens the menu).

## Checkpoints (saving)

There is one save slot in `localStorage` (key `space-owner.save`). `checkpoint()` writes the
current act, location, spawn, all story flags and the simulation state, and shows a
"Checkpoint" toast. Nothing else saves the game: put a checkpoint wherever losing progress would
hurt - at the start of every act, before a dangerous place, after an important choice.

```ts
// an interactable that saves: a save station
'save-station': { kind: 'interactable', run: (ctx) => ctx.flow.checkpoint() },
```

The hero reappears at the checkpoint's **spawn point**, not where he stood when it was saved.
If the browser cannot store the save (private mode, full storage) the game goes on unsaved and
the console shows a warning.

## Deaths and endings

Both show the end screen (`EndingScene`) with a title, a text and two options: "Retry from
checkpoint" and "Main menu". Their texts live in `src/content/endings.ts`:

```ts
export const endings = {
  'demo-ending': { title: 'The End', text: 'You reached the end of the demo story.' },
  'death-generic': { title: 'You died', text: 'Something went badly wrong.' },
  'death-airlock': { title: 'Spaced', text: 'The airlock opened with you inside.' },
} as const satisfies Record<string, Ending>;
```

- **A death with a reason:** add an entry (`death-airlock`) and call
  `ctx.flow.gameOver('death-airlock')` (or `services.flow.gameOver(...)`, or `flow.gameOver` in
  an act). It emits the `gameOver` event with the reason, then shows the screen. Example in the
  demo: the `broken-vent` interactable in `demo-room`:

  ```ts
  'broken-vent': { kind: 'interactable', run: (ctx) => ctx.flow.gameOver('death-generic') },
  ```

- **An ending:** `flow.finish('demo-ending')` (see `act3.ts`). The explanations of the endings
  from the design document go into `text`.

The ids are checked by the compiler: a misspelt ending id does not build.

## Restarts and the story

"Continue" in the main menu and "Retry from checkpoint" on the end screen are **one mechanism**
(`continueGame()`): the last checkpoint is loaded - act, location, spawn and **all flags as they
were when it was saved**. Anything the player did after the checkpoint is forgotten, including
flags set since then. A checkpoint taken while the ship simulation runs saves it too, and the load
restores it. `retry()` with no save at all starts a new game.

**Extension point:** if something must survive a restart (for example "the hero already died
here once", so a character can comment on it), keep it across the load in
`FlowService.retry()` - read the flag before `continueGame()` and set it again after
`state.loadFrom(save)`. Nothing does this yet; by default only the checkpoint counts.

"New game" deletes the save and clears all flags. "Main menu" from the pause menu or the end
screen drops the game in progress; the save stays, so "Continue" brings back the last checkpoint.

## Pause

Esc in the world opens the pause menu (not during a cutscene, a dialogue or a location change).
The world stops under it. Options: Resume (or Esc again), Settings (the settings panel, opened
over the pause menu: docs/HOWTO-audio.md), Main menu.

## Testing quickly

- `?act=<id>` starts an act with its title: `?act=act3` shows the demo ending at once.
- `?location=<id>&spawn=<name>` opens a location outside the story (act `debug`); a checkpoint
  saved there is saved with act `debug`.
- In the console (`?debug=1` or dev build): `nasa.services.flow.gameOver('death-generic')`,
  `nasa.services.flow.checkpoint()`, `nasa.services.save.load()`, `nasa.services.state.current`.
