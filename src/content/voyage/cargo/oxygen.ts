import { TODO } from '@/core/locale/text';
import type { CargoDef } from '@/core/voyage/types';

/** Oxygen tanks: days of oxygen, no power needed. */
export const oxygen: CargoDef = {
  // OWNER: script
  label: { en: 'Oxygen', uk: TODO, max: 14 },
  line: { en: 'Oxygen tanks, no power needed.', uk: TODO, max: 60 },
  // OWNER: physics - pressure tanks, regulators and the crate; the oxygen itself is light
  // (`stock-mass.ts`).
  dryMassKg: 500,
  // OWNER: design - bays taken and copies allowed
  bays: 1,
  maxCopies: 1,
  icon: 1,
  // OWNER: physics - days of oxygen (with the base's 160: 280 days, to Mars on the slowest
  // transfer of about 265 days; with a fuel crate, 190-230 days, a margin for the hull breach
  // and the asteroids; the base alone runs out on day 160). Four times the 53-day voyage's 30
  // (plan variable-mass S9); 120 days are 100 kg of oxygen (`stock-mass.ts`).
  start: { oxygen: 120 },
  // OWNER: design
  colony: { life: 1 },
};
