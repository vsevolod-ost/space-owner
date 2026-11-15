import type { CargoId } from '@/content/voyage/cargo';
import type { ColonyBodyDef, ColonyCatalog } from '@/core/voyage/colony';

/**
 * The colony sites (plan D19, GDD `colony-reqs` A, D10): what each gate body needs of a colony
 * and the colours its colony location is painted in. The object key is the gate body id
 * (src/content/voyage/gates.ts). The needs are levels on the axes Power, Heat, Shielding,
 * Life: the base and the cargo's `colony` amounts (src/content/voyage/cargo) must reach them
 * (`colonyCheck` in src/core/voyage/colony.ts). Water is local on every body, so it is no axis.
 *
 * OWNER: physics - `sunFactor`, the sunlight at the body against the Earth's orbit (1/r^2 in
 * au: 1, 1.52 au); items' `colony` functions read it (solar panels).
 * OWNER: design - the needs: the Moon heat 2 (the two-week night) and shielding 4 (regolith walls
 * and ice from the polar craters), Mars power 4 (dust storms dim the panels: every power source)
 * and heat 1. They pull apart, so no 7-bay hold that reaches Mars builds a full colony on both
 * (invariant I4); picked by a search over the needs with I4 and I5 (`npm run balance`).
 * Each body's picture: `BODY_BACKGROUNDS` in src/content/locations/colony.ts.
 */
export const colonyBodies = {
  // No air, no magnetic field: radiation and dust.
  moon: { sunFactor: 1, needs: { heat: 2, shielding: 4 } },
  // Thin air, radiation, dust storms that dim the panels.
  mars: { sunFactor: 0.43, needs: { power: 4, heat: 1 } },
} as const satisfies Record<string, ColonyBodyDef>;

/** Id of a colony site: a gate body. */
export type ColonyBodyId = keyof typeof colonyBodies;

/**
 * Buildings of the colony (art-order rows 17 and 26): `<building>` names the image
 * `colony-<building>` (`sprites/colony/<building>.png`), `module` the generic module.
 */
export type ColonyBuilding =
  'module' | 'greenhouse' | 'solar' | 'reactor' | 'battery' | 'regolith' | 'ice' | 'thermal';

/**
 * What each copy of a colony item puts up in the colony (the places `build-1..7` of the colony
 * map, in the hold's order). Fuel builds nothing. OWNER: art
 */
export const colonyBuildings = {
  oxygen: 'module',
  supplies: 'module',
  battery: 'battery',
  solar: 'solar',
  reactor: 'reactor',
  greenhouse: 'greenhouse',
  'regolith-kit': 'regolith',
  'ice-kit': 'ice',
  'thermal-kit': 'thermal',
} as const satisfies Partial<Record<CargoId, ColonyBuilding>>;

/** The colony registry as core gets it (`services.voyage.attach` in src/main.ts). */
export const colony: ColonyCatalog = { bodies: colonyBodies, buildings: colonyBuildings };
