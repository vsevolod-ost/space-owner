import { act1 } from '@/content/story/act1';
import { act2 } from '@/content/story/act2';
import { act3 } from '@/content/story/act3';
import { prologue } from '@/content/story/prologue';
import type { Act, Debrief } from '@/content/story/types';

/**
 * Registry of acts, in story order: "New game" starts the first one and
 * `services.flow.nextAct()` moves to the next. The object key is the act id (`ActId`), used in
 * saves, `?act=<id>` and door bindings. To add an act, create `<id>.ts` next to this file and
 * list it here at its place in the story; see docs/HOWTO-story.md.
 */
export const acts = {
  prologue,
  act1,
  act2,
  act3,
} as const satisfies Record<string, Act>;

/** Id of a registered act. */
export type ActId = keyof typeof acts;

/** Act ids in story order (the order of `acts`). */
export const actOrder = Object.keys(acts) as ActId[];

/**
 * The death loop's return point (plan D18, GDD `loop-return-point` A): after a death or
 * "Return to warehouse" the hero stands before the scientists' booth in the warehouse (act 1, no
 * title card), the `debrief` cutscene explains what happened and leaves him at the hatch.
 * "Fly again" on the end screen puts him at the hatch (`hatch`) without the debrief.
 */
export const debrief: Debrief = {
  act: 'act1',
  location: 'warehouse',
  spawn: 'debrief',
  cutscene: 'debrief',
  hatch: 'spawn-hatch',
};

/**
 * The act a landing starts (Stop at a gate, plan S11): the colony. Its title card reads
 * "<Body> · day N".
 */
export const landingAct: ActId = 'act3';

/** Whether a string (e.g. from the URL or a save) names a registered act. */
export function isActId(id: string): id is ActId {
  return Object.hasOwn(acts, id);
}
