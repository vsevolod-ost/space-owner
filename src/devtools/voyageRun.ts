import { DAY_S } from '@/core/simulation/constants';
import type { ResourceId } from '@/core/simulation/types';
import type { LegForecast } from '@/core/voyage/forecast';
import type { Voyage, VoyageOutcome, VoyageSignal } from '@/core/voyage/Voyage';
import { FRAME_S } from '@/devtools/voyageFlight';

/** A voyage that has not ended after this much real Run is given up, s. */
const VOYAGE_LIMIT_REAL_S = 3600;

/** How the tool answers: Stop at gate `stopAt` (none: Go on to the end), event answers. */
export interface VoyagePolicy {
  /** Gate index to stop at; undefined: Go on at every gate (Stop only at the last). */
  stopAt?: number;
  /** `first`: the first enabled choice of every card; a number: that choice when enabled. */
  choice: 'first' | number;
  /** Answer by event id, before `choice` (when enabled). */
  choices?: Readonly<Record<string, string>>;
}

/** The ship at one gate of a seeded voyage, with the forecast of the leg ahead. */
export interface SeededGateRow {
  gate: number;
  day: number;
  values: Record<ResourceId, number>;
  offline: string[];
  /** Forecast of the next leg computed at this gate (null at the last gate). */
  forecast: LegForecast | null;
}

/** One answered card. */
export interface AnsweredEvent {
  eventId: string;
  day: number;
  choiceId: string;
  hit: boolean;
  /** Stocks the answer emptied (from above 0 to 0), and the fuel it took, kg. */
  emptied: ResourceId[];
  fuelLost: number;
}

/** How a seeded voyage went (`runSeededVoyage`). */
export interface SeededRun {
  gates: SeededGateRow[];
  answers: AnsweredEvent[];
  outcome: VoyageOutcome | null;
  realS: number;
}

/**
 * Flies `voyage` frame by frame as the game would (60 frames a real second, no warp), with
 * events, deciding at every gate and card by `policy`; the forecast at each gate is computed
 * at once (`finishForecast`). Stops when the voyage ends or after an hour of Run.
 */
export function runSeededVoyage(voyage: Voyage, policy: VoyagePolicy): SeededRun {
  const gates: SeededGateRow[] = [];
  const answers: AnsweredEvent[] = [];
  let realS = 0;
  const handle = (signals: VoyageSignal[]): void => {
    const queue = [...signals];
    for (let signal = queue.shift(); signal; signal = queue.shift()) {
      if (signal.kind === 'gate') {
        const snapshot = voyage.simulation.snapshot();
        const forecast = voyage.atLastGate ? null : voyage.finishForecast();
        gates.push({
          gate: signal.gate,
          day: snapshot.timeS / DAY_S,
          values: Object.fromEntries(
            Object.entries(snapshot.resources).map(([id, r]) => [id, r.value]),
          ) as Record<ResourceId, number>,
          offline: [...snapshot.life.offline],
          forecast,
        });
        if (voyage.atLastGate || signal.gate === policy.stopAt) voyage.stop();
        else voyage.goOn();
      } else if (signal.kind === 'event') {
        const card = voyage.openEvent;
        if (!card) continue;
        const enabled = card.choices.filter((choice) => choice.enabled);
        const byId = card.choices.find((choice) => choice.id === policy.choices?.[card.id]);
        const wanted =
          byId ?? (policy.choice === 'first' ? undefined : card.choices[policy.choice]);
        const pick = wanted?.enabled ? wanted : enabled[0];
        const before = voyage.simulation.snapshot().resources;
        const answered = voyage.choose(pick.id);
        const after = voyage.simulation.snapshot().resources;
        if (!answered) throw new Error(`choice ${pick.id} of ${card.id} refused`);
        answers.push({
          eventId: card.id,
          day: voyage.day,
          choiceId: pick.id,
          hit: answered.resolution.hit,
          emptied: (Object.keys(after) as ResourceId[]).filter(
            (id) => before[id].value > 0 && after[id].value <= 0,
          ),
          fuelLost: before.fuel.value - after.fuel.value,
        });
        queue.push(...answered.signals);
      }
    }
  };
  // The forecast of the first leg, as the game computes it at the start.
  voyage.finishForecast();
  while (voyage.phase !== 'ended' && realS < VOYAGE_LIMIT_REAL_S) {
    handle(voyage.advance(FRAME_S));
    realS += FRAME_S;
  }
  return { gates, answers, outcome: voyage.outcome, realS };
}
