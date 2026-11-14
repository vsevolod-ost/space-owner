import type { Act } from '@/content/story/types';
import { TODO } from '@/core/locale/text';

/**
 * Act 2: on board the ship. Reached through the `hatch` of the warehouse. The ship deck
 * is an ordinary location; its navigation station opens the panel with the solar system. The
 * voyage (the ship simulation, gates, events) runs for the whole act (docs/HOWTO-simulation.md).
 */
export const act2: Act = {
  title: { en: 'Act 2', uk: TODO }, // OWNER: script
  async start(flow) {
    await flow.goTo('ship-deck', 'spawn-default');
    flow.startVoyage();
    flow.checkpoint();
  },
};
