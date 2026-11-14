import type { LocationDef } from '@/content/locations/types';

/**
 * Prologue: the hero's flat, one screen. Walking into the door on the right (`door-warehouse`)
 * starts act 1 in the warehouse.
 */
export const home: LocationDef = {
  title: 'Home', // OWNER: script
  background: 'location-home',
  map: 'home',
  music: 'music-demo',
  bindings: {
    'door-warehouse': { kind: 'door', act: 'act1' },
  },
};
