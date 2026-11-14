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
  title: 'Lost signal',
  text: 'The link to Earth is all static. The flight update is stuck. Restart the radio, or shout louder with full power.',
  // OWNER: design - the deck station the alarm is answered at, and the choice applied when its
  // timer runs out: the transmitter at full power, the dearer one (no risk: plan act2-stations
  // D3, D11).
  station: 'radio',
  timeoutChoice: 'boost',
  choices: [
    {
      id: 'reboot',
      // OWNER: script
      text: 'Restart the radio.',
      result: 'Cold restart. Link back. Earth says hello. We say hello back.',
      // OWNER: physics - days of power (small: under the 16 days of oxygen of "Seal the
      // module", plan act2-stations D11).
      effect: { stocks: { power: -6 } },
    },
    {
      id: 'boost',
      // OWNER: script
      text: 'Push the transmitter to full power.',
      result: 'Signal punches through. Batteries pay for it. Earth is loud.',
      // OWNER: physics - days of power.
      effect: { stocks: { power: -14 } },
    },
  ],
};
