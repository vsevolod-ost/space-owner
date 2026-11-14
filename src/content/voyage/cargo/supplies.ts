import { TODO } from '@/core/locale/text';
import type { CargoDef } from '@/core/voyage/types';

/** Water and food. */
export const supplies: CargoDef = {
  // OWNER: script
  label: { en: 'Supplies', uk: TODO, max: 14 },
  line: { en: 'Water and food.', uk: TODO, max: 60 },
  // OWNER: physics - water containers, food lockers and the crate; the contents weigh by
  // `stock-mass.ts`.
  dryMassKg: 500,
  // OWNER: design - bays taken and copies allowed
  bays: 1,
  maxCopies: 1,
  icon: 2,
  // OWNER: physics - days of water and of food: with the base's 160, 280 days (four times the
  // 53-day voyage's 30, plan variable-mass S9); 120 days are about 0.6 t (`stock-mass.ts`).
  start: { water: 120, food: 120 },
  // OWNER: design
  colony: { life: 1 },
};
