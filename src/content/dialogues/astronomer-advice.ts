import { defineDialogue } from '@/core/dialogue/types';
import { TODO } from '@/core/locale/text';
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
      text: {
        en: "Ah, the meatbag holding the stick. I am the astronomer. I chart worlds that don't care if we live or die, which makes us kindred spirits of sorts.",
        uk: TODO,
      },
      when: (s) => s.flags.get('astronomer.met') !== true,
      effect: (s) => s.flags.set('astronomer.met', true),
      next: 'question',
    },
    question: {
      speaker: 'astronomer',
      text: {
        en: 'Speak quickly, traveler. The celestial mechanics are shifting, and my coffee is cooling at an alarming thermodynamic rate.',
        uk: TODO,
      },
      choices: [
        {
          text: { en: 'Where should we settle?', uk: TODO },
          when: (s) => !gaveBodiesAdvice(s),
          effect: (s) => s.flags.set('advice.astronomer.bodies', true),
          next: 'bodies',
        },
        {
          text: { en: 'Remind me about the bodies.', uk: TODO },
          when: gaveBodiesAdvice,
          next: 'bodies-again',
        },
        { text: { en: "That's all, thank you.", uk: TODO }, next: 'bye' },
      ],
    },
    bodies: {
      speaker: 'astronomer',
      text: {
        en: 'Farther means grander horizons and lonelier graves. Every kilometer from Earth costs extra panic. The GMAT trajectory analysis is unforgiving—pick a rock that matches your scientific objectives and payload requirements before the vacuum introduces itself.',
        uk: TODO,
      },
      next: 'bodies-hero',
    },
    'bodies-hero': {
      speaker: 'hero',
      text: { en: 'And what exactly does a colony need?', uk: TODO },
      next: 'bodies-needs',
    },
    'bodies-needs': {
      speaker: 'astronomer',
      text: {
        en: "Power and thermal shielding. My science missions require precision, but your colony needs stability. Mismatch the kit to the planetary environment—that’s a system failure I can calculate in GMAT in advance, if only you'd listen.",
        uk: TODO,
      },
      next: 'bye',
    },
    'bodies-again': {
      speaker: 'astronomer',
      text: {
        en: 'Closer is safe and boring; farther is glorious and fatal. Choose your poison based on your fuel reserves.',
        uk: TODO,
      },
      next: 'bye',
    },
    bye: {
      speaker: 'astronomer',
      text: {
        en: 'May the solar winds blow gently past your hull. Mostly because cleaning radiation off costs my budget.',
        uk: TODO,
      },
    },
  },
});
