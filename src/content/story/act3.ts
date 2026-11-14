import type { Act } from '@/content/story/types';

/** Act 3 (placeholder): goes straight to the demo ending. */
export const act3: Act = {
  title: 'Act 3',
  async start(flow) {
    flow.finish('demo-ending');
  },
};
