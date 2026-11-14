/**
 * Endings of the game: what the end screen (src/scenes/EndingScene.ts) shows. Both the real
 * endings (`flow.finish(id)`) and deaths (`flow.gameOver(id)`, the reason the hero died) live
 * here; the explanations of the endings from the design document go into `text`.
 */

/** One ending: a heading and the text under it. */
export interface Ending {
  /** Heading of the end screen. */
  title: string;
  /** Text under the heading; `\n` starts a new line, long lines wrap. */
  text: string;
}

/**
 * Registry of endings. The object key is the ending id (`EndingId`), passed to
 * `services.flow.finish(id)` and `services.flow.gameOver(id)`. To add one, add a line here.
 */
export const endings = {
  'demo-ending': {
    title: 'The End',
    text: 'You reached the end of the demo story.\nThe real endings will be written here.',
  },
  'death-generic': {
    title: 'You died',
    text: 'Something went badly wrong.\nTry again from the last checkpoint.',
  },
} as const satisfies Record<string, Ending>;

/** Id of a registered ending (or death reason). */
export type EndingId = keyof typeof endings;

/** Whether a string names a registered ending. */
export function isEndingId(id: string): id is EndingId {
  return Object.hasOwn(endings, id);
}
