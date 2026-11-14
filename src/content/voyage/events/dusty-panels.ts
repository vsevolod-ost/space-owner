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
  title: 'Dusty panels',
  text: '[TODO: dust on the panels, their output drops]',
  choices: [
    {
      id: 'clean',
      // OWNER: script
      text: '[TODO: Go out and clean them]',
      result: '[TODO: clean again; the walk cost air]',
      // OWNER: design - days of oxygen (four times the 53-day voyage's 4, plan variable-mass S9).
      effect: { stocks: { oxygen: -16 } },
    },
    {
      id: 'leave',
      // OWNER: script
      text: '[TODO: Leave them]',
      result: '[TODO: the batteries make up for it]',
      // OWNER: design - days of power (four times the 53-day voyage's 10, plan variable-mass S9).
      effect: { stocks: { power: -40 } },
    },
  ],
};
