import type { Binding, LocationDef, PropLayer, PropSpec } from '@/content/locations/types';
import type { CargoId } from '@/content/voyage/cargo';
import { defineDialogue } from '@/core/dialogue/types';
import type { Dialogue } from '@/core/dialogue/types';
import type { GameState } from '@/core/state/GameState';
import { formatText } from '@/core/text/format';
import { tonnesText } from '@/core/text/units';
import { cargoFlag } from '@/core/voyage/loadout';
import type { VoyageService } from '@/core/voyage/VoyageService';
import type { WorldContext } from '@/world/WorldContext';

/** Dialogue id the cargo stands report (`dialogueStarted`, `UiScene.debugInfo`). */
const STAND_DIALOGUE_ID = 'cargo-stand';
/** Dialogue id the hatch reports. */
const HATCH_DIALOGUE_ID = 'hatch';

/** Choices of a cargo stand (plan D21). OWNER: script */
const TAKE = 'Take it';
const PUT_BACK = 'Put it back';
const LEAVE = 'Leave it';
/**
 * The stand's line instead of "Take it" when the hold is full (GDD `act1-loadout-undo`).
 * OWNER: script
 */
const NO_SPACE = 'No cargo space. Put something back first.';

/** Bays of the hold in use by the flags now (every copy aboard takes its item's `bays`). */
function baysUsed(voyage: VoyageService, s: GameState): number {
  return voyage.hold(s.flags).reduce((sum, id) => sum + voyage.item(id).bays, 0);
}

/** Free bays of the hold by the flags now. */
function baysFree(voyage: VoyageService, s: GameState): number {
  return voyage.cargo.bays - baysUsed(voyage, s);
}

/**
 * The toast after a take or a put back: bays in use and the ship's start mass with the cargo
 * of the flags now (plan variable-mass D7), `Cargo 3/7 · 134.5 t`. OWNER: script
 */
function cargoToast(voyage: VoyageService, s: GameState): string {
  return formatText('Cargo {used}/{bays} · {mass} t', {
    used: baysUsed(voyage, s),
    bays: voyage.cargo.bays,
    mass: tonnesText(voyage.startMassKg(s.flags)),
  });
}

/**
 * The stand at place `place` (1-based) of cargo `itemId` (plan D21, GDD `act1-hands`): a
 * narrator line with the item's label and `line` and the crate's mass, then "Take it" /
 * "Put it back" / "Leave it" by `when`. Place `place` holds a crate while fewer than `place` copies are aboard (`crates`),
 * so copies are taken in place order and put back in reverse: "Take it" only at the next
 * standing place (`count + 1`) while the hold has room (otherwise the line ends with
 * `NO_SPACE`), "Put it back" only at the last emptied place (`count`); the crate that moves is
 * always the one at this place. `onChange` runs after a take or a put back.
 * Built by code because it follows the cargo registry (`openDialogueDef`).
 * OWNER: script - the lines above.
 */
export function cargoStand(
  voyage: VoyageService,
  itemId: string,
  place: number,
  onChange: () => void,
): Dialogue {
  const def = voyage.item(itemId);
  const count = (s: GameState) => voyage.count(itemId, s.flags);
  const taken = (s: GameState) => count(s) >= place;
  const isNext = (s: GameState) => count(s) === place - 1;
  const isLast = (s: GameState) => count(s) === place;
  const setCount = (s: GameState, n: number) => {
    s.flags.set(cargoFlag(itemId), n);
    onChange();
  };
  const text = (s: GameState): string => {
    const lines = [formatText('{label}. {line}', { label: def.label, line: def.line })];
    // The crate's mass with its start contents (plan variable-mass D7). OWNER: script
    lines.push(formatText('Mass {mass} t.', { mass: tonnesText(voyage.itemMassKg(itemId)) }));
    if (def.maxCopies > 1) {
      lines.push(formatText('Aboard: {n} of {max}.', { n: count(s), max: def.maxCopies }));
    }
    if (isLast(s)) lines.push('Its crate is in the hold; the place is empty.');
    else if (taken(s)) lines.push('Empty; put back the last crate taken first.');
    else if (!isNext(s)) lines.push('The crates are taken front first.');
    else if (baysFree(voyage, s) < def.bays) lines.push(NO_SPACE);
    return lines.join('\n');
  };
  return defineDialogue({
    start: 'stand',
    nodes: {
      stand: {
        speaker: 'narrator',
        text,
        choices: [
          {
            text: TAKE,
            when: (s) => isNext(s) && baysFree(voyage, s) >= def.bays,
            effect: (s) => setCount(s, count(s) + 1),
          },
          {
            text: PUT_BACK,
            when: isLast,
            effect: (s) => setCount(s, count(s) - 1),
          },
          { text: LEAVE },
        ],
      },
    },
  });
}

/**
 * The crate places of the map (`crate-<place>` objects), one per crate of the cargo registry:
 * an item with one copy has place `<id>`, one with several `<id>-1`, `<id>-2`, ... (fuel:
 * `fuel-1..3`). Place `n` of a kind empties once `n` crates of it are taken: with `cargo.fuel`
 * = 1 `fuel-1` is empty, `fuel-2` and `fuel-3` stand. A crate shows the item's icon frame. The
 * place stays usable when empty (its stand puts the crate back); E opens `cargoStand`, and a
 * take or a put back ends with the toast `Cargo n/7 · <start mass> t`.
 */
function crates(voyage: VoyageService): Record<string, Binding> {
  const bindings: Record<string, Binding> = {};
  for (const id of voyage.itemIds) {
    const def = voyage.item(id);
    const crate: readonly PropLayer[] = [
      { image: 'crate' },
      { spritesheet: 'items', frame: def.icon ?? 0 },
    ];
    for (let n = 1; n <= def.maxCopies; n++) {
      const place = def.maxCopies > 1 ? `${id}-${n}` : id;
      const prop: PropSpec = { layers: (s) => (voyage.count(id, s.flags) < n ? crate : []) };
      bindings[`crate-${place}`] = {
        kind: 'interactable',
        prop,
        run: async (ctx) => {
          let changed = false;
          await ctx.ui.openDialogueDef(
            cargoStand(ctx.voyage, id, n, () => (changed = true)),
            ctx,
            STAND_DIALOGUE_ID,
          );
          if (changed) ctx.ui.toast(cargoToast(ctx.voyage, ctx.state));
        },
      };
    }
  }
  return bindings;
}

/**
 * What the engineer at the hatch names as missing: a gap is open while none of its cargo ids is
 * aboard (GDD `act1-launch` B). OWNER: script - the names; design - which ids close a gap.
 */
const GAPS: readonly { ids: readonly CargoId[]; name: string }[] = [
  { ids: ['fuel'], name: 'spare fuel' },
  { ids: ['oxygen', 'greenhouse'], name: 'extra air' },
  { ids: ['supplies', 'greenhouse'], name: 'extra food and water' },
  { ids: ['battery', 'solar', 'reactor'], name: 'a power source' },
  { ids: ['regolith-kit', 'ice-kit', 'thermal-kit'], name: 'a colony kit' },
];

/** The open gaps of the hold by the flags now, in `GAPS` order. */
function gapsOf(voyage: VoyageService, s: GameState): string[] {
  return GAPS.filter((gap) => gap.ids.every((id) => voyage.count(id, s.flags) === 0)).map(
    (gap) => gap.name,
  );
}

/**
 * The hatch (plan D22, GDD `act1-launch` B): the engineer reads the manifest and names what is
 * not aboard and how many bays are free, then "Wait" (first: stay in the warehouse) or "Board"
 * (`onBoard`, after which the hatch starts act 2 with its checkpoint). Nothing in act 1 comes
 * back after boarding: only a death or the pause menu returns to the warehouse.
 * OWNER: script - the lines above.
 */
export function hatchCheck(voyage: VoyageService, onBoard: () => void): Dialogue {
  return defineDialogue({
    start: 'check',
    nodes: {
      check: {
        speaker: 'engineer',
        text: (s) => {
          const gaps = gapsOf(voyage, s);
          const free = baysFree(voyage, s);
          return gaps.length > 0
            ? formatText(
                "Hold on, pilot. Before boarding, not aboard: {gaps}. Free bays: {free}. Don't launch half-equipped.",
                {
                  gaps: gaps.join(', '),
                  free,
                },
              )
            : formatText(
                "Before boarding. Nothing missing. Free bays: {free}. You're either ready or stubborn.",
                {
                  free,
                },
              );
        },
        choices: [{ text: 'Wait' }, { text: 'Board', effect: () => onBoard() }],
      },
    },
  });
}

/** E at the hatch: the check, and act 2 if the player boards. */
async function hatch(ctx: WorldContext): Promise<void> {
  let board = false;
  await ctx.ui.openDialogueDef(
    hatchCheck(ctx.voyage, () => (board = true)),
    ctx,
    HATCH_DIALOGUE_ID,
  );
  if (board) await ctx.flow.startAct('act2');
}

/**
 * Act 1: the warehouse, one screen 640x368. Crates on three islands (stands: take, put back,
 * plan D21), the engineer and the astronomer by them (advice, flags `advice.<npc>.<topic>`),
 * the scientists' booth top left (`post-1`, `post-2`; the hero's place in front of it is the
 * spawn `debrief`), the hatch to the ship on the right ("Wait" / "Board", plan D22). A crate is
 * there while `cargo.<id>` says it has not been taken (the cargo registry, `crates`). The first
 * steps in (trigger `arrival`) play the `warehouse-arrival` cutscene once. The HOLD strip at
 * the top shows what is aboard.
 */
export const warehouse: LocationDef = {
  title: 'Warehouse', // OWNER: script
  background: 'location-warehouse',
  map: 'warehouse',
  music: 'music-act1', // OWNER: art
  showHold: true,
  bindings: ({ voyage }) => ({
    ...crates(voyage),
    'npc-engineer': { kind: 'npc', character: 'engineer', dialogue: 'engineer-advice' },
    'npc-astronomer': { kind: 'npc', character: 'astronomer', dialogue: 'astronomer-advice' },
    hatch: { kind: 'interactable', run: hatch },
    arrival: {
      kind: 'trigger',
      once: true,
      run: (ctx) => ctx.cutscenes.play('warehouse-arrival'),
    },
  }),
};
