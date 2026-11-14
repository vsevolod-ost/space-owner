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
      text: "I'm the ship's engineer. We launch soon, so let's make the cargo count.",
      when: (s) => s.flags.get('engineer.met') !== true,
      effect: (s) => s.flags.set('engineer.met', true),
      next: 'question',
    },
    question: {
      speaker: 'engineer',
      text: 'What do you need to know?',
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
      text: "I keep the reactor, the air and the water running. If something breaks out there, it's my fault.",
      next: 'about-me-reply',
    },
    'about-me-reply': {
      speaker: 'hero',
      text: "Good to know someone's watching the engines.",
      next: 'question',
    },
    cargo: {
      speaker: 'engineer',
      text: 'Fuel decides how far we get; everything else decides how long we last. Take fuel for the distance, then air, water and food for the days.',
      next: 'cargo-gesture',
    },
    'cargo-gesture': {
      speaker: 'narrator',
      text: 'He nods toward the crate stands along the wall.',
      next: 'bye',
    },
    'cargo-again': {
      speaker: 'engineer',
      text: 'Fuel for distance, air, water and food for time. Build what the colony needs with the rest.',
      next: 'bye',
    },
    bye: {
      speaker: 'engineer',
      text: 'Good luck out there, pilot.',
    },
  },
});
