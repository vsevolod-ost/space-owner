import { base } from '@/content/voyage/cargo/base';
import { battery } from '@/content/voyage/cargo/battery';
import { fuel } from '@/content/voyage/cargo/fuel';
import { greenhouse } from '@/content/voyage/cargo/greenhouse';
import { iceKit } from '@/content/voyage/cargo/ice-kit';
import { oxygen } from '@/content/voyage/cargo/oxygen';
import { reactor } from '@/content/voyage/cargo/reactor';
import { regolithKit } from '@/content/voyage/cargo/regolith-kit';
import { solar } from '@/content/voyage/cargo/solar';
import { stockMass } from '@/content/voyage/cargo/stock-mass';
import { supplies } from '@/content/voyage/cargo/supplies';
import { thermalKit } from '@/content/voyage/cargo/thermal-kit';
import type { CargoCatalog, CargoDef } from '@/core/voyage/types';

/**
 * Registry of cargo (D11: 10 kinds, 12 crates). The object key is the cargo id (`CargoId`):
 * flag `cargo.<id>` counts its copies aboard, the warehouse's crate places are `crate-<id>`
 * (`crate-fuel-1..3` for fuel). The order is the warehouse's and the hold's (fuel first). To
 * add an item: create `<id>.ts` next to this file, list it here, give it an icon frame and a
 * crate place on the warehouse map (docs/HOWTO-voyage.md, "To add a kind"). Changing `bays`
 * below also changes the generated maps (docs/HOWTO-voyage.md, "Cargo").
 */
export const cargoItems = {
  fuel,
  oxygen,
  supplies,
  battery,
  solar,
  reactor,
  greenhouse,
  'regolith-kit': regolithKit,
  'ice-kit': iceKit,
  'thermal-kit': thermalKit,
} as const satisfies Record<string, CargoDef>;

/** Id of a kind of cargo. */
export type CargoId = keyof typeof cargoItems;

/**
 * The cargo registry as core gets it (`services.voyage.attach` in src/main.ts): the built-in
 * base, the items, and the bays of the hold. OWNER: design - the bay count (plan D11: 7); after
 * a change run `python3 tools/make_maps.py`, which reads it for the deck's `bay-N` and the
 * colony's `build-N` places.
 */
export const cargo: CargoCatalog = { base, items: cargoItems, bays: 7, kgPerDay: stockMass };
