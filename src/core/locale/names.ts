import type { LocalText } from '@/core/locale/text';

/**
 * The display names of the solar system's bodies by id (plan uk-localization D15). main.ts
 * registers them from src/content/simulation/solar-system.ts; content and views that only have
 * a body id (saved flags, events, telemetry) get the name here instead of importing the solar
 * system. No imports but types: content loads this in Node too (src/devtools).
 */
const bodyNames = new Map<string, LocalText>();

/** Registers the names of bodies (`[id, name]` pairs); a repeated id takes the newer name. */
export function registerBodyNames(entries: Iterable<readonly [id: string, name: LocalText]>): void {
  for (const [id, name] of entries) bodyNames.set(id, name);
}

/** The name of body `id` (`tr` it when shown), or undefined for an id nobody registered. */
export function bodyName(id: string): LocalText | undefined {
  return bodyNames.get(id);
}
