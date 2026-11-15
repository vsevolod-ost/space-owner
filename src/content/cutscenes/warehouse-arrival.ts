import type { Cutscene } from '@/core/cutscene/types';

/**
 * The hero's first steps into the warehouse (trigger `arrival`, once): the engineer walks up
 * and speaks two lines, turns to the hatch to the ship, then returns to his post. No camera pan:
 * the warehouse is as wide as the screen, so the hatch is always in view, and a pan could only
 * nudge the camera up and down by the few pixels the map is taller than the screen. Sets `warehouse.arrivalSeen`. The trigger is `once`, so the
 * scene does not replay when the hero comes back here after a death (plan D18).
 * OWNER: script
 */
export const warehouseArrival: Cutscene = {
  async run(api) {
    // The eyes get used to the dim warehouse light.
    await api.fadeOut(200);
    await api.wait(150);
    await api.fadeIn(200);

    await api.walk('npc-engineer', 'player');
    api.face('player', 'npc-engineer');
    await api.say('engineer', {
      en: 'Ah, the new pilot. Welcome aboard - and sorry about the lighting, the warehouse is allergic to cheerfulness.',
      uk: 'А, новий пілот. Ласкаво просимо на борт — і вибачте за освітлення, склад має алергію на життєрадісність.',
    });
    await api.say('engineer', {
      en: "Seven bays, ten kinds of cargo. Load what you can carry; the hatch to the ship is over there - check it when you think you're ready. Or when I say so.",
      uk: 'Сім відсіків, десять видів вантажу. Завантажуй те, що зможеш донести; люк до корабля он там — перевір його, коли вирішиш, що готовий. Або коли я скажу.',
    });

    // Both look at the hatch, then he goes back.
    api.face('npc-engineer', 'spawn-hatch');
    api.face('player', 'spawn-hatch');
    await api.wait(800);
    await api.walk('npc-engineer', api.homeOf('npc-engineer'));
    api.face('npc-engineer', 'down');

    api.setFlag('warehouse.arrivalSeen', true);
  },
};
