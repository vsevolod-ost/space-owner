import type { LocationDef } from '@/content/locations/types';

/** Demo corridor: the first location; the engineer stands halfway to the door on the right. */
export const demoCorridor: LocationDef = {
  title: 'Corridor',
  background: 'location-demo-corridor',
  map: 'demo-corridor',
  music: 'music-demo',
  bindings: {
    'door-room': { kind: 'door', to: 'demo-room', spawn: 'spawn-from-corridor' },
    'npc-engineer': { kind: 'npc', character: 'engineer', dialogue: 'demo-engineer' },
  },
};
