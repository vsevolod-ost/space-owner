import { TODO } from '@/core/locale/text';
import type { CargoDef } from '@/core/voyage/types';

/**
 * A small reactor: steady power anywhere. It fails only in its own event on the way (plan S7
 * puts it offline then).
 */
export const reactor: CargoDef = {
  // OWNER: script
  label: { en: 'Reactor', uk: TODO, max: 14 },
  line: { en: 'Steady power anywhere, if it holds.', uk: TODO, max: 60 },
  // OWNER: physics - a small fission reactor with its shield and radiators (tens of kW).
  dryMassKg: 6_000,
  // OWNER: design - bays taken and copies allowed
  bays: 1,
  maxCopies: 1,
  icon: 5,
  // OWNER: physics - days of power per day: covers the base load and the heating of the
  // Moon-Mars leg (1 + 0.1) and the greenhouse's lamps (0.25), with room to spare.
  flows: () => ({ power: 2 }),
  // OWNER: design
  colony: { power: 2, heat: 1 },
};
