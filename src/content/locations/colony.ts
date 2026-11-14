import type { ImageKey } from '@/assets';
import type { EndingId } from '@/content/endings';
import type { BackgroundLayer, Binding, LocationDef } from '@/content/locations/types';
import type { ColonyBodyId } from '@/content/voyage/colony';
import type { GameState } from '@/core/state/GameState';
import type { ColonyTier } from '@/core/voyage/colony';
import type { ColonyAxis } from '@/core/voyage/types';
import { formatText } from '@/core/text/format';
import type { VoyageService } from '@/core/voyage/VoyageService';
import type { WorldContext } from '@/world/WorldContext';

/**
 * The shelter's line by the colony's tier; `{body}` is the body's name.
 * OWNER: script
 */
const SHELTER_LINES: Readonly<Record<ColonyTier, string>> = {
  outpost: 'The shelter on {body} barely holds; an outpost.',
  settlement: 'The shelter on {body} holds; a settlement.',
  colony: 'The shelter on {body} is a home; a colony.',
};

/**
 * The systems' line per need of the body: met or short; `{have}` and `{need}` are the levels.
 * OWNER: script
 */
const SYSTEM_LINES: Readonly<Record<ColonyAxis, { met: string; short: string }>> = {
  power: {
    met: 'Power holds ({have}/{need}).',
    short: 'Power falls short ({have}/{need}).',
  },
  heat: {
    met: 'The modules stay warm ({have}/{need}).',
    short: 'The cold gets in ({have}/{need}).',
  },
  shielding: {
    met: 'The shielding holds the radiation off ({have}/{need}).',
    short: 'The radiation gets through ({have}/{need}).',
  },
  life: {
    met: 'Air and food will last ({have}/{need}).',
    short: 'Air and food run thin ({have}/{need}).',
  },
};

/** The systems' line for a body with no needs. OWNER: script */
const SYSTEMS_NO_NEEDS = 'Nothing here asks for more.';

/**
 * The overlook's line per body, before the ending (GDD `act3-content` A: the view, then the
 * signal home). OWNER: script
 */
const OVERLOOK_LINES: Readonly<Record<ColonyBodyId, string>> = {
  moon: 'The Earth over the horizon; the signal takes a second.',
  mars: 'A small Sun over red dunes; the signal is minutes old.',
};

/** The colony site the colony stands on now (`voyage.stopBody`, the Moon without a landing). */
function bodyOf(voyage: VoyageService, ctx: WorldContext): string {
  return voyage.colonyBody(ctx.state.flags);
}

/** The body's display name (from the solar system), or its id. */
function bodyName(ctx: WorldContext, body: string): string {
  const name = ctx.state.flags.get('voyage.stopName');
  if (typeof name === 'string' && ctx.state.flags.get('voyage.stopBody') === body) return name;
  return body.charAt(0).toUpperCase() + body.slice(1);
}

/** The shelter: the colony's tier in words. */
async function shelter(voyage: VoyageService, ctx: WorldContext): Promise<void> {
  const body = bodyOf(voyage, ctx);
  const tier = voyage.colonyTier(body);
  await ctx.ui.say('narrator', formatText(SHELTER_LINES[tier], { body: bodyName(ctx, body) }), ctx);
}

/** The systems: each need of the body, met or short. */
async function systems(voyage: VoyageService, ctx: WorldContext): Promise<void> {
  const check = voyage.colonyCheck(bodyOf(voyage, ctx));
  const lines = (check?.needs ?? []).map(({ axis, need, have, met }) =>
    formatText(met ? SYSTEM_LINES[axis].met : SYSTEM_LINES[axis].short, { have, need }),
  );
  await ctx.ui.say('narrator', lines.length > 0 ? lines.join('\n') : SYSTEMS_NO_NEEDS, ctx);
}

/** The overlook: the body's line, then its ending. */
async function overlook(voyage: VoyageService, ctx: WorldContext): Promise<void> {
  const body = bodyOf(voyage, ctx);
  const line = Object.hasOwn(OVERLOOK_LINES, body)
    ? OVERLOOK_LINES[body as ColonyBodyId]
    : 'The view.'; // OWNER: script - a body without its own line
  await ctx.ui.say('narrator', line, ctx);
  // The colony registry and the endings registry list the same bodies (`colony-<body>`);
  // `flow.finish` warns about an id it does not know.
  ctx.flow.finish(`colony-${body}` as EndingId);
}

/**
 * The building places `build-1..<bays>` (class `prop`, one per bay of the hold: at most that
 * many buildings): place `n` shows the `n`-th building of the cargo aboard
 * (`voyage.colonyBuildings`: one per copy of an item that gives this body something, in the
 * hold's order), or nothing. The map has them from `tools/make_maps.py`, which reads the same
 * count (`bays` in src/content/voyage/cargo/index.ts).
 */
function buildPlaces(voyage: VoyageService): Record<string, Binding> {
  return Object.fromEntries(
    Array.from({ length: voyage.cargo.bays }, (_, i): [string, Binding] => [
      `build-${i + 1}`,
      {
        kind: 'prop',
        prop: {
          layers: (s) => {
            const building = voyage.colonyBuildings(s.flags)[i];
            // `colonyBuildings` in src/content/voyage/colony.ts names only `colony-*` images.
            return building ? [{ image: `colony-${building}` as ImageKey }] : [];
          },
        },
      },
    ]),
  );
}

/**
 * The sky and the ground painted in the body's colours (`sky`, `ground` of the colony
 * registry); the base (lander and shelter) keeps its own.
 */
function background(voyage: VoyageService): readonly BackgroundLayer[] {
  const colours = (s: GameState) => voyage.colony.bodies[voyage.colonyBody(s.flags)];
  return [
    { image: 'location-colony-sky', tint: (s) => colours(s)?.sky },
    { image: 'location-colony-ground', tint: (s) => colours(s)?.ground },
    { image: 'location-colony-base' },
  ];
}

/**
 * Act 3: the colony on the body where the hero stopped (plan D19, GDD `act3-content` A,
 * `colony-location-variants`), one map for every body. The background is three layers
 * (`location-colony-sky`, `-ground`, `-base`); the sky and the ground are tinted by the body
 * (`voyage.stopBody`, the Moon without a landing). The places `build-1..7` show a building
 * per colony item taken. `shelter` tells the colony's tier, `systems` each need of the body,
 * `overlook` the view and then the body's ending (`colony-<body>`, the tier line on the end
 * screen). Lines are placeholders. OWNER: script
 */
export const colony: LocationDef = {
  title: 'Colony', // OWNER: script
  background: ({ voyage }) => background(voyage),
  map: 'colony',
  bindings: ({ voyage }) => ({
    ...buildPlaces(voyage),
    shelter: { kind: 'interactable', run: (ctx) => shelter(voyage, ctx) },
    systems: { kind: 'interactable', run: (ctx) => systems(voyage, ctx) },
    overlook: { kind: 'interactable', run: (ctx) => overlook(voyage, ctx) },
  }),
};
