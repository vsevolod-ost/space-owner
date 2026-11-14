import type { GateDef } from '@/core/simulation/types';

/**
 * The gates of the voyage in flight order (GDD D14): at each the player stops and builds the
 * colony there, or goes on. The ship starts at the Earth (`ship.start` in
 * src/content/simulation/ship.ts); leg `i` of src/content/voyage/legs.ts ends at gate `i`.
 * OWNER: design - the order and the bodies (each needs a `gate` body in
 * src/content/simulation/solar-system.ts).
 */
export const gates: readonly GateDef[] = [{ body: 'moon' }, { body: 'mars', last: true }];
