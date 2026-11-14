import type { Act } from '@/content/story/types';

/** The first act: the hero at home; the door of the flat starts act 1. */
export const prologue: Act = {
  title: 'Prologue', // OWNER: script
  async start(flow) {
    await flow.goTo('home', 'spawn-default');
    flow.checkpoint();
  },
};
