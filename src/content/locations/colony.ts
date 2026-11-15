import type { ImageKey } from '@/assets';
import type { EndingId } from '@/content/endings';
import type { BackgroundLayer, Binding, LocationDef } from '@/content/locations/types';
import type { ColonyBodyId } from '@/content/voyage/colony';
import { bodyName as registeredBodyName } from '@/core/locale/names';
import { TODO, tr, type LocalText } from '@/core/locale/text';
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
const SHELTER_LINES: Readonly<Record<ColonyTier, LocalText>> = {
  outpost: { en: 'The shelter on {body} barely holds; an outpost.', uk: TODO },
  settlement: { en: 'The shelter on {body} holds; a settlement.', uk: TODO },
  colony: { en: 'The shelter on {body} is a home; a colony.', uk: TODO },
};

/**
 * The systems' line per need of the body: met or short; `{have}` and `{need}` are the levels.
 * OWNER: script
 */
const SYSTEM_LINES: Readonly<Record<ColonyAxis, { met: LocalText; short: LocalText }>> = {
  power: {
    met: { en: 'Power holds ({have}/{need}).', uk: TODO },
    short: { en: 'Power falls short ({have}/{need}).', uk: TODO },
  },
  heat: {
    met: { en: 'The modules stay warm ({have}/{need}).', uk: TODO },
    short: { en: 'The cold gets in ({have}/{need}).', uk: TODO },
  },
  shielding: {
    met: { en: 'The shielding holds the radiation off ({have}/{need}).', uk: TODO },
    short: { en: 'The radiation gets through ({have}/{need}).', uk: TODO },
  },
  life: {
    met: { en: 'Air and food will last ({have}/{need}).', uk: TODO },
    short: { en: 'Air and food run thin ({have}/{need}).', uk: TODO },
  },
};

/** The systems' line for a body with no needs. OWNER: script */
const SYSTEMS_NO_NEEDS: LocalText = { en: 'Nothing here asks for more.', uk: TODO };

/**
 * The overlook's line per body, before the ending (GDD `act3-content` A: the view, then the
 * signal home). OWNER: script
 */
const OVERLOOK_LINES: Readonly<Record<ColonyBodyId, LocalText>> = {
  moon: { en: 'The Earth over the horizon; the signal takes a second.', uk: TODO },
  mars: { en: 'A small Sun over red dunes; the signal is minutes old.', uk: TODO },
};

/** The colony site the colony stands on now (`voyage.stopBody`, the Moon without a landing). */
function bodyOf(voyage: VoyageService, ctx: WorldContext): string {
  return voyage.colonyBody(ctx.state.flags);
}

/**
 * The body's display name in the current language: the name the solar system registers
 * (`bodyName` of src/core/locale/names.ts), else its id with a capital.
 */
function bodyName(body: string): string {
  const registered = registeredBodyName(body);
  if (registered) return tr(registered);
  return body.charAt(0).toUpperCase() + body.slice(1);
}

/** The shelter: the colony's tier in words. */
async function shelter(voyage: VoyageService, ctx: WorldContext): Promise<void> {
  const body = bodyOf(voyage, ctx);
  const tier = voyage.colonyTier(body);
  await ctx.ui.say(
    'narrator',
    () => formatText(tr(SHELTER_LINES[tier]), { body: bodyName(body) }),
    ctx,
  );
}

/** The systems: each need of the body, met or short. */
async function systems(voyage: VoyageService, ctx: WorldContext): Promise<void> {
  const check = voyage.colonyCheck(bodyOf(voyage, ctx));
  const needs = check?.needs ?? [];
  if (needs.length === 0) {
    await ctx.ui.say('narrator', SYSTEMS_NO_NEEDS, ctx);
    return;
  }
  const text = () =>
    needs
      .map(({ axis, need, have, met }) =>
        formatText(tr(met ? SYSTEM_LINES[axis].met : SYSTEM_LINES[axis].short), { have, need }),
      )
      .join('\n');
  await ctx.ui.say('narrator', text, ctx);
}

/** The overlook: the body's line, then its ending. */
async function overlook(voyage: VoyageService, ctx: WorldContext): Promise<void> {
  const body = bodyOf(voyage, ctx);
  const line: LocalText = Object.hasOwn(OVERLOOK_LINES, body)
    ? OVERLOOK_LINES[body as ColonyBodyId]
    : { en: 'The view.', uk: TODO }; // OWNER: script - a body without its own line
  await ctx.ui.say('narrator', line, ctx);
  // The colony registry and the endings registry list the same bodies (`colony-<body>`);
  // `flow.finish` warns about an id it does not know.
  ctx.flow.finish(`colony-${body}` as EndingId);
}

/**
 * The building places `build-1..<bays>` (class `prop`, one per bay of the hold: at most that
 * many buildings): place `n` shows the `n`-th building of the cargo aboard
 * (`voyage.colonyBuildings`: one per copy of an item that gives this body something, in the
 * hold's order), or nothing; nothing at all under a built picture (`builtPicture`). The map
 * has them from `tools/make_maps.py`, which reads the same count (`bays` in
 * src/content/voyage/cargo/index.ts).
 */
function buildPlaces(voyage: VoyageService): Record<string, Binding> {
  return Object.fromEntries(
    Array.from({ length: voyage.cargo.bays }, (_, i): [string, Binding] => [
      `build-${i + 1}`,
      {
        kind: 'prop',
        prop: {
          layers: (s) => {
            if (builtPicture(voyage, s)) return []; // the picture has the colony drawn in
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
 * The pictures of each colony site: `empty`, sky and ground with nothing built (the base layer
 * and the buildings stand over it); `built`, the same with a whole colony drawn in, shown
 * instead when the colony there is a full one (tier `colony`; no buildings are drawn then).
 * A body without `built` always shows `empty` with its buildings. OWNER: art
 */
const BODY_BACKGROUNDS: Readonly<Record<ColonyBodyId, { empty: ImageKey; built?: ImageKey }>> = {
  moon: { empty: 'location-colony-moon', built: 'location-colony-moon-built' },
  mars: { empty: 'location-colony-mars', built: 'location-colony-mars-built' },
};

/** Whether the colony now stands on a body with a `built` picture and is a full colony. */
function builtPicture(voyage: VoyageService, s: GameState): boolean {
  const body = voyage.colonyBody(s.flags);
  if (!Object.hasOwn(BODY_BACKGROUNDS, body)) return false;
  if (!BODY_BACKGROUNDS[body as ColonyBodyId].built) return false;
  return voyage.colonyTier(body, voyage.buildLoadout(s.flags)) === 'colony';
}

/**
 * The pictures of the body the colony stands on (`voyage.colonyBody`): empty, or built when
 * the colony is full (`builtPicture`); then the base (lander and shelter) over it.
 */
function background(voyage: VoyageService): readonly BackgroundLayer[] {
  const on = (s: GameState, body: string) => voyage.colonyBody(s.flags) === body;
  const bodies = Object.entries(BODY_BACKGROUNDS).flatMap(
    ([body, { empty, built }]): BackgroundLayer[] => [
      { image: empty, when: (s) => on(s, body) && !builtPicture(voyage, s) },
      ...(built
        ? [{ image: built, when: (s: GameState) => on(s, body) && builtPicture(voyage, s) }]
        : []),
    ],
  );
  return [...bodies, { image: 'location-colony-base' }];
}

/**
 * Act 3: the colony on the body where the hero stopped (plan D19, GDD `act3-content` A,
 * `colony-location-variants`), one map for every body. The background is the picture of the
 * body (`BODY_BACKGROUNDS`: `voyage.stopBody`, the Moon without a landing; with the colony
 * drawn in when it is a full one) under the base (`location-colony-base`). The places
 * `build-1..7` show a building per colony item taken. `shelter` tells the colony's tier, `systems` each need of the body,
 * `overlook` the view and then the body's ending (`colony-<body>`, the tier line on the end
 * screen). Lines are placeholders. OWNER: script
 */
export const colony: LocationDef = {
  title: { en: 'Colony', uk: TODO }, // OWNER: script
  background: ({ voyage }) => background(voyage),
  map: 'colony',
  bindings: ({ voyage }) => ({
    ...buildPlaces(voyage),
    shelter: { kind: 'interactable', run: (ctx) => shelter(voyage, ctx) },
    systems: { kind: 'interactable', run: (ctx) => systems(voyage, ctx) },
    overlook: { kind: 'interactable', run: (ctx) => overlook(voyage, ctx) },
  }),
};
