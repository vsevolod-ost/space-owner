/**
 * A worker thread of the loadout sweep (`runSweep` in `voyageSweep.ts`): takes indices into
 * `allLoadouts()`, answers with their rows (`sweepRow`), each with the cross-check's search
 * over it (`searchHits`) flown on the same flights.
 *
 * Must not import `@/config`, `@/core/services` or the event bus: they read `window` on load.
 */
import { parentPort } from 'node:worker_threads';

import { cargo } from '@/content/voyage/cargo';
import { loadoutOf } from '@/core/voyage/loadout';
import { searchHits } from '@/devtools/voyageCrossCheck';
import { LoadoutFlights } from '@/devtools/voyageEvaluator';
import { allLoadouts, type SweepRow, sweepRow } from '@/devtools/voyageSweep';

const sets = allLoadouts();

/** The row of set `index` with the search over it. */
function row(index: number): SweepRow {
  const flights = new LoadoutFlights(loadoutOf(cargo, sets[index]));
  const result = sweepRow(sets[index], flights);
  result.searchHits = searchHits(result, flights);
  return result;
}

parentPort?.on('message', (indices: number[]) => {
  parentPort?.postMessage({ indices, rows: indices.map(row) });
});
