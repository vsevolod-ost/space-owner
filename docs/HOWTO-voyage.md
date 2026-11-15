# How to change the voyage

For the game designers (and the writers): the voyage of act 2 as data - the gates, the legs,
the cargo, the events on the way and the colonies - where each number and text lives, and how to
check the balance after changing one. You change TypeScript objects in `src/content/voyage/`;
you do not need to read the engine. The physics of the flight (the autopilot, the time scale,
the integrator) is in [HOWTO-simulation.md](HOWTO-simulation.md).

## The loop in one paragraph

In the warehouse (act 1) the player takes up to 7 crates into the hold (`cargo.<id>` flags) and
boards. On the ship deck the navigation panel flies the ship through two gates in order - the
Moon, then Mars - while the player keeps the panel open (time stands while it is closed). Every day of flight the cargo and the
built-in base add or use oxygen, water, food, power and heat, and the engine burns fuel (the
Moon leg a few tonnes, the Mars transfer most of the rest); the heavier the ship, the less far
its fuel takes it. On the way to Mars events may stop the flight: the panel flashes an alarm
and closes, and the player runs to the event's deck station (airlock, porthole, radio, the
reactor's bay) to choose an answer there before a ~10 s timer runs out; too late, and the
event's worst answer applies with its bad outcome. At the Moon a card shows the forecast of the next leg and offers **Go on** or
**Stop here: build &lt;tier&gt;**; at Mars, the last gate, only Stop. Stop lands: the colony (act 3) on that body, its tier set by the cargo against the
body's needs, then the ending. A death (a stock at 0, drift out of fuel, an event) runs the
death loop: the scientists' debrief and back to the warehouse with the same cargo
([HOWTO-story.md](HOWTO-story.md)).

## Where to change what

Every number and text meant for the team is marked in the code with its owner:
`grep -rn "OWNER:" src` lists them all (`OWNER: design`, `physics`, `script`, `art`).

| To change                                          | File                                                               | Owner                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------- |
| Gate order and bodies                              | `src/content/voyage/gates.ts`                                      | design                                                    |
| A leg's delta-v budget, docking, rail / physics    | `src/content/voyage/legs.ts` (`dvBudget`, `dockS`, `mode`)         | physics                                                   |
| A leg's sunlight, heating load, link to the Earth  | `src/content/voyage/legs.ts` (`sunFactor`, `heatLoad`, `comms`)    | physics                                                   |
| The ship's base: dry mass, tank, stocks, daily use | `src/content/voyage/cargo/base.ts`                                 | physics                                                   |
| A crate: dry mass, start amounts, daily flows      | `src/content/voyage/cargo/<id>.ts` (`dryMassKg`, `start`, `flows`) | physics                                                   |
| Mass of a day of oxygen, water, food               | `src/content/voyage/cargo/stock-mass.ts`                           | physics                                                   |
| The engine: thrust, specific impulse               | `src/content/simulation/ship.ts`                                   | physics                                                   |
| A crate: bays, copies, what it gives a colony      | `src/content/voyage/cargo/<id>.ts` (`bays`, `maxCopies`, `colony`) | design; physics where it depends on the site (solar, ice) |
| A crate's name and line on the warehouse stand     | `src/content/voyage/cargo/<id>.ts` (`label`, `line`)               | script                                                    |
| Bays of the hold (7; then regenerate the maps)     | `src/content/voyage/cargo/index.ts` (`bays`), see [Cargo](#cargo)  | design                                                    |
| What the engineer at the hatch calls missing       | `GAPS` in `src/content/locations/warehouse.ts`                     | design / script                                           |
| Events: leg, point, chance, prices, risks          | `src/content/voyage/events/<id>.ts`                                | design; physics for `reactor-failure` `at`                |
| Events: title, text, choices, results              | `src/content/voyage/events/<id>.ts`                                | script                                                    |
| Colony needs per body                              | `src/content/voyage/colony.ts` (`needs`)                           | design                                                    |
| Colony colours per body                            | `src/content/voyage/colony.ts` (`sky`, `ground`)                   | art                                                       |
| Which picture a colony item puts up                | `src/content/voyage/colony.ts` (`colonyBuildings`)                 | art                                                       |
| Colony lines (shelter, systems, overlook)          | `src/content/locations/colony.ts`                                  | script                                                    |
| Endings and the tier lines                         | `src/content/endings.ts`                                           | script                                                    |
| Alarm thresholds, drift time                       | `src/core/voyage/flows.ts` (`ALARM_*`, `DRIFT_DEATH_REAL_S`)       | design (core: tell Vsevolod / PR review by the architect) |
| TIGHT on the gate card                             | `src/core/voyage/forecast.ts` (`FORECAST_TIGHT_*`)                 | design (core: tell Vsevolod / PR review by the architect) |
| Beats after a landing or a loss                    | `src/core/flow/FlowService.ts` (`LANDING_BEAT_MS`, `LOSS_BEAT_MS`) | design (core: tell Vsevolod / PR review by the architect) |
| Balance invariant thresholds                       | `src/devtools/balance.ts` (`I3_*`, `I5_*`, `I8_*`)                 | design                                                    |
| The debrief's lines by cause of death              | `src/content/cutscenes/debrief.ts` (`LINES`)                       | script                                                    |
| The landing's title card ("Mars · day 203")        | `src/content/story/act3.ts`                                        | script                                                    |

After changing any number in this table: **`npm run balance`** (below). The three files in
`src/core/` are the engine's: change the constant, and tell Vsevolod (the architect reviews the
PR, [CONTRIBUTING.md](CONTRIBUTING.md#who-owns-what)).

### Texts

Every text the player reads is marked `OWNER: script` (`grep -rn "OWNER: script" src`) and is a
`LocalText` pair `{ en: '...', uk: TODO }`: change the `en` text, leave `uk` to the translator
([HOWTO-localization.md](HOWTO-localization.md)). Texts in `src/ui/` and `src/scenes/` sit in the
UI owner's files: change the string, tell them. No visible word is compared in code: the status
words, the pause and ending options, the cabin states and the engine states are ids with a
table of labels next to them (`STATUS_LABELS`, `CHOICE_LABELS`, `HEAT_NAMES`, `ENGINE_WORDS`),
so change only the label. Strings with `max` must stay within it in every language.

| Text                                                                                                                                               | File                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| A crate's name and its line on the stand                                                                                                           | `src/content/voyage/cargo/<id>.ts` (`label`, `line`)                                           |
| An event card: title, text, choices, results                                                                                                       | `src/content/voyage/events/<id>.ts`                                                            |
| Warehouse: "Take it" / "Put it back" / "Leave it", the full-hold line, the "Cargo n/7 · m t" toast, the stand and hatch lines, the gap names       | `src/content/locations/warehouse.ts`                                                           |
| Ship deck: the porthole, radio and airlock toasts; the station names (`deckStationNames`), the "not here - go to" toast                            | `src/content/locations/ship-deck.ts`                                                           |
| Colony: shelter, systems, overlook                                                                                                                 | `src/content/locations/colony.ts`                                                              |
| Endings, tier lines                                                                                                                                | `src/content/endings.ts`                                                                       |
| The end screen's buttons ("Fly again", "Main menu")                                                                                                | `src/scenes/EndingScene.ts` (`CHOICE_LABELS`)                                                  |
| The scientists' debrief, the warehouse arrival                                                                                                     | `src/content/cutscenes/debrief.ts`, `warehouse-arrival.ts`                                     |
| The advisers' dialogues                                                                                                                            | `src/content/dialogues/<id>.ts`                                                                |
| Act titles; the landing's title card                                                                                                               | `src/content/story/<act>.ts` (`title`; `act3.ts`)                                              |
| Location titles                                                                                                                                    | `src/content/locations/<id>.ts` (`title`)                                                      |
| Character names                                                                                                                                    | `src/content/characters.ts` (`name`)                                                           |
| Body names (panel, cards, landing title)                                                                                                           | `src/content/simulation/solar-system.ts` (`name`)                                              |
| Panel rows, units, cabin states, the forecast block and its warnings ("NOT ENOUGH FUEL...", "... runs out on day N", "Tight..."), the ALARM toasts | `src/ui/navigation/navigationView.ts`                                                          |
| Gate card: "Gate n/2", "Day N. Next leg", "Go on to", "Stop here: build"                                                                           | `src/ui/navigation/GateCard.ts`                                                                |
| Event card: the "(needs: ...)" suffix; the cards' key legend; the map's note; the station card's key hint                                          | `src/ui/navigation/EventCard.ts`, `Card.ts`, `SystemMap.ts`; `src/scenes/EventStationScene.ts` |
| The alarm flash on the panel ("ALARM", "Go to: ...", its hint)                                                                                     | `src/ui/navigation/AlarmNotice.ts`                                                             |
| Deck toasts of the voyage: "Too late!", "Gate reached: back to the navigation station.", "ALARM: ... - go to the ...!"                             | `src/scenes/stationFlow.ts` (`LINES`)                                                          |
| The timer bar's seconds ("9s")                                                                                                                     | `src/scenes/AlarmBarScene.ts`                                                                  |
| Panel column: next / day / leg lines, the log, the key legend, "Close"                                                                             | `src/scenes/NavigationScene.ts`                                                                |
| The HOLD strip's caption                                                                                                                           | `src/ui/HoldStrip.ts`                                                                          |
| Pause menu; main menu; settings; the "(in development)" stub                                                                                       | `src/scenes/PauseScene.ts`, `MainMenuScene.ts`, `SettingsScene.ts`, `StubScene.ts`             |
| "... has nothing to say yet." (an NPC without a dialogue)                                                                                          | `src/world/Interactables.ts`                                                                   |
| The "Checkpoint" toast                                                                                                                             | `src/core/flow/FlowService.ts` (`CHECKPOINT_TOAST`)                                            |
| The interact hint ("E")                                                                                                                            | `src/scenes/UiScene.ts` (`INTERACT_HINT`)                                                      |

## Gates and legs

`gates.ts` lists the gates in flight order; the last one has `last: true` (only Stop there).
Each gate's `body` is a body of `src/content/simulation/solar-system.ts` with role `gate`.

`legs.ts` has one leg per gate, in the same order: leg 0 is the Earth to the Moon, leg 1 the
Moon to Mars. Per leg:

- `dvBudget` - the most delta-v the autopilot may spend, m/s (Moon 4, Mars 10 km/s). It plans
  85 % of what the fuel gives, at most of this, and keeps the rest as a reserve. Fuel is in
  kilograms (the base's tank 23 t, each fuel crate 12 t, up to 3 crates); what it is worth is
  its delta-v at the ship's mass (the rocket equation, see
  [HOWTO-simulation.md](HOWTO-simulation.md#the-ship-mass-engine-fuel)). The Moon leg takes
  about 1 km/s (3.5-5 t of fuel); the Mars leg is a transfer of 188-267 days: the more
  delta-v the ship has, the faster (two crates already fly at the `dvBudget` cap, about 190
  days); the slowest costs about 5.3 km/s. The tank alone always reaches the Moon, but Mars
  only with a light hold (at most about 115-119 t at the start); a heavier one needs a fuel
  crate.
- `dockS` - simulated seconds of the docking at the gate (about 0.9 real s of Run at the
  current time scale: Moon 3.75 h, Mars 6.75 h).
- `mode` - `physics` (the autopilot flies the real gravity) or `rail` (a scripted curve, for
  a leg the autopilot cannot fly well; the reason is written next to it). Both legs are
  `physics` now; no leg uses rails.
- `sunFactor` (0..1, sunlight against the Earth's orbit: solar panels), `heatLoad` (extra power
  per day for heating: colder further out), `comms` (`ok` / `weak` / `lost`: the link shown on
  the panel; events may read it). They switch at the gates.

These are physics numbers: after a change run `npm run voyage-check` first (every leg must
still arrive, see [HOWTO-simulation.md](HOWTO-simulation.md#the-autopilot)), then
`npm run balance`. A new gate needs a body, a line in `gates.ts`, a leg, a colony site in
`colony.ts`, an ending `colony-<body>` in `src/content/endings.ts`, and `npm run balance` green again.

## Cargo

`src/content/voyage/cargo/index.ts` lists the kinds of cargo (10 now) in the warehouse's order;
the hold has `bays: 7`. The base (`base.ts`) is always aboard and takes no bay.

**Changing `bays`** also changes the maps: the ship deck has one crate place `bay-N` per bay
and the colony one building place `build-N` per bay. The game binds as many as `bays` says;
the maps get them from `tools/make_maps.py`, which reads the same `bays` from `index.ts` (its
`BAYS`). After a change run `python3 tools/make_maps.py` (it stops if the places no longer fit
the map: then move their rows in its `MAPS`, and the hold's rectangle in `LOCATIONS` of
`tools/placeholders.py`, then `python3 tools/placeholders.py`). A map that does not match warns
`binding "bay-8" has no object with that name in the map` in the console. The artists' deck
background shows 7 mounts ([HOWTO-art.md](HOWTO-art.md)): tell them.

One kind:

```ts
// src/content/voyage/cargo/solar.ts (short)
export const solar: CargoDef = {
  label: { en: 'Solar panels', uk: TODO, max: 14 }, // on the crate and in lists
  line: { en: 'Power from the Sun, fading past Mars.', uk: TODO, max: 60 }, // the stand's line
  bays: 1, // bays one copy takes
  maxCopies: 1, // crates of it in the warehouse (fuel: 3)
  icon: 4, // frame in ui/items.png
  dryMassKg: 2_000, // the crate's own mass, kg, without its fuel and stocks
  // start: { power: 160 } (the battery) - added at the start, per copy: fuel in kg, days
  flows: ({ sunFactor }) => ({ power: 2 * sunFactor }), // per simulated day, per copy
  colony: ({ sunFactor }) => ({ power: sunFactor >= SOLAR_COLONY_MIN_SUN ? 1 : 0 }),
};
```

- **Units.** Fuel in kilograms, oxygen / water / food in days for the one person aboard, power
  in days of the ship's base load (1 a day plus the leg's `heatLoad`), heat in days the cabin
  stays warm without power.
- **Mass.** `dryMassKg` is the crate itself (the base 80 t; crates 0.5 t for oxygen and
  supplies to 6 t for the reactor; the fuel crate 3 t of tank). Its fuel and stocks add their
  own: fuel kilogram for kilogram, oxygen / water / food at `stockMass` in `stock-mass.ts` (0.84,
  3, 1.8 kg a day), power and heat nothing. The warehouse stand shows a crate's whole mass
  ("Mass 15.0 t." for a fuel crate), the toast after a take or a put back the ship's ("Cargo
  3/7 · 134.5 t" with two fuel crates and oxygen). Mass slows the ship and shortens its fuel's
  reach: a heavy hold flies a slower transfer to Mars and needs more days of life support.
- **`flows(ctx)`** returns the change per day; `ctx` has the leg's `sunFactor`, `heatLoad`,
  `comms` and `powered` (power above 0). The base breathes, drinks and eats 1 a day each.
- **`needsPower: true`**: the item dies for good when power reaches 0 (the greenhouse).
- **`colony`**: levels it gives a colony on the axes `power`, `heat`, `shielding`, `life`; a
  function of the site's `sunFactor` when it depends on the body (solar, ice kit).

Deaths: oxygen, water, food at 0 (`hypoxia`, `dehydration`, `starvation`); power at 0 and then
the cabin's warmth (`heat`) at 0 (`frozen`); out of fuel mid-leg for 3 real seconds (`drift`);
an event's own death (`event:<id>`). Before each, the alarm turns the panel row red: at 10
simulated days or 3 real seconds of Run before it, whichever comes first.

**To add a kind:** create `<id>.ts` next to the others and list it in `index.ts`; then

- its icon: a line in `ITEMS` of `tools/placeholders.py` (id, two-letter code, colour; the
  order is the frame order of `ui/items.png`, so add it at the end and give the kind
  `icon: <its index>`); `python3 tools/placeholders.py` rebuilds the placeholder sheet, and the
  artists draw the new frame ([HOWTO-art.md](HOWTO-art.md), `ui/items.png`);
- its crate place `crate-<id>` (one per copy: `crate-<id>-1..n` when `maxCopies` is above 1)
  on the warehouse map: the three islands of `MAPS['warehouse']` in `tools/make_maps.py` hold
  2x2 cells each and all 12 are taken, so a new kind needs a fourth island (a new
  `(x, cells)` entry there, and its rectangle among the warehouse's obstacles in `LOCATIONS` of
  `tools/placeholders.py`); then `python3 tools/placeholders.py && python3 tools/make_maps.py`
  (see [HOWTO-location.md](HOWTO-location.md#generated-maps)). If it closes one of the gaps the
  engineer names at the hatch, add its id to `GAPS` in `src/content/locations/warehouse.ts`
  (that table lists cargo ids by hand). If it builds something in the colony, add it to
  `colonyBuildings` in `colony.ts`.

## Events on the way

`src/content/voyage/events/index.ts` lists them. All seven are on the Moon - Mars leg, at
different points, more of them late on the leg so that the alarms come faster towards Mars:

| Event             | `at` | Chance                               | Station                   | Timeout answer             |
| ----------------- | ---- | ------------------------------------ | ------------------------- | -------------------------- |
| `dusty-panels`    | 0.2  | 0.5 with solar panels and no reactor | `airlock`                 | `leave` (no risk)          |
| `hull-breach`     | 0.4  | 0.45                                 | `airlock`                 | `patch`: oxygen -48        |
| `lost-signal`     | 0.55 | 0.65                                 | `radio`                   | `boost` (no risk)          |
| `asteroid-belt`   | 0.65 | 0.7                                  | `porthole`                | `fly`: the hit             |
| `solar-flare`     | 0.75 | 0.6                                  | `porthole`                | `work-on` (no risk)        |
| `greenhouse-leak` | 0.8  | 0.6 with a greenhouse                | `{ bayOf: 'greenhouse' }` | `shut-valve` (no risk)     |
| `reactor-failure` | 0.85 | 0.5 with a reactor                   | `{ bayOf: 'reactor' }`    | `shut-down` (a melt kills) |

The asteroid belt is a field of rocks on the way (the real belt lies past Mars). The Earth - Moon
leg has none. A leg may hold several events; give each its own point. Each is rolled once per
voyage with the run's seed, when the ship has flown `at` of the leg's planned duration; if the
roll is under `chance`, time stands and the **station alarm** comes on (below). Only one event is
open at a time; an event whose point comes after the arrival, or while the ship drifts, is
dropped.

```ts
// src/content/voyage/events/hull-breach.ts (short)
export const hullBreach: VoyageEventDef = {
  leg: 1, // leg 1: the Moon to Mars
  at: 0.4, // 40 % into the leg (keep under 0.9)
  chance: () => 0.45, // may read the cargo: (ctx) => (ctx.has('reactor') ? 0.4 : 0)
  speaker: 'computer', // portrait on the card
  title: { en: 'Hull breach', uk: TODO },
  text: { en: 'A micrometeoroid holed a module; air is leaking.', uk: TODO },
  station: 'airlock', // deck object where it is answered; or { bayOf: 'reactor' }
  timeoutChoice: 'patch', // applied, its bad outcome sure, when the timer runs out
  choices: [
    {
      id: 'seal',
      text: { en: 'Seal the module off.', uk: TODO },
      result: { en: 'The module is lost with the air in it.', uk: TODO },
      effect: { stocks: { oxygen: -16 } },
    },
    {
      id: 'patch',
      text: { en: 'Patch it from outside.', uk: TODO },
      risk: () => 0.5, // chance it goes wrong
      onHit: { stocks: { oxygen: -48 } }, // then this, on top of `effect`
      result: { en: 'The patch holds.', uk: TODO },
      hitResult: { en: 'The patch tore; much air is gone.', uk: TODO },
    },
    {
      id: 'foam',
      text: { en: 'Fill it with the regolith kit foam.', uk: TODO },
      when: (ctx) => ctx.has('regolith-kit'), // otherwise shown dim with "Needs: ..."
      needs: { en: 'Regolith kit', uk: TODO },
      result: { en: 'The foam sets; little air lost.', uk: TODO },
      effect: { stocks: { oxygen: -4 } },
    },
  ],
};
```

- An **effect** may have `waitDays` (the stocks flow that many days while the ship waits),
  `stocks` (added: negative is lost; `fuel` in kg, the rest in days), `offline` (cargo ids
  that stop for good) and `die` (the crew dies, cause `event:<id>`).
- `ctx` in `chance`, `when` and `risk`: `has(id)`, `count(id)`, `stock(id)`, `comms`, `leg`.
- The **first choice** is what the tools and the smoke test answer by default: make it the
  safe, ordinary answer.
- The answer is kept in the flag `event.<id>` (and `event.<id>.hit`) until the next voyage.
- **`station`** is the deck object where the event is answered: `airlock`, `porthole` or `radio`
  (interactables of `ship-deck`), or `{ bayOf: '<cargo id>' }` - the hold's access point over
  the bay of that crate (`bay-access-N`; give such an event a `chance` of 0 without that cargo).
  Several events may share a station.
- **`timeoutChoice`** is the choice applied when the alarm's timer runs out: the worst ordinary
  answer. A choice with `risk` is applied with its bad outcome (`onHit`) for sure, without a
  roll; one without `risk` as it is. It must exist, must not have `when` and its `onHit` must not
  `die` (a death is never the price of being late): `checkEventCatalog`
  (`src/core/voyage/voyageEvents.ts`) throws at game start otherwise.

**The station alarm** (`services.stationAlarm`, `src/core/alarm/StationAlarmService.ts`): an
event fires only while the navigation panel runs. The panel then flashes "ALARM", the title and
"Go to: <station>" for `ALARM_FLASH_MS` (0.7 s, `src/scenes/NavigationScene.ts`) and closes;
the timer (`STATION_TIMER_S` = 10 s real time, OWNER: design) counts from the moment the event
fires, also while the station's card is open, and stands only in the pause menu and while the tab is hidden. On the deck
a box in the top-right corner shows the event, the station, the seconds and a bar (red in the
last third, `AlarmBarScene`; on the navigation panel it sits above the Close button, clear of
the gate ribbon); a pointer blinks over the station (`StationMarker`); the deck's music switches to the alarm track
(docs/HOWTO-audio.md). E at the right station opens the
card (`EventStationScene`; Esc closes it, the timer runs on); at another station a toast says
where to go. The result is a toast on the deck; then the player walks back to the navigation
station and opens the panel, and the ship flies on. A death at a station opens the panel on LOST as before. Simulated time
stands during the whole alarm, so the balance tools treat an event as instant, as before.
Measured walks from the navigation station (80 px/s): airlock 5.0 s, porthole 2.8 s, radio
3.0 s, bay 1 0.7 s, bay 7 3.3 s - all leave more than 3 s of the 10 s after the flash and
the card's 0.4 s input lock.

**To add an event:** create `<id>.ts` with its `station` and `timeoutChoice`, list it in
`index.ts`, run `npm run balance` (each new choice multiplies the balance's answer policies, so
the run gets longer: ~6.5 min with seven events), and check that the smoke seed still holds
(`tools/smoke/voyage-seed.mjs`, and the seed of the `stations` scenario, which needs its
four events). The
balance check flies a voyage for every choice (and every hit) of every event; if no loadout and
seed it tries can reach your event, it fails with `coverage: <event>/<choice>/... never compared`
(below).

## Colonies and endings

`src/content/voyage/colony.ts` has one entry per gate body (now `moon` and `mars`):

```ts
mars: { sunFactor: 0.43, needs: { power: 4, heat: 1 }, sky: 0xe0b48c, ground: 0xc0603a },
```

The Moon needs heat 2 and shielding 4, Mars power 4 and heat 1. The needs pull apart on purpose
and were picked by a search so that I4 and I5 hold (below).

- `needs` - levels on `power`, `heat`, `shielding`, `life`. The base gives `shielding: 1`; the
  cargo aboard gives its `colony` levels.
- **Tier** (`colonyCheck` in `src/core/voyage/colony.ts`): every need met - **colony**; more
  than half of the need levels covered (each need counted up to its level) - **settlement**;
  otherwise **outpost**. Every tier is a colony that lives; there is no failed landing. The gate
  card's "Stop here: build an outpost / a settlement / a colony" (one whole phrase per tier,
  `STOP_TEXTS` in `src/ui/navigation/GateCard.ts`), the colony location and the end screen all
  use it.
- `sky`, `ground` - colours multiplied over the grey colony layers (art).
- `colonyBuildings` - which picture each colony item puts up on the places `build-1..7` (one
  per bay of the hold).

The ending of each body is `colony-<body>` in `src/content/endings.ts` (title, text, optional own
tier lines); the common tier lines are `TIER_LINES` there.

## How to balance

1. Change a number (a crate's flow, an event's chance, a colony need...).
2. Run **`npm run balance`** (about 6.5 minutes on a 16-thread machine with the seven events
   (1.5 with four): every choice of every event multiplies the answer policies it flies, so the
   sweep costs about 97 CPU-minutes spread over worker threads, one per CPU; one core takes
   well over an hour). It flies **every loadout the hold can take**
   (1606 sets of at most 7 bays) through the whole voyage, without events and with 20 seeds,
   and prints one line per invariant: `I3 ok: ...` or `I3 failed: ...` with what was measured
   and an example loadout. It must end with every line `ok` (exit code 0).
3. To see the numbers behind it, run **`npm run voyage-check -- --all`**: the same sweep, a
   summary (how many loadouts reach each gate, how they die, the colony tiers), and one line
   per loadout in **`tools/out/voyage-sweep.csv`** (open it in a spreadsheet; `tools/out/` is
   not committed). Columns: `loadout`, `bays`, `start_mass_t` and `start_dv_km_s` (the ship's
   mass and the delta-v of its fuel at the start), `range_gate` / `range_body` (the last gate
   reached, -1 / `none` before the Moon), `result` (`landed`, `died`, or `gave up`: the flight
   neither arrived nor drifted), `death_cause`, `death_day`, `death_leg_to`, `drift_day`,
   `alarm_lead_real_s`, `end_day` (of the death or the landing), `fuel_t_<body>` and
   `fuel_short_<body>` (the fuel at the gate and whether the gate card says it is short for
   the next leg), `tier_<body>` (the tier a
   Stop there would build), `events_reach_<body>` (share of the 20 seeds that reach it with
   events, with the best fixed answers for that gate: the policy of answers, one per event,
   that gets the most seeds there), `dominates_share`, `dominated_by`.
4. To follow one loadout gate by gate:
   `npm run voyage-check -- --loadout fuel:1,oxygen:1,solar:1` (stocks at every gate, how it
   ended, how long the alarm warned); with events:
   `npm run voyage-check -- --seed 1 --loadout fuel:1,oxygen:1,solar:1 --stop mars`
   (`--choice 1` answers every card with its second choice).
5. Play it: `npm run dev`, `http://localhost:5173/?act=act1&seed=1` (a fixed seed rolls the
   same events every time).

Change the numbers, not the invariants. The thresholds in `src/devtools/balance.ts` are design
decisions; change one only on purpose, with the team.

### The invariants

| Id  | In plain words                                                                                                                                                                            | If it fails                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | Any loadout, even an empty hold, reaches the Moon.                                                                                                                                        | The base's start stocks or the Moon leg's costs are too harsh: raise `base.ts` `start`, or lower the leg's `heatLoad`.                       |
| I2  | The base alone dies before the last gate (Mars): the cargo matters.                                                                                                                       | The base is too generous: lower its `start` (power, oxygen...) or raise its daily use.                                                       |
| I3  | Between 10 % and 50 % of loadouts reach the last gate (Mars) (`I3_MIN_LAST_SHARE`, `I3_MAX_LAST_SHARE`).                                                                                  | Too few: give the sets more (fuel kg per crate, life support, power). Too many: tighten the Mars leg (`heatLoad`) or the life-support flows. |
| I4  | No loadout is at least as good as every other on range and on the tier at every body: there is no single right answer.                                                                    | Weaken the dominant set's strongest item, or give the others something it lacks (a colony axis, a body where it is worse).                   |
| I5  | Every kind of cargo is in some best set (top 10 % by range or by the tier at some body): no dead cargo.                                                                                   | The named kind is never worth a bay: give it a colony axis a body needs, a better flow, or a choice in an event.                             |
| I6  | Every death comes at least 3 real seconds after its alarm: no death without warning.                                                                                                      | A stock falls too fast for the alarm (a big event loss, a steep flow): soften it, or raise the alarm thresholds (`ALARM_*`).                 |
| I7  | Go on with too little fuel never reaches the next gate, and the gate card warns every time (in the game the card says "NOT ENOUGH FUEL: the ship drifts..."; the tool prints FUEL SHORT). | The forecast and the flight disagree: an engine problem, tell the programmer.                                                                |
| I8  | With events, the best loadout for each gate still reaches it in at least 60 % of seeds (events take at most 40 % off): luck tests, it never rules.                                        | An event is too deadly: lower its `chance`, its losses, or a `risk`.                                                                         |

The full measured values are in the `ok` lines (e.g. `I2 ok: the base alone dies of frozen on
day 83.0`). Now: all 1606 loadouts reach the Moon and 506 (31.5 %) reach Mars; the best sets
of I5 are 128 for the Moon's tier and 28 for Mars's; the closest to dominant (I4) is at least
as good as 98.3 % of the others; 177 gates are fuel-short (I7); with events the best set
reaches Mars in 100 % of seeds (I8). How they end without events: landed at Mars 506, hypoxia
410, frozen 361, dehydration 194, drift 135.

**Known limitation of I7 (accepted).** The fuel-short forecast counts the ship's mass without
events. An event that throws mass overboard (lost stocks, a dumped tank) lightens the ship, so a
set the gate card calls fuel-short can still reach the next gate: e.g.
`supplies,reactor,greenhouse` is FUEL SHORT at the Moon yet "Go on" lands at Mars in most seeds.
I7 stays green only because the cross-check samples game voyages where this does not happen; a
new late event that loses mass can make it sample such a voyage and fail I7. That is this
limitation, not an engine bug: tie the event to other cargo, or make the forecast account for
mass lost to events (a programmer's job).

### What the sweep assumes, and its other failures

- **Every loadout flies its own voyage.** The ship's mass - the base, the crates, the stocks,
  the fuel - sets its acceleration, its delta-v and the transfer the autopilot picks (a light
  or fuel-rich ship flies a faster one), and it falls as the stocks are used and the fuel
  burns. So the sweep flies each loadout with the game's own `Simulation`, frame by frame as
  the game does: once without events (with the alarm, for I6) and once stopping where the
  events fall due. An event that happens changes the stocks, hence the mass and the flight:
  the sweep applies the answer with the game's own code to the state saved at that point and
  flies on from there, once per loadout and answer path; every seed that takes that path
  shares the flight (`LoadoutFlights` in `src/devtools/voyageEvaluator.ts`). The gate card's
  "not enough fuel" is the loadout's own flight drifting on the next leg, as in the game. The
  1606 loadouts are spread over worker threads (one per CPU).
- **The cross-check.** The sweep's evaluator is compared with the game's own voyage on a
  sample of loadouts and seeds; `sweep failed: the sweep's evaluator disagrees with the game ...`
  means they differ (an engine bug; tell the programmer, with the line).
- **Coverage.** The cross-check also flies a voyage for every (event, choice, hit or not) the
  events can produce. `sweep failed: coverage: asteroid-belt/fly/hit never compared` means no
  loadout and seed it tried reaches that case: an event too rare to happen (`chance` near 0, a
  `when` no loadout meets), or a new choice nobody can pick. Make it reachable, or tell the
  programmer if it should not be.
- **`flight failed: ...`**: some loadout's flight neither arrived nor drifted within 1000 days
  (the autopilot failed with these numbers). Run
  `npm run voyage-check -- --check --loadout <the loadout named>` and fix the flight first.

## Testing in the game

- `?act=act1&seed=<n>` starts at the warehouse with a fixed seed; `?act=act2` boards with the
  cargo of the current flags (none in a fresh browser).
- In the console (`?debug=1` or the dev server): `nasa.services.simulation.setDebugWarp(20)`
  makes the flight 20 times faster; `nasa.services.simulation.voyage` shows the phase, the
  gate, the open event and the forecast; `nasa.services.state.flags.set('cargo.fuel', 2)`
  puts two fuel crates aboard (before boarding).
- The smoke test `voyage` plays the whole loop on seed 1 with `fuel`, `oxygen`, `supplies`
  and `solar`: Moon, Go on, Mars (landing on day 202), Stop, the colony, the ending
  (`node tools/smoke.mjs --scenario tools/smoke/scenarios/voyage.mjs --timeout 600000` after
  `npm run build`). After changing events, cargo or legs, check that seed 1 still lands at Mars
  with that loadout (`tools/smoke/voyage-seed.mjs` says how), or pick another seed.
- The smoke test `stations` plays the station alarms on seed 71 with `fuel`, `oxygen`,
  `supplies` and `reactor`: the flash, the bar and the marker, a wrong station, the timeout
  (`nasa.services.stationAlarm.setDebugTimer(ms)` shortens the timer in debug mode), answers at
  the radio and the porthole, the reactor's bay and a death there (LOST on the panel).
