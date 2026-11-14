import type { CargoDef, ColonyAmounts, ColonyAxis, ColonySite, Loadout } from '@/core/voyage/types';

/**
 * How well a colony does on a body (plan D19, GDD `colony-grades` E). Every tier is a colony
 * that lives (no "failed"): `outpost` - it barely holds (half of the body's needs or less met),
 * `settlement` - more than half met, `colony` - every need of the body met.
 */
export type ColonyTier = 'outpost' | 'settlement' | 'colony';

/** The tiers from the lowest up. */
export const COLONY_TIERS: readonly ColonyTier[] = ['outpost', 'settlement', 'colony'];

/** The axes of a colony's needs, in the order they are listed (plan D19). */
export const COLONY_AXES: readonly ColonyAxis[] = ['power', 'heat', 'shielding', 'life'];

/**
 * What a body asks of a colony (GDD `colony-reqs` A): the level needed on each axis it needs
 * (an axis it does not need is left out). The cargo's `colony` amounts, summed over every copy
 * aboard and the ship's base, must reach it.
 */
export type ColonyNeeds = Partial<Record<ColonyAxis, number>>;

/**
 * One gate body as a colony site: its conditions (`ColonySite`: what items' `colony` functions
 * read), its needs and the colours its colony is painted in.
 */
export interface ColonyBodyDef extends ColonySite {
  needs: ColonyNeeds;
  /** Colour multiplied over the colony's sky layer (`location-colony-sky`). */
  sky: number;
  /** Colour multiplied over the colony's ground layer (`location-colony-ground`). */
  ground: number;
}

/**
 * The colony registry as core gets it (`VoyageService.attach` in src/main.ts, from
 * src/content/voyage/colony.ts).
 */
export interface ColonyCatalog {
  /** Colony sites by gate body id (`GateDef.body`), in the gates' order. */
  bodies: Readonly<Record<string, ColonyBodyDef>>;
  /**
   * The building a copy of a cargo item puts up in the colony, by cargo id: the `<building>`
   * of image `colony-<building>` (`module` - the generic module). Items not listed and items
   * that give the site nothing (`buildsColony`: no `colony` axis, or solar panels far from the
   * Sun) build nothing.
   */
  buildings: Readonly<Record<string, string>>;
}

/** One need of a body against what the cargo gives. */
export interface ColonyNeedCheck {
  axis: ColonyAxis;
  /** The level the body needs. */
  need: number;
  /** What the base and the cargo give on this axis (may exceed `need`). */
  have: number;
  /** `have >= need`. */
  met: boolean;
}

/** `colonyCheck`: the tier and how each need of the body stands. */
export interface ColonyCheck {
  tier: ColonyTier;
  /** The body's needs in `COLONY_AXES` order. */
  needs: ColonyNeedCheck[];
  /** Need levels covered, each need counted up to its level. */
  met: number;
  /** Sum of the need levels. */
  total: number;
}

/**
 * What the loadout (the base and every copy aboard) gives a colony on `site` on each axis.
 * Pure.
 */
export function colonySupply(loadout: Loadout, site: ColonySite): Record<ColonyAxis, number> {
  const supply: Record<ColonyAxis, number> = { power: 0, heat: 0, shielding: 0, life: 0 };
  for (const entry of loadout.entries) {
    const amounts = colonyAmounts(entry.def, site);
    for (const axis of COLONY_AXES) supply[axis] += (amounts[axis] ?? 0) * entry.count;
  }
  return supply;
}

/** What one copy of `def` gives a colony on `site` (its `colony`, or nothing). Pure. */
export function colonyAmounts(def: CargoDef, site: ColonySite): ColonyAmounts {
  const colony = def.colony;
  return (typeof colony === 'function' ? colony(site) : colony) ?? {};
}

/** Whether one copy of `def` gives a colony on `site` anything (it puts up a building). */
export function buildsColony(def: CargoDef, site: ColonySite): boolean {
  const amounts = colonyAmounts(def, site);
  return COLONY_AXES.some((axis) => (amounts[axis] ?? 0) > 0);
}

/**
 * The colony `loadout` builds on `site` against its needs (plan D19, GDD `colony-score` D: viability first,
 * then the distance, which the body itself carries). The rule: every need met - `colony`; more
 * than half of the need levels covered (each need counted up to its level) - `settlement`;
 * otherwise `outpost`. A body with no needs gets `colony`. Pure: the gate card, the colony
 * location, the end screen and the balance tools (src/devtools) use the same numbers.
 * The stock left on landing (`voyage.o2Days`) does not count yet (GDD `win-endings` A: not in P0).
 */
export function colonyCheck(site: ColonyBodyDef, loadout: Loadout): ColonyCheck {
  const needs = site.needs;
  const supply = colonySupply(loadout, site);
  const checks: ColonyNeedCheck[] = [];
  let met = 0;
  let total = 0;
  for (const axis of COLONY_AXES) {
    const need = needs[axis];
    if (need === undefined || need <= 0) continue;
    const have = supply[axis];
    checks.push({ axis, need, have, met: have >= need });
    met += Math.min(have, need);
    total += need;
  }
  let tier: ColonyTier = 'outpost';
  if (met >= total) tier = 'colony';
  else if (met * 2 > total) tier = 'settlement';
  return { tier, needs: checks, met, total };
}

/**
 * The tier of the colony built on gate body `body` with `loadout`'s cargo (`colonyCheck` with
 * the body's needs from `catalog`): what "Stop here" promises on the gate card, what the colony
 * and its end screen show. A body not in the catalog gives `outpost`. Pure.
 */
export function colonyFit(body: string, loadout: Loadout, catalog: ColonyCatalog): ColonyTier {
  const def = Object.hasOwn(catalog.bodies, body) ? catalog.bodies[body] : undefined;
  return def ? colonyCheck(def, loadout).tier : 'outpost';
}
