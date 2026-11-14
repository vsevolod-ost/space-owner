import { defineDialogue } from '@/core/dialogue/types';
import type { GameState } from '@/core/state/GameState';

/** Whether the engineer has already given his advice on the cargo. */
const gaveCargoAdvice = (s: GameState): boolean => s.flags.get('advice.engineer.cargo') === true;

/**
 * The engineer in the warehouse (placeholder lines; the real advice comes with the warehouse
 * mechanics). The first visit opens with `greeting` (it sets `engineer.met`); later visits
 * skip it and start at `question`. The cargo question sets `advice.engineer.cargo` (advice
 * flags survive deaths, plan D17), after which it is replaced by a reminder.
 * OWNER: script
 */
export const engineerAdvice = defineDialogue({
  start: 'greeting',
  nodes: {
    greeting: {
      speaker: 'engineer',
      text: "Oh, look. Another genius sent to test my life-support tolerance. I'm the engineer. If the air tastes like old socks or the reactor sings opera, blame me later. Right now, load the crates.",
      when: (s) => s.flags.get('engineer.met') !== true,
      effect: (s) => s.flags.set('engineer.met', true),
      next: 'question',
    },
    question: {
      speaker: 'engineer',
      text: 'Make it fast, pilot. My gaskets are crying and my coffee is getting cold in spirit.',
      choices: [
        { text: 'Who are you?', next: 'about-me' },
        {
          text: 'What cargo should I take?',
          when: (s) => !gaveCargoAdvice(s),
          effect: (s) => s.flags.set('advice.engineer.cargo', true),
          next: 'cargo',
        },
        { text: 'Remind me about the cargo.', when: gaveCargoAdvice, next: 'cargo-again' },
        { text: "That's all, thanks.", next: 'bye' },
      ],
    },
    'about-me': {
      speaker: 'engineer',
      text: "I am the duct-tape deity of this tin can. I keep the reactor from becoming a second sun and the water recycled from things you really don't want to audit. I treat every mission concept as a CML-1 fantasy until I've run it through the MDL trade studies and verified the hard engineering. Any other philosophical inquiries?",
      next: 'about-me-reply',
    },
    'about-me-reply': {
      speaker: 'hero',
      text: 'Reassuring as always. Keep the pipes clean.',
      next: 'question',
    },
    cargo: {
      speaker: 'engineer',
      text: "Listen close because I hate repeating myself. It's all one big trade study, pilot: fuel is your launch segment, life support is your space segment. Overload the space segment, and the launch segment can't get you out of the gravity well. The ship doesn't care about your ambitions if you don't have the mass-margin to survive.",
      next: 'cargo-gesture',
    },
    'cargo-gesture': {
      speaker: 'narrator',
      text: 'He kicks a stray hydraulic wrench across the concrete and scowls at the cargo stands.',
      next: 'bye',
    },
    'cargo-again': {
      speaker: 'engineer',
      text: 'Fuel for distance, stocks for survival. Did stuttering become my new feature overnight? Go load up.',
      next: 'bye',
    },
    bye: {
      speaker: 'engineer',
      text: "Don't die out there. Replacing pilots is paperwork, and I hate paperwork.",
    },
  },
});
