/**
 * Seed of the voyage's events in the smoke scenarios (`?seed=`, plan D10). Chosen in plan S7
 * with `npm run voyage-check -- --seed 1` (answering every card with its first choice):
 * - `fuel:1,supplies:1,reactor:1` dies of `hypoxia` (day 144: the base's 160 days of oxygen,
 *   and the hull breach on the way to Mars happens and "Seal the module" costs 16 more);
 * - `fuel:1,oxygen:1,supplies:1,solar:1` reaches Mars (day 202.4; plan variable-mass S9 kept
 *   seed 1; the dusty panels, the hull breach and the lost signal happen on the way, plan act2-stations S7).
 * After changing events, cargo or legs, run that check again and pick a seed that still does.
 */
export const VOYAGE_SEED = 1;
