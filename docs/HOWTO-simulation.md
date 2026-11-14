# How to work on the ship simulation

Everything the physics owner touches: the model of the solar system and the ship in act 2, the
formulas to replace, resources, and how the navigation panel and the save use it. The
simulation is plain TypeScript **without Phaser** (`src/core/simulation/`): you can read and
change it without knowing the game engine. The voyage's content - cargo, events, colonies - and
how to check the balance are in [HOWTO-voyage.md](HOWTO-voyage.md); this page is the physics
and the engine under them.

## Files

| File                                       | What it is                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| `src/core/simulation/types.ts`             | The data: `Body`, `GateDef`, `LegDef`, `AutopilotState`, `SimulationSnapshot`, ...   |
| `src/core/simulation/constants.ts`         | `G`, `DAY_S`                                                                         |
| `src/core/simulation/SolarSystem.ts`       | Where each body is at time `t` (static circular orbits)                              |
| `src/core/simulation/dynamics.ts`          | Gravity (3 strongest pulls), substep length, the integrator, engine-off predictions  |
| `src/core/simulation/autopilot.ts`         | Autopilot tuning (`AUTOPILOT`), capture and parking radii, the guidance law          |
| `src/core/simulation/Simulation.ts`        | One frame: time scale, autopilot, docking, rail legs, fuel charges, resources        |
| `src/core/simulation/SimulationService.ts` | Runs the `Voyage` in the game: start, holds, stop, bus events, flag mirrors          |
| `src/core/voyage/Voyage.ts`                | The voyage: gate chain, Stop / Go on, events, how it ends (`VoyageOutcome`)          |
| `src/core/voyage/forecast.ts`              | The gate forecast (plan D16): a headless copy flies the next leg, OK / TIGHT / SHORT |
| `src/core/voyage/voyageEvents.ts`          | Event types (`VoyageEventDef`, choices, effects) and their context                   |
| `src/core/voyage/random.ts`                | Seeded rolls (`rollFor(seed, key)`, plan D10)                                        |
| `src/content/voyage/events/`               | The events on the way: hull breach, asteroid belt, reactor fault, dusty panels       |
| `src/content/simulation/solar-system.ts`   | The bodies: real masses, radii, orbit radii, periods, roles, starting angles         |
| `src/content/simulation/ship.ts`           | The ship: mass, thrust, start orbit                                                  |
| `src/core/voyage/flows.ts`                 | Resources: `evaluateFlows`, `stepLife`, deaths, `lifeForecast`, the alarm            |
| `src/core/voyage/loadout.ts`               | `buildLoadout(flags)`: cargo aboard, `startResources`, the hold's order              |
| `src/core/voyage/VoyageService.ts`         | `services.voyage`: the cargo registry for the game and the location bindings         |
| `src/content/voyage/cargo/`                | The cargo registry: the built-in base and 10 kinds of crates (start, flows)          |
| `src/content/voyage/gates.ts`              | The 2 gates in flight order (Moon, Mars)                                             |
| `src/content/voyage/legs.ts`               | Per leg: `dvBudget`, `dockS`, `mode`; `sunFactor`, `heatLoad`, `comms` for flows     |
| `src/devtools/voyageCheck.ts`              | `npm run voyage-check`: the whole voyage headless in Node, table and criteria        |
| `src/devtools/voyageRun.ts`                | `--seed` runs: a `Voyage` with events, Stop / Go on and answers by a policy          |
| `src/scenes/NavigationScene.ts`            | The navigation panel that draws a snapshot                                           |

How it fits together: act 2 (`src/content/story/act2.ts`) goes to the ship deck and calls
`flow.startVoyage()`, which builds a `Voyage` (the `Simulation` plus gates, forecast and events,
see "The voyage" below). From then on `main.ts` calls `services.simulation.tick(ms)` on every
frame of the game loop; while nothing holds simulated time (only the navigation panel in Run
mode, see below) the service advances the voyage, emits `simulationTick` about four times a
second (the panel redraws on it) and `gateReached` when the autopilot reaches a gate.
Leaving the act (main menu, an ending, death, another act) stops the simulation.

Units are SI everywhere: metres, seconds, kilograms, newtons, radians. The model is flat: the Sun
is at the origin, x to the right, y up, angles counter-clockwise from +x. Display scale lives only
in the panel.

## The contract: `step` and the snapshot

```ts
// src/core/simulation/types.ts (short)
interface Body {
  id: string;
  name: string;
  role: 'home' | 'gate' | 'parent' | 'scenery'; // what it is for in the voyage
  massKg: number;
  radiusM: number;
  orbitRadiusM: number; // around `parent`, 0 for the Sun
  periodS: number; // one orbit, 0 for the Sun
  parent?: string; // id of the body it orbits; none = the Sun's place (origin)
  color: number; // 0xRRGGBB in the panel
  phaseRad?: number; // angle at t = 0 (one canonical date, frozen)
}
interface SimulationSnapshot {
  timeS: number; // simulated seconds since the voyage began
  timeScale: number; // simulated seconds per real second in the last frame
  pendingS: number; // simulated time granted but not yet integrated
  ship: ShipState; // x, y, vx, vy, massKg, thrustN, heading
  resources: Record<ResourceId, Resource>; // fuel in charges, days of stock, states
  autopilot: AutopilotState; // phase, legIndex, stage, plan, delta-v spent, docking
  cargo: Record<string, number>; // copies aboard by cargo id: the loadout is rebuilt from it
  life: LifeState; // offline items, death cause and day, drift clock
}
```

`Simulation.step(realDtS)` advances the world by one frame - `realDtS` **real** seconds (about
1/60) - and returns a new `SimulationSnapshot` (`advance(realDtS)` is the same without the
snapshot). The time scale grants `realDtS * timeScale` simulated seconds; the integrator
advances in whole substeps whose length depends only on the state and keeps the rest in
`pendingS`. While the ship is parked at a gate (`arrived`, `finished`) nothing moves and
simulated time stands (bodies too), and the frame that docks drops the rest of its grant. So
**the flight does not depend on real time**: not on the frame rate, the debug warp, how long the
player waits at a gate, or the time-scale constants (they only change how long it takes in
real seconds). A copy (`clone()`) flown headless arrives exactly where the game's ship does, to
the last bit (forecasts at the gates use this; checked at warp 1, 10, 100 and with 10 s waits at
every gate). Whatever you change inside, keep this:

- the snapshot is plain data (numbers, objects), so no classes or functions (it is not saved:
  a checkpoint restarts the voyage from its start, plan D17);
- everything a copy needs to fly on is in the snapshot (the constructor takes one back: `clone`);
- body positions are a function of `timeS` only (`SolarSystem.positionOf(body, timeS)`), so the
  snapshot does not store them.

`SimulationService` (`services.simulation`, reach it from the browser console as
`nasa.services.simulation` with `?debug=1`):

| Member                                 | What it does                                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `start(seed)`                          | New voyage with the cargo the `cargo.<id>` flags put aboard, events rolled with `seed`         |
| `voyage`                               | The running `Voyage` (phase, gate, `openEvent`, `forecast`, `outcome`, `seed`, `log`), or null |
| `goOn()`, `stopHere()`                 | The gate decision: leave for the next gate (Run then waits, `panel` held) / end landed here    |
| `answerEvent(choiceId)`                | Answer the open event's card; Run then waits for the player (`panel` held)                     |
| `forecastLife()`, `life`               | Every death, days away, alarm on or off (plan D14); offline items, death, drift clock          |
| `hold(reason)`, `release(reason)`      | Add / remove a reason time stands (`panel`, `pause`, `blur`, `gate`, `event`)                  |
| `isHeld(reason)`, `heldReasons`        | Which reasons hold time now                                                                    |
| `resetHolds()`                         | Back to a new session's holds (`panel` only); `FlowService` calls it                           |
| `setDebugWarp(n)`                      | Debug only: simulated time `n` times faster on top of `timeScaleAt`; lasts for the page's life |
| `stop()`                               | Drop the simulation (`snapshot()` is null after)                                               |
| `tick(realDtMs)`                       | One frame; main.ts calls it. Steps only while running and in the start's act                   |
| `snapshot()`                           | A copy of the current state, or null                                                           |
| `autopilot`                            | A copy of the autopilot's state (`phase`, `legIndex`, `thrusting`, `dvSpent`...), or null      |
| `clone()`                              | An independent `Simulation` in the same state, for a headless forecast                         |
| `isRunning`, `isStarted`, `isUnderWay` | State; `isUnderWay`: started and not ended (what a checkpoint marks)                           |
| `system`, `content`                    | The `SolarSystem`; the gates, legs and ship                                                    |

## The autopilot

The player does not steer (GDD D5): the autopilot flies every leg to the next gate's body.

- **Profile.** The engine is either full (2 kN on 100 t: 0.02 m/s^2) or off. At the start of a
  leg the autopilot plans the arrival time for `planFraction` (0.85) of the leg's `dvBudget`:
  a straight "accelerate - coast - brake" flight to where the body will be, stretched (at most
  1.4x) if the guidance would need more delta-v than that with gravity and the ship's own
  velocity counted.
- **Guidance.** Every few hours (2 % of the time left) it predicts where the ship would be at
  the planned arrival with the engine off (`coast`, the same physics), and fires the engine
  along the correction of the "zero-effort miss / velocity" law (`guidance` in
  `autopilot.ts`): full while it asks for at least 0.6 of full acceleration, off below 0.4.
  This gives burn - coast - brake.
- **Climb-out.** A leg that begins where a body pulls harder than the engine (a moon of a
  giant planet) first burns along the velocity until that pull is under half the engine's. Not
  used on the current route (Earth, Moon, Mars); kept for a farther gate.
- **Moons deep in a planet's gravity**: the autopilot first stops at a standoff point by the
  planet (where it pulls with half the engine's acceleration), waits there for a fall that
  passes the moon, then aims the fall at it. Not used on the current route either (the Moon is
  shallow enough to fly straight at).
- **Capture and docking.** Inside the capture radius (the body's Hill sphere, never more than
  half the distance to its parent: Moon 6.2e7 m, Mars 1.1e9 m) the ship is
  pulled smoothly onto a parking orbit in `dockS` simulated seconds of the leg (`legs.ts`,
  about 0.9 real s at the current time scale); then the voyage is at the gate (`gateReached`).
- **Fuel charges** (`fuel`, plan D13): one charge is the leg's planned delta-v (0.85 of its
  `dvBudget`, `chargeDv` in `Simulation.ts`), so a leg flown as planned burns about one charge
  and the fuel at a gate is an exact number. The tank holds 1 (`src/content/voyage/cargo/base.ts`), each fuel crate adds
  1. At 0 the engine stops for good: `drifting`.
- **Drift.** Out of charges mid-leg the ship coasts (`drifting`, the line `DRIFTING`); after
  3 real seconds of Run (`DRIFT_DEATH_REAL_S`) the crew is lost: death `drift`.
- **Rail legs** (`mode: 'rail'` in `legs.ts`, plan D3): for a leg the autopilot cannot fly within the
  criteria the ship follows a smooth curve to the capture radius in the planned time and spends
  the planned delta-v evenly. No leg uses rails now (both are `physics`); the mechanism stays
  for a leg that would need it.

**After changing any number below, run `npm run voyage-check`.** It flies the whole voyage in
Node with full charges (1 + 3 fuel crates = 4, `--fuel <n>` to change) and enough life support, and prints per leg: simulated days, real seconds of Run at the current
time scale, the slow approach, the miss at capture, delta-v against `dvBudget`, the mode; then
each leg again with the gate body's phase (and its planet's) shifted by +-0.3 rad. A leg passes
when it arrives within 1.5x its brachistochrone time and 120 % of its `dvBudget`. If a leg
cannot pass, set it to `mode: 'rail'` with the reason in a comment.

## Where to replace the formulas

Every place meant for you is marked `// OWNER: physics` - search for it. Now:

| Where                                     | What it does now (first draft)                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------- |
| `Simulation.ts`, `timeScaleAt(distanceM)` | `300000 * log10(d / 5e8 m)`, within 12000..2e6; `d` = nearest `home`/`gate`/`parent`    |
| `dynamics.ts`, `Workspace.gravity`        | `G M / r^2` from the 3 bodies that pull hardest; inside a body r = its radius           |
| `dynamics.ts`, `kick`, `substepFor`       | Semi-implicit Euler; substep 1/200 of the shortest sqrt(r^3/GM), 1 s..1 h               |
| `autopilot.ts`, `AUTOPILOT`               | Tuning of the autopilot (plan share, thresholds, standoff, climb-out)                   |
| `autopilot.ts`, `captureRadius`           | Hill sphere x 1, at most half the distance to the parent                                |
| `content/voyage/cargo/*.ts`               | Start amounts and flows per day of the base and each item (see "Resources and cargo")   |
| `content/simulation/ship.ts`              | Mass 100 t, thrust 2 kN, start 30 Earth radii from the Earth                            |
| `content/simulation/solar-system.ts`      | Starting angles (`phaseRad`), chosen so every leg flies outwards on the Sun's same side |
| `content/voyage/legs.ts`                  | `dvBudget`, `dockS`, `mode`; `sunFactor`, `heatLoad`, `comms` per leg                   |

Numbers now (`npm run voyage-check`): the voyage to Mars takes about 53 simulated days and
49 s of real Run (Moon 2.2 days / 15.8 s, Mars 50.9 days / 33.5 s), with at least 3 s of slow
approach before the capture radius at every gate. Charges per leg: Moon 0.3, Mars 1.0. Full
charges (4) reach Mars with about 2.7 left; the tank alone (1) reaches the Moon but not Mars.

Not modelled: crashing into a body (the autopilot never aims at a surface).

## Resources and cargo

Resources are counted for the one person aboard (plan D14, GDD `res-list`), all 7 ids of
`RESOURCE_IDS` kept:

| Id                        | Unit                                                               | Death at 0                             |
| ------------------------- | ------------------------------------------------------------------ | -------------------------------------- |
| `fuel`                    | charges (one leg flown as planned)                                 | `drift` after 3 real s                 |
| `oxygen`, `water`, `food` | days of stock                                                      | `hypoxia`, `dehydration`, `starvation` |
| `power`                   | days at the base load (1 a day without heating)                    | through `heat`                         |
| `heat`                    | days the cabin stays warm without power (Normal / Cold / Freezing) | `frozen`                               |
| `comms`                   | link to the Earth from the leg: 2 OK, 1 Weak, 0 Lost               | -                                      |

What the ship carries is the built-in base plus the crates the `cargo.<id>` flags count
(`buildLoadout`). Each entry of `src/content/voyage/cargo/` declares, per copy, `start`
(amounts added at the start: fuel charges, days) and `flows(ctx)` (change per simulated day;
`ctx` has the leg's `sunFactor`, `heatLoad`, `comms` and `powered`): those are yours. The rest
of an entry (bays, copies, colony levels, texts) is the designers' and writers'; the fields and
an example are in [HOWTO-voyage.md](HOWTO-voyage.md#cargo).

One pure function, `evaluateFlows(loadout, leg, live)` in `src/core/voyage/flows.ts`, sums the
flows of the base and every working item; the simulation's step (`stepLife`), the gate
forecast and the balance tools all use it. A death comes when oxygen, water, food or heat
reaches 0 (first in that order wins), when the ship has drifted 3 real s, or from an event
(`event:<id>`); the simulation then stands, `shipDied` and `voyageEnded` are emitted, and
`FlowService` runs the death loop (`flow.die`, docs/HOWTO-story.md).

**The alarm** (plan D14): `lifeForecast` gives every death's distance in simulated days at the
current flows - while powered, through the power running out and the unpowered flows after it
(the greenhouse dies), so that cascade's alarm comes before the power is gone; one raises the alarm (`shipAlarm`, red row on the panel) when it is under 10
simulated days or 3 real seconds of Run away. The real seconds are counted at the pace the
ship could have by then (it speeds up leaving a body), so the alarm never comes less than 3 s
before a death. The estimate assumes full thrust over the horizon, so in practice the alarm
comes about 20-30 simulated days (5-35 real s) ahead. Constants: `ALARM_SIM_DAYS`, `ALARM_REAL_S`, `DRIFT_DEATH_REAL_S` in
`flows.ts` (`OWNER: design`).

**After changing a cargo number**, fly loadouts: `npm run voyage-check -- --loadout
fuel:1,supplies:1,battery:1,solar:1 --loadout base` (repeatable; `base` = no crates). For each it
presses Go on at every gate and prints the stocks at every gate (value / days left on the next
leg) and how it ended: landed at Mars, or the cause of death, where, and how long after the
alarm. Numbers now: the base alone freezes on day 28 (Moon to Mars); fuel, oxygen, supplies,
solar lands at Mars (day 53) with 17 days of oxygen, water and food left; with no fuel crate
the tank runs dry on the Moon-Mars leg and the ship drifts.

**Then run `npm run balance`**: the balance invariants I1-I8 over every loadout, explained
with what to do when one fails in [HOWTO-voyage.md](HOWTO-voyage.md#how-to-balance).
`npm run voyage-check -- --all` prints the same sweep in full and writes it as CSV.

## Add a resource

1. Add the id at the end of `RESOURCE_IDS` in `src/core/simulation/types.ts` (the order there
   is the order of the bars): `..., 'food', 'comms', 'shield'] as const`.
2. If it flows per day, add it to `FlowId`/`StockId` in `src/core/voyage/types.ts` and to
   `FLOW_IDS` in `flows.ts`; give it `start` amounts and `flows` in the cargo entries.
3. Show it: the navigation panel's rows are `ROW_IDS` in `src/ui/navigation/navigationView.ts`
   (GDD D12); add a row there (and an icon frame in `ui/panel-icons.png`) if players should see it.

## Add a body

Add a line to `src/content/simulation/solar-system.ts`; a parent must come before its moons.

```ts
{ id: 'phobos', name: 'Phobos', role: 'scenery', massKg: 1.06e16, radiusM: 1.1e4,
  orbitRadiusM: 9.376e6, periodS: 0.3189 * DAY_S, parent: 'mars', color: 0x9a8f80 },
```

`role` decides whether the time scale slows down near it (`home`, `gate`, `parent`) or not
(`scenery`). A new gate needs a `gate` body, a line in `gates.ts` and a leg in `legs.ts`. The
panel draws it with its name. Its scale fits the outermost orbit (Mars now) into the map, so a
farther planet shrinks the inner ones. A moon closer than 6 px to its planet on the map is drawn
6 px out along its real direction, so it can be seen (the Moon is a fraction of a pixel from the
Earth at this scale); that is a display cheat, the simulation uses the real position.

## How the navigation panel reads it

`NavigationScene` (plan S8, GDD `ux-panel-layout` B) never computes physics; its parts live in
`src/ui/navigation/`. It reads `services.simulation` (`snapshot()`, `voyage`, `forecastLife()`)
on each `simulationTick` and every frame for the column, and draws:

- **Gate ribbon** (`GateRibbon`) across the top: the Earth and the gates (Moon, Mars), passed / current /
  ahead, the ship moving along its leg by `voyage.legFraction`.
- **Map** (`SystemMap`): the whole system in root scale, r_px = k·sqrt(r) scaled so the outermost
  orbit fits (now Mars's at 140 px, the Earth's about 114 px; plan D27), "Map not to scale"; moons drawn 6 px from their planet, the ship magnified
  the same way near a planet with moons (so it parks on the moon's dot); orbits, bodies, gate
  rings in the three states, the trail (the whole voyage, kept across openings), the ship's
  triangle along `heading`, and the forecast's mark (an x) at `firstDepletion` (plan D7).
- **Column** (`StatusColumn`): RUN / HOLD / DRIFTING / LANDED / LOST, the day, "Next: MARS in
  51 d" (the forecast's arrival, rounded up), "Leg 2/2 · burn", six rows (`navigationView.ts`,
  GDD D12): OXYGEN, SUPPLIES (the lower of water and food), POWER in days of stock (rounded
  down), FUEL in charges = gates, HEAT (Normal / Cold / Freezing) and COMMS (OK / Weak / Lost,
  arrow: the next leg's link) with a trend arrow; normal / low (under `FORECAST_TIGHT_DAYS`, or
  the leg's forecast TIGHT / SHORT) / critical (the death's alarm is on) in `theme.ts` colours;
  then a log (gates, events and their results, alarms, the end).
- **Cards** in place of the column (GDD `evt-presentation` A): the gate card (`GateCard`: the
  forecast of the next leg now -> on arrival with verdicts, the leg's days, a red warning when
  the charges do not reach the next gate (plan D6) or a stock runs out, "Go on to <next>" once the
  forecast is in, and "Stop here: build <tier>" from `colonyFit` in `src/core/voyage/colony.ts`,
  met/total of the body's needs, see `src/content/voyage/colony.ts`; only Stop at the last gate) and the event card (`EventCard`: portrait,
  title, text, choices; a choice the cargo does not allow is dim with what it needs).
- **Alarms** (plan D14, `shipAlarm`): a toast over the map, the `sfx-alarm` sound and the row red.

Keys: `confirm` (Enter, Space) or "Run / Hold" switches Run / Hold on a leg; `cancel` (Esc) or
`interact` (E) closes. On a card the keys belong to its list: Esc does not dismiss a decision,
and the press that chose is ignored for that frame, so the player presses Run again himself.
A card ignores input for `CARD_INPUT_LOCK_S` (0.4 s, `Card.ts`) after it opens, so the Enter or
Space pressed for Run does not choose on it; while the gate's forecast computes both rows are
disabled and the cursor waits on Go on.
`debugInfo()` gives the phase, `legIndex`, the status, the rows as shown, the alarms, the open
card (choices, disabled, selected, `locked`, centres, lines, `fuelShort`), the log and the toast. Open it on the ship
deck at the navigation station (E), or with `?act=act2` to skip the earlier acts.

Simulated time runs only while the navigation panel is open in Run mode (GDD `act2-pause`).
`SimulationService` keeps a set of hold reasons and advances only when it is empty: `panel` is
held from the start of a session and whenever the panel is closed or in Hold; the panel's
"Run / Hold" button and `confirm` (Enter, Space) release and take it again. The pause menu holds
`pause` (`src/scenes/PauseScene.ts`); a hidden browser tab holds `blur`, and `panel` as well, so
the panel comes back in Hold (`document.visibilitychange` in `src/main.ts`). Every new session
(`FlowService.beginSession`) cancels cutscenes and resets the holds. For long smoke runs,
`nasa.services.simulation.setDebugWarp(n)` multiplies simulated time (debug mode only).

## The voyage: gates, forecast, events

`Voyage` (`src/core/voyage/Voyage.ts`) drives the `Simulation` through the chain of gates. It has
no Phaser and no event bus: the game runs it through `SimulationService`, the tools directly.
The designers' side (gates, events, colonies, balance) is [HOWTO-voyage.md](HOWTO-voyage.md);
the contract of the engine:

- **Phases**: `flying` (Run advances it), `atGate` (parked, waiting for Stop or Go on; at the
  last gate only Stop), `event` (a card is open), `drifting` (out of fuel, plan D13), `ended`.
- **At a gate**: `gateReached {gateIndex, body, last}`, time held (`gate`), flags
  `voyage.gateIndex`, `voyage.gate`, `voyage.day`. `goOn()` is always allowed (plan D6; the ship
  may drift) and holds `panel`, as an event's card does: after any card the player presses Run
  (GDD `evt-presentation` A). `stopHere()` ends the voyage `landed` with flags
  `voyage.stopGate`, `voyage.stopBody`, `voyage.stopName`, `voyage.day`, `voyage.o2Days`; after a
  1 s beat (LANDED) the flow starts act 3 in the colony (`FlowContent.landingAct`).
- **Leg mirrors**: `voyage.nextGate` (body of the gate flown to or parked at, set at the start
  and on Go on) and `voyage.legProgress` (whole per cent of the leg by time, set with
  `simulationTick`, so about once a real second; 100 at the gate). Every flag change marks the
  world for a rebuild; the panel pauses the world, so it rebuilds once when the panel closes.
- **Forecast** (plan D16, `forecast.ts`): at every gate (and at the start, and after an event for
  the rest of the leg) a forecast copy of the simulation (`Simulation.forecastCopy`: nobody
  dies, depletions are recorded) flies the next leg headless, exactly as the game will, without
  events. `voyage.forecast` (`LegForecast`): `arrives`, `legDays` (to the arrival, else to the
  planned one), `charges`, `fuelNow` / `fuelOnArrival`; `drifts` with `driftDay` and
  `driftLegFraction` when the charges run out on the way (the copy stops there: the stocks'
  `onArrival` are then at the drift's start), `fuelShort` = `drifts` (Go on leads to drift: the
  card must warn); `gaveUp` when the copy flew 4 planned durations without arriving (an
  autopilot failure, verdict SHORT, not a fuel shortage); per stock `now` / `onArrival` /
  `runsOutDay` / verdict OK / TIGHT / SHORT (`FORECAST_TIGHT_DAYS`, `OWNER: design`), the
  overall `verdict`, `firstDepletion` (stock, day, share of the leg, position: the map's mark).
  A long leg's forecast costs far more than a frame, so the game computes it about 4 ms per frame, in slices
  of 8 substeps (`Simulation.flySubsteps`: the game's own substeps, so the result does not
  depend on the budget; `voyage.forecast` is null and `forecastPending` true meanwhile); tools
  call `finishForecast()`. Not sliced: a departure's planning (up to ~75 ms, in the forecast's
  first frame) and a single guidance update (up to ~60 ms on Moon -> Mars): the game's Go on and
  Run pay the same.
- **Events** (plan D15, `src/content/voyage/events/`): `{leg, at, chance(ctx), choices}`; a choice
  has `when` / `needs`, `effect` (`waitDays`, `stocks`, `offline`, `die`), `risk(ctx)` and
  `onHit`; `waitDays` lets the stocks flow day by day (power running out mid-wait switches to
  the unpowered flows) while the ship and the clock stand. One function applies an effect,
  `applyEventEffect` in `voyageEvents.ts`; the game's `Simulation` and the balance sweep both
  call it, so a new effect part goes there (it does not compile until it is applied). Each event is rolled once when the ship has flown `at` of the leg's planned
  duration (the simulation stops exactly there, whatever the frame rate). Happened: the card
  opens (`voyageEvent`, hold `event`, `voyage.openEvent`); `answerEvent(choiceId)` applies it
  (`voyageEventResolved`, flags `event.<id>` = choice, `event.<id>.hit`) and holds `panel`: the
  player presses Run again (GDD `evt-arbitration`). One card at a time; order: death, event,
  gate. An event whose point comes after the arrival is dropped; once the ship drifts, every
  event not yet rolled or still waiting for its card is dropped too (`dropped` in the log).
- **Seed** (plan D10): every roll is `rollFor(seed, key)` (`random.ts`), independent of order and
  frames. `flow.startVoyage()` takes a new seed and keeps it in `run.seed`; Continue in act 2
  takes the saved one; `?seed=<n>` fixes it (smoke: `tools/smoke/voyage-seed.mjs`).
- **End** (`voyageEnded {outcome}`): `landed {gate, body, day}` or `died {cause, gate (last
reached), leg, legFraction, day}`. A death and an arrival in the same substep: death wins.

Fly it headless with events: `npm run voyage-check -- --seed 1 [--loadout ...] [--stop mars]
[--choice 1]` prints every roll, the stocks and the forecast at each gate (and whether the
forecast came true), how it ended, and the same voyage again (one seed flies the same).

## How the save stores it

It does not (plan D17). `flow.checkpoint()` marks a save taken while a voyage is under way
(`voyage: true` in `localStorage` key `space-owner.save`; not after Stop or a death); "Continue"
from it starts the voyage again from its start with the same cargo and `run.seed`. Saves of an older version (`SAVE_VERSION`) are
ignored without a warning: "Continue" is off.

## Testing formulas (optional)

The project has no unit tests yet. When you want them, add Vitest with one command:
`npm install -D vitest` and a script `"test": "vitest run"` in `package.json`. Vite's
`@/` alias works in tests through `vite.config.ts`. Example `src/core/simulation/SolarSystem.test.ts`:

```ts
import { expect, test } from 'vitest';
import { SolarSystem } from '@/core/simulation/SolarSystem';

test('a body is back where it started after one period', () => {
  const earth = {
    id: 'earth',
    name: 'Earth',
    role: 'home' as const,
    massKg: 6e24,
    radiusM: 6.4e6,
    orbitRadiusM: 1.5e11,
    periodS: 100,
    color: 0,
  };
  const p = new SolarSystem([earth]).positionOf(earth, 100);
  expect(p.x).toBeCloseTo(1.5e11, -3);
  expect(Math.abs(p.y)).toBeLessThan(1);
});
```

To check formulas by hand, the browser console with `?act=act2&debug=1` works too:
`nasa.services.simulation.snapshot()`.
