import type { LocalText } from '@/core/locale/text';

/**
 * Data model of the voyage's resources and cargo (plan D5, D14; GDD `cargo-catalog` A): what a
 * cargo item declares, what the ship carries, how resources flow per day, and why the ship's
 * crew dies. Plain data and pure functions' types, no Phaser. The registries live in
 * src/content/voyage/cargo; how to change them: docs/HOWTO-simulation.md.
 */

/**
 * Resources a cargo item can add at the start (`CargoDef.start`):
 * - `fuel` - kilograms of propellant (plan variable-mass D3: the engine burns it by the rocket
 *   equation, `src/core/simulation/rocket.ts`);
 * - `oxygen`, `water`, `food` - days of stock for the one person aboard;
 * - `power` - days of stock at the ship's base load (1 per day, without heating);
 * - `heat` - days the cabin stays warm with no power (then the crew freezes, `frozen`).
 */
export type StockId = 'fuel' | 'oxygen' | 'water' | 'food' | 'power' | 'heat';

/** Resources that flow per day (`CargoDef.flows`): all stocks but fuel (the engine burns it). */
export type FlowId = Exclude<StockId, 'fuel'>;

/** Change per simulated day of each flowing resource; a missing key is 0. */
export type FlowRates = Partial<Record<FlowId, number>>;

/**
 * Link to the Earth on a leg (GDD `res-comms`: under 2 au OK, 2-6 au Weak, over 6 au Lost).
 * Shown on the panel; events read it (plan S7).
 */
export type CommsLevel = 'ok' | 'weak' | 'lost';

/**
 * What a leg of the voyage does to the flows (GDD `cargo-to-sim` B: one value per leg, they
 * switch at the gates). Part of every `LegDef` in src/content/voyage/legs.ts.
 */
export interface LegConditions {
  /** Sunlight on this leg against the Earth's orbit, 0..1 (about 1/r^2): solar panels' output. */
  sunFactor: number;
  /** Extra power for heating the cabin on this leg, days of power per day (colder further out). */
  heatLoad: number;
  /** Link to the Earth on this leg. */
  comms: CommsLevel;
}

/** What an item's `flows` gets: the leg's conditions, and whether the ship has power now. */
export interface FlowContext extends LegConditions {
  /** Power stock above 0: heating and powered items work. */
  powered: boolean;
}

/**
 * Axes of a colony's requirements (plan D19): what an item gives the colony when the player
 * stops. Plan S11 scores them.
 */
export type ColonyAxis = 'power' | 'heat' | 'shielding' | 'life';

/**
 * One kind of cargo in the warehouse (or the built-in base of the ship), one entry of
 * src/content/voyage/cargo. Numbers are per copy: two fuel crates give twice `start` and
 * twice `flows`.
 */
export interface CargoDef {
  /** Name on the crate and in lists (OWNER: script), `max: 14` characters. */
  label: LocalText;
  /** One line about it for the warehouse stand (OWNER: script), `max: 60` characters. */
  line: LocalText;
  /**
   * Mass of one copy with its stocks used up, kg: the crate, tanks and gear (for the base, the
   * ship itself: hull, engine and its reactor, empty tank). Its stocks add their own mass
   * (`CargoCatalog.kgPerDay`, `shipMassKg` in src/core/voyage/mass.ts).
   */
  dryMassKg: number;
  /** Bays of the hold one copy takes (all items take 1 for now; the base takes 0). */
  bays: number;
  /** How many copies can be aboard (the warehouse has this many crates of it). */
  maxCopies: number;
  /** Frame of the item's icon in the `items` sheet (art-order row 12); none for the base. */
  icon?: number;
  /** Added at the start of the voyage, per copy (fuel in kg, the rest in days). */
  start?: Partial<Record<StockId, number>>;
  /** Production (+) or use (-) per simulated day, per copy, on a leg (`FlowContext`). */
  flows?: (ctx: FlowContext) => FlowRates;
  /**
   * It stops working for good once the power stock reaches 0 (the greenhouse's plants die).
   * Its `flows` are not counted from then on.
   */
  needsPower?: boolean;
  /**
   * What it gives a colony, by axis (plan S11), per copy; none: nothing. A function of the
   * colony site when it depends on the body (solar panels give power only near the Sun).
   */
  colony?: ColonyAmounts | ((site: ColonySite) => ColonyAmounts);
}

/** Levels an item gives a colony, by axis (`CargoDef.colony`); a missing axis is 0. */
export type ColonyAmounts = Partial<Record<ColonyAxis, number>>;

/** What an item's `colony` function gets: the conditions of the colony site (a gate body). */
export interface ColonySite {
  /** Sunlight at the body against the Earth's orbit, 0..1 (about 1/r^2 in au). */
  sunFactor: number;
}

/** The cargo registry as core gets it (`VoyageService.attach` in src/main.ts). */
export interface CargoCatalog {
  /** The ship's built-in base: always aboard once, takes no bay (D14). */
  base: CargoDef;
  /** Kinds of cargo by id, in the warehouse's order (`cargo.<id>` flags count them). */
  items: Readonly<Record<string, CargoDef>>;
  /** Bays of the hold (D11: 7). */
  bays: number;
  /**
   * Mass of one day of a stock, kg (plan variable-mass D4): a stock of `d` days weighs
   * `d * kgPerDay`. A missing key weighs nothing (power, heat). Fuel is not here: it counts in
   * kilograms already (`shipMassKg`).
   */
  kgPerDay: Readonly<Partial<Record<FlowId, number>>>;
}

/** One kind of cargo aboard and how many copies. */
export interface LoadoutEntry {
  /** Cargo id, or `base` for the built-in base. */
  id: string;
  def: CargoDef;
  count: number;
}

/**
 * What the ship carries on this voyage (`buildLoadout`): the base and every item aboard. Not
 * in the snapshot itself: the snapshot keeps `counts` and `clone` builds the loadout again.
 */
export interface Loadout {
  /** The base first, then items in registry order, only those aboard. */
  entries: readonly LoadoutEntry[];
  /** Copies aboard by cargo id (no `base`), as the `cargo.<id>` flags said. */
  counts: Readonly<Record<string, number>>;
}

/**
 * Why the crew died (D14). When several happen at once, the first in this order wins:
 * `hypoxia` (oxygen 0), `dehydration` (water 0), `starvation` (food 0), `frozen` (no power, and
 * the cabin's warmth ran out), `drift` (out of fuel mid-leg for `DRIFT_DEATH_REAL_S`), an
 * event's own death `event:<id>` (plan S7).
 */
export type DeathCause =
  'hypoxia' | 'dehydration' | 'starvation' | 'frozen' | 'drift' | `event:${string}`;

/**
 * The living part of the ship's state, kept in the snapshot (`SimulationSnapshot.life`):
 * items that stopped working, the death if any, and how long the ship has drifted.
 */
export interface LifeState {
  /**
   * Cargo ids that stopped working for good: a `needsPower` item when power reached 0, the
   * reactor after its event (plan S7).
   */
  offline: string[];
  /** Why the crew died, or null while alive. The simulation stands once it is set. */
  cause: DeathCause | null;
  /** Simulated day the crew died (null while alive). */
  deathDay: number | null;
  /** Real seconds of Run spent drifting (`drift` comes at `DRIFT_DEATH_REAL_S`). */
  driftRealS: number;
}

/** A forecast of one way to die at the current flows (`lifeForecast`). */
export interface DeathForecast {
  cause: DeathCause;
  /** Simulated days until it, at the current rates (Infinity: not coming). */
  days: number;
  /** Whether it raises the alarm now (`isAlarm`). */
  alarm: boolean;
}
