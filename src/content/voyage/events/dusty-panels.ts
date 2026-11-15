import type { VoyageEventDef } from '@/core/voyage/voyageEvents';

/**
 * E3 without a reactor (GDD `evt-catalog` A: "without the reactor, the panels on 1/r^2"): dust
 * settles on the solar panels between the Moon and Mars.
 */
export const dustyPanels: VoyageEventDef = {
  // OWNER: design - the leg (1: Moon -> Mars), the point and the chance (with working
  // panels and no working reactor: one E3 per voyage).
  leg: 1,
  at: 0.2,
  chance: (ctx) => (ctx.has('solar') && !ctx.has('reactor') ? 0.5 : 0),
  speaker: 'computer',
  // OWNER: script
  title: { en: 'Dusty panels', uk: 'Запилені панелі' },
  text: {
    en: 'Dust on the panels; their output drops.',
    uk: 'Пил на панелях; їхня потужність падає.',
  },
  // OWNER: design - the deck station the alarm is answered at, and the choice applied when its
  // timer runs out: leaving them (power -40; no risk) (plan act2-stations D3, D8).
  station: 'airlock',
  timeoutChoice: 'leave',
  choices: [
    {
      id: 'clean',
      // OWNER: script
      text: { en: 'Go out and clean them.', uk: 'Вийди й очисти їх.' },
      result: { en: 'Clean again; the walk cost air.', uk: 'Знову чисті; вихід коштував повітря.' },
      // OWNER: design - days of oxygen (four times the 53-day voyage's 4, plan variable-mass S9).
      effect: { stocks: { oxygen: -16 } },
    },
    {
      id: 'leave',
      // OWNER: script
      text: { en: 'Leave them.', uk: 'Залишити їх.' },
      result: { en: 'The batteries make up for it.', uk: 'Батареї це компенсують.' },
      // OWNER: design - days of power (four times the 53-day voyage's 10, plan variable-mass S9).
      effect: { stocks: { power: -40 } },
    },
  ],
};
