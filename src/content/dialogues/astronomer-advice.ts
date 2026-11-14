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
      text: "Ah, the meatbag holding the stick. I am the astronomer. I chart worlds that don't care if we live or die, which makes us kindred spirits of sorts.",
      when: (s) => s.flags.get('astronomer.met') !== true,
      effect: (s) => s.flags.set('astronomer.met', true),
      next: 'question',
    },
    question: {
      speaker: 'astronomer',
      text: 'Speak quickly, traveler. The celestial mechanics are shifting, and my coffee is cooling at an alarming thermodynamic rate.',
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
      text: 'Farther means grander horizons and lonelier graves. Every kilometer from Earth costs extra panic. The GMAT trajectory analysis is unforgiving—pick a rock that matches your scientific objectives and payload requirements before the vacuum introduces itself.',
      next: 'bodies-hero',
    },
    'bodies-hero': {
      speaker: 'hero',
      text: 'And what exactly does a colony need?',
      next: 'bodies-needs',
    },
    'bodies-needs': {
      speaker: 'astronomer',
      text: "Power and thermal shielding. My science missions require precision, but your colony needs stability. Mismatch the kit to the planetary environment—that’s a system failure I can calculate in GMAT in advance, if only you'd listen.",
      next: 'bye',
    },
    'bodies-again': {
      speaker: 'astronomer',
      text: 'Closer is safe and boring; farther is glorious and fatal. Choose your poison based on your fuel reserves.',
      next: 'bye',
    },
    bye: {
      speaker: 'astronomer',
      text: 'May the solar winds blow gently past your hull. Mostly because cleaning radiation off costs my budget.',
    },
  },
});
