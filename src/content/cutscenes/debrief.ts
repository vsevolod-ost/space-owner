import type { Cutscene } from '@/core/cutscene/types';
import { RUN_FLAGS } from '@/core/flow/runFlags';
import type { GameState } from '@/core/state/GameState';
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
  what: string;
  why: string;
  advice: string;
}

/**
 * Lines by cause (`run.lastCause`: a `DeathCause` or `abort`); `{cause}`, `{gate}` (the last gate
 * reached, or the Earth), `{next}` (the body flown to) and `{day}` are filled in. A cause
 * without lines (an event's death, `event:<id>`) gets `GENERIC`.
 * OWNER: script - every line.
 */
const LINES: Readonly<Record<string, DebriefLines>> = {
  hypoxia: {
    what: 'User Segment analysis: The air ran out on day {day}, on the way from {gate} to {next}.',
    why: 'The space segment oxygen supply failed the trade study; life support did not last the leg.',
    advice:
      'MDL recommendation: An oxygen crate or greenhouse is required for this mission concept.',
  },
  dehydration: {
    what: 'User Segment analysis: The water ran out on day {day}, on the way from {gate} to {next}.',
    why: 'The water stock was too short for so long a flight.',
    advice: 'Take supplies or the greenhouse next time.',
  },
  starvation: {
    what: 'User Segment analysis: The food ran out on day {day}, on the way from {gate} to {next}.',
    why: 'The food stock was too short for so long a flight.',
    advice: 'Take supplies or the greenhouse next time.',
  },
  frozen: {
    what: 'User Segment analysis: The ship froze on day {day}, on the way from {gate} to {next}.',
    why: 'Without power the space segment heaters stopped.',
    advice: 'Power: the reactor, batteries or solar panels near the Sun.',
  },
  drift: {
    what: 'User Segment analysis: The fuel ran out after {gate}; the ship drifted past {next}.',
    why: 'The trajectory model said the fuel would not reach the next gate.',
    advice: 'More fuel, or stop where the fuel still reaches.',
  },
  abort: {
    what: 'Ground Segment report: You turned back on day {day}, on the way from {gate} to {next}.',
    why: 'No harm done; the cargo is still in the bays.',
    advice: 'Change what you take and fly again.',
  },
};

/** Lines of a cause the table does not know. OWNER: script */
const GENERIC: DebriefLines = {
  what: 'We lost the ship on day {day}, on the way from {gate} to {next}: {cause}.',
  why: 'The flight log says: {cause}.',
  advice: 'Think over the cargo and try again.',
};

/** How a cause reads in a line: `event:reactor-failure` -> `reactor failure`. */
function causeWords(cause: string): string {
  return cause.replace(/^event:/, '').replaceAll('-', ' ');
}

/** The line `part` for the last lost voyage, from the `run.*` flags. */
function line(part: keyof DebriefLines): StateText {
  return (s: GameState) => {
    const flags = s.flags;
    const cause = String(flags.get(RUN_FLAGS.lastCause) ?? '');
    const lines = Object.hasOwn(LINES, cause) ? LINES[cause] : GENERIC;
    return formatText(lines[part], {
      cause: causeWords(cause),
      gate: String(flags.get(RUN_FLAGS.lastGateName) || 'the Earth'),
      next: String(flags.get(RUN_FLAGS.lastNextName) || 'the Moon'),
      day: Number(flags.get(RUN_FLAGS.lastDay) ?? 0),
    });
  };
}

/**
 * The scientists' debrief after a lost voyage (plan D18, GDD D7, `loop-scene-format` A):
 * played by `flow.die` on the warehouse's black screen. The scientists stand in their booth
 * (`post-1`, `post-2`), the hero before it (`debrief`); a moment of black, then three lines on
 * the cause (`run.lastCause`, `run.lastGateName`, `run.lastNextName`, `run.lastDay`); a fade,
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
