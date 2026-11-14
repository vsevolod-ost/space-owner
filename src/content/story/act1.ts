import type { Act } from '@/content/story/types';

/** Act 1 (placeholder): starts in the room behind the corridor. */
export const act1: Act = {
  title: 'Act 1',
  async start(flow) {
    await flow.goTo('demo-room', 'spawn-default');
    flow.checkpoint();
  },
};
