/**
 * Seeded randomness of the voyage's events (plan D10): the only random thing in the voyage -
 * the physics has none. Every roll is a pure function of the run's seed and a key naming what
 * is rolled (`happen:hull-breach`, `risk:asteroid-belt:fly-through`), so rolls do not depend on
 * their order, on frame times or on what happened before: one seed and the same answers give
 * the same voyage, a new seed (every fresh start of act 2) new rolls.
 */

/** Largest seed + 1: seeds are whole numbers in 0..SEED_LIMIT-1 (`run.seed`, `?seed=`). */
export const SEED_LIMIT = 2 ** 31;

/** A new seed for a fresh voyage (not reproducible: `Math.random`). */
export function newSeed(): number {
  return Math.floor(Math.random() * SEED_LIMIT);
}

/** A number in [0, 1) fixed by `seed` and `key` (32-bit FNV-1a of both, then mulberry32). */
export function rollFor(seed: number, key: string): number {
  let hash = 0x811c9dc5;
  const text = `${seed}:${key}`;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // One step of mulberry32 from the hash spreads close keys apart.
  let t = (hash + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
