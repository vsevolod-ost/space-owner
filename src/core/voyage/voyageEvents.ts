import type { LocalText } from '@/core/locale/text';
import { DAY_S } from '@/core/simulation/constants';
import type { Resources } from '@/core/simulation/types';
import { rollFor } from '@/core/voyage/random';
import type { CommsLevel, DeathCause, LifeState, Loadout, StockId } from '@/core/voyage/types';

/**
 * Events on the way (plan D15, GDD `evt-catalog` A, `gate-uncertainty` D): cards that stop the
 * voyage at a point of a leg and ask the player to choose. The registry lives in
 * src/content/voyage/events; `Voyage` rolls and applies them. Plain data and pure functions.
 */

/** What an event's numbers may look at when they are rolled or applied (`EventContext`). */
export interface EventContext {
  /** Copies of cargo `id` aboard that still work (an offline item counts 0). */
  count(id: string): number;
  /** Whether at least one working copy of cargo `id` is aboard. */
  has(id: string): boolean;
  /** Amount of a stock now (days of a resource, or kg of fuel). */
  stock(id: StockId): number;
  /** The link to the Earth on this leg. */
  comms: CommsLevel;
  /** Index of the leg (the gate it ends at). */
  leg: number;
}

/**
 * What a choice does to the ship. All parts are optional and applied in this order:
 * `waitDays`, `stocks`, `offline`, `die` (`applyEventEffect`, the one place that reads them: a
 * new part is a compile error there until it is applied).
 */
export interface EventEffect {
  /**
   * Days of the current flows pass for the stocks (waiting for a corridor): every resource
   * changes by its daily rate times this. The ship and the voyage's clock stand.
   */
  waitDays?: number;
  /** Added to stocks (negative: lost) - days of a resource, or kg of fuel (a leak). */
  stocks?: Partial<Record<StockId, number>>;
  /** Cargo ids that stop working for good (the reactor). */
  offline?: readonly string[];
  /** The crew dies of this event (`event:<id>`). */
  die?: boolean;
}

/** One answer on an event's card. */
export interface EventChoiceDef {
  /** Unique within the event; flag `event.<eventId>` stores the chosen one. */
  id: string;
  /** Text of the choice (OWNER: script). */
  text: LocalText;
  /** Offered only when this holds; otherwise shown disabled with `needs`. */
  when?: (ctx: EventContext) => boolean;
  /** Why it is disabled, shown as "Needs: ..." (`when` false). */
  needs?: LocalText;
  /** What it always does (the price of the choice). */
  effect?: EventEffect;
  /**
   * Chance, 0..1, that it goes wrong (rolled once per voyage with the run's seed); none: it
   * never does. Equipment may lower it.
   */
  risk?: (ctx: EventContext) => number;
  /** What it does when it goes wrong (on top of `effect`). */
  onHit?: EventEffect;
  /** Line shown after it went fine, and after it went wrong (OWNER: script). */
  result?: LocalText;
  hitResult?: LocalText;
}

/**
 * One event of the registry (src/content/voyage/events). The object key is its id. It is
 * rolled once per voyage when the ship has flown `at` of leg `leg` (by the leg's planned
 * duration); if the roll is under `chance`, the card opens.
 */
export interface VoyageEventDef {
  /** Leg it can happen on: leg `i` ends at gate `i` (1 = the Moon to Mars). */
  leg: number;
  /** Where on the leg, 0..1 of its planned duration (keep it under 0.9: past arrival it is dropped). */
  at: number;
  /** Character id of the portrait on the card (`computer` by default). */
  speaker?: string;
  /** Card title and text (OWNER: script). */
  title: LocalText;
  text: LocalText;
  /** Chance, 0..1, that it happens on this voyage, from the cargo aboard. */
  chance: (ctx: EventContext) => number;
  /** Answers; the first is the default one of the tools (`voyage-check --seed`). */
  choices: readonly EventChoiceDef[];
  /**
   * Where on the deck the alarm is answered (plan act2-stations D1, D8): the name of an
   * interactable object of the ship deck (`'airlock'`), or `{ bayOf: '<cargo id>' }` - the
   * access point of the hold bay the crate of that cargo stands in.
   */
  station: EventStation;
  /**
   * Id of the choice applied when the alarm's timer runs out (D2, D3): its bad outcome
   * (`onHit`) is forced, without a roll. It must exist, have no `when`, and its `onHit` must not
   * kill (`checkEventCatalog`).
   */
  timeoutChoice: string;
}

/**
 * A deck station of an event (`VoyageEventDef.station`): an interactable object name of the
 * ship deck, or the hold bay where the crate of cargo `bayOf` stands.
 */
export type EventStation = string | { readonly bayOf: string };

/** The event registry as core gets it (`VoyageService.attach` in src/main.ts). */
export type VoyageEventCatalog = Readonly<Record<string, VoyageEventDef>>;

/**
 * Checks the event registry's alarm data (plan act2-stations D3): every `timeoutChoice` names a
 * choice of its event that has no `when` (it must always be allowed) and whose `onHit` does not
 * kill, and every `station.bayOf` is one of `cargoIds`. Throws one error listing every problem;
 * `VoyageService.attach` calls it at game start.
 */
export function checkEventCatalog(events: VoyageEventCatalog, cargoIds: readonly string[]): void {
  const problems: string[] = [];
  for (const [id, def] of Object.entries(events)) {
    if (typeof def.station !== 'string' && !cargoIds.includes(def.station.bayOf)) {
      problems.push(`${id}: station bayOf "${def.station.bayOf}" is not a cargo id`);
    }
    const choice = def.choices.find((c) => c.id === def.timeoutChoice);
    if (!choice) {
      problems.push(`${id}: timeoutChoice "${def.timeoutChoice}" is not one of its choices`);
      continue;
    }
    if (choice.when) problems.push(`${id}: timeoutChoice "${choice.id}" has \`when\``);
    if (choice.onHit?.die) problems.push(`${id}: timeoutChoice "${choice.id}" kills on a hit`);
  }
  if (problems.length > 0) throw new Error(`Voyage events: ${problems.join('; ')}`);
}

/** A choice as the card shows it: enabled or not. */
export interface OpenChoice {
  id: string;
  /** `tr` it when shown (plan uk-localization D16). */
  text: LocalText;
  enabled: boolean;
  /** "Needs: ..." text of a disabled choice (null when enabled or not given). */
  needs: LocalText | null;
}

/** The event whose card is open (`Voyage.openEvent`). */
export interface OpenEvent {
  id: string;
  leg: number;
  speaker: string;
  /** `tr` them when shown (plan uk-localization D16). */
  title: LocalText;
  text: LocalText;
  choices: OpenChoice[];
}

/** How an answered event went (`Voyage.choose`). */
export interface EventResolution {
  eventId: string;
  choiceId: string;
  /** Whether its risk struck (false for a choice without risk). */
  hit: boolean;
  /** Line to show afterwards (`tr` it when shown), or null when there is none. */
  text: LocalText | null;
}

/** One line of a voyage's event log: every roll, for tools and the debug surface. */
export interface EventLogEntry {
  eventId: string;
  leg: number;
  /** Simulated day it was rolled. */
  day: number;
  /** The roll and the chance it was compared with: it happened when `roll < chance`. */
  roll: number;
  chance: number;
  happened: boolean;
  /** Filled once answered. */
  choiceId?: string;
  riskRoll?: number;
  risk?: number;
  hit?: boolean;
  /**
   * Dropped: the ship arrived, went adrift or the voyage ended before the event's point (never
   * rolled), or it went adrift while the event that happened waited for its card (unanswered).
   */
  dropped?: boolean;
}

/** The context of `loadout` with `offline` items and `stock` amounts on leg `leg`. */
export function eventContext(
  loadout: Loadout,
  offline: readonly string[],
  stock: (id: StockId) => number,
  comms: CommsLevel,
  leg: number,
): EventContext {
  const count = (id: string) =>
    offline.includes(id) ? 0 : (loadout.entries.find((entry) => entry.id === id)?.count ?? 0);
  return { count, has: (id) => count(id) > 0, stock, comms, leg };
}

/** A chance clamped to 0..1 (NaN counts 0). */
export function clampChance(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/** Whether event `eventId` happens on this voyage (`Voyage` rolls it once, where it is due). */
export function rollEvent(
  def: VoyageEventDef,
  eventId: string,
  seed: number,
  ctx: EventContext,
): { roll: number; chance: number; happened: boolean } {
  const chance = clampChance(def.chance(ctx));
  const roll = rollFor(seed, `happen:${eventId}`);
  return { roll, chance, happened: roll < chance };
}

/** The choices of `def` offered now (`when` holds or is absent), in the card's order. */
export function enabledChoices(def: VoyageEventDef, ctx: EventContext): EventChoiceDef[] {
  return def.choices.filter((choice) => (choice.when ? choice.when(ctx) : true));
}

/** Rolls the risk of answering event `eventId` with `choice` (false for a choice without one). */
export function rollRisk(
  choice: EventChoiceDef,
  eventId: string,
  seed: number,
  ctx: EventContext,
): { risk: number; riskRoll: number; hit: boolean } {
  const risk = choice.risk ? clampChance(choice.risk(ctx)) : 0;
  const riskRoll = rollFor(seed, `risk:${eventId}:${choice.id}`);
  return { risk, riskRoll, hit: choice.risk !== undefined && riskRoll < risk };
}

/**
 * The ship's living state as an event's effect changes it (`applyEventEffect`): the game's
 * `Simulation` gives it (the balance sweep flies that same `Simulation`), so effects apply one
 * way only.
 */
export interface EffectTarget {
  /** The stocks, changed in place (the fuel too, in kg). */
  readonly resources: Resources;
  /** Offline items (added to) and the death (read). */
  readonly life: LifeState;
  /**
   * `dtS` simulated seconds of the current flows for the stocks only (`stepLife`), then the
   * death check of a resource at 0; with 0 only the rates, the items dying without power and
   * the death check.
   */
  flow(dtS: number): void;
  /** An effect emptied the fuel: on a leg, the ship drifts (D13). */
  fuelOut(): void;
  /** The crew dies of `cause` (a second death is ignored). */
  die(cause: DeathCause): void;
}

/**
 * Applies `effect` of event `eventId` to `target`, in `EventEffect` order:
 * - `waitDays` - the flows pass in steps of at most a day (power running out mid-wait switches
 *   to the unpowered flows; a stock at 0 kills on the day it runs out); the clock stands;
 * - `stocks` - added within 0..max (fuel too: at 0 the ship drifts), then the zero-step update
 *   (power at 0 takes the powered items offline; a resource at 0 kills);
 * - `offline` - items stop working for good, then the zero-step update;
 * - `die` - the crew dies of `event:<eventId>`.
 * Nothing happens to a dead crew.
 */
export function applyEventEffect(
  target: EffectTarget,
  eventId: string,
  effect: EventEffect | undefined,
): void {
  if (!effect) return;
  const { waitDays, stocks, offline, die, ...unapplied } = effect;
  everyPartApplied(unapplied);
  const dead = () => target.life.cause !== null;
  if (waitDays) {
    let leftS = waitDays * DAY_S;
    while (leftS > 0 && !dead()) {
      const stepS = Math.min(DAY_S, leftS);
      target.flow(stepS);
      leftS -= stepS;
    }
  }
  if (dead()) return;
  if (stocks) {
    for (const [id, delta] of Object.entries(stocks) as [StockId, number | undefined][]) {
      if (!delta) continue;
      const resource = target.resources[id];
      resource.value = Math.min(resource.max, Math.max(0, resource.value + delta));
      if (id === 'fuel' && resource.value <= 0) target.fuelOut();
    }
    target.flow(0);
  }
  if (offline && offline.length > 0) {
    for (const id of offline) if (!target.life.offline.includes(id)) target.life.offline.push(id);
    target.flow(0);
  }
  if (die && !dead()) target.die(`event:${eventId}`);
}

/** Compile-time guard of `applyEventEffect`: every part of `EventEffect` is taken apart there. */
function everyPartApplied(_rest: Record<string, never>): void {}
