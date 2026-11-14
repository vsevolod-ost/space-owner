import type { LocationDef } from '@/content/locations/types';

/**
 * Demo room behind the corridor: the captain, a terminal on the right, a door back on the left.
 * Stepping into the middle plays the `demo-arrival` cutscene once. `door-ship` (right edge,
 * past the terminal) starts act 2; `broken-vent` (straight up from the spawn) kills the hero,
 * to try deaths and "Retry from checkpoint".
 */
export const demoRoom: LocationDef = {
  title: 'Room',
  background: 'location-demo-room',
  map: 'demo-room',
  music: 'music-demo',
  bindings: {
    'door-corridor': { kind: 'door', to: 'demo-corridor', spawn: 'spawn-from-room' },
    'npc-captain': { kind: 'npc', character: 'captain' },
    terminal: { kind: 'interactable', run: (ctx) => ctx.ui.toast('A dusty terminal.') },
    'door-ship': { kind: 'door', act: 'act2' },
    'broken-vent': { kind: 'interactable', run: (ctx) => ctx.flow.gameOver('death-generic') },
    'trigger-center': {
      kind: 'trigger',
      once: true,
      run: (ctx) => ctx.cutscenes.play('demo-arrival'),
    },
  },
};
