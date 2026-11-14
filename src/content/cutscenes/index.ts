import type { Cutscene } from '@/core/cutscene/types';
import { debrief } from '@/content/cutscenes/debrief';
import { warehouseArrival } from '@/content/cutscenes/warehouse-arrival';

/**
 * Registry of cutscenes. The object key is the cutscene id (`CutsceneId`), used in
 * `services.cutscenes.play(id)` and `ctx.cutscenes.play(id)`. To add a cutscene, create
 * `<id>.ts` next to this file and list it here; see docs/HOWTO-cutscene.md.
 */
export const cutscenes = {
  'warehouse-arrival': warehouseArrival,
  debrief,
} as const satisfies Record<string, Cutscene>;

/** Id of a registered cutscene. */
export type CutsceneId = keyof typeof cutscenes;

/** Whether a string (e.g. from the console) names a registered cutscene. */
export function isCutsceneId(id: string): id is CutsceneId {
  return Object.hasOwn(cutscenes, id);
}
