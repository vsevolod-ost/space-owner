import { act1 } from '@/content/story/act1';
import { act2 } from '@/content/story/act2';
import { act3 } from '@/content/story/act3';
import { prologue } from '@/content/story/prologue';
import type { Act } from '@/content/story/types';

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

/** Whether a string (e.g. from the URL or a save) names a registered act. */
export function isActId(id: string): id is ActId {
  return Object.hasOwn(acts, id);
}
