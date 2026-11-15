import type { CargoDef } from '@/core/voyage/types';

/** Regolith tools: build shelter from the ground of a rocky body. Colony only. */
export const regolithKit: CargoDef = {
  // OWNER: script
  label: { en: 'Regolith kit', uk: 'Набір реголіту', max: 14 },
  line: { en: 'Dig in and build walls from rock.', uk: 'Копай і будуй стіни з каменю.', max: 60 },
  // OWNER: physics - a small excavator and sintering tools.
  dryMassKg: 3_000,
  // OWNER: design - bays taken and copies allowed
  bays: 1,
  maxCopies: 1,
  icon: 7,
  // OWNER: design
  colony: { shielding: 2 },
};
