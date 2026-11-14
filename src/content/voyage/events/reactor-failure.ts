import { TODO } from '@/core/locale/text';
import type { VoyageEventDef } from '@/core/voyage/voyageEvents';

/**
 * E3 with a reactor aboard (GDD `evt-catalog` A, plan D5: the reactor fails only in its own
 * event): it overheats between the Moon and Mars - shut it down for good, or try to save it.
 */
export const reactorFailure: VoyageEventDef = {
  // OWNER: design - the leg (1: Moon -> Mars) and the chance (only with a working reactor; 0.4
  // before the alarms grew more frequent late on the leg, plan act2-stations D11).
  // OWNER: physics - the point `at`: late on the leg so that "Shut it down" (no other power
  // aboard) still reaches Mars on the base's reserve (GDD `res-power` C: SCRAM, the reserve
  // to the next gate); at 0.5 it was a sure frozen death (plan S12).
  leg: 1,
  at: 0.85,
  chance: (ctx) => (ctx.has('reactor') ? 0.5 : 0),
  speaker: 'computer',
  // OWNER: script
  title: { en: 'Reactor fault', uk: TODO },
  text: { en: 'The reactor overheats; the computer asks what to do.', uk: TODO },
  // OWNER: design - the deck station the alarm is answered at, and the choice applied when its
  // timer runs out: shutting it down (a melt-down would kill) (plan act2-stations D3, D8).
  station: { bayOf: 'reactor' },
  timeoutChoice: 'shut-down',
  choices: [
    {
      id: 'shut-down',
      // OWNER: script
      text: { en: 'Shut it down for good.', uk: TODO },
      result: { en: 'The reactor is cold; power from what is left.', uk: TODO },
      // OWNER: design
      effect: { offline: ['reactor'] },
    },
    {
      id: 'restart',
      // OWNER: script
      text: { en: 'Try to cool it and keep it running.', uk: TODO },
      result: { en: 'The temperature falls; it holds.', uk: TODO },
      hitResult: { en: 'It melts down.', uk: TODO },
      // OWNER: design - the chance it goes wrong: the crew dies (`event:reactor-failure`).
      risk: () => 0.3,
      onHit: { die: true },
    },
  ],
};
