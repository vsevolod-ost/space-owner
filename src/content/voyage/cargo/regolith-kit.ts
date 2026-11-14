import type { CargoDef } from '@/core/voyage/types';

/** Regolith tools: build shelter from the ground of a rocky body. Colony only. */
export const regolithKit: CargoDef = {
  // OWNER: script
  label: 'Regolith kit',
  line: '[TODO: dig in and build walls from rock]',
  // OWNER: physics - a small excavator and sintering tools.
  dryMassKg: 3_000,
  // OWNER: design - bays taken and copies allowed
  bays: 1,
  maxCopies: 1,
  icon: 7,
  // OWNER: design
  colony: { shielding: 2 },
};
