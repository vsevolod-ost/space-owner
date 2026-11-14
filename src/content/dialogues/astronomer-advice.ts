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
      text: "I'm the astronomer. I know the bodies on our route and what a colony needs there.",
      when: (s) => s.flags.get('astronomer.met') !== true,
      effect: (s) => s.flags.set('astronomer.met', true),
      next: 'question',
    },
    question: {
      speaker: 'astronomer',
      text: 'What would you like to know?',
      choices: [
        {
          text: 'Where should we settle?',
          when: (s) => !gaveBodiesAdvice(s),
          effect: (s) => s.flags.set('advice.astronomer.bodies', true),
          next: 'bodies',
        },
        {
          text: 'Remind me about the bodies.',
          when: gaveBodiesAdvice,
          next: 'bodies-again',
        },
        { text: "That's all, thank you.", next: 'bye' },
      ],
    },
    bodies: {
      speaker: 'astronomer',
      text: 'The farther the body, the better the colony can be - if the cargo can build it.',
      next: 'bodies-hero',
    },
    'bodies-hero': {
      speaker: 'hero',
      text: 'What does a colony need out there?',
      next: 'bodies-needs',
    },
    'bodies-needs': {
      speaker: 'astronomer',
      text: 'Power and warmth. The colony kits are made for their own bodies, so match the kit to the world.',
      next: 'bye',
    },
    'bodies-again': {
      speaker: 'astronomer',
      text: 'Fly farther if the cargo can support it; nearer worlds need less.',
      next: 'bye',
    },
    bye: {
      speaker: 'astronomer',
      text: 'Clear skies, pilot.',
    },
  },
});
