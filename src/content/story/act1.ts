import type { Act } from '@/content/story/types';

/** Act 1: the warehouse, where the cargo is chosen; its hatch starts act 2. */
export const act1: Act = {
  title: { en: 'Act 1', uk: 'Акт 1' }, // OWNER: script
  async start(flow) {
    await flow.goTo('warehouse', 'spawn-default');
    flow.checkpoint();
  },
};
