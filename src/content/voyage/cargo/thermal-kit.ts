import type { CargoDef } from '@/core/voyage/types';

/** Insulation and heaters for a cold body. Colony only. */
export const thermalKit: CargoDef = {
  // OWNER: script
  label: 'Thermal kit',
  line: '[TODO: keep a colony warm far from the Sun]',
  // OWNER: design - bays taken and copies allowed
  bays: 1,
  maxCopies: 1,
  icon: 9,
  // OWNER: design
  colony: { heat: 2 },
};
