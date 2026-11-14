import { asteroidBelt } from '@/content/voyage/events/asteroid-belt';
import { dustyPanels } from '@/content/voyage/events/dusty-panels';
import { hullBreach } from '@/content/voyage/events/hull-breach';
import { reactorFailure } from '@/content/voyage/events/reactor-failure';
import type { VoyageEventCatalog } from '@/core/voyage/voyageEvents';

/**
 * Registry of events on the way (plan D15; the route is short, so every event is on the Moon -> Mars
 * leg, at different points; the Earth -> Moon leg has none). The object key is the event id: flag `event.<id>` holds the
 * answer, a death in it is `event:<id>`. Each event is rolled once per voyage with the run's
 * seed (D10). To add one: create `<id>.ts` next to this file (`VoyageEventDef`) and list it
 * here (docs/HOWTO-voyage.md, "Events on the way").
 */
export const voyageEvents = {
  'hull-breach': hullBreach,
  'asteroid-belt': asteroidBelt,
  'reactor-failure': reactorFailure,
  'dusty-panels': dustyPanels,
} as const satisfies VoyageEventCatalog;

/** Id of an event on the way. */
export type VoyageEventId = keyof typeof voyageEvents;
