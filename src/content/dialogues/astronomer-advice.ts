import { defineDialogue } from '@/core/dialogue/types';
import type { GameState } from '@/core/state/GameState';

/** Whether the astronomer has already told the hero about the bodies on the way. */
const gaveBodiesAdvice = (s: GameState): boolean =>
  s.flags.get('advice.astronomer.bodies') === true;

/**
 * The astronomer in the warehouse: knows the bodies on the way and what
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
        uk: 'А, мішок із м’ясом, що тримає штурвал. Я астроном. Я картографую світи, яким байдуже, живемо ми чи вмираємо, що робить нас певною мірою спорідненими душами.',
      },
      when: (s) => s.flags.get('astronomer.met') !== true,
      effect: (s) => s.flags.set('astronomer.met', true),
      next: 'question',
    },
    question: {
      speaker: 'astronomer',
      text: {
        en: 'Speak quickly, traveler. The celestial mechanics are shifting, and my coffee is cooling at an alarming thermodynamic rate.',
        uk: 'Говори швидше, мандрівнику. Небесна механіка змінюється, а моя кава остигає з тривожною термодинамічною швидкістю.',
      },
      choices: [
        {
          text: { en: 'Where should we settle?', uk: 'Де нам оселитися?' },
          when: (s) => !gaveBodiesAdvice(s),
          effect: (s) => s.flags.set('advice.astronomer.bodies', true),
          next: 'bodies',
        },
        {
          text: { en: 'Remind me about the bodies.', uk: 'Нагадай про небесні тіла.' },
          when: gaveBodiesAdvice,
          next: 'bodies-again',
        },
        { text: { en: "That's all, thank you.", uk: 'Це все, дякую.' }, next: 'bye' },
      ],
    },
    bodies: {
      speaker: 'astronomer',
      text: {
        en: 'Farther means grander horizons and lonelier graves. Every kilometer from Earth costs extra panic. The GMAT trajectory analysis is unforgiving—pick a rock that matches your scientific objectives and payload requirements before the vacuum introduces itself.',
        uk: 'Далі означає величніші горизонти і самотніші могили. Кожен кілометр від Землі коштує додаткової паніки. Аналіз траєкторії GMAT не прощає помилок — обери камінь, який відповідає твоїм науковим цілям та вимогам до корисного навантаження, поки вакуум не заявив про себе особисто.',
      },
      next: 'bodies-hero',
    },
    'bodies-hero': {
      speaker: 'hero',
      text: { en: 'And what exactly does a colony need?', uk: 'А що саме потрібно колонії?' },
      next: 'bodies-needs',
    },
    'bodies-needs': {
      speaker: 'astronomer',
      text: {
        en: "Power and thermal shielding. My science missions require precision, but your colony needs stability. Mismatch the kit to the planetary environment—that’s a system failure I can calculate in GMAT in advance, if only you'd listen.",
        uk: 'Енергія та тепловий захист. Мої наукові місії вимагають точності, але вашій колонії потрібна стабільність. Невідповідність обладнання планетарному середовищу — це системний збій, який я можу заздалегідь розрахувати в GMAT, якби ви лише прислухалися.',
      },
      next: 'bye',
    },
    'bodies-again': {
      speaker: 'astronomer',
      text: {
        en: 'Closer is safe and boring; farther is glorious and fatal. Choose your poison based on your fuel reserves.',
        uk: 'Ближче — безпечно і нудно; далі — славетно й фатально. Обирай своє отруєння залежно від запасів палива.',
      },
      next: 'bye',
    },
    bye: {
      speaker: 'astronomer',
      text: {
        en: 'May the solar winds blow gently past your hull. Mostly because cleaning radiation off costs my budget.',
        uk: 'Хай сонячні вітри м’яко обдувають ваш корпус. Здебільшого тому, що очищення від радіації б’є по моєму бюджету.',
      },
    },
  },
});
