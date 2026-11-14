import type { ColonyBodyId } from '@/content/voyage/colony';
import type { ColonyTier } from '@/core/voyage/colony';

/**
 * Endings of the game (plan D19, GDD `win-endings` A, `colony-grades` E): one per colony site,
 * `colony-<body>`, shown by the end screen (src/scenes/EndingScene.ts) after `flow.finish(id)`
 * at the colony's overlook. Under the body's own text comes the line of the colony's tier
 * (`colonyFit` of the cargo against the body's needs): the common `TIER_LINES`, or the ending's
 * own `tiers` line. Deaths have no end screen: they run the death loop (`flow.die`, the
 * scientists' debrief).
 */

/** One ending: a heading, the text under it and, optionally, its own tier lines. */
export interface Ending {
  /** Heading of the end screen. */
  title: string;
  /** Text under the heading; `\n` starts a new line, long lines wrap. */
  text: string;
  /** Lines of the colony's tier for this ending only, instead of `TIER_LINES`. */
  tiers?: Partial<Record<ColonyTier, string>>;
}

/**
 * The tier line under every colony ending, unless the ending has its own (GDD `colony-grades` E:
 * about how it feels, not about an item; every tier is a colony that lives).
 * OWNER: script
 */
export const TIER_LINES: Readonly<Record<ColonyTier, string>> = {
  outpost: 'Outpost. [TODO: it barely holds, but it holds]',
  settlement: 'Settlement. [TODO: most of what the place asks for is there]',
  colony: 'Colony. [TODO: everything this world asks for, you brought]',
};

/**
 * Registry of endings. The object key is the ending id (`EndingId`), passed to
 * `services.flow.finish(id)`: `colony-<body>` for each colony site of
 * src/content/voyage/colony.ts. OWNER: script - every title and text.
 */
export const endings = {
  'colony-moon': {
    title: 'Moon',
    text: '[TODO: a colony in sight of home; the Earth hangs in a black sky]',
  },
  'colony-mars': {
    title: 'Mars',
    text: '[TODO: a colony under a butterscotch sky; the first to stay]',
  },
} as const satisfies Record<`colony-${ColonyBodyId}`, Ending>;

/** Id of a registered ending. */
export type EndingId = keyof typeof endings;

/** Whether a string names a registered ending. */
export function isEndingId(id: string): id is EndingId {
  return Object.hasOwn(endings, id);
}

/** The tier line of ending `id` for a colony of tier `tier`: its own, else `TIER_LINES`. */
export function tierLine(id: EndingId, tier: ColonyTier): string {
  const own: Ending = endings[id];
  return own.tiers?.[tier] ?? TIER_LINES[tier];
}
