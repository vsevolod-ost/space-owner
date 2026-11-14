import type { CargoDef } from '@/core/voyage/types';

/** A fuel crate: one more fuel charge (D13), up to three crates. */
export const fuel: CargoDef = {
  // OWNER: script
  label: 'Fuel',
  line: '[TODO: one more leg of fuel]',
  // OWNER: design - bays taken and copies allowed
  bays: 1,
  // OWNER: design - three crates in the warehouse.
  maxCopies: 3,
  icon: 0,
  // OWNER: physics - charges per crate.
  start: { fuel: 1 },
};
