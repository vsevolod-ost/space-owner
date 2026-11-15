import type {
  Binding,
  InteractableBinding,
  LocationDef,
  PropSpec,
} from '@/content/locations/types';
import { bayAccessName, stationObject } from '@/core/alarm/station';
import { tr, type LocalText } from '@/core/locale/text';
import type { GameState } from '@/core/state/GameState';
import { formatText } from '@/core/text/format';
import type { VoyageService } from '@/core/voyage/VoyageService';
import type { EventStationScene } from '@/scenes/EventStationScene';
import { SceneKey } from '@/scenes/keys';
import type { NavigationScene } from '@/scenes/NavigationScene';
import type { WorldContext } from '@/world/WorldContext';

/**
 * Names of the deck stations where alarms are answered, by map object, for the alarm's lines
 * (the navigation panel's flash, the station card, the "wrong station" toast). The hold's
 * access points `bay-access-N` read "Bay N" (`stationName`). OWNER: script
 */
export const deckStationNames: Readonly<Record<string, LocalText>> = {
  airlock: { en: 'Airlock', uk: 'Шлюз' },
  porthole: { en: 'Porthole', uk: 'Ілюмінатор' },
  radio: { en: 'Radio', uk: 'Радіо' },
  'station-navigation': { en: 'Navigation', uk: 'Навігація' },
};

/** Name of a hold access point; `{n}` is the bay's number. OWNER: script */
const BAY_NAME: LocalText = { en: 'Bay {n}', uk: 'Відсік {n}' };

/**
 * Name of deck station `object` for the player, in the current language (`deckStationNames`;
 * "Bay N"; an unknown object: its own name). Call it when the name is shown.
 */
export function stationName(object: string): string {
  const bay = /^bay-access-(\d+)$/.exec(object);
  if (bay) return formatText(tr(BAY_NAME), { n: bay[1] });
  return Object.hasOwn(deckStationNames, object) ? tr(deckStationNames[object]) : object;
}

/**
 * The toast at a deck station while the alarm is answered at another one: `{event}` is the
 * event's title, `{station}` the station's name (`stationName`) in lower case. OWNER: script
 */
const WRONG_STATION: LocalText = {
  en: '{event}: not here - go to the {station}!',
  uk: '{event}: не тут — шукайте «{station}»!',
};

/**
 * What a deck station does on E (plan act2-stations D1, D13): when the alarm is answered here,
 * the event's card opens (`EventStationScene`); during an alarm elsewhere, a toast says where
 * to go; without an alarm, `idle` (the station's own stub line).
 */
function alarmStation(name: string, idle: (ctx: WorldContext) => void): InteractableBinding['run'] {
  return (ctx) => {
    const alarm = ctx.stationAlarm.alarm;
    if (!alarm) {
      idle(ctx);
    } else if (alarm.station === name) {
      void (ctx.scene.scene.get(SceneKey.EventStation) as EventStationScene).open();
    } else {
      const def = ctx.voyage.events[alarm.eventId];
      const title = def ? tr(def.title) : alarm.eventId;
      ctx.ui.toast(
        formatText(tr(WRONG_STATION), {
          event: title,
          station: stationName(alarm.station).toLowerCase(),
        }),
      );
    }
  };
}

/**
 * The hold's access point where an open event is answered now (`stationObject` of the open
 * event whose station is a bay, by flag `event.<id>` = `open` and the hold of the flags), or
 * null. Derived from the flags only: a binding's `when` sees nothing else.
 */
function openBayStation(voyage: VoyageService, state: GameState): string | null {
  for (const [id, def] of Object.entries(voyage.events)) {
    if (typeof def.station === 'string') continue;
    if (state.flags.get(`event.${id}`) !== 'open') continue;
    return stationObject(def.station, voyage.hold(state.flags));
  }
  return null;
}

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
 * The hold's access points `bay-access-1..<bays>`, one above each bay (plan act2-stations D7):
 * only the one above the crate an open event is answered at is there (`openBayStation`), and
 * it opens that event's card.
 */
function bayAccess(voyage: VoyageService): Record<string, Binding> {
  return Object.fromEntries(
    Array.from({ length: voyage.cargo.bays }, (_, i): [string, Binding] => {
      const name = bayAccessName(i + 1);
      return [
        name,
        {
          kind: 'interactable',
          when: (state) => openBayStation(voyage, state) === name,
          // Never without an alarm: the point is there only while its event is open.
          run: alarmStation(name, (ctx) =>
            ctx.ui.toast(
              tr({
                en: 'Nothing open here. Just crates and ambition.',
                uk: 'Тут нічого не відкрито. Лише контейнери й амбіції.',
              }),
            ),
          ),
        },
      ];
    }),
  );
}

/**
 * The ship's deck in act 2, one screen: an ordinary location whose stations open panels.
 * Walking right from the spawn along the middle line: the navigation station (solar system and
 * ship), then the airlock. Events on the way are answered at the deck's stations, not on the
 * navigation panel (plan act2-stations D1): the airlock, the porthole, the radio and the access
 * point above a hold bay open the event's card when its alarm is on there, send the hero to the
 * right one when it is elsewhere, and are stubs otherwise. A death still shows on the
 * navigation panel: it opens by itself with LOST (D9, `src/scenes/stationFlow.ts`). The hold's
 * bays (`bay-1..7` for the 7 bays, class `prop`) show the cargo taken aboard, and so does the
 * HOLD strip at the top. Lines are placeholders. OWNER: script
 * Music: `music-flight`, act 2's calm flight; a station alarm switches to `music-alarm` and its
 * end brings the flight track back where it stopped (`src/scenes/stationSound.ts`). The track
 * has no drum layer (`musicLayer`) so far.
 */
export const shipDeck: LocationDef = {
  title: { en: 'Ship deck', uk: 'Палуба корабля' }, // OWNER: script
  background: 'location-ship-deck',
  map: 'ship-deck',
  music: 'music-flight', // OWNER: art
  showHold: true,
  bindings: ({ voyage }) => ({
    ...bays(voyage),
    ...bayAccess(voyage),
    'station-navigation': {
      kind: 'interactable',
      run: (ctx) => (ctx.scene.scene.get(SceneKey.Navigation) as NavigationScene).open(),
    },
    porthole: {
      kind: 'interactable',
      run: alarmStation('porthole', (ctx) =>
        ctx.ui.toast(tr({ en: 'Porthole view.', uk: 'Вид з ілюмінатора.' })),
      ),
    },
    radio: {
      kind: 'interactable',
      run: alarmStation('radio', (ctx) => ctx.ui.toast(tr({ en: 'Radio.', uk: 'Радіо.' }))),
    },
    airlock: {
      kind: 'interactable',
      run: alarmStation('airlock', (ctx) => ctx.ui.toast(tr({ en: 'Airlock.', uk: 'Шлюз.' }))),
    },
  }),
};
