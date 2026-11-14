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
  bays: 0,
  maxCopies: 1,
  // OWNER: physics - fuel charges (1: the Moon leg burns 0.3 of it, Mars needs a fuel crate, D13), days of oxygen, water, food
  // and power, days the cabin stays warm without power (D14: frozen 10 days after power is out).
  start: { fuel: 1, oxygen: 40, water: 40, food: 40, power: 20, heat: 10 },
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
