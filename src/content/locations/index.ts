import { demoCorridor } from '@/content/locations/demo-corridor';
import { demoRoom } from '@/content/locations/demo-room';
import { shipDeck } from '@/content/locations/ship-deck';
import type { LocationDef } from '@/content/locations/types';

/**
 * Registry of locations. The object key is the location id (`LocationId`), used in URLs
 * (`?location=demo-corridor`), saves and door bindings. To add a location, create
 * `<id>.ts` next to this file and list it here.
 */
export const locations = {
  'demo-corridor': demoCorridor,
  'demo-room': demoRoom,
  'ship-deck': shipDeck,
} as const satisfies Record<string, LocationDef>;

/** Id of a registered location. */
export type LocationId = keyof typeof locations;

/** Whether a string (e.g. from the URL or a save) names a registered location. */
export function isLocationId(id: string): id is LocationId {
  return Object.hasOwn(locations, id);
}
