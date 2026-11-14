import { TODO } from '@/core/locale/text';
import type { CargoDef } from '@/core/voyage/types';

/** Insulation and heaters for a cold body. Colony only. */
export const thermalKit: CargoDef = {
  // OWNER: script
  label: { en: 'Thermal kit', uk: TODO, max: 14 },
  line: { en: 'Keep a colony warm far from the Sun.', uk: TODO, max: 60 },
  // OWNER: physics - insulation blankets and heaters.
  dryMassKg: 1_500,
  // OWNER: design - bays taken and copies allowed
  bays: 1,
  maxCopies: 1,
  icon: 9,
  // OWNER: design
  colony: { heat: 2 },
};
