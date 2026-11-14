# How to write a dialogue

A dialogue is a TypeScript object: lines (nodes) by id, which line follows which, choices for the
player, and conditions and effects over the game state. The compiler checks node ids, speakers
and portraits (not flag names), and the editor autocompletes them. There is no separate dialogue
language and no string tables: every line is a pair `{ en: '...', uk: TODO }` written right in
the file; a translator later replaces `TODO` with the Ukrainian text (see
[HOWTO-localization.md](HOWTO-localization.md)).

## Where things are

| File                                       | What it is                                                         |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `src/content/dialogues/<id>.ts`            | One dialogue. File name = dialogue id, kebab-case.                 |
| `src/content/dialogues/index.ts`           | Registry: every dialogue is listed here; the key is its id.        |
| `src/content/characters.ts`                | Speakers: `name` (shown over the line) and `portrait` (48×48).     |
| `src/core/dialogue/types.ts`               | The model: `Dialogue`, `DialogueNode`, `Choice`, `defineDialogue`. |
| `src/core/dialogue/DialogueRunner.ts`      | Walks a dialogue (no Phaser). You do not call it yourself.         |
| `src/ui/DialogueBox.ts`                    | The window at the bottom of the screen.                            |
| `src/content/dialogues/engineer-advice.ts` | The example to copy from.                                          |

## Template

Copy this into `src/content/dialogues/<id>.ts` (here `astronomer-intro`):

```ts
import { defineDialogue } from '@/core/dialogue/types';
import { TODO } from '@/core/locale/text';

/** The astronomer meets the hero in the warehouse. */
export const astronomerIntro = defineDialogue({
  start: 'hello',
  nodes: {
    hello: {
      speaker: 'astronomer',
      text: { en: 'So you are the new pilot.', uk: TODO },
      next: 'reply',
    },
    reply: {
      speaker: 'hero',
      text: { en: 'Ready when you are, doctor.', uk: TODO },
      next: 'orders',
    },
    orders: {
      speaker: 'astronomer',
      text: { en: 'Good. Any questions?', uk: TODO },
      choices: [
        { text: { en: 'Where are we going?', uk: TODO }, next: 'destination' },
        { text: { en: 'No, sir.', uk: TODO }, next: 'dismissed' },
      ],
    },
    destination: {
      speaker: 'astronomer',
      text: { en: 'Mars. The rest you will learn on board.', uk: TODO },
      effect: (s) => s.flags.set('astronomer.toldDestination', true),
      next: 'dismissed',
    },
    dismissed: {
      speaker: 'narrator',
      text: { en: 'The astronomer turns back to the window.', uk: TODO },
      // No `next`: the dialogue ends here.
    },
  },
});
```

Then list it in `src/content/dialogues/index.ts`:

```ts
import { astronomerIntro } from '@/content/dialogues/astronomer-intro';

export const dialogues = {
  'engineer-advice': engineerAdvice,
  'astronomer-intro': astronomerIntro,
} as const satisfies Record<string, Dialogue>;
```

Always write the object through `defineDialogue(...)`: it makes a misspelt `start` or `next`
a compile error instead of a dialogue that stops in the middle of the game.

## Nodes

| Field      | Meaning                                                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `speaker`  | A key of `characters` (`'hero'`, `'engineer'`, ...) or `'narrator'` (default).                                                                                                                               |
| `portrait` | An image key; default: the speaker's `portrait`. Use it for another expression.                                                                                                                              |
| `text`     | The line, a pair `{ en, uk }`. It wraps by itself; about 260 characters fit one page of the window, a longer line is split into pages. May be a function of the state, read when the node shows (see below). |
| `next`     | Id of the next node, or a function `(s) => id`. No `next` and no choices: the end.                                                                                                                           |
| `choices`  | Options shown after the line (keep it to four or fewer): `{ text, next?, when?, effect? }`.                                                                                                                  |
| `when`     | `(s) => boolean`: the node is shown only if true; otherwise it is skipped along `next`.                                                                                                                      |
| `effect`   | `(s) => void`: runs once when the node is shown (not when it is skipped).                                                                                                                                    |

How the window behaves: the line types out at 40 characters per second; Enter, Space or a
click first shows the whole page, then goes on. A line taller than the window (4 lines of text
under a name, 6 for the narrator) is split into pages: each types out in turn, a blinking `>`
says there is more, and Enter turns the page. At a node with `choices`, the list opens above
the window once the last page is typed out; arrows (or W/S) move, Enter/Space or a click picks.
The narrator has no name and no portrait. While a dialogue runs the hero cannot move.

A choice goes to its own `next`; without one, to the node's `next`; without that, the dialogue
ends. Its `effect` runs when it is picked.

## Conditions and effects

`when` and `effect` are functions of the game state `s` (`GameState`): its `flags` are the story
memory, saved with the game.

```ts
when: (s) => s.flags.get('engineer.met') !== true,       // first visit only
when: (s) => s.flags.get('astronomer.toldDestination') === true,
effect: (s) => s.flags.set('engineer.met', true),
effect: (s) => s.flags.set('fuelChecks', Number(s.flags.get('fuelChecks') ?? 0) + 1),
next: (s) => (s.flags.get('ship.repaired') === true ? 'thanks' : 'still-broken'),
```

- A flag that was never set is `undefined`: compare with `=== true` / `!== true`, not `!flag`.
- A condition used in several places goes into a small function at the top of the file (see
  `gaveCargoAdvice` in `engineer-advice.ts`).
- Choices whose `when` is false are hidden. Use that to swap an option once it is used up.
- A node's choices are decided when the node is entered, after its `effect` has run.

**Different start on a second visit.** A skipped node goes on to its `next`, so put the
first-visit node first with a `when`, and its `next` at the node every visit shares:

```ts
start: 'greeting',
nodes: {
  greeting: {
    speaker: 'engineer',
    text: { en: 'Oh, a new face!', uk: TODO },
    when: (s) => s.flags.get('engineer.met') !== true,
    effect: (s) => s.flags.set('engineer.met', true),
    next: 'question', // first visit: after the greeting; later visits: straight here
  },
  question: { ... },
}
```

## Flag names

`<area>.<fact>` in camelCase: `engineer.met`, `advice.engineer.cargo`, `ship.repaired`,
`act1.finished`. The area is a character, a place or an act. A flag is `true` / `false`, a
number or a string. Flags are not declared anywhere: the first `set` creates one, so a typo in a
name is not caught - copy names, do not retype them. Trigger flags are named
`trigger:<location>:<object>` by the engine.

## Attach a dialogue to an NPC

In the location file (`src/content/locations/<location>.ts`) give the NPC's binding a
`dialogue`:

```ts
'npc-engineer': { kind: 'npc', character: 'engineer', dialogue: 'engineer-advice' },
```

E next to the NPC starts it; the NPC turns to the hero and turns back afterwards. An NPC without
`dialogue` would show the toast "<name> has nothing to say yet." (`src/world/Interactables.ts`);
every NPC in the game has a dialogue now, so that fallback is never seen and no smoke test
covers it.

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

**From a cutscene:** `await api.dialogue('astronomer-intro')` waits for the dialogue to end (a thin
wrapper over `ui.openDialogue`); for a single line without a dialogue file use
`await api.say('astronomer', { en: 'Welcome aboard.', uk: TODO })`. See [HOWTO-cutscene.md](HOWTO-cutscene.md).

**A dialogue built by code** (its nodes depend on the game): build it with `defineDialogue` in
the location's script and run it with `ctx.ui.openDialogueDef(dialogue, ctx, id?)`: the same
window, lock and events as `openDialogue`; `id` is only the name reported in `dialogueStarted`
and `debugInfo()` (default `code`). The warehouse has two, in `src/content/locations/warehouse.ts`:

- `cargoStand(voyage, itemId, place, onChange)` - the crate stand: the item's `label` and `line`
  from the cargo registry, "Aboard: n of max", then "Take it" / "Put it back" / "Leave it" by
  `when`. Its `[TODO: ...]` lines and the choice texts (`TAKE`, `PUT_BACK`, `LEAVE`,
  `NO_SPACE`) are at the top of that file.
- `hatchCheck(voyage, onBoard)` - the engineer at the hatch names what is not aboard (`GAPS`)
  and the free bays, then "Wait" / "Board".

Writers change the strings in those functions; the logic around them stays.

**Numbers in a line.** A node's `text`, a choice's `text`, `say`'s text and an act's `title`
may be a function of the state (`StateText`) that returns the finished string; translate the
template with `tr` inside it and fill the gaps with `formatText` from `src/core/text/format.ts`:
`text: (s) => formatText(tr({ en: 'Oxygen: {o2Days} d.', uk: TODO }), { o2Days: daysOf(s) })`.
The function runs when the line is shown, after its node's `effect`. Placeholder values are
nominatives and numbers; a translator builds the sentence around them (see
[HOWTO-localization.md](HOWTO-localization.md)). A `{name}` without a value stays on screen
and warns in the console. Where the game fills gaps for you:

| Text                                               | Gaps                                                                       |
| -------------------------------------------------- | -------------------------------------------------------------------------- |
| Debrief lines (`src/content/cutscenes/debrief.ts`) | `{cause}`, `{gate}` (last gate reached), `{next}` (body flown to), `{day}` |
| Colony lines (`src/content/locations/colony.ts`)   | `{body}`; the systems lines `{have}`, `{need}`                             |
| Hatch check (`warehouse.ts`)                       | `{gaps}`, `{free}`                                                         |
| Landing title (`src/content/story/act3.ts`)        | `{body}`, `{day}`                                                          |

**Placeholders.** A line still to be written is `{ en: '[TODO: what this line should say]', uk:
TODO }`, with an `OWNER: script` comment nearby; `grep -rn "\[TODO" src` lists them. Replace the
whole bracket with the line (the `uk: TODO` stays for the translator).

## A new speaker

Add the character to `src/content/characters.ts` with a `name` (a pair) and a `portrait`. The portrait is
a 48×48 PNG in `public/assets/portraits/`, registered in `src/assets/images.ts`
(`'portrait-<name>'`). No art yet: add the name to `portraits()` in `tools/placeholders.py` and run
`python3 tools/placeholders.py` (it rewrites every placeholder - check `git status` afterwards).

## Test it

1. `npm run dev`, open `http://localhost:5173/?location=warehouse` (the location with your
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
   plays a placeholder dialogue; copy it for a dialogue that matters to the story.

## What not to do

- **No runtime imports between content modules.** A dialogue file imports `defineDialogue`,
  `TODO`/`tr` from `@/core/locale/text` and types only. Refer to other content by id (`'astronomer'`, `'engineer-advice'`); when you need a
  type from another content module, use `import type`. Runtime imports between content files
  create import cycles that break at start-up.
- **No Phaser in `src/core`.** The dialogue model and runner are plain TypeScript so they stay
  testable; drawing belongs in `src/ui/DialogueBox.ts`.
- **Do not change flags outside `effect`** (e.g. at the top of the file): that code runs once at
  load, not when the line is shown.
- **No game logic in `text`.** A text function only reads the state to fill in numbers and names;
  branch with nodes and `when`, and change flags only in `effect`.
- **Do not open a dialogue with `new DialogueBox`** - always `ui.openDialogue(id, ctx)`, which
  locks the hero and emits `dialogueStarted` / `dialogueEnded`.
- **No plain strings for visible text, and no `tr` at the top of the file.** A bare `'Hi'` where
  a pair belongs does not compile; `tr(...)` outside a function runs before the language is set
  and freezes English.
