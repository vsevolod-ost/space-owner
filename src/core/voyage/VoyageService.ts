import type { GameState } from '@/core/state/GameState';
import {
  buildsColony,
  colonyCheck,
  colonyFit,
  type ColonyCatalog,
  type ColonyCheck,
  type ColonyTier,
} from '@/core/voyage/colony';
import {
  buildLoadout,
  cargoCount,
  holdOrder,
  loadoutOf,
  type FlagReader,
} from '@/core/voyage/loadout';
import type { CargoCatalog, CargoDef, Loadout } from '@/core/voyage/types';
import type { VoyageEventCatalog } from '@/core/voyage/voyageEvents';

/**
 * The voyage's data for the rest of the game (plan D12): the cargo and event registries from
 * src/content/voyage, handed over by `attach` in src/main.ts (src/core never imports content
 * at run time), and what the `cargo.<id>` flags put aboard. Location bindings reach it as
 * `voyage` (the warehouse's crates, the deck's bays); `SimulationService` builds a `Voyage`
 * from it. The running voyage itself (gates, forecast, events) is `services.simulation.voyage`.
 */
export class VoyageService {
  private catalog: CargoCatalog | null = null;
  private eventCatalog: VoyageEventCatalog = {};
  private colonyCatalog: ColonyCatalog | null = null;

  constructor(private readonly state: GameState) {}

  /** Hands over the cargo, event and colony registries; main.ts calls this once. */
  attach(catalog: CargoCatalog, events: VoyageEventCatalog, colony: ColonyCatalog): void {
    this.catalog = catalog;
    this.eventCatalog = events;
    this.colonyCatalog = colony;
  }

  /**
   * The colony registry (src/content/voyage/colony.ts: the bodies' needs and colours, the
   * items' buildings); throws before `attach`.
   */
  get colony(): ColonyCatalog {
    if (!this.colonyCatalog) throw new Error('VoyageService: no colony attached (see main.ts)');
    return this.colonyCatalog;
  }

  /**
   * The body the colony stands on: flag `voyage.stopBody` (set by Stop) when it is a colony
   * site, else the first site (the Moon: `?act=act3` with no voyage behind it).
   */
  colonyBody(flags: FlagReader = this.state.flags): string {
    const body = flags.get('voyage.stopBody');
    const bodies = this.colony.bodies;
    if (typeof body === 'string' && Object.hasOwn(bodies, body)) return body;
    return Object.keys(bodies)[0] ?? '';
  }

  /**
   * The tier of a colony on `body` with `loadout` (`colonyFit`); by default the cargo of the
   * flags now. The gate card passes the voyage's own cargo.
   */
  colonyTier(body: string, loadout: Loadout = this.buildLoadout()): ColonyTier {
    return colonyFit(body, loadout, this.colony);
  }

  /** The tier and each need of `body` against `loadout` (`colonyCheck`); none for a non-site. */
  colonyCheck(body: string, loadout: Loadout = this.buildLoadout()): ColonyCheck | null {
    const bodies = this.colony.bodies;
    return Object.hasOwn(bodies, body) ? colonyCheck(bodies[body], loadout) : null;
  }

  /**
   * The colony's buildings by the flags now, on the colony's body (`colonyBody`): one per copy
   * of an item that gives that site something (`buildsColony`), in the hold's order (`hold`,
   * fuel first, which builds nothing): `<building>` of image `colony-<building>`. Solar panels
   * stand on the Moon and Mars, not past them, where they give the colony no power: the
   * buildings show what works, as the systems' lines do.
   */
  colonyBuildings(flags: FlagReader = this.state.flags): string[] {
    const { buildings, bodies } = this.colony;
    const site = bodies[this.colonyBody(flags)];
    if (!site) return [];
    return this.hold(flags).flatMap((id) =>
      Object.hasOwn(buildings, id) && buildsColony(this.item(id), site) ? [buildings[id]] : [],
    );
  }

  /** The registry of events on the way (src/content/voyage/events); empty before `attach`. */
  get events(): VoyageEventCatalog {
    return this.eventCatalog;
  }

  /** The cargo registry (the base, the items, the bay count); throws before `attach`. */
  get cargo(): CargoCatalog {
    if (!this.catalog) throw new Error('VoyageService: no cargo attached (see main.ts)');
    return this.catalog;
  }

  /** Cargo ids in registry order (the warehouse's order). */
  get itemIds(): string[] {
    return Object.keys(this.cargo.items);
  }

  /** The entry of cargo `id`; throws for an unknown id. */
  item(id: string): CargoDef {
    const def = this.cargo.items[id];
    if (!def) throw new Error(`VoyageService: unknown cargo "${id}"`);
    return def;
  }

  /** Copies of cargo `id` aboard now (`cargo.<id>`, within 0..maxCopies). */
  count(id: string, flags: FlagReader = this.state.flags): number {
    return cargoCount(this.cargo, flags, id);
  }

  /** Cargo ids in the hold, one per copy, fuel first (plan D21): what the deck's bays show. */
  hold(flags: FlagReader = this.state.flags): string[] {
    return holdOrder(this.cargo, flags);
  }

  /** What the ship carries by the flags now (`buildLoadout`). */
  buildLoadout(flags: FlagReader = this.state.flags): Loadout {
    return buildLoadout(this.cargo, flags);
  }

  /** The loadout of saved copy counts (`SimulationSnapshot.cargo`). */
  loadoutOf(counts: Readonly<Record<string, number>>): Loadout {
    return loadoutOf(this.cargo, counts);
  }
}
