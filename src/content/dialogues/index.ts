import type { Dialogue } from '@/core/dialogue/types';
import { astronomerAdvice } from '@/content/dialogues/astronomer-advice';
import { engineerAdvice } from '@/content/dialogues/engineer-advice';

/**
 * Registry of dialogues. The object key is the dialogue id (`DialogueId`), used in NPC
 * bindings (`dialogue: 'engineer-advice'`) and cutscenes. To add a dialogue, create `<id>.ts`
 * next to this file and list it here; see docs/HOWTO-dialogue.md.
 */
export const dialogues = {
  'astronomer-advice': astronomerAdvice,
  'engineer-advice': engineerAdvice,
} as const satisfies Record<string, Dialogue>;

/** Id of a registered dialogue. */
export type DialogueId = keyof typeof dialogues;

/** Whether a string (e.g. from the console) names a registered dialogue. */
export function isDialogueId(id: string): id is DialogueId {
  return Object.hasOwn(dialogues, id);
}
