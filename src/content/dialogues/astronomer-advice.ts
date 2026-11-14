import { defineDialogue } from '@/core/dialogue/types';
import type { GameState } from '@/core/state/GameState';

/** Whether the astronomer has already told the hero about the bodies on the way. */
const gaveBodiesAdvice = (s: GameState): boolean =>
  s.flags.get('advice.astronomer.bodies') === true;

/**
 * The astronomer in the warehouse (placeholder lines): knows the bodies on the way and what
 * a colony needs there; the engineer knows the ship (GDD `act1-knowledge-map` A, D16). The
 * first visit opens with `greeting` (it sets `astronomer.met`); later visits start at
 * `question`. The bodies question sets `advice.astronomer.bodies` (advice flags survive deaths,
 * plan D17), after which it is replaced by a reminder.
 * OWNER: script
 */
export const astronomerAdvice = defineDialogue({
  start: 'greeting',
  nodes: {
    greeting: {
      speaker: 'astronomer',
      text: '[TODO: the astronomer meets the hero for the first time and says who they are]',
      when: (s) => s.flags.get('astronomer.met') !== true,
      effect: (s) => s.flags.set('astronomer.met', true),
      next: 'question',
    },
    question: {
      speaker: 'astronomer',
      text: '[TODO: what do you want to know?]',
      choices: [
        {
          text: '[TODO: ask where to settle]',
          when: (s) => !gaveBodiesAdvice(s),
          effect: (s) => s.flags.set('advice.astronomer.bodies', true),
          next: 'bodies',
        },
        {
          text: '[TODO: ask about the bodies again]',
          when: gaveBodiesAdvice,
          next: 'bodies-again',
        },
        { text: '[TODO: say goodbye]', next: 'bye' },
      ],
    },
    bodies: {
      speaker: 'astronomer',
      text: '[TODO: the farther the body, the better the colony, if the cargo can build it]',
      next: 'bodies-hero',
    },
    'bodies-hero': {
      speaker: 'hero',
      text: '[TODO: the hero asks what a colony needs]',
      next: 'bodies-needs',
    },
    'bodies-needs': {
      speaker: 'astronomer',
      text: '[TODO: power and warmth out there; the colony kits fit their own bodies]',
      next: 'bye',
    },
    'bodies-again': {
      speaker: 'astronomer',
      text: '[TODO: the bodies advice in short]',
      next: 'bye',
    },
    bye: {
      speaker: 'astronomer',
      text: '[TODO: clear skies]',
    },
  },
});
