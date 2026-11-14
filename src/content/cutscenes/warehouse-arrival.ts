import type { Cutscene } from '@/core/cutscene/types';

/**
 * The hero's first steps into the warehouse (trigger `arrival`, once): the engineer walks up
 * and speaks two lines, turns to the hatch to the ship, then returns to his post. No camera pan:
 * the warehouse is as wide as the screen, so the hatch is always in view, and a pan could only
 * nudge the camera up and down by the few pixels the map is taller than the screen. Sets `warehouse.arrivalSeen`. The trigger is `once`, so the
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
    await api.say(
      'engineer',
      "Welcome aboard, pilot. We launch soon, so let's get the cargo loaded.",
    );
    await api.say(
      'engineer',
      "Seven bays, ten kinds of cargo. The hatch to the ship is over there - check it when you're ready.",
    );

    // Both look at the hatch, then he goes back.
    api.face('npc-engineer', 'spawn-hatch');
    api.face('player', 'spawn-hatch');
    await api.wait(800);
    await api.walk('npc-engineer', api.homeOf('npc-engineer'));
    api.face('npc-engineer', 'down');

    api.setFlag('warehouse.arrivalSeen', true);
  },
};
