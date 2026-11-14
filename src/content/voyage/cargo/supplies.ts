import type { CargoDef } from '@/core/voyage/types';

/** Water and food. */
export const supplies: CargoDef = {
  // OWNER: script
  label: 'Supplies',
  line: '[TODO: water and food]',
  // OWNER: design - bays taken and copies allowed
  bays: 1,
  maxCopies: 1,
  icon: 2,
  // OWNER: physics - days of water and of food.
  start: { water: 30, food: 30 },
  // OWNER: design
  colony: { life: 1 },
};
