import type { VoyageEventDef } from '@/core/voyage/voyageEvents';

/** E1 (GDD `evt-catalog` A): a micrometeoroid holes the hull on the way from the Moon to Mars. */
export const hullBreach: VoyageEventDef = {
  // OWNER: design - the leg (1: Moon -> Mars), the point (share of the leg) and the chance.
  leg: 1,
  at: 0.4,
  chance: () => 0.45,
  speaker: 'computer',
  // OWNER: script
  title: { en: 'Hull breach', uk: 'Пробоїна в корпусі' },
  text: {
    en: 'A micrometeoroid holed a module; air is leaking.',
    uk: 'Мікрометеорит пробив модуль; повітря витікає.',
  },
  // OWNER: design - the deck station the alarm is answered at, and the choice applied when its
  // timer runs out: the patch, and its tear (oxygen -48) (plan act2-stations D3, D8).
  station: 'airlock',
  timeoutChoice: 'patch',
  choices: [
    {
      id: 'seal',
      // OWNER: script
      text: { en: 'Seal the module off.', uk: 'Загерметизувати модуль.' },
      result: {
        en: 'The module is lost with the air in it.',
        uk: 'Модуль втрачено разом із повітрям.',
      },
      // OWNER: design - a sure price in days of oxygen (four times the 53-day voyage's 4, as
      // every stock: the voyage is now 190-270 days, plan variable-mass S9).
      effect: { stocks: { oxygen: -16 } },
    },
    {
      id: 'patch',
      // OWNER: script
      text: { en: 'Patch it from outside.', uk: 'Залатати ззовні.' },
      result: { en: 'The patch holds.', uk: 'Латка тримається.' },
      hitResult: {
        en: 'The patch tore; much air is gone.',
        uk: 'Латку зірвало; багато повітря втрачено.',
      },
      // OWNER: design - the chance it goes wrong, and the loss then (days: four times the
      // 53-day voyage's 12, plan variable-mass S9).
      risk: () => 0.5,
      onHit: { stocks: { oxygen: -48 } },
    },
    {
      id: 'foam',
      // OWNER: script
      text: { en: 'Fill it with the regolith kit foam.', uk: 'Заповнити піною з набору реголіту.' },
      needs: { en: 'Regolith kit', uk: 'Набір реголіту' },
      result: {
        en: 'The foam sets; little air lost.',
        uk: 'Піна застигла; повітря втрачено мало.',
      },
      when: (ctx) => ctx.has('regolith-kit'),
      // OWNER: design - days of oxygen (four times the 53-day voyage's 1, plan variable-mass S9).
      effect: { stocks: { oxygen: -4 } },
    },
  ],
};
