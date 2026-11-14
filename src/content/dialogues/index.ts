import type { Dialogue } from '@/core/dialogue/types';
import { demoEngineer } from '@/content/dialogues/demo-engineer';

/**
 * Registry of dialogues. The object key is the dialogue id (`DialogueId`), used in NPC
 * bindings (`dialogue: 'demo-engineer'`) and cutscenes. To add a dialogue, create `<id>.ts`
 * next to this file and list it here; see docs/HOWTO-dialogue.md.
 */
export const dialogues = {
  'demo-engineer': demoEngineer,
} as const satisfies Record<string, Dialogue>;

/** Id of a registered dialogue. */
export type DialogueId = keyof typeof dialogues;

/** Whether a string (e.g. from the console) names a registered dialogue. */
export function isDialogueId(id: string): id is DialogueId {
  return Object.hasOwn(dialogues, id);
}
