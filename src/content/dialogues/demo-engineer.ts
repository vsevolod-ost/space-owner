import { defineDialogue } from '@/core/dialogue/types';
import type { GameState } from '@/core/state/GameState';

/** Whether the engineer has already told the hero about the ship. */
const toldAboutShip = (s: GameState): boolean => s.flags.get('engineer.toldAboutShip') === true;

/**
 * The engineer in the demo corridor. The first visit opens with `greeting` (it sets
 * `engineer.met`); later visits skip it and start at `question`. Picking "Tell me about the
 * ship." sets `engineer.toldAboutShip`, after which that option is replaced by a reminder.
 */
export const demoEngineer = defineDialogue({
  start: 'greeting',
  nodes: {
    greeting: {
      speaker: 'engineer',
      text: "Oh, a new face! You must be the recruit they sent up. I'm the station engineer.",
      when: (s) => s.flags.get('engineer.met') !== true,
      effect: (s) => s.flags.set('engineer.met', true),
      next: 'question',
    },
    question: {
      speaker: 'engineer',
      text: 'So, what do you want to know?',
      choices: [
        { text: 'Who are you, exactly?', next: 'about-me' },
        {
          text: 'Tell me about the ship.',
          when: (s) => !toldAboutShip(s),
          effect: (s) => s.flags.set('engineer.toldAboutShip', true),
          next: 'about-ship',
        },
        { text: 'Where was the ship again?', when: toldAboutShip, next: 'ship-again' },
        { text: 'Nothing. See you later.', next: 'bye' },
      ],
    },
    'about-me': {
      speaker: 'engineer',
      text: 'I keep this station breathing: air, power, the lot. Nobody notices until it breaks.',
      next: 'about-me-reply',
    },
    'about-me-reply': {
      speaker: 'hero',
      text: 'Sounds like a lot of work.',
      next: 'question',
    },
    'about-ship': {
      speaker: 'engineer',
      text: "She's docked past the room on the right. Old, but she flies. The captain is waiting.",
      next: 'about-ship-gesture',
    },
    'about-ship-gesture': {
      speaker: 'narrator',
      text: 'The engineer nods towards the door at the end of the corridor.',
      next: 'bye',
    },
    'ship-again': {
      speaker: 'engineer',
      text: "Through the door on the right. Don't keep the captain waiting.",
      next: 'bye',
    },
    bye: {
      speaker: 'engineer',
      text: 'Good luck out there.',
    },
  },
});
