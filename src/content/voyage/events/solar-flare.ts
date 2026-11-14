import { TODO } from '@/core/locale/text';
import type { VoyageEventDef } from '@/core/voyage/voyageEvents';

/**
 * A late-leg event at the porthole (plan act2-stations D10, D11): a flare lights up the Sun's
 * side of the sky - the crew sits the radiation storm out in the shelter, or keeps working and
 * some food is spoiled. A placeholder for the team: theme, texts and numbers are to be
 * rewritten.
 */
export const solarFlare: VoyageEventDef = {
  // OWNER: design - the leg (1: Moon -> Mars), the point and the chance (late on the leg, where
  // the alarms come more often: plan act2-stations D11).
  leg: 1,
  at: 0.75,
  chance: () => 0.6,
  speaker: 'computer',
  // OWNER: script
  title: { en: 'Solar flare', uk: TODO },
  text: {
    en: 'A flare just lit up the Sun side of the sky. A radiation storm is rolling in. The shelter is that way; the work is this way. Your call, pilot.',
    uk: TODO,
  },
  // OWNER: design - the deck station the alarm is answered at, and the choice applied when its
  // timer runs out: working on through the storm, the dearer one (no risk: plan act2-stations
  // D3, D11).
  station: 'porthole',
  timeoutChoice: 'work-on',
  choices: [
    {
      id: 'shelter',
      // OWNER: script
      text: { en: 'Sit it out in the storm shelter.', uk: TODO },
      result: {
        en: 'The storm passes. Cold meals in the shelter. Nobody glowed. Probably.',
        uk: TODO,
      },
      // OWNER: physics - days of food (small: under the 16 days of oxygen of "Seal the
      // module", plan act2-stations D11).
      effect: { stocks: { food: -6 } },
    },
    {
      id: 'work-on',
      // OWNER: script
      text: { en: 'Keep working through it.', uk: TODO },
      result: {
        en: 'The radiation spoiled part of the food stores. The crew did not glow. Much.',
        uk: TODO,
      },
      // OWNER: physics - days of food.
      effect: { stocks: { food: -14 } },
    },
  ],
};
