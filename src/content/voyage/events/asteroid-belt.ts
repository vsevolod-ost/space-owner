import type { VoyageEventDef } from '@/core/voyage/voyageEvents';

/**
 * E2 (GDD `evt-catalog` A, `evt-asteroid` A): a field of rocks between the Moon and Mars (the
 * real belt lies past Mars; the route ends there, so the event moved in) - wait for a clear corridor (days of every stock) or fly through (a chance of a hit).
 */
export const asteroidBelt: VoyageEventDef = {
  // OWNER: design - the leg (1: Moon -> Mars), the point and the chance.
  leg: 1,
  at: 0.65,
  chance: () => 0.6,
  speaker: 'computer',
  // OWNER: script
  title: 'Asteroid belt',
  text: '[TODO: dense rocks ahead; wait for a corridor or fly through]',
  choices: [
    {
      id: 'wait',
      // OWNER: script
      text: '[TODO: Wait for a corridor (6 d)]',
      result: '[TODO: a corridor opens, the ship slips through]',
      // OWNER: design - days of every stock spent waiting (GDD `evt-asteroid`: N ~ 10-15 % of the leg).
      effect: { waitDays: 6 },
    },
    {
      id: 'fly',
      // OWNER: script
      text: '[TODO: Fly through]',
      result: '[TODO: not a scratch]',
      hitResult: '[TODO: a hit: a tank and the air line are holed]',
      // OWNER: design - the chance of a hit (lower with the regolith kit's shield plates) and
      // its price: oxygen, and a fuel leak (with one fuel crate it leaves too little to reach Mars, D13).
      risk: (ctx) => (ctx.has('regolith-kit') ? 0.3 : 0.45),
      onHit: { stocks: { oxygen: -10, fuel: -0.75 } },
    },
  ],
};
