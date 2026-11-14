import type { CargoDef } from '@/core/voyage/types';

/** A fuel crate: more propellant for the tank (plan variable-mass D3), up to three crates. */
export const fuel: CargoDef = {
  // OWNER: script
  label: 'Fuel',
  line: 'One more leg of fuel.',
  // OWNER: physics - the empty tank and feed lines of one crate.
  dryMassKg: 3_000,
  // OWNER: design - bays taken and copies allowed
  bays: 1,
  // OWNER: design - three crates in the warehouse.
  maxCopies: 3,
  icon: 0,
  // OWNER: physics - kg of fuel per crate: with the base's 23 t one crate gives the base and
  // the crate 10.3 km/s at 3000 s (src/content/simulation/ship.ts), a hold of the six heaviest
  // other crates besides it 8.5 km/s - enough for the Moon (1 km/s) and the slowest Mars
  // transfer at any phase of Mars within +-0.3 rad (plan variable-mass S4: 35 t with one crate;
  // 34 t drifts at -0.3 rad). The lighter ship flies a faster transfer (D20): one crate takes
  // a hold to Mars in 200-230 days instead of about 265 without (if it gets there at all,
  // `base.ts`), two or three in about 190. 12 t with the 3 t tank: 15 t, the heaviest crate and
  // about 3x a typical one - at the edge of plausible for one bay (plan S9, E2); a lighter tank
  // (dry mass above) is the first thing to revisit.
  start: { fuel: 12_000 },
};
