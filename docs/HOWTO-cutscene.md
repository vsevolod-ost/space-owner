# How to write a cutscene

A cutscene is a short scripted scene: characters walk, talk, the screen fades, the camera looks
somewhere. It is an `async` TypeScript function over a small API (`api`). Each step that takes
time returns a promise: `await` it and the script waits for it to finish. While a cutscene plays
the hero cannot move or press E, and doors and triggers do not fire.

## Where things are

| File                                         | What it is                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| `src/content/cutscenes/<id>.ts`              | One cutscene. File name = cutscene id, kebab-case.                       |
| `src/content/cutscenes/index.ts`             | Registry: every cutscene is listed here; the key is its id.              |
| `src/core/cutscene/types.ts`                 | The API: `CutsceneApi`, `Cutscene`, `ActorId`, `Place`.                  |
| `src/core/cutscene/CutsceneService.ts`       | Plays cutscenes one at a time (`services.cutscenes.play(id)`).           |
| `src/world/WorldCutsceneApi.ts`              | The API on the game scenes. You do not call it yourself.                 |
| `src/content/cutscenes/warehouse-arrival.ts` | The example to copy from (the engineer meets the hero in the warehouse). |

## Template

Copy this into `src/content/cutscenes/<id>.ts` (here `astronomer-intro`):

```ts
import type { Cutscene } from '@/core/cutscene/types';

/** The astronomer greets the hero and shows the hatch. */
export const astronomerIntro: Cutscene = {
  async run(api) {
    await api.fadeIn(500);
    await api.walk('npc-astronomer', 'player');
    api.face('player', 'npc-astronomer');
    await api.say('astronomer', 'So you are the new pilot.');
    await api.say('hero', 'Ready when you are, doctor.');
    await api.cameraPanTo('spawn-hatch', 800);
    await api.wait(500);
    await api.cameraPanTo('player', 800);
    api.cameraFollowPlayer();
    api.setFlag('astronomer.introduced', true);
  },
};
```

Then list it in `src/content/cutscenes/index.ts`:

```ts
import { astronomerIntro } from '@/content/cutscenes/astronomer-intro';

export const cutscenes = {
  'warehouse-arrival': warehouseArrival,
  'astronomer-intro': astronomerIntro,
} as const satisfies Record<string, Cutscene>;
```

## Actors and places

- **Actor** (`ActorId`): `'player'` (the hero) or the name of an `npc` object in the current
  location's map (`'npc-engineer'`).
- **Place** (`Place`): the name of a `spawn` or `point` object of the map (`'spawn-hatch'`),
  an actor id (where that actor stands now) or map pixels `{ x: 320, y: 96 }` (whole numbers).
  Add `point` objects in Tiled for places a cutscene needs (see
  [HOWTO-location.md](HOWTO-location.md)) rather than writing pixels.

A misspelt actor or place is not a compile error: the step warns in the browser console (F12)
and is skipped, and the cutscene goes on.

## The API

| Method                   | What it does                                                                                                                                                                                          | Example                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `walk(actor, place)`     | Walks there at the actor's speed; resolves on arrival (or, with a warning, when blocked for half a second). To an actor: stops beside it and turns to it. NPCs walk through walls, the hero does not. | `await api.walk('npc-engineer', 'player')`             |
| `face(actor, to)`        | Turns to `'up'`, `'down'`, `'left'`, `'right'` or towards a place.                                                                                                                                    | `api.face('player', 'npc-engineer')`                   |
| `say(speaker, text)`     | One line in the dialogue window; resolves when the player closes it (Enter, Space, click). Speaker: a character id or `'narrator'`.                                                                   | `await api.say('astronomer', 'Welcome aboard.')`       |
| `dialogue(id)`           | A whole dialogue from `src/content/dialogues` (choices, flags); resolves when it ends.                                                                                                                | `await api.dialogue('engineer-advice')`                |
| `wait(ms)`               | Waits game time (stops while the game is paused).                                                                                                                                                     | `await api.wait(500)`                                  |
| `fadeOut(ms)`            | Fades the screen to black; it stays black until `fadeIn`.                                                                                                                                             | `await api.fadeOut(400)`                               |
| `fadeIn(ms)`             | Fades back from black.                                                                                                                                                                                | `await api.fadeIn(400)`                                |
| `cameraPanTo(place, ms)` | Stops following the hero and slides the camera to centre on the place (it stays inside the location, so in a screen-sized room it does not move).                                                     | `await api.cameraPanTo('spawn-hatch', 800)`            |
| `cameraFollowPlayer()`   | The camera follows the hero again (a jump: pan to `'player'` first for a smooth return).                                                                                                              | `api.cameraFollowPlayer()`                             |
| `setFlag(name, value)`   | Sets a story flag (`<area>.<fact>`, see [HOWTO-dialogue.md](HOWTO-dialogue.md)).                                                                                                                      | `api.setFlag('warehouse.arrivalSeen', true)`           |
| `playSfx(key)`           | Plays a sound effect from `src/assets/audio.ts` at the SFX volume (docs/HOWTO-audio.md).                                                                                                              | `api.playSfx('sfx-door')`                              |
| `teleport(actor, place)` | Puts the actor there at once.                                                                                                                                                                         | `api.teleport('npc-engineer', 'spawn-hatch')`          |
| `homeOf(actor)`          | The NPC's home: its `npc` map object's position (not where it stands now).                                                                                                                            | `api.walk('npc-engineer', api.homeOf('npc-engineer'))` |
| `goTo(location, spawn)`  | Changes the location (fade out, load, fade in); later steps act in the new location.                                                                                                                  | `await api.goTo('home', 'spawn-default')`              |
| `showTitle(text, ms)`    | A big centred title for `ms` in all (fades in and out); shows over a black screen too.                                                                                                                | `await api.showTitle('Day 2', 2000)`                   |

Several steps at once: start them together and wait for all.

```ts
await Promise.all([api.cameraPanTo('player', 800), api.walk('npc-engineer', { x: 320, y: 96 })]);
```

When the cutscene ends (or fails), the hero's input is unlocked and the camera follows the hero
again, whatever the script left. A screen left black by `fadeOut` stays black: end with
`fadeIn`.

## Start a cutscene

**From a trigger** (the usual way: the hero walks into a rectangle). In the location file:

```ts
arrival: {
  kind: 'trigger',
  once: true,
  run: (ctx) => ctx.cutscenes.play('warehouse-arrival'),
},
```

`once: true` plays it once per game (the flag `trigger:<location>:<object>` remembers it, and
it is saved with the game). `ctx.cutscenes` is the same object as `services.cutscenes`.

**From an interactable** (E on an object): the same `run`, with `kind: 'interactable'`. After
a dialogue:

```ts
run: async (ctx) => {
  await ctx.ui.openDialogue('terminal-log', ctx);
  await ctx.cutscenes.play('terminal-alarm');
},
```

**From a dialogue** (a choice or a line): an `effect` gets only the game state, so import the
services there:

```ts
import { services } from '@/core/services';
// ...
effect: () => void services.cutscenes.play('astronomer-intro'),
```

The cutscene starts at once, while the dialogue window is still open. Its `say` and `dialogue`
steps wait for that window to close, but walks and fades do not - put the effect on the last
line, or begin the cutscene with a `say`.

**From a door:** doors run no scripts. Put a `once` trigger right behind the door on the arrival
side (a trigger under the arrival spawn fires as the hero appears), or replace the door by a
trigger whose cutscene ends with `api.goTo(location, spawn)`. One limit: when the arrival itself
happens inside a cutscene (`api.goTo`), a trigger under the arrival spawn does not fire, because
triggers are muted while controls are locked and only fire on entering. To chain two cutscenes,
call `play` for the second one at the end of the first instead.

**From the console** (testing): `nasa.services.cutscenes.play('warehouse-arrival')`.

A `play` while another cutscene runs waits for it and then plays (a queue); `isPlaying` is true
for both. `services.events` emits `cutsceneStarted` and `cutsceneEnded`.

## When the player dies or quits mid-cutscene

`services.flow.die(...)` (the death loop), `finish(...)` and "Main menu" in the pause menu
replace the world with the debrief, the end screen or the menu; a new game, Continue and an act
start begin a new session too.
Every new session (`FlowService.beginSession`) calls `services.cutscenes.cancel()`, and the
scene driver calls it again before it replaces the world with the end screen or the menu: at once `isPlaying` turns false, the input is unlocked and
`cutsceneEnded` is emitted; queued cutscenes are dropped. The script itself stops at the step it
is waiting on (or its next one): that `api` step rejects with `CutsceneCancelled`
(`src/core/cutscene/cancel.ts`), so nothing after it runs - flags set at the end of the script
stay unset, and "Continue" plays the cutscene again when the checkpoint was saved
before it (the save does not hold its `once` trigger flag yet). `play()` resolves normally and nothing is logged. Do not catch errors around
`api` steps in a script, or rethrow `CutsceneCancelled` if you must; and wait only on `api`
steps, not on your own timers, so a cancel can reach the script. A location change (`api.goTo`)
does not cancel: the cutscene goes on in the new location.

## Replay a cutscene while testing

1. `npm run dev`, open
   `http://localhost:5173/?location=warehouse&spawn=spawn-default` (your location and a
   spawn next to the trigger).
2. Walk into the trigger. To see it again, reset its flags in the browser console (F12):

   ```js
   nasa.services.state.flags.set('trigger:warehouse:arrival', false);
   nasa.services.state.flags.set('warehouse.arrivalSeen', false);
   ```

   then walk out of the trigger and back in. Reloading the page also resets every flag (unless
   you continued a saved game). Or play it straight away:
   `nasa.services.cutscenes.play('warehouse-arrival')`.

`window.nasa` exists in `npm run dev` and with `?debug=1` in the URL.

## Rules

- `run` is `async`; `await` every step that takes time, unless you mean it to run alongside the
  next ones. A step you forget to await does not wait.
- No Phaser in content: a cutscene talks to the game only through `api`. Need something the API
  lacks? Add a method to `CutsceneApi` (`src/core/cutscene/types.ts`) and implement it in
  `src/world/WorldCutsceneApi.ts`.
- Content modules refer to each other by id (`'engineer-advice'`, `'spawn-hatch'`) or with
  `import type`, never by importing another content module's value: no import cycles.
- Lines are English, like dialogues. Coordinates are whole pixels.
- An error thrown in a cutscene shows in the console; the input is unlocked anyway.
