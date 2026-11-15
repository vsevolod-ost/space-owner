# Space Owner

A browser game in TypeScript and [Phaser 4](https://phaser.io), built with Vite: a top-down
pixel-art adventure in the spirit of RPG Maker, with a prologue and three acts, locations,
characters, dialogues and cutscenes. In act 2 the map is a spaceship, and its navigation panel
shows the ship moving through a simulated solar system.

The whole loop is playable, in English and Ukrainian: the flat (prologue), the warehouse where the
cargo is chosen (act 1), the voyage through two gates (the Moon, Mars) on the navigation panel
(act 2), the colony and its ending (act 3), and the death loop back to the warehouse. The music
and most of the art are final; the colony buildings, a few small pictures and the sound effects
are still placeholders (see "Systems"). `grep -rn "OWNER:" src` lists every number and text a team member owns, marked
`physics`, `design`, `script` or `art`.

## NASA & Space Agency Compliance

NASA does not endorse any non-U.S. Government entity and is not responsible for information contained on non-U.S. Government websites. For non-U.S. Government websites, participants must comply with any data use parameters of that specific website.

This project aligns its mission design and engineering principles with [NASA Data & Resources](docs/NASA-RESOURCES.md).

## Use of Artificial Intelligence

The code was developed with an AI coding assistant: Claude (Anthropic), through Claude Code. A
large part of the source code, the developer tools (`tools/`, `src/devtools/`) and the technical
documentation (`docs/`) was generated or edited with AI assistance, then reviewed,
tested and corrected by the team. AI-assisted commits carry a `Co-Authored-By: Claude` line in
their metadata (`git log --grep "Co-Authored-By: Claude"`).

AI was used for the code, the developer tools, the technical documentation and the project
descriptions only. No generative AI was used for the art, the music, the sound effects or the
in-game texts (dialogues, story, Ukrainian translation): they are made by the team members named
in [Team and credits](#team-and-credits). The one exception among the in-game texts is the
credits text of the About panel, which was drafted with AI assistance.

## Run

Play online: <https://vsevolod-ost.github.io/space-owner/>.

To run it locally: needs [Node.js](https://nodejs.org/) 22 or newer.

```bash
npm install
npm run dev        # open the printed address, http://localhost:5173/
npm run check      # type check, lint, format check, docs links
npm run build      # check, then the production build into dist/
npm run smoke      # build, then a headless browser check of the menu
npm run balance    # the balance invariants over every cargo loadout (~6.5 min on 16 threads)
```

Controls: arrows or WASD to walk, E to interact, Enter or Space to confirm, Esc for the pause
menu, F3 for the debug overlay. Open a location directly with
`http://localhost:5173/?location=warehouse`, an act with `?act=act2`.

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
- [Voyage](docs/HOWTO-voyage.md) - gates, legs, cargo, events, colonies; how to balance
- [Simulation](docs/HOWTO-simulation.md) - the ship and solar system model of act 2
- [Localization](docs/HOWTO-localization.md) - text pairs, translating, the language check

## Systems

| System                | Status | Scope                                                                                                                                                                                                                 |
| --------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Locations and doors   | done   | Home, warehouse, ship deck, colony: generated maps, props, flag conditions, a colony picture per body                                                                                                                 |
| Dialogue              | done   | Typed nodes with choices, conditions, flags and state-function texts; the advisers, the crate stands                                                                                                                  |
| Cutscenes             | done   | Async scripts over a small API (walk, say, pan, fade); the warehouse arrival, the scientists' debrief                                                                                                                 |
| Story flow and saving | done   | Acts with title cards, checkpoints in localStorage, Continue, the death loop, landing, Fly again                                                                                                                      |
| Cargo (act 1)         | done   | 10 kinds of cargo, 7 bays, crate stands, advisers, the hatch check, the HOLD strip                                                                                                                                    |
| Voyage (act 2)        | done   | Autopilot on a live integrator through 2 gates, resources per item, alarms, drift, gate forecast, events                                                                                                              |
| Navigation panel      | done   | System map, gate ribbon, status column, gate cards, alarm flash; time runs while it is open                                                                                                                           |
| Colony and endings    | done   | One colony per gate body, tiers by cargo against the body's needs, two endings                                                                                                                                        |
| Balance tools         | done   | `npm run voyage-check`, `npm run balance`: headless voyages, the loadout sweep, invariants I1-I8                                                                                                                      |
| UI kit                | done   | 9-slice panel, button, text, label, toast, choice list, fader, panel scenes, pause menu                                                                                                                               |
| Audio                 | done   | Music per location with crossfade, UI, door and alarm sounds, volume settings panel                                                                                                                                   |
| Debug overlay         | done   | F3 or `?overlay=1`: FPS, location, hero coordinates, act, music, simulation, flags                                                                                                                                    |
| Localization          | done   | English and Ukrainian text pairs, language choice with a live rebuild, a pseudo-locale check                                                                                                                          |
| Smoke test            | done   | 19 headless Chromium scenarios over the production build, the whole voyage included                                                                                                                                   |
| Art and sound effects | partly | Final: music, logo, menu ship, locations, colony pictures, characters, portraits, crates, cargo icons, prologue card. Placeholders: colony buildings, two extra hero portraits, navigation panel icons, sound effects |

The placeholders are drawn and synthesised by plain scripts (`tools/placeholders.py`,
`tools/sounds.py`), not by generative AI; each placeholder picture carries its file name and a
`PLACEHOLDER` PNG comment. The list of pictures and their state: [Art guide](docs/HOWTO-art.md).

## Team and credits

| Who                                 | Role                                                    |
| ----------------------------------- | ------------------------------------------------------- |
| Vsevolod Ostapenko                  | Author of the idea, team lead, developer                |
| Emilia Dmytrenko                    | Composer, sound designer, manager, project presentation |
| Gaidai Yevangelina, Artem Ninovskyy | Artists                                                 |
| Pasha Hrebelnyi                     | Physics, author of the dialogues                        |

- Art: drawn by hand by Gaidai Yevangelina and Artem Ninovskyy. The pictures still marked as
  placeholders are drawn by the script `tools/placeholders.py`.
- Music: composed by Emilia Dmytrenko in FL Studio. The placeholder sound effects are synthesised
  by the script `tools/sounds.py`.
- In-game texts: written by the team.
- Code: the team with an AI coding assistant, see
  [Use of Artificial Intelligence](#use-of-artificial-intelligence).
- NASA and partner resources the design follows: [NASA Data & Resources](docs/NASA-RESOURCES.md).
- The team's task list and design notes are kept outside the repository.
- Who owns which folders: [Contributing - Who owns what](docs/CONTRIBUTING.md#who-owns-what).
- What artists need: [Art guide](docs/HOWTO-art.md).

## Licences

- Space Owner - the code, art, music, sounds and texts made by the team - is released under the
  [Apache License 2.0](LICENSE).
- Phaser: MIT licence.
- Font Press Start 2P (The Press Start 2P Project Authors): SIL Open Font License 1.1, text in
  [public/fonts/OFL.txt](public/fonts/OFL.txt).
