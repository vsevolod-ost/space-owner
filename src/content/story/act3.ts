import type { Act } from '@/content/story/types';
import { bodyName } from '@/core/locale/names';
import { tr } from '@/core/locale/text';
import type { GameState } from '@/core/state/GameState';
import { formatText } from '@/core/text/format';

/**
 * The title card of the landing (GDD `act2-arrival` D): "<Body> · day N" from the flags Stop
 * set (`voyage.stopBody` named by `bodyName`, `voyage.day`; the day as the navigation panel shows
 * it, from 1);
 * "Act 3" when no voyage landed (`?act=act3`). OWNER: script
 */
function landingTitle(state: GameState): string {
  const body = state.flags.get('voyage.stopBody');
  const day = state.flags.get('voyage.day');
  if (typeof body !== 'string' || !body || typeof day !== 'number') {
    return tr({ en: 'Act 3', uk: 'Акт 3' });
  }
  const name = bodyName(body);
  return formatText(tr({ en: '{body} · day {day}', uk: '{body} · день {day}' }), {
    body: name ? tr(name) : body,
    day: day + 1,
  });
}

/**
 * Act 3: the colony (plan D19, GDD `act3-content` A). Stop at a gate starts it
 * (`landingAct` in ./index.ts); one colony location for every body, painted and built by the
 * flags of the landing and the cargo (src/content/locations/colony.ts). Its `overlook` ends the
 * game with the body's ending `colony-<body>`.
 */
export const act3: Act = {
  title: landingTitle,
  async start(flow) {
    await flow.goTo('colony', 'spawn-default');
    flow.checkpoint();
  },
};
