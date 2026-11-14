import { PLACEHOLDER, tr, type LocalText } from '@/core/locale/text';
import type { GameState } from '@/core/state/GameState';

/**
 * Text that may depend on the game state: a pair `{ en: 'Hi!', uk: TODO }`, or a function of
 * the state that returns the finished string, translating its template with `tr` inside
 * (`(s) => formatText(tr({ en: 'Oxygen for {o2Days} days', uk: TODO }), { o2Days: daysOf(s) })`).
 * Dialogue lines, choices and `say` take it; it is read when the line is shown.
 */
export type StateText = LocalText | ((state: GameState) => string);

/** Values for `formatText`: `{ o2Days: 42, gate: 'Mars', cause: 'oxygen' }`. */
export type TextValues = Readonly<Record<string, string | number>>;

/**
 * Replaces every `{name}` in `template` with `values[name]` (numbers through `String`; round
 * them first). A placeholder without a value stays as it is, so the gap shows on screen, and is
 * reported with `console.warn`. Text without placeholders comes back unchanged.
 *
 * ```ts
 * formatText('Fuel reaches: {gate}', { gate: 'Mars' }); // 'Fuel reaches: Mars'
 * ```
 */
export function formatText(template: string, values: TextValues): string {
  return template.replace(PLACEHOLDER, (whole, name: string) => {
    if (Object.hasOwn(values, name)) return String(values[name]);
    console.warn(`formatText: no value for {${name}} in "${template}"`);
    return whole;
  });
}

/** The string a `StateText` stands for now, in the current language. */
export function resolveText(text: StateText, state: GameState): string {
  return typeof text === 'function' ? text(state) : tr(text);
}
