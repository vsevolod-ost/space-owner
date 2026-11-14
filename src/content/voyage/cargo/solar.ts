import type { CargoDef } from '@/core/voyage/types';

/**
 * Sunlight (`ColonySite.sunFactor`) from which solar panels power a colony: the Moon (1) and
 * Mars (0.43); not much further out. OWNER: physics
 */
export const SOLAR_COLONY_MIN_SUN = 0.25;

/** Solar panels: power from the Sun, weaker with every leg out (`sunFactor`). */
export const solar: CargoDef = {
  // OWNER: script
  label: 'Solar panels',
  line: '[TODO: power from the Sun, fading past Mars]',
  // OWNER: design - bays taken and copies allowed
  bays: 1,
  maxCopies: 1,
  icon: 4,
  // OWNER: physics - days of power per day at the Earth's distance (GDD `res-power`: 1.5; 2
  // gives 1.28 on the Moon-Mars leg, just over the base load with heating, 1.1).
  flows: ({ sunFactor }) => ({ power: 2 * sunFactor }),
  // OWNER: physics - power for a colony only near the Sun (GDD `colony-reqs`: the Moon, Mars).
  colony: ({ sunFactor }) => ({ power: sunFactor >= SOLAR_COLONY_MIN_SUN ? 1 : 0 }),
};
