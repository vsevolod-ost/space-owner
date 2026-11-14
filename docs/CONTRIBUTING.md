# Contributing

How to set up the project, what to run before a pull request, and who owns which folders. How
the code is organised: [ARCHITECTURE.md](ARCHITECTURE.md).

## Setup

1. Install [Node.js](https://nodejs.org/) **22 or newer** (npm comes with it) and git.
2. Clone and install:

   ```bash
   git clone https://github.com/vsevolod-ost/space-owner.git
   cd space-owner
   npm install
   ```

3. `npm run dev` and open the address it prints (`http://localhost:5173/`).

For maps: [Tiled](https://www.mapeditor.org/) **1.10 or newer** (1.9 saves the object class
under a field Phaser does not read). For the smoke test: Chromium or Chrome (default path
`/usr/bin/chromium`, override with the `CHROMIUM` environment variable). For regenerating
placeholders: Python 3 with Pillow (images and generated maps) and numpy (sounds).

Editor: VS Code picks up the recommended extensions (ESLint, Prettier) from `.vscode/` and
formats on save.

## Commands

| Command                         | What it does                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `npm run dev`                   | Dev server with hot reload; `window.nasa` debug hooks are on.                    |
| `npm run check`                 | Type check, ESLint, Prettier check and the docs link check. Must pass for a PR.  |
| `npm run build`                 | `check`, then the production build into `dist/`.                                 |
| `npm run preview`               | Serves `dist/` as the players get it.                                            |
| `npm run smoke`                 | Builds, serves the build and runs the menu scenario in headless Chromium.        |
| `npm run lint:fix`              | ESLint with automatic fixes.                                                     |
| `npm run format`                | Formats every file (code and Markdown) with Prettier.                            |
| `npm run typecheck`             | TypeScript only (`tsc --noEmit`).                                                |
| `npm run check:links`           | Checks that relative links in `README.md` and `docs/` resolve.      |
| `npm run balance`               | Balance invariants I1-I8 over every loadout (~6.5 min on 16 threads); see below. |
| `npm run voyage-check -- --all` | The loadout sweep: summary, CSV in `tools/out/`, check against the game.         |
| `npm run i18n:todo`             | Ukrainian strings still `TODO`, by file, and strings over their `max`.           |

## Checks

Before you open a pull request:

1. `npm run format` then `npm run check` - green. Warnings count as errors (`console.log` too;
   use `console.warn` / `console.error` for real problems).
2. `npm run build` - green.
3. Smoke scenarios for what you touched. `npm run smoke` runs only the menu; others run on the
   build it leaves in `dist/`:

   ```bash
   npm run build
   node tools/smoke.mjs --scenario tools/smoke/scenarios/dialogue.mjs
   ```

   Scenarios: `menu`, `state`, `ui`, `world`, `doors`, `dialogue`, `cutscene`,
   `cutscene-cancel`, `flow`, `audio`, `ship`, `debug`, `props`, `warehouse`, `death-loop`,
   `colony`, `voyage`, `stations`, `locale` (languages; on `?lang=pseudo` it fails on any text
   that did not go through `tr`: run it after adding a screen or a string,
   [HOWTO-localization.md](HOWTO-localization.md#checking)). `death-loop` and `voyage` fly a whole voyage: add `--timeout 600000`.
   `voyage` plays the loop end to end on seed 1 (New game, warehouse, fuel + oxygen + supplies
   - solar, Moon, Go on, Mars, Stop, colony, ending). Screenshots go to `smoke-out/`. A scenario fails on
     any console error, page error or failed request (a missing file is a 404).

4. Play the part you changed in `npm run dev` and look at the browser console (F12): the game
   warns there about unbound map objects, unknown keys and wrong spawn names.
5. **Changed a balance number** (cargo in `src/content/voyage/cargo/`, legs, gates, colony
   needs, events, the time scale, the alarm)? Run `npm run balance` - it must be green (the
   invariants in plain words and what to do when one fails:
   [HOWTO-voyage.md](HOWTO-voyage.md#how-to-balance)). It flies
   every loadout the hold can take (1606) and checks the balance invariants: the Moon with any
   loadout (I1), the base alone dies before Mars, the last gate (I2), between 10 % and 50 % of
   loadouts reach Mars (I3), no dominant loadout (I4), no dead cargo (I5), every death at least 3 real
   seconds after its alarm (I6), Go on short of fuel never reaches the next gate and the gate
   card warns (I7), events take at most 40 % off the best loadout's chance for any gate (I8).
   "Top 10 %" in I5 is strict: a metric's top is the loadouts strictly above its cut, the cut
   being the lowest value with at most 10 % of loadouts above it (ties at the cut are out). The
   sweep's evaluator (every loadout flies its own voyage: the mass sets the flight) is checked
   against the game's own `Voyage` on every (event, choice, hit or not) the events can produce;
   `sweep failed: coverage: ... never compared` means a new event or choice no voyage reaches
   yet. A loadout whose flight neither arrives nor drifts (an autopilot broken by `dvBudget`,
   say) is reported as `flight failed: ...`.
   A failure prints what was measured and an example loadout, e.g.
   `I2 failed: the base alone reaches mars (need to die before mars)`. Change the numbers, not the invariants; the
   thresholds are `OWNER: design` constants in `src/devtools/balance.ts`. It is not part of
   `npm run check` (slower); `npm run voyage-check -- --all` prints the same sweep in full and
   writes one CSV line per loadout to `tools/out/voyage-sweep.csv`.

**CI:** GitHub Actions (`.github/workflows/ci.yml`) runs `npm ci`, `npm run check` and
`npm run build` on Node 22 on every push to any branch and on every pull request. See the result
as the check on your pull request, or in the repository's Actions tab. A red check blocks the
merge by convention: fix it on your branch and push again. `npm run smoke` is not in CI - it needs
a Chromium, so run it locally; a CI job for it can come later together with a Playwright browser
install.

**Play online:** not before the release. The repository is private and every free hosting
either makes the site public or asks for a payment card for access control, so until the release
everybody plays locally with `npm run dev`; artists get screenshots or screen recordings from the
programmers. At the release the repository goes public and `.github/workflows/deploy.yml`
publishes the build to GitHub Pages at <https://vsevolod-ost.github.io/space-owner/>; the steps
are in the comment at the top of that file.

## Branches and pull requests

- `main` is what the team plays. Nobody pushes to it directly.
- Work on a branch from `main`: `git switch -c dialogue-astronomer` (short, kebab-case, says what).
- Push it and open a pull request into `main`. The architect (Vsevolod) reviews and merges.
- Keep a PR to one topic: a location with its dialogue is one PR; a new UI panel is another.
- Commit messages: a short imperative sentence in English, no trailing period, about 70
  characters at most - `Add astronomer dialogue to warehouse`, `Fix spawn in home`. Details,
  if needed, go into the body after an empty line.
- Everything in the repository is in English: code, comments, docs, commit messages, game text.
  The one exception: Ukrainian text in the `uk:` slot of a `LocalText` pair, and a language's
  own name (`'Українська'` in `LANGUAGE_NAMES`). See [HOWTO-localization.md](HOWTO-localization.md).

## Adding an asset

1. Put the file into its folder under `public/assets/` (kebab-case name).
2. Add an entry to the matching registry in `src/assets/` (`images.ts`, `spritesheets.ts`,
   `audio.ts`, `maps.ts`); the object key is the key code uses. Boot loads everything listed.
3. Replacing a placeholder needs no code: overwrite the file with the same name and size.

The maps under placeholder art (`home`, `warehouse`, `ship-deck`, `colony`) are generated by `python3 tools/make_maps.py`; change them there, not in Tiled (see
[HOWTO-location.md](HOWTO-location.md)). Real maps are drawn in Tiled.

Sizes, formats and the list of every art file: [HOWTO-art.md](HOWTO-art.md). Sounds:
[HOWTO-audio.md](HOWTO-audio.md). Maps: [HOWTO-location.md](HOWTO-location.md).

## Who owns what

The owner reviews changes in their area and is the one to ask. Anyone may change anything
through a PR; tell the owner.

| Who                              | Folders                                                                                                                                                                                                                    | Guides                                                                                                                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Artists                          | the image folders of `public/assets/`: `images/`, `menu/`, `ui/`, `portraits/`, `sprites/`; `docs/palette.md`                                                                                                              | [HOWTO-art.md](HOWTO-art.md)                                                                                                                                                                     |
| Sound and UI                     | `public/assets/audio/`, `src/assets/audio.ts`, `src/core/audio/`, `src/core/settings/`, `src/ui/`, the panel scenes `src/scenes/*Scene.ts` (Pause, Settings, Navigation, Stub)                                             | [HOWTO-audio.md](HOWTO-audio.md), [HOWTO-ui.md](HOWTO-ui.md)                                                                                                                                     |
| Physics, mechanics and narrative | `src/core/simulation/`, `src/content/simulation/`, `src/content/voyage/`, `src/content/dialogues/`, `src/content/cutscenes/`, `src/content/story/`, `src/content/endings.ts`                                               | [HOWTO-simulation.md](HOWTO-simulation.md), [HOWTO-voyage.md](HOWTO-voyage.md), [HOWTO-dialogue.md](HOWTO-dialogue.md), [HOWTO-cutscene.md](HOWTO-cutscene.md), [HOWTO-story.md](HOWTO-story.md) |
| Architect (Vsevolod)             | everything else: `src/core/` (outside the above, `src/core/voyage/` included), `src/devtools/`, `src/world/`, `WorldScene`, `BootScene`, `UiScene`, `PhaserSceneDriver`, `src/main.ts`, `tools/`, maps and locations, docs | [ARCHITECTURE.md](ARCHITECTURE.md), [HOWTO-location.md](HOWTO-location.md)                                                                                                                       |

Places marked `OWNER: <who>` in the code are the team's work list, by who fills them in:
`physics` (formulas and physical numbers), `design` (game-design numbers: bays, needs, event
chances, alarm and balance thresholds), `script` (every text the player reads: `[TODO: ...]`
lines, names, titles, panel and menu words) and `art` (colony colours, which picture an item
puts up). `grep -rn "OWNER: design" src` lists one owner's places; the texts by file are in
[HOWTO-voyage.md](HOWTO-voyage.md#texts). Every `OWNER: script` text is a pair
`{ en: '...', uk: TODO }`: writers change `en`, the translator replaces `TODO` with the
Ukrainian text; `npm run i18n:todo` lists what is left
([HOWTO-localization.md](HOWTO-localization.md)).

References like "plan S8" / "plan D14" and "GDD `res-list`" / "GDD D12" in the code and the
docs point to the architect's working notes (the implementation plan and the game design
document), which are not in the repository; the code and these docs are authoritative.

## Tool versions

- **TypeScript is pinned to 6.0.x** (`"typescript": "^6.0.3"`). `typescript-eslint` 8.72
  supports TypeScript below 6.1 only, and the `typescript@7` package does not export the
  compiler API that `typescript-eslint` loads, so `npm run lint` fails on 7 instead of warning.
  Move to TypeScript 7 when `typescript-eslint` supports it (its peer range in
  `node_modules/typescript-eslint/package.json`).
- ESLint 10 (flat config `eslint.config.js`), Prettier 3.9 (`.prettierrc.json`: width 100,
  single quotes, semicolons, trailing commas), Vite 8, Phaser 4.2.1, playwright-core (no browser
  download; the smoke test uses the system Chromium).
- No unit tests yet; [HOWTO-simulation.md](HOWTO-simulation.md#testing-formulas-optional) shows
  how to add Vitest when needed.
