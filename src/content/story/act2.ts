import type { Act } from '@/content/story/types';

/**
 * Act 2: on board the ship. Reached through `door-ship` in demo-room. The ship deck
 * is an ordinary location; its navigation station opens the panel with the solar system. The
 * ship simulation runs in the background for the whole act (docs/HOWTO-simulation.md).
 */
export const act2: Act = {
  title: 'Act 2',
  async start(flow) {
    await flow.goTo('ship-deck', 'spawn-default');
    flow.startSimulation();
    flow.checkpoint();
  },
};
