import type { VoyageEventDef } from '@/core/voyage/voyageEvents';

/**
 * A late-leg event in the hold (plan act2-stations D10, D11): the greenhouse's irrigation line
 * springs a leak - clamp it at the crate, or shut the bay's main valve and lose what is in the
 * line. Only with a greenhouse aboard; answered at the access point above its bay. A
 * placeholder for the team: theme, texts and numbers are to be rewritten.
 */
export const greenhouseLeak: VoyageEventDef = {
  // OWNER: design - the leg (1: Moon -> Mars), the point and the chance (late on the leg, where
  // the alarms come more often, and only with a greenhouse aboard: plan act2-stations D11).
  leg: 1,
  at: 0.8,
  chance: (ctx) => (ctx.has('greenhouse') ? 0.6 : 0),
  speaker: 'computer',
  // OWNER: script
  title: 'Greenhouse leak',
  text: 'The greenhouse irrigation line is leaking. Water on the floor, dignity on the ceiling. Your call.',
  // OWNER: design - the deck station the alarm is answered at (the bay of the greenhouse), and
  // the choice applied when its timer runs out: the main valve, the dearer one (no risk: plan
  // act2-stations D3, D11).
  station: { bayOf: 'greenhouse' },
  timeoutChoice: 'shut-valve',
  choices: [
    {
      id: 'clamp',
      // OWNER: script
      text: 'Clamp it at the crate.',
      result: 'Clamp held. A few litres on the floor. The plants are dramatic but alive.',
      // OWNER: physics - days of water (small: under the 16 days of oxygen of "Seal the
      // module", plan act2-stations D11).
      effect: { stocks: { water: -6 } },
    },
    {
      id: 'shut-valve',
      // OWNER: script
      text: 'Shut the bay main valve.',
      result: 'Leak stopped. The water in the line is gone. The plants will sulk.',
      // OWNER: physics - days of water.
      effect: { stocks: { water: -14 } },
    },
  ],
};
