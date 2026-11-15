import type { CargoDef } from '@/core/voyage/types';

/** A battery pack: stored power, no production. */
export const battery: CargoDef = {
  // OWNER: script
  label: { en: 'Battery', uk: 'Батарея', max: 14 },
  line: { en: 'Stored power for the long dark.', uk: 'Запас енергії для довгої темряви.', max: 60 },
  // OWNER: physics - a large battery bank with its frame: heavy for the energy it holds.
  dryMassKg: 4_000,
  // OWNER: design - bays taken and copies allowed
  bays: 1,
  maxCopies: 1,
  icon: 3,
  // OWNER: physics - days of power at the base load: with the base's 80 that is 240 days, then
  // about 10 days of a cooling cabin, without panels or a reactor - to Mars with a fuel crate,
  // not on the slowest transfer of about 265 days (four times the 53-day voyage's 40, plan
  // variable-mass S9).
  start: { power: 160 },
  // OWNER: design
  colony: { power: 1 },
};
