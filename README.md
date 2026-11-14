# Space Owner

A browser game in TypeScript and [Phaser 4](https://phaser.io), built with Vite: a top-down
pixel-art adventure in the spirit of RPG Maker, with a prologue and three acts, locations,
characters, dialogues and cutscenes. In act 2 the map is a spaceship, and its navigation panel
shows the ship moving through a simulated solar system.

This is the **skeleton**: every system works on a short demo story with placeholder art, ready
for the team to fill with content.

## Run

Play online: after the release, on GitHub Pages. Until then run it locally:

Needs [Node.js](https://nodejs.org/) 22 or newer.

```bash
npm install
npm run dev        # open the printed address, http://localhost:5173/
npm run check      # type check, lint, format check, docs links
npm run build      # check, then the production build into dist/
npm run smoke      # build, then a headless browser check of the menu
```

Controls: arrows or WASD to walk, E to interact, Enter or Space to confirm, Esc for the pause
menu, F3 for the debug overlay. Open a location directly with
`http://localhost:5173/?location=demo-room`, an act with `?act=act2`.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) - layers, scenes, services, where state lives, debug tools
- [Contributing](docs/CONTRIBUTING.md) - setup, commands, branches and pull requests, who owns
  what
- [Art guide](docs/HOWTO-art.md) - resolution, every picture and its size, sprite sheets,
  delivering art; [palette](docs/palette.md)
- [Locations](docs/HOWTO-location.md) - a background, a Tiled map, doors, NPCs, triggers
- [Dialogues](docs/HOWTO-dialogue.md) - lines, choices, flags, NPCs
- [Cutscenes](docs/HOWTO-cutscene.md) - scripted scenes as async functions
- [Story](docs/HOWTO-story.md) - acts, checkpoints, deaths, endings, pause
- [UI](docs/HOWTO-ui.md) - the UI kit, theme and panel scenes
- [Audio](docs/HOWTO-audio.md) - music, sound effects, volumes
- [Simulation](docs/HOWTO-simulation.md) - the ship and solar system model of act 2

## Systems

| System                    | Status      | Scope                                                                                     |
| ------------------------- | ----------- | ----------------------------------------------------------------------------------------- |
| Locations and doors       | done (demo) | Background + Tiled markup, collisions, spawns, doors between corridor, room and ship deck |
| Dialogue                  | done (demo) | Typed dialogue nodes with choices, conditions and flags; the engineer's branching talk    |
| Cutscenes                 | done (demo) | Async scripts over a small API (walk, say, pan, fade); the arrival scene in the room      |
| Story flow and saving     | done (demo) | Acts with title cards, checkpoints in localStorage, Continue / Retry, deaths, an ending   |
| UI kit                    | done (demo) | 9-slice panel, button, text, label, toast, choice list, fader, panel scenes, pause menu   |
| Audio                     | done (demo) | Music per location with crossfade, UI and door sounds, volume settings panel              |
| Simulation and navigation | done (demo) | Solar system and ship model without Phaser, resources, navigation panel on the ship deck  |
| Debug overlay             | done (demo) | F3 or `?overlay=1`: FPS, location, hero coordinates, act, music, simulation, flags        |
| Smoke test                | done (demo) | `npm run smoke`: headless Chromium scenarios over the production build                    |

All art and sound are generated placeholders (`tools/placeholders.py`, `tools/sounds.py`).

## Team

- The team's task list and design notes are kept outside the repository.
- Who owns which folders: [Contributing - Who owns what](docs/CONTRIBUTING.md#who-owns-what).
- What artists need: [Art guide](docs/HOWTO-art.md).

## Licences

- Phaser: MIT licence.
- Font Press Start 2P (The Press Start 2P Project Authors): SIL Open Font License 1.1, text in
  [public/fonts/OFL.txt](public/fonts/OFL.txt).
