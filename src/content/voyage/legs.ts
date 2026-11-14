import type { LegDef } from '@/core/simulation/types';

const HOUR_S = 3600;

/**
 * The legs of the voyage, one per gate of src/content/voyage/gates.ts (same order): leg 0 from
 * the Earth to the Moon, leg 1 from the Moon to Mars.
 * - `dvBudget` - delta-v budget of the leg, m/s: the autopilot plans to spend
 *   `AUTOPILOT.planFraction` (0.85) of it and keeps the rest as a reserve; one fuel charge is
 *   that planned delta-v (D13), so a leg flown as planned burns one charge.
 * - `dockS` - simulated seconds of the docking at the gate (capture radius to parking orbit);
 *   sized to about 0.9 real s of docking at the current time-scale constants (the time scale
 *   falls as the ship nears the body, so it is far less than 0.9 s times the scale at capture).
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
  { dvBudget: 4_000, dockS: 3 * HOUR_S, mode: 'physics', sunFactor: 1, heatLoad: 0, comms: 'ok' },
  {
    dvBudget: 55_000,
    dockS: 5 * HOUR_S,
    mode: 'physics',
    sunFactor: 0.64,
    heatLoad: 0.1,
    comms: 'ok',
  },
];
