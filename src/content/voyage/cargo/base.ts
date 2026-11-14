import type { CargoDef } from '@/core/voyage/types';

/**
 * The ship's built-in base (D14, GDD `act1-loadout` A): always aboard, takes no bay. It holds
 * the fuel tank, the crew's stocks, the battery and the shelter, and declares what the one
 * person aboard uses per day.
 */
export const base: CargoDef = {
  // OWNER: script - the name and the line.
  label: 'Ship base',
  line: '[TODO: built-in tank, stocks and shelter]',
  // OWNER: physics - the ship itself: the cabin and the shelter, the 2 kN electric engine with
  // its own reactor and radiators, the empty tank (plan variable-mass D2). With its fuel and
  // stocks the base alone is 104 t; with cargo up to 166 t.
  dryMassKg: 80_000,
  bays: 0,
  maxCopies: 1,
  // OWNER: physics - kg of fuel: 23 t give the base alone 7.4 km/s at 3000 s
  // (src/content/simulation/ship.ts). The Moon leg takes about 1 km/s, the slowest Mars transfer
  // about 5.3 (a Lambert transfer of about 265 days, plan variable-mass D20), so without a fuel
  // crate a ship reaches Mars only with up to 11-15 t of other cargo (115-119 t at the start,
  // by the phase it reaches the Moon in); a heavier hold needs a fuel crate (D13). Picked by
  // the plan S9 search: of the holds whose life support lasts, 95 reach Mars without a fuel
  // crate and 110 only with one (at 24 t with an 11 t crate it was 168 and 44: the crate hardly
  // mattered; at 22 t with 13 t, 29 and 176).
  // OWNER: physics - days of oxygen, water, food and power for the voyage of 190-270 days
  // (plan variable-mass S9: four times the 53-day voyage's 40, 40, 40, 20, so the balance of
  // the cargo stays the same; 160 days of stocks are about 0.9 t, `stock-mass.ts`); the base
  // alone dies of the cold on about day 83 (I2). Heat: days the cabin stays warm without power
  // (D14: frozen 10 days after power is out; not scaled, it is the cabin's cooling).
  start: { fuel: 23_000, oxygen: 160, water: 160, food: 160, power: 80, heat: 10 },
  // OWNER: physics - per day: the crew breathes, drinks and eats one day of each; the ship's
  // systems use one day of power, heating adds the leg's `heatLoad`; with power the heater
  // keeps the cabin warm (+5: back to full in 2 days), without it the cabin cools by a day.
  flows: ({ heatLoad, powered }) => ({
    oxygen: -1,
    water: -1,
    food: -1,
    power: -(1 + heatLoad),
    heat: powered ? 5 : -1,
  }),
  // OWNER: design - the shelter shields a colony a little.
  colony: { shielding: 1 },
};
