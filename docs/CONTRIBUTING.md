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
placeholders: Python 3 with Pillow (images and demo maps) and numpy (sounds).

Editor: VS Code picks up the recommended extensions (ESLint, Prettier) from `.vscode/` and
formats on save.

## Commands

| Command               | What it does                                                                    |
| --------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`         | Dev server with hot reload; `window.nasa` debug hooks are on.                   |
| `npm run check`       | Type check, ESLint, Prettier check and the docs link check. Must pass for a PR. |
| `npm run build`       | `check`, then the production build into `dist/`.                                |
| `npm run preview`     | Serves `dist/` as the players get it.                                           |
| `npm run smoke`       | Builds, serves the build and runs the menu scenario in headless Chromium.       |
| `npm run lint:fix`    | ESLint with automatic fixes.                                                    |
| `npm run format`      | Formats every file (code and Markdown) with Prettier.                           |
| `npm run typecheck`   | TypeScript only (`tsc --noEmit`).                                               |
| `npm run check:links` | Checks that relative links in `README.md` and `docs/` resolve.     |

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
   `cutscene-cancel`, `flow`, `audio`, `ship`, `debug`. Screenshots go to `smoke-out/`. A
   scenario fails on any console error, page error or failed request (a missing file is a 404).

4. Play the part you changed in `npm run dev` and look at the browser console (F12): the game
   warns there about unbound map objects, unknown keys and wrong spawn names.

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
- Work on a branch from `main`: `git switch -c dialogue-captain` (short, kebab-case, says what).
- Push it and open a pull request into `main`. The architect (Vsevolod) reviews and merges.
- Keep a PR to one topic: a location with its dialogue is one PR; a new UI panel is another.
- Commit messages: a short imperative sentence in English, no trailing period, about 70
  characters at most - `Add captain dialogue to demo room`, `Fix door spawn in corridor`. Details,
  if needed, go into the body after an empty line.
- Everything in the repository is in English: code, comments, docs, commit messages, game text.

## Adding an asset

1. Put the file into its folder under `public/assets/` (kebab-case name).
2. Add an entry to the matching registry in `src/assets/` (`images.ts`, `spritesheets.ts`,
   `audio.ts`, `maps.ts`); the object key is the key code uses. Boot loads everything listed.
3. Replacing a placeholder needs no code: overwrite the file with the same name and size.

The three demo maps (`demo-corridor`, `demo-room`, `ship-deck`) are generated by
`python3 tools/make_maps.py`; change them there, not in Tiled (see
[HOWTO-location.md](HOWTO-location.md)). Real maps are drawn in Tiled.

Sizes, formats and the list of every art file: [HOWTO-art.md](HOWTO-art.md). Sounds:
[HOWTO-audio.md](HOWTO-audio.md). Maps: [HOWTO-location.md](HOWTO-location.md).

## Who owns what

The owner reviews changes in their area and is the one to ask. Anyone may change anything
through a PR; tell the owner.

| Who                              | Folders                                                                                                                                                                        | Guides                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Artists                          | the image folders of `public/assets/`: `images/`, `menu/`, `ui/`, `portraits/`, `sprites/`; `docs/palette.md`                                                                  | [HOWTO-art.md](HOWTO-art.md)                                                                                                                                 |
| Sound and UI                     | `public/assets/audio/`, `src/assets/audio.ts`, `src/core/audio/`, `src/core/settings/`, `src/ui/`, the panel scenes `src/scenes/*Scene.ts` (Pause, Settings, Navigation, Stub) | [HOWTO-audio.md](HOWTO-audio.md), [HOWTO-ui.md](HOWTO-ui.md)                                                                                                 |
| Physics, mechanics and narrative | `src/core/simulation/`, `src/content/simulation/`, `src/content/dialogues/`, `src/content/cutscenes/`, `src/content/story/`, `src/content/endings.ts`                          | [HOWTO-simulation.md](HOWTO-simulation.md), [HOWTO-dialogue.md](HOWTO-dialogue.md), [HOWTO-cutscene.md](HOWTO-cutscene.md), [HOWTO-story.md](HOWTO-story.md) |
| Architect (Vsevolod)             | everything else: `src/core/` (outside the above), `src/world/`, `WorldScene`, `BootScene`, `UiScene`, `PhaserSceneDriver`, `src/main.ts`, `tools/`, maps and locations, docs   | [ARCHITECTURE.md](ARCHITECTURE.md), [HOWTO-location.md](HOWTO-location.md)                                                                                   |

Places marked `// OWNER: physics` in the code are meant for the physics owner to replace.

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
