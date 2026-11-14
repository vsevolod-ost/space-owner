import type { CargoDef } from '@/core/voyage/types';

/** A battery pack: stored power, no production. */
export const battery: CargoDef = {
  // OWNER: script
  label: 'Battery',
  line: '[TODO: stored power for the long dark]',
  // OWNER: design - bays taken and copies allowed
  bays: 1,
  maxCopies: 1,
  icon: 3,
  // OWNER: physics - days of power at the base load: with the base's 20 it lasts the
  // 53 days to Mars without panels or a reactor.
  start: { power: 40 },
  // OWNER: design
  colony: { power: 1 },
};
