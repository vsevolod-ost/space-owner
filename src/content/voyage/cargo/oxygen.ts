import type { CargoDef } from '@/core/voyage/types';

/** Oxygen tanks: days of oxygen, no power needed. */
export const oxygen: CargoDef = {
  // OWNER: script
  label: 'Oxygen',
  line: '[TODO: oxygen tanks, no power needed]',
  // OWNER: design - bays taken and copies allowed
  bays: 1,
  maxCopies: 1,
  icon: 1,
  // OWNER: physics - days of oxygen (with the base's 40: to Mars, 53 days, with a margin
  // for the hull breach and the asteroids; the base alone runs out on day 40).
  start: { oxygen: 30 },
  // OWNER: design
  colony: { life: 1 },
};
