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
      text: {
        en: "Oh, look. Another genius sent to test my life-support tolerance. I'm the engineer. If the air tastes like old socks or the reactor sings opera, blame me later. Right now, load the crates.",
        uk: 'О, дивіться. Ще один геній, надісланий перевірити мою стійкість до несправностей системи життєзабезпечення. Я інженер. Якщо повітря на смак як старі шкарпетки, а реактор співає оперу — звинувачуйте мене пізніше. А зараз — завантажуйте контейнери.',
      },
      when: (s) => s.flags.get('engineer.met') !== true,
      effect: (s) => s.flags.set('engineer.met', true),
      next: 'question',
    },
    question: {
      speaker: 'engineer',
      text: {
        en: 'Make it fast, pilot. My gaskets are crying and my coffee is getting cold in spirit.',
        uk: 'Швидше, пілоте. Мої прокладки ридають, а кава холоне в душі.',
      },
      choices: [
        { text: { en: 'Who are you?', uk: 'Хто ти такий?' }, next: 'about-me' },
        {
          text: { en: 'What cargo should I take?', uk: 'Який вантаж мені взяти?' },
          when: (s) => !gaveCargoAdvice(s),
          effect: (s) => s.flags.set('advice.engineer.cargo', true),
          next: 'cargo',
        },
        {
          text: { en: 'Remind me about the cargo.', uk: 'Нагадай про вантаж.' },
          when: gaveCargoAdvice,
          next: 'cargo-again',
        },
        { text: { en: "That's all, thanks.", uk: 'Це все, дякую.' }, next: 'bye' },
      ],
    },
    'about-me': {
      speaker: 'engineer',
      text: {
        en: "I am the duct-tape deity of this tin can. I keep the reactor from becoming a second sun and the water recycled from things you really don't want to audit. I treat every mission concept as a CML-1 fantasy until I've run it through the MDL trade studies and verified the hard engineering. Any other philosophical inquiries?",
        uk: 'Я бог ізоляційної стрічки цієї бляшанки. Я не даю реактору стати другим сонцем і фільтрую воду з того, про що вам краще не знати. Я сприймаю будь-яку концепцію місії як фантазію рівня CML-1, поки не пропущу її через техніко-економічне обґрунтування MDL і не перевірю інженерну частину. Маєте ще філософські питання?',
      },
      next: 'about-me-reply',
    },
    'about-me-reply': {
      speaker: 'hero',
      text: {
        en: 'Reassuring as always. Keep the pipes clean.',
        uk: 'Як завжди заспокоюєш. Тримай труби в чистоті.',
      },
      next: 'question',
    },
    cargo: {
      speaker: 'engineer',
      text: {
        en: "Listen close because I hate repeating myself. It's all one big trade study, pilot: fuel is your launch segment, life support is your space segment. Overload the space segment, and the launch segment can't get you out of the gravity well. The ship doesn't care about your ambitions if you don't have the mass-margin to survive.",
        uk: 'Слухай уважно, бо я ненавиджу повторюватися. Усе це — одне велике технічне завдання, пілоте: паливо — це ваш етап запуску, життєзабезпечення — космічний етап. Перевантаж космічний сегмент, і ти не вирвешся з гравітаційної пастки. Кораблю байдуже до ваших амбіцій, якщо у вас немає запасу маси, щоб вижити.',
      },
      next: 'cargo-gesture',
    },
    'cargo-gesture': {
      speaker: 'narrator',
      text: {
        en: 'He kicks a stray hydraulic wrench across the concrete and scowls at the cargo stands.',
        uk: 'Він відштовхує ногою випадковий гідравлічний ключ і хмуриться на вантажні стелажі.',
      },
      next: 'bye',
    },
    'cargo-again': {
      speaker: 'engineer',
      text: {
        en: 'Fuel for distance, stocks for survival. Did stuttering become my new feature overnight? Go load up.',
        uk: 'Паливо для дистанції, запаси для виживання. Невже я заїкаюся? Іди завантажуйся.',
      },
      next: 'bye',
    },
    bye: {
      speaker: 'engineer',
      text: {
        en: "Don't die out there. Replacing pilots is paperwork, and I hate paperwork.",
        uk: 'Не вмри там. Заміна пілотів — це паперова тяганина, а я її терпіти не можу.',
      },
    },
  },
});
