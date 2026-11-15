import type { Cutscene } from '@/core/cutscene/types';
import { RUN_FLAGS } from '@/core/flow/runFlags';
import { bodyName } from '@/core/locale/names';
import { tr, type LocalText } from '@/core/locale/text';
import type { FlagValue, GameState } from '@/core/state/GameState';
import { formatText, type StateText } from '@/core/text/format';

/**
 * The moment of black before the booth shows (GDD `loop-scene-format` A: a ritual <= 2 s from
 * the loss to the first line, with `LOSS_BEAT_MS` in src/core/flow/FlowService.ts and the
 * driver's fade). OWNER: design
 */
const RITUAL_MS = 200;
/** The fade into the booth and out of it, ms. OWNER: design */
const FADE_MS = 400;

/** The scientists' lines for one cause: the engineer, the astronomer, the engineer again. */
interface DebriefLines {
  what: LocalText;
  why: LocalText;
  advice: LocalText;
}

/**
 * Lines by cause (`run.lastCause`: a `DeathCause` or `abort`); `{cause}`, `{gate}` (the last gate
 * reached, or the Earth), `{next}` (the body flown to) and `{day}` are filled in. A cause
 * without lines (an event's death, `event:<id>`) gets `GENERIC`.
 * OWNER: script - every line.
 */
const LINES: Readonly<Record<string, DebriefLines>> = {
  hypoxia: {
    what: {
      en: 'User Segment analysis: The air ran out on day {day}, on the way from {gate} to {next}.',
      uk: 'Аналіз користувацького сегмента: повітря закінчилося на {day} день на шляху від {gate} до {next}.',
    },
    why: {
      en: 'The space segment oxygen supply failed the trade study; life support did not last the leg.',
      uk: 'Запас кисню космічного сегмента не пройшов перевірку технічних вимог; система життєзабезпечення не витримала перельоту.',
    },
    advice: {
      en: 'MDL recommendation: An oxygen crate or greenhouse is required for this mission concept.',
      uk: 'Рекомендація MDL: Для цієї концепції місії необхідний контейнер з киснем або оранжерея.',
    },
  },
  dehydration: {
    what: {
      en: 'User Segment analysis: The water ran out on day {day}, on the way from {gate} to {next}.',
      uk: 'Аналіз користувацького сегмента: вода закінчилася на {day} день на шляху від {gate} до {next}.',
    },
    why: {
      en: 'The water stock was too short for so long a flight.',
      uk: 'Запас води був замалим для такого тривалого перельоту.',
    },
    advice: {
      en: 'Take supplies or the greenhouse next time.',
      uk: 'Наступного разу візьміть запаси або оранжерею.',
    },
  },
  starvation: {
    what: {
      en: 'User Segment analysis: The food ran out on day {day}, on the way from {gate} to {next}.',
      uk: 'Аналіз користувацького сегмента: їжа закінчилася на {day} день на шляху від {gate} до {next}.',
    },
    why: {
      en: 'The food stock was too short for so long a flight.',
      uk: 'Запас їжі був занадто малим для такого тривалого перельоту.',
    },
    advice: {
      en: 'Take supplies or the greenhouse next time.',
      uk: 'Наступного разу візьміть запаси або оранжерею.',
    },
  },
  frozen: {
    what: {
      en: 'User Segment analysis: The ship froze on day {day}, on the way from {gate} to {next}.',
      uk: 'Аналіз користувацького сегмента: корабель замерз на {day} день на шляху від {gate} до {next}.',
    },
    why: {
      en: 'Without power the space segment heaters stopped.',
      uk: 'Без енергії нагрівачі космічного сегмента зупинилися.',
    },
    advice: {
      en: 'Power: the reactor, batteries or solar panels near the Sun.',
      uk: 'Енергія: реактор, батареї або сонячні панелі поблизу Сонця.',
    },
  },
  drift: {
    what: {
      en: 'User Segment analysis: The fuel ran out after {gate}; the ship drifted past {next}.',
      uk: 'Аналіз користувацького сегмента: паливо закінчилося після {gate}; корабель пройшов повз {next} за інерцією.',
    },
    why: {
      en: 'The trajectory model said the fuel would not reach the next gate.',
      uk: 'Модель траєкторії показала, що палива не вистачить до наступних воріт.',
    },
    advice: {
      en: 'More fuel, or stop where the fuel still reaches.',
      uk: 'Більше палива, або зупиніться там, куди паливо ще дозволяє дістатися.',
    },
  },
  abort: {
    what: {
      en: 'Ground Segment report: You turned back on day {day}, on the way from {gate} to {next}.',
      uk: 'Звіт наземного сегмента: ви повернули назад на {day} день на шляху від {gate} до {next}.',
    },
    why: {
      en: 'No harm done; the cargo is still in the bays.',
      uk: 'Жодної шкоди; вантаж усе ще у відсіках.',
    },
    advice: {
      en: 'Change what you take and fly again.',
      uk: 'Змініть те, що берете, і летить знову.',
    },
  },
};

/** Lines of a cause the table does not know. OWNER: script */
const GENERIC: DebriefLines = {
  what: {
    en: 'We lost the ship on day {day}, on the way from {gate} to {next}: {cause}.',
    uk: 'Ми втратили корабель на {day} день на шляху від {gate} до {next}: {cause}.',
  },
  why: { en: 'The flight log says: {cause}.', uk: 'Бортовий журнал каже: {cause}.' },
  advice: { en: 'Think over the cargo and try again.', uk: 'Продумайте вантаж і спробуйте знову.' },
};

/**
 * How a cause reads in `{cause}` (only `GENERIC` uses it: an event's death). Each word is in the
 * nominative (plan uk-localization D5). OWNER: script
 */
const CAUSE_WORDS: Readonly<Record<string, LocalText>> = {
  'event:hull-breach': { en: 'hull breach', uk: 'пробоїна в корпусі' },
  'event:asteroid-belt': { en: 'asteroid belt', uk: 'пояс астероїдів' },
  'event:reactor-failure': { en: 'reactor failure', uk: 'збій реактора' },
  'event:dusty-panels': { en: 'dusty panels', uk: 'запилені панелі' },
  'event:lost-signal': { en: 'lost signal', uk: 'втрата сигналу' },
  'event:solar-flare': { en: 'solar flare', uk: 'сонячний спалах' },
  'event:greenhouse-leak': { en: 'greenhouse leak', uk: 'витік в оранжереї' },
};

/** `{gate}` when no gate was reached yet. OWNER: script */
const NO_GATE: LocalText = { en: 'the Earth', uk: 'Землі' };
/** `{next}` when the body flown to is not known. OWNER: script */
const NO_NEXT: LocalText = { en: 'the Moon', uk: 'Місяця' };

/**
 * How a cause reads in a line: its `CAUSE_WORDS` entry, else words from the id
 * (`event:reactor-failure` -> `reactor failure`).
 */
function causeWords(cause: string): string {
  if (Object.hasOwn(CAUSE_WORDS, cause)) return tr(CAUSE_WORDS[cause]);
  return cause.replace(/^event:/, '').replaceAll('-', ' ');
}

/**
 * The name of body id `body` (a `run.*` flag) in the current language: `fallback` when there is
 * no body, the id itself when nobody registered it.
 */
function bodyText(body: FlagValue | undefined, fallback: LocalText): string {
  if (typeof body !== 'string' || !body) return tr(fallback);
  const name = bodyName(body);
  return name ? tr(name) : body;
}

/** The line `part` for the last lost voyage, from the `run.*` flags. */
function line(part: keyof DebriefLines): StateText {
  return (s: GameState) => {
    const flags = s.flags;
    const cause = String(flags.get(RUN_FLAGS.lastCause) ?? '');
    const lines = Object.hasOwn(LINES, cause) ? LINES[cause] : GENERIC;
    return formatText(tr(lines[part]), {
      cause: causeWords(cause),
      gate: bodyText(flags.get(RUN_FLAGS.lastGateBody), NO_GATE),
      next: bodyText(flags.get(RUN_FLAGS.lastNextBody), NO_NEXT),
      // `run.lastDay` is the whole simulated day (from 0); the panel counts from 1.
      day: Number(flags.get(RUN_FLAGS.lastDay) ?? 0) + 1,
    });
  };
}

/**
 * The scientists' debrief after a lost voyage (plan D18, GDD D7, `loop-scene-format` A):
 * played by `flow.die` on the warehouse's black screen. The scientists stand in their booth
 * (`post-1`, `post-2`), the hero before it (`debrief`); a moment of black, then three lines on
 * the cause (`run.lastCause`, `run.lastGateBody`, `run.lastNextBody`, `run.lastDay`); a fade,
 * and the hero stands at the hatch (`spawn-hatch`) with the scientists back at their places.
 */
export const debrief: Cutscene = {
  async run(api) {
    // Black at once, whoever started it: the scientists move to the booth unseen.
    await api.fadeOut(0);
    api.teleport('npc-engineer', 'post-1');
    api.teleport('npc-astronomer', 'post-2');
    api.face('npc-engineer', 'down');
    api.face('npc-astronomer', 'down');
    api.face('player', 'up');
    await api.wait(RITUAL_MS);
    await api.fadeIn(FADE_MS);

    await api.say('engineer', line('what'));
    await api.say('astronomer', line('why'));
    await api.say('engineer', line('advice'));

    await api.fadeOut(FADE_MS);
    api.teleport('npc-engineer', api.homeOf('npc-engineer'));
    api.teleport('npc-astronomer', api.homeOf('npc-astronomer'));
    api.face('npc-engineer', 'down');
    api.face('npc-astronomer', 'down');
    api.teleport('player', 'spawn-hatch');
    api.face('player', 'right');
    await api.fadeIn(FADE_MS);
  },
};
