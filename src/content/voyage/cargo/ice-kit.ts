import type { CargoDef } from '@/core/voyage/types';

/**
 * Sunlight (`ColonySite.sunFactor`) under which a body is icy at the surface, so the ice kit's
 * walls are thick (beyond Mars; no such body on the route now, so the kit gives life 1 and
 * shielding 1 on the Moon and Mars). OWNER: physics
 */
export const ICE_COLONY_MAX_SUN = 0.25;

/** Ice drill and melter: water and shelter on an icy body. Colony only. */
export const iceKit: CargoDef = {
  // OWNER: script
  label: { en: 'Ice kit', uk: 'Криговий набір', max: 14 },
  line: { en: 'Drill ice for water and walls.', uk: 'Бурити лід для води та стін.', max: 60 },
  // OWNER: physics - a drill and a melter.
  dryMassKg: 2_000,
  // OWNER: design - bays taken and copies allowed
  bays: 1,
  maxCopies: 1,
  icon: 8,
  // OWNER: physics - ice walls shield like regolith ones on an icy body (GDD `colony-reqs`: the
  // ice drill is the icy bodies' gear); was shielding 1 everywhere (plan S12, I5).
  colony: ({ sunFactor }) => ({ life: 1, shielding: sunFactor < ICE_COLONY_MAX_SUN ? 2 : 1 }),
};
