import type { EventStation } from '@/core/voyage/voyageEvents';

/**
 * Deck station names of the station alarm (plan act2-stations S3): pure helpers, also for
 * content (the deck's bindings) and Node tools.
 */

/** Name of the deck's access point above hold bay `bay` (1-based; `tools/make_maps.py`). */
export function bayAccessName(bay: number): string {
  return `bay-access-${bay}`;
}

/**
 * The deck object where event station `station` is answered: a plain object name as is; for
 * `{ bayOf }`, the access point above the bay of the first crate of that cargo in `hold`
 * (`VoyageService.hold`: one id per bay, fuel first). Null when that cargo is not in the hold.
 */
export function stationObject(station: EventStation, hold: readonly string[]): string | null {
  if (typeof station === 'string') return station;
  const index = hold.indexOf(station.bayOf);
  return index < 0 ? null : bayAccessName(index + 1);
}
