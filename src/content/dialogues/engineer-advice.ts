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
      text: '[TODO: the engineer meets the hero for the first time and says who he is]',
      when: (s) => s.flags.get('engineer.met') !== true,
      effect: (s) => s.flags.set('engineer.met', true),
      next: 'question',
    },
    question: {
      speaker: 'engineer',
      text: '[TODO: what do you want to know?]',
      choices: [
        { text: '[TODO: ask about the engineer]', next: 'about-me' },
        {
          text: '[TODO: ask what cargo to take]',
          when: (s) => !gaveCargoAdvice(s),
          effect: (s) => s.flags.set('advice.engineer.cargo', true),
          next: 'cargo',
        },
        { text: '[TODO: ask about the cargo again]', when: gaveCargoAdvice, next: 'cargo-again' },
        { text: '[TODO: say goodbye]', next: 'bye' },
      ],
    },
    'about-me': {
      speaker: 'engineer',
      text: '[TODO: the engineer about himself]',
      next: 'about-me-reply',
    },
    'about-me-reply': {
      speaker: 'hero',
      text: '[TODO: the hero replies]',
      next: 'question',
    },
    cargo: {
      speaker: 'engineer',
      text: '[TODO: advice on the cargo: fuel decides how far, the rest how long]',
      next: 'cargo-gesture',
    },
    'cargo-gesture': {
      speaker: 'narrator',
      text: '[TODO: the engineer nods towards the crates]',
      next: 'bye',
    },
    'cargo-again': {
      speaker: 'engineer',
      text: '[TODO: the cargo advice in short]',
      next: 'bye',
    },
    bye: {
      speaker: 'engineer',
      text: '[TODO: good luck]',
    },
  },
});
