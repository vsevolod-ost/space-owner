import type { Act } from '@/content/story/types';

/**
 * The first act: its card is the hero on the roof at night, then the hero at home; the door of
 * the flat starts act 1.
 */
export const prologue: Act = {
  title: { en: 'Prologue', uk: 'Пролог' }, // OWNER: script
  card: 'card-prologue',
  async start(flow) {
    await flow.goTo('home', 'spawn-default');
    flow.checkpoint();
  },
};
