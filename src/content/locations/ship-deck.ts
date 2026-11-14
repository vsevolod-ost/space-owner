import type { Binding, LocationDef, PropSpec } from '@/content/locations/types';
import type { VoyageService } from '@/core/voyage/VoyageService';
import { SceneKey } from '@/scenes/keys';
import type { NavigationScene } from '@/scenes/NavigationScene';

/**
 * The hold's bays: bay `n` shows a crate with the icon of the `n`-th item in the hold (fuel
 * first, then in the order of the cargo registry, plan D21), or nothing. One bay object
 * `bay-1..<bays>` per bay of the hold (`bays` in src/content/voyage/cargo/index.ts); the map
 * has them from `tools/make_maps.py`, which reads the same count.
 */
function bays(voyage: VoyageService): Record<string, Binding> {
  const bayProp = (n: number): PropSpec => ({
    layers: (s) => {
      const id = voyage.hold(s.flags)[n - 1];
      return id
        ? [{ image: 'crate' }, { spritesheet: 'items', frame: voyage.item(id).icon ?? 0 }]
        : [];
    },
  });
  return Object.fromEntries(
    Array.from({ length: voyage.cargo.bays }, (_, i): [string, Binding] => [
      `bay-${i + 1}`,
      { kind: 'prop', prop: bayProp(i + 1) },
    ]),
  );
}

/**
 * The ship's deck in act 2, one screen: an ordinary location whose stations open panels.
 * Walking right from the spawn along the middle line: the navigation station (solar system and
 * ship), then the airlock. The porthole, the radio and the airlock are stubs (deaths happen
 * only on the navigation panel, GDD D8); the hold's bays (`bay-1..7` for the 7 bays, class `prop`) show
 * the cargo taken aboard, and so does the HOLD strip at the top. Lines are placeholders. OWNER: script
 * No `music`: the track of the previous location keeps playing.
 */
export const shipDeck: LocationDef = {
  title: 'Ship deck', // OWNER: script
  background: 'location-ship-deck',
  map: 'ship-deck',
  showHold: true,
  bindings: ({ voyage }) => ({
    ...bays(voyage),
    'station-navigation': {
      kind: 'interactable',
      run: (ctx) => (ctx.scene.scene.get(SceneKey.Navigation) as NavigationScene).open(),
    },
    porthole: { kind: 'interactable', run: (ctx) => ctx.ui.toast('[TODO: porthole view]') },
    radio: { kind: 'interactable', run: (ctx) => ctx.ui.toast('[TODO: radio]') },
    airlock: { kind: 'interactable', run: (ctx) => ctx.ui.toast('[TODO: airlock]') },
  }),
};
