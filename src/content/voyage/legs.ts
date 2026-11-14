import type { LegDef } from '@/core/simulation/types';

const HOUR_S = 3600;

/**
 * The legs of the voyage, one per gate of src/content/voyage/gates.ts (same order): leg 0 from
 * the Earth to the Moon, leg 1 from the Moon to Mars.
 * - `dvBudget` - the most delta-v the leg may spend, m/s (plan variable-mass D16): the
 *   autopilot plans `AUTOPILOT.planFraction` (0.85) of what the fuel gives, at most of this,
 *   and keeps the rest as a reserve. The fuel it burns follows from the rocket equation
 *   (src/core/simulation/rocket.ts). On the Moon leg the straight flight takes about 1 km/s
 *   (2.4 with the Moon 0.3 rad behind); 4 leaves it the old room. On the Mars transfer it caps
 *   the fastest transfer a ship rich in fuel may fly (D20): its plan, 8.5 km/s, is a Lambert
 *   transfer of about 185 days, against about 265 for the slowest a ship affords (about 5.3
 *   km/s, near a Hohmann one). Plan S9 kept both: two fuel crates already fly at the cap, and
 *   a lower one would leave the third crate nothing to buy.
 * - `dockS` - simulated seconds of the docking at the gate (capture radius to parking orbit);
 *   sized to about 0.9 real s of docking at the current time-scale constants (the time scale
 *   falls as the ship nears the body, so it is far less than 0.9 s times the scale at capture):
 *   the Moon docks all the way at the approach floor, 15 000 (`Simulation.ts`), so 3.75 h;
 *   Mars from 1.1e9 m down, 6.75 h.
 *   OWNER: physics - the numbers; after a change run `npm run voyage-check`.
 * - `mode` - `physics` (the autopilot flies the integrator) or `rail` (a scripted path, for a
 *   leg the autopilot cannot fly within the criteria; write the reason next to it).
 * - `sunFactor`, `heatLoad`, `comms` - what the leg does to the resource flows (GDD
 *   `cargo-to-sim` B: one value per leg, they switch at the gates; `LegConditions`):
 *   sunlight against the Earth's orbit (about 1/r^2 at the leg's middle distance from the Sun:
 *   1, 1.25 au), extra power per day for heating (colder further out), the link
 *   to the Earth (GDD `res-comms`: under 2 au OK, 2-6 Weak, over 6 Lost).
 *   OWNER: physics - the numbers; after a change run `npm run voyage-check -- --loadout ...`.
 */
export const legs: readonly LegDef[] = [
  {
    dvBudget: 4_000,
    dockS: 3.75 * HOUR_S,
    mode: 'physics',
    sunFactor: 1,
    heatLoad: 0,
    comms: 'ok',
  },
  {
    dvBudget: 10_000,
    dockS: 6.75 * HOUR_S,
    mode: 'physics',
    sunFactor: 0.64,
    heatLoad: 0.1,
    comms: 'ok',
  },
];
