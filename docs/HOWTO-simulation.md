# How to work on the ship simulation

Everything the physics owner touches: the model of the solar system and the ship in act 2, the
formulas to replace, resources, and how the navigation panel and the save use it. The
simulation is plain TypeScript **without Phaser** (`src/core/simulation/`): you can read and
change it without knowing the game engine.

## Files

| File                                       | What it is                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| `src/core/simulation/types.ts`             | The data: `Body`, `ShipState`, `ResourceId`, `Resources`, `SimulationSnapshot` |
| `src/core/simulation/constants.ts`         | `G`, `DAY_S`                                                                   |
| `src/core/simulation/SolarSystem.ts`       | Where each body is at time `t` (static circular orbits)                        |
| `src/core/simulation/Simulation.ts`        | One step: time scale, forces, integration, resources. **The formulas.**        |
| `src/core/simulation/SimulationService.ts` | Runs a `Simulation` in the game: start, pause, stop, the save                  |
| `src/content/simulation/solar-system.ts`   | The bodies: real masses, orbit radii, periods, colours                         |
| `src/content/simulation/ship.ts`           | The ship: mass, thrust, start orbit, resources and their rates                 |
| `src/scenes/NavigationScene.ts`            | The navigation panel that draws a snapshot                                     |

How it fits together: act 2 (`src/content/story/act2.ts`) goes to the ship deck and calls
`flow.startSimulation()`. From then on `main.ts` calls `services.simulation.tick(ms)` on every
frame of the game loop (also while a panel pauses the world), the service calls
`Simulation.step`, and about four times a second emits the `simulationTick` event; the
navigation panel redraws on it. Leaving the act (main menu, an ending, death, another act) stops
the simulation.

Units are SI everywhere: metres, seconds, kilograms, newtons, radians. The model is flat: the Sun
is at the origin, x to the right, y up, angles counter-clockwise from +x. Display scale lives only
in the panel.

## The contract: `step` and the snapshot

```ts
// src/core/simulation/types.ts (short)
interface Body {
  id: string;
  name: string;
  massKg: number;
  orbitRadiusM: number; // around `parent`, 0 for the Sun
  periodS: number; // one orbit, 0 for the Sun
  parent?: string; // id of the body it orbits; none = the Sun's place (origin)
  color: number; // 0xRRGGBB in the panel
  phaseRad?: number; // angle at t = 0
}
interface ShipState {
  x: number; // position, m
  y: number;
  vx: number; // velocity, m/s
  vy: number;
  massKg: number;
  thrustN: number; // 0 = engine off
  heading: number; // where the ship points, rad
}
type ResourceId = 'oxygen' | 'fuel' | 'heat' | 'power' | 'water' | 'food' | 'comms';
interface Resource {
  value: number; // 0..max
  max: number;
  ratePerS: number; // change per simulated second, negative drains
}
interface SimulationSnapshot {
  timeS: number; // simulated seconds since the voyage began
  timeScale: number; // simulated seconds per real second in the last step
  ship: ShipState;
  resources: Record<ResourceId, Resource>;
}
```

`Simulation.step(realDtS)` advances the world by one frame - `realDtS` **real** seconds (about
1/60) - and returns a new `SimulationSnapshot`. Whatever you change inside, keep this:

- the snapshot is plain data (numbers, objects): it is saved as JSON, so no classes or functions;
- everything the game needs to continue later is in the snapshot (the constructor takes one back);
- body positions are a function of `timeS` only (`SolarSystem.positionOf(body, timeS)`), so the
  snapshot does not store them.

`SimulationService` (`services.simulation`, reach it from the browser console as
`nasa.services.simulation` with `?debug=1`):

| Member                                       | What it does                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| `start(snapshot?)`                           | New simulation from `ship.ts`, or from a saved snapshot                      |
| `pause()`, `resume()`                        | Freeze / continue simulated time                                             |
| `stop()`                                     | Drop the simulation (`snapshot()` is null after)                             |
| `tick(realDtMs)`                             | One frame; main.ts calls it. Steps only while running and in the start's act |
| `snapshot()`                                 | A copy of the current state, or null                                         |
| `setThrust(on)`                              | Engine on (`ship.thrustN` from `ship.ts`) or off                             |
| `isRunning`, `isStarted`, `thrust`, `system` | State; `system` is the `SolarSystem` (bodies, positions)                     |

## Where to replace the formulas

Every place meant for you is marked `// OWNER: physics` - search for it. Now:

| Where                                     | What it does now (first draft)                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| `Simulation.ts`, `timeScaleAt(distanceM)` | `20000 * log10(d / 1e6 m)`, clamped to 100..200000, `d` = distance to nearest body    |
| `Simulation.ts`, `integrate(h)`           | Explicit Euler in substeps of at most 60 simulated s                                  |
| `Simulation.ts`, `gravityAt(point, t)`    | `G M / r^2` from the 3 bodies that pull hardest (not the 3 nearest - see the comment) |
| `Simulation.ts`, heading in `integrate`   | Autopilot stub: the ship always points along its velocity around the Sun              |
| `Simulation.ts`, `drainResources(dt)`     | `value += ratePerS * dt`, clamped to 0..max                                           |
| `Simulation.ts`, `initialShip`            | Circular orbit around `ship.start.around`, moving with that body                      |
| `content/simulation/ship.ts`              | Mass 100 t, thrust 2 kN, start 10 Earth radii from the Earth, rates per resource      |
| `content/simulation/solar-system.ts`      | Starting angles (`phaseRad`) of the planets are arbitrary                             |

Numbers from the first draft (60 frames per second): near the Earth the time scale is about
36 000 (10 hours per real second), in open space about 90 000 (a day per real second). Without
thrust the ship stays on its parking orbit: after 5 simulated days (12 real seconds) it is 68 700
km from the Earth instead of 63 700 (Euler drift); with thrust on it is 1.5 million km out.
Oxygen lasts 400 simulated days, about 7-15 minutes of play. The design document asks for act 2 to take
about 5 minutes: tune `TIME_SCALE_PER_DECADE` and the rates together.

Not modelled yet: crashing into a body, fuel burnt by thrust, heat from the Sun, comms from the
Earth's distance, what happens when a resource reaches 0. Each has its `OWNER: physics` note.

## Add a resource

1. Add the id at the end of `RESOURCE_IDS` in `src/core/simulation/types.ts` (the order there
   is the order of the bars): `..., 'food', 'comms', 'shield'] as const`.
2. The compiler now asks for it in `src/content/simulation/ship.ts`; add its start values:
   ```ts
   shield: { value: 100, max: 100, ratePerS: 0 },
   ```
3. Done: the navigation panel draws a bar for every id in `RESOURCE_IDS`. Old saves without
   it start it from `ship.ts`.

## Add a body

Add a line to `src/content/simulation/solar-system.ts`; a parent must come before its moons.

```ts
{ id: 'phobos', name: 'Phobos', massKg: 1.06e16, orbitRadiusM: 9.376e6,
  periodS: 0.3189 * DAY_S, parent: 'mars', color: 0x9a8f80 },
```

The panel draws it with its name. Its scale fits the largest orbit (Mars now) into the map, so a
farther planet shrinks the inner ones. A moon closer than 6 px to its planet on the map is drawn
6 px out along its real direction, so it can be seen (the Moon is a quarter of a pixel from the
Earth at this scale); that is a display cheat, the simulation uses the real position.

## How the navigation panel reads it

`NavigationScene` never computes physics. On each `simulationTick` it reads
`services.simulation.snapshot()` and draws: orbits around each parent, bodies at
`system.positionOf(body, snapshot.timeS)`, the ship at `snapshot.ship` pointing along
`heading`, the last 200 ship positions as a trail (kept only while the panel is open),
`T×<timeScale>`, `Day <n>` (from 1) and a bar per resource (`value / max`). "Thrust on/off"
calls `setThrust`. Open it on the ship deck at the navigation station (E), or with `?act=act2`
to skip the earlier acts.

The simulation keeps running while the navigation and settings panels are open (the world is
paused, the ship's clock is not). Only the pause menu (Esc) pauses it, through
`services.simulation.pause()` / `resume()` in `src/scenes/PauseScene.ts`.

## How the save stores it

`flow.checkpoint()` puts `services.simulation.snapshot()` into the save
(`GameSave.simulation` in `localStorage` key `space-owner.save`). "Continue" and "Retry from
checkpoint" load it back with `start(snapshot)`, so the voyage continues from the moment of the
checkpoint. If you change the snapshot's shape, old saves may no longer match
`isSimulationSnapshot` in `types.ts`; such a save continues without the simulation (a warning in
the console) - extend the check or convert old snapshots there.

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
    massKg: 6e24,
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
