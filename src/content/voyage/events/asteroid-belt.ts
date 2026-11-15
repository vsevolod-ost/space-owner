import type { VoyageEventDef } from '@/core/voyage/voyageEvents';

/**
 * E2 (GDD `evt-catalog` A, `evt-asteroid` A): a field of rocks between the Moon and Mars (the
 * real belt lies past Mars; the route ends there, so the event moved in) - wait for a clear corridor (days of every stock) or fly through (a chance of a hit).
 */
export const asteroidBelt: VoyageEventDef = {
  // OWNER: design - the leg (1: Moon -> Mars), the point and the chance (0.6 before the alarms
  // grew more frequent late on the leg, plan act2-stations D11).
  leg: 1,
  at: 0.65,
  chance: () => 0.7,
  speaker: 'computer',
  // OWNER: script
  title: { en: 'Asteroid belt', uk: 'Пояс астероїдів' },
  text: {
    en: 'Dense rocks ahead; wait for a corridor or fly through.',
    uk: 'Попереду щільні камені; зачекайте на коридор або пролетіть наскрізь.',
  },
  // OWNER: design - the deck station the alarm is answered at, and the choice applied when its
  // timer runs out: flying through, and the hit (oxygen -40, fuel -6 t) (plan act2-stations D3, D8).
  station: 'porthole',
  timeoutChoice: 'fly',
  choices: [
    {
      id: 'wait',
      // OWNER: script
      text: { en: 'Wait for a corridor (24 d).', uk: 'Зачекати на коридор (24 д).' },
      result: {
        en: 'A corridor opens; the ship slips through.',
        uk: 'Коридор відкривається; корабель прослизає.',
      },
      // OWNER: design - days of every stock spent waiting (GDD `evt-asteroid`: N ~ 10-15 % of the
      // leg: the leg is now 185-265 days, so 24, four times the 53-day voyage's 6; plan
      // variable-mass S9).
      effect: { waitDays: 24 },
    },
    {
      id: 'fly',
      // OWNER: script
      text: { en: 'Fly through.', uk: 'Пролетіти наскрізь.' },
      result: { en: 'Not a scratch.', uk: 'Жодної подряпини.' },
      hitResult: {
        en: 'A hit: a tank and the air line are holed.',
        uk: 'Влучання: пробито бак і повітряну магістраль.',
      },
      // OWNER: design - the chance of a hit (lower with the regolith kit's shield plates) and
      // its price: days of oxygen (four times the 53-day voyage's 10, plan variable-mass S9), and
      // a fuel leak.
      // OWNER: physics - the leak in kg (plan variable-mass D17): a holed tank. 6 t leave a
      // ship with one fuel crate (or none) too little to reach Mars, while two crates still
      // get there (the plan S9 search: 375 of 382 such Mars sets; at the 8.25 t it was, three
      // quarters of a crate, only 66 did, as the autopilot spends spare fuel on a faster
      // transfer, D20).
      risk: (ctx) => (ctx.has('regolith-kit') ? 0.3 : 0.45),
      onHit: { stocks: { oxygen: -40, fuel: -6_000 } },
    },
  ],
};
