import type { VoyageEventDef } from '@/core/voyage/voyageEvents';

/**
 * A late-leg event at the radio (plan act2-stations D10, D11): the link to the Earth drops to
 * static between the Moon and Mars - restart the radio, or push the transmitter to full power.
 * A placeholder for the team: theme, texts and numbers are to be rewritten.
 */
export const lostSignal: VoyageEventDef = {
  // OWNER: design - the leg (1: Moon -> Mars), the point and the chance (late on the leg, where
  // the alarms come more often: plan act2-stations D11).
  leg: 1,
  at: 0.55,
  chance: () => 0.65,
  speaker: 'computer',
  // OWNER: script
  title: { en: 'Lost signal', uk: 'Втрачений сигнал' },
  text: {
    en: 'The link to Earth is all static. The flight update is stuck. Restart the radio, or shout louder with full power.',
    uk: 'Зв’язок із Землею — суцільний тріск. Оновлення польоту застрягло. Перезапусти радіо або гукай гучніше на повній потужності.',
  },
  // OWNER: design - the deck station the alarm is answered at, and the choice applied when its
  // timer runs out: the transmitter at full power, the dearer one (no risk: plan act2-stations
  // D3, D11).
  station: 'radio',
  timeoutChoice: 'boost',
  choices: [
    {
      id: 'reboot',
      // OWNER: script
      text: { en: 'Restart the radio.', uk: 'Перезапустити радіо.' },
      result: {
        en: 'Cold restart. Link back. Earth says hello. We say hello back.',
        uk: 'Холодний перезапуск. Зв’язок повернувся. Земля вітається. Ми відповідаємо.',
      },
      // OWNER: physics - days of power (small: under the 16 days of oxygen of "Seal the
      // module", plan act2-stations D11).
      effect: { stocks: { power: -6 } },
    },
    {
      id: 'boost',
      // OWNER: script
      text: {
        en: 'Push the transmitter to full power.',
        uk: 'Витиснути з передавача повну потужність.',
      },
      result: {
        en: 'Signal punches through. Batteries pay for it. Earth is loud.',
        uk: 'Сигнал пробивається. Батареї за це платять. Земля чути гучно.',
      },
      // OWNER: physics - days of power.
      effect: { stocks: { power: -14 } },
    },
  ],
};
