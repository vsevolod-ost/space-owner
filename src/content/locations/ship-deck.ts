import type { LocationDef } from '@/content/locations/types';
import { SceneKey } from '@/scenes/keys';
import type { NavigationScene } from '@/scenes/NavigationScene';

/**
 * The ship's deck in act 2: an ordinary location whose stations open panels. Walking
 * right from the spawn along the middle line: the navigation station (solar system and ship),
 * the reactor station (a stub for the physics owner), the airlock (death, to try "Retry").
 * No `music`: the track of the previous location keeps playing.
 */
export const shipDeck: LocationDef = {
  title: 'Ship deck',
  background: 'location-ship-deck',
  map: 'ship-deck',
  bindings: {
    'station-navigation': {
      kind: 'interactable',
      run: (ctx) => (ctx.scene.scene.get(SceneKey.Navigation) as NavigationScene).open(),
    },
    'station-reactor': {
      kind: 'interactable',
      run: (ctx) => ctx.ui.toast('Reactor panel: TODO (physics)'),
    },
    airlock: { kind: 'interactable', run: (ctx) => ctx.flow.gameOver('death-generic') },
  },
};
