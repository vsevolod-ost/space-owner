import type { Binding } from '@/content/locations/types';
import type { GameState } from '@/core/state/GameState';

/**
 * Whether the map object of `binding` exists now: its `when` holds, or it has none. Bindings
 * without a `when` field (triggers) are always there.
 */
export function isPresent(binding: Binding, state: GameState): boolean {
  if (!('when' in binding) || !binding.when) return true;
  return binding.when(state);
}
