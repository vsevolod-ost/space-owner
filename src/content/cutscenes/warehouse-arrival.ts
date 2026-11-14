import type { Cutscene } from '@/core/cutscene/types';

/**
 * The hero's first steps into the warehouse (trigger `arrival`, once): the engineer walks up
 * and speaks two lines, the camera looks at the hatch to the ship and comes back while the
 * engineer returns to his post. Sets `warehouse.arrivalSeen`. The trigger is `once`, so the
 * scene does not replay when the hero comes back here after a death (plan D18).
 * Lines are placeholders. OWNER: script
 */
export const warehouseArrival: Cutscene = {
  async run(api) {
    // The eyes get used to the dim warehouse light.
    await api.fadeOut(200);
    await api.wait(150);
    await api.fadeIn(200);

    await api.walk('npc-engineer', 'player');
    api.face('player', 'npc-engineer');
    await api.say('engineer', '[TODO: greet the hero; the launch is soon]');
    await api.say('engineer', '[TODO: seven bays, ten kinds of cargo; the hatch is over there]');

    await api.cameraPanTo('spawn-hatch', 800);
    await api.wait(500);
    // Two steps at once: the camera comes back while the engineer returns to his post.
    await Promise.all([
      api.cameraPanTo('player', 800),
      api.walk('npc-engineer', api.homeOf('npc-engineer')),
    ]);
    api.cameraFollowPlayer();
    api.face('npc-engineer', 'down');

    api.setFlag('warehouse.arrivalSeen', true);
  },
};
