import type { Cutscene } from '@/core/cutscene/types';

/**
 * Demo cutscene: the hero steps into the middle of the room (trigger `trigger-center` of
 * demo-room), the lights flicker, the captain walks up and speaks two lines, the camera looks
 * at the terminal and comes back while the captain returns to his post. Sets `demo.arrivalSeen`.
 */
export const demoArrival: Cutscene = {
  async run(api) {
    // The lights flicker as the hero walks in.
    await api.fadeOut(200);
    await api.wait(150);
    await api.fadeIn(200);

    await api.walk('npc-captain', 'player');
    api.face('player', 'npc-captain');
    await api.say('captain', 'There you are. We launch at dawn, and you are on the crew.');
    await api.say('captain', 'Learn the navigation terminal over there before we go.');

    await api.cameraPanTo('point-terminal', 800);
    await api.wait(500);
    // Two steps at once: the camera comes back while the captain returns to his post (the
    // `npc-captain` object of the map, at 320,96).
    await Promise.all([api.cameraPanTo('player', 800), api.walk('npc-captain', { x: 320, y: 96 })]);
    api.cameraFollowPlayer();
    api.face('npc-captain', 'down');

    api.setFlag('demo.arrivalSeen', true);
  },
};
