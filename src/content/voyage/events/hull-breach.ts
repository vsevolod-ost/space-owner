import type { VoyageEventDef } from '@/core/voyage/voyageEvents';

/** E1 (GDD `evt-catalog` A): a micrometeoroid holes the hull on the way from the Moon to Mars. */
export const hullBreach: VoyageEventDef = {
  // OWNER: design - the leg (1: Moon -> Mars), the point (share of the leg) and the chance.
  leg: 1,
  at: 0.4,
  chance: () => 0.45,
  speaker: 'computer',
  // OWNER: script
  title: 'Hull breach',
  text: '[TODO: a micrometeoroid holed a module; air is leaking]',
  choices: [
    {
      id: 'seal',
      // OWNER: script
      text: '[TODO: Seal the module off]',
      result: '[TODO: the module is lost with the air in it]',
      // OWNER: design - a sure price in days of oxygen (four times the 53-day voyage's 4, as
      // every stock: the voyage is now 190-270 days, plan variable-mass S9).
      effect: { stocks: { oxygen: -16 } },
    },
    {
      id: 'patch',
      // OWNER: script
      text: '[TODO: Patch it from outside]',
      result: '[TODO: the patch holds]',
      hitResult: '[TODO: the patch tore, much air is gone]',
      // OWNER: design - the chance it goes wrong, and the loss then (days: four times the
      // 53-day voyage's 12, plan variable-mass S9).
      risk: () => 0.5,
      onHit: { stocks: { oxygen: -48 } },
    },
    {
      id: 'foam',
      // OWNER: script
      text: '[TODO: Fill it with the regolith kit foam]',
      needs: 'Regolith kit',
      result: '[TODO: the foam sets, little air lost]',
      when: (ctx) => ctx.has('regolith-kit'),
      // OWNER: design - days of oxygen (four times the 53-day voyage's 1, plan variable-mass S9).
      effect: { stocks: { oxygen: -4 } },
    },
  ],
};
