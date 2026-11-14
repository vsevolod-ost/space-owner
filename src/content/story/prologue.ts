import type { Act } from '@/content/story/types';

/** The first act: the hero wakes up in the corridor. */
export const prologue: Act = {
  title: 'Prologue',
  async start(flow) {
    await flow.goTo('demo-corridor', 'spawn-default');
    flow.checkpoint();
  },
};
