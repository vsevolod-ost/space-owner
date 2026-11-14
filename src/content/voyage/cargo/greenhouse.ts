import type { CargoDef } from '@/core/voyage/types';

/**
 * A greenhouse: the plants make all the oxygen the crew breathes and most of the water and
 * food, while they have light. They die for good once power runs out.
 */
export const greenhouse: CargoDef = {
  // OWNER: script
  label: 'Greenhouse',
  line: '[TODO: air, water and food while the lamps are on]',
  // OWNER: design - bays taken and copies allowed
  bays: 1,
  maxCopies: 1,
  icon: 6,
  // OWNER: physics - per day: oxygen for the crew (+1), three quarters of the water and food
  // (GDD `act1-loadout` says half; 3/4 with the base's 40 days reaches Mars without supplies), the
  // lamps use a quarter day of power.
  flows: () => ({ oxygen: 1, water: 0.75, food: 0.75, power: -0.25 }),
  needsPower: true,
  // OWNER: design
  colony: { life: 2 },
};
