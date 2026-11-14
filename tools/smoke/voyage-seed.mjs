/**
 * Seed of the voyage's events in the smoke scenarios (`?seed=`, plan D10). Chosen in plan S7
 * with `npm run voyage-check -- --seed 1` (answering every card with its first choice):
 * - `fuel:1,supplies:1,reactor:1` dies of `hypoxia` (day 36: the base's 40 days of oxygen, and
 *   the hull breach on the way to Mars happens and "Seal the module" costs 4 more);
 * - `fuel:1,oxygen:1,supplies:1,solar:1` reaches Mars (day 53.1).
 * After changing events, cargo or legs, run that check again and pick a seed that still does.
 */
export const VOYAGE_SEED = 1;
