# How to write a dialogue

A dialogue is a TypeScript object: lines (nodes) by id, which line follows which, choices for the
player, and conditions and effects over the game state. The compiler checks node ids, speakers
and portraits (not flag names), and the editor autocompletes them. There is no separate dialogue
language and no localisation: lines are written in English right in the file.

## Where things are

| File                                     | What it is                                                         |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `src/content/dialogues/<id>.ts`          | One dialogue. File name = dialogue id, kebab-case.                 |
| `src/content/dialogues/index.ts`         | Registry: every dialogue is listed here; the key is its id.        |
| `src/content/characters.ts`              | Speakers: `name` (shown over the line) and `portrait` (48×48).     |
| `src/core/dialogue/types.ts`             | The model: `Dialogue`, `DialogueNode`, `Choice`, `defineDialogue`. |
| `src/core/dialogue/DialogueRunner.ts`    | Walks a dialogue (no Phaser). You do not call it yourself.         |
| `src/ui/DialogueBox.ts`                  | The window at the bottom of the screen.                            |
| `src/content/dialogues/demo-engineer.ts` | The example to copy from.                                          |

## Template

Copy this into `src/content/dialogues/<id>.ts` (here `captain-intro`):

```ts
import { defineDialogue } from '@/core/dialogue/types';

/** The captain meets the hero in the demo room. */
export const captainIntro = defineDialogue({
  start: 'hello',
  nodes: {
    hello: {
      speaker: 'captain',
      text: 'So you are the new pilot.',
      next: 'reply',
    },
    reply: {
      speaker: 'hero',
      text: 'Ready when you are, captain.',
      next: 'orders',
    },
    orders: {
      speaker: 'captain',
      text: 'Good. Any questions?',
      choices: [
        { text: 'Where are we going?', next: 'destination' },
        { text: 'No, sir.', next: 'dismissed' },
      ],
    },
    destination: {
      speaker: 'captain',
      text: 'Mars. The rest you will learn on board.',
      effect: (s) => s.flags.set('captain.toldDestination', true),
      next: 'dismissed',
    },
    dismissed: {
      speaker: 'narrator',
      text: 'The captain turns back to the window.',
      // No `next`: the dialogue ends here.
    },
  },
});
```

Then list it in `src/content/dialogues/index.ts`:

```ts
import { captainIntro } from '@/content/dialogues/captain-intro';

export const dialogues = {
  'demo-engineer': demoEngineer,
  'captain-intro': captainIntro,
} as const satisfies Record<string, Dialogue>;
```

Always write the object through `defineDialogue(...)`: it makes a misspelt `start` or `next`
a compile error instead of a dialogue that stops in the middle of the game.

## Nodes

| Field      | Meaning                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------- |
| `speaker`  | A key of `characters` (`'hero'`, `'engineer'`, ...) or `'narrator'` (default).              |
| `portrait` | An image key; default: the speaker's `portrait`. Use it for another expression.             |
| `text`     | The line. It wraps by itself; about 260 characters fit the window.                          |
| `next`     | Id of the next node, or a function `(s) => id`. No `next` and no choices: the end.          |
| `choices`  | Options shown after the line (keep it to four or fewer): `{ text, next?, when?, effect? }`. |
| `when`     | `(s) => boolean`: the node is shown only if true; otherwise it is skipped along `next`.     |
| `effect`   | `(s) => void`: runs once when the node is shown (not when it is skipped).                   |

How the window behaves: the line types out at 40 characters per second; Enter, Space or a
click first shows the whole line, then goes on. At a node with `choices`, the list opens above
the window once the line is typed out; arrows (or W/S) move, Enter/Space or a click picks.
The narrator has no name and no portrait. While a dialogue runs the hero cannot move.

A choice goes to its own `next`; without one, to the node's `next`; without that, the dialogue
ends. Its `effect` runs when it is picked.

## Conditions and effects

`when` and `effect` are functions of the game state `s` (`GameState`): its `flags` are the story
memory, saved with the game.

```ts
when: (s) => s.flags.get('engineer.met') !== true,       // first visit only
when: (s) => s.flags.get('captain.toldDestination') === true,
effect: (s) => s.flags.set('engineer.met', true),
effect: (s) => s.flags.set('fuelChecks', Number(s.flags.get('fuelChecks') ?? 0) + 1),
next: (s) => (s.flags.get('ship.repaired') === true ? 'thanks' : 'still-broken'),
```

- A flag that was never set is `undefined`: compare with `=== true` / `!== true`, not `!flag`.
- A condition used in several places goes into a small function at the top of the file (see
  `toldAboutShip` in `demo-engineer.ts`).
- Choices whose `when` is false are hidden. Use that to swap an option once it is used up.
- A node's choices are decided when the node is entered, after its `effect` has run.

**Different start on a second visit.** A skipped node goes on to its `next`, so put the
first-visit node first with a `when`, and its `next` at the node every visit shares:

```ts
start: 'greeting',
nodes: {
  greeting: {
    speaker: 'engineer',
    text: 'Oh, a new face!',
    when: (s) => s.flags.get('engineer.met') !== true,
    effect: (s) => s.flags.set('engineer.met', true),
    next: 'question', // first visit: after the greeting; later visits: straight here
  },
  question: { ... },
}
```

## Flag names

`<area>.<fact>` in camelCase: `engineer.met`, `engineer.toldAboutShip`, `ship.repaired`,
`act1.finished`. The area is a character, a place or an act. A flag is `true` / `false`, a
number or a string. Flags are not declared anywhere: the first `set` creates one, so a typo in a
name is not caught - copy names, do not retype them. Trigger flags are named
`trigger:<location>:<object>` by the engine.

## Attach a dialogue to an NPC

In the location file (`src/content/locations/<location>.ts`) give the NPC's binding a
`dialogue`:

```ts
'npc-engineer': { kind: 'npc', character: 'engineer', dialogue: 'demo-engineer' },
```

E next to the NPC starts it; the NPC turns to the hero and turns back afterwards. An NPC without
`dialogue` says "<name> has nothing to say yet."

From an interactable or a trigger script, open any dialogue yourself:

```ts
'terminal': {
  kind: 'interactable',
  run: async (ctx) => {
    await ctx.ui.openDialogue('terminal-log', ctx);
    // runs after the dialogue has closed
  },
},
```

**From a cutscene:** `await api.dialogue('captain-intro')` waits for the dialogue to end (a thin
wrapper over `ui.openDialogue`); for a single line without a dialogue file use
`await api.say('captain', 'Welcome aboard.')`. See [HOWTO-cutscene.md](HOWTO-cutscene.md).

## A new speaker

Add the character to `src/content/characters.ts` with a `name` and a `portrait`. The portrait is
a 48×48 PNG in `public/assets/portraits/`, registered in `src/assets/images.ts`
(`'portrait-<name>'`). No art yet: add the name to `portraits()` in `tools/placeholders.py` and run
`python3 tools/placeholders.py` (it rewrites every placeholder - check `git status` afterwards).

## Test it

1. `npm run dev`, open `http://localhost:5173/?location=demo-corridor` (the location with your
   NPC), walk up to the NPC and press E.
2. In the browser console:

   ```js
   window.nasa.services.state.flags.toRecord(); // all flags
   window.nasa.services.state.flags.set('engineer.met', false); // replay the first visit
   window.nasa.game.scene.getScene('Ui').debugInfo().dialogue; // { id, nodeId, ... }
   ```

   `window.nasa` exists in development builds and with `?debug=1`.

3. Before a pull request: `npm run check`. The smoke test
   `node tools/smoke.mjs --scenario tools/smoke/scenarios/dialogue.mjs` (after `npm run build`)
   plays the demo dialogue; copy it for a dialogue that matters to the story.

## What not to do

- **No runtime imports between content modules.** A dialogue file imports `defineDialogue`
  and types only. Refer to other content by id (`'captain'`, `'demo-engineer'`); when you need a
  type from another content module, use `import type`. Runtime imports between content files
  create import cycles that break at start-up.
- **No Phaser in `src/core`.** The dialogue model and runner are plain TypeScript so they stay
  testable; drawing belongs in `src/ui/DialogueBox.ts`.
- **Do not change flags outside `effect`** (e.g. at the top of the file): that code runs once at
  load, not when the line is shown.
- **No game logic in `text`.** Text is shown as is; branch with nodes and `when`, not with string
  tricks.
- **Do not open a dialogue with `new DialogueBox`** - always `ui.openDialogue(id, ctx)`, which
  locks the hero and emits `dialogueStarted` / `dialogueEnded`.
