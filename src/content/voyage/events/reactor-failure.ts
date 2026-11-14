import type { VoyageEventDef } from '@/core/voyage/voyageEvents';

/**
 * E3 with a reactor aboard (GDD `evt-catalog` A, plan D5: the reactor fails only in its own
 * event): it overheats between the Moon and Mars - shut it down for good, or try to save it.
 */
export const reactorFailure: VoyageEventDef = {
  // OWNER: design - the leg (1: Moon -> Mars) and the chance (only with a working reactor).
  // OWNER: physics - the point `at`: late on the leg so that "Shut it down" (no other power
  // aboard) still reaches Mars on the base's reserve (GDD `res-power` C: SCRAM, the reserve
  // to the next gate); at 0.5 it was a sure frozen death (plan S12).
  leg: 1,
  at: 0.85,
  chance: (ctx) => (ctx.has('reactor') ? 0.4 : 0),
  speaker: 'computer',
  // OWNER: script
  title: 'Reactor fault',
  text: '[TODO: the reactor overheats; the computer asks what to do]',
  choices: [
    {
      id: 'shut-down',
      // OWNER: script
      text: '[TODO: Shut it down for good]',
      result: '[TODO: the reactor is cold; power from what is left]',
      // OWNER: design
      effect: { offline: ['reactor'] },
    },
    {
      id: 'restart',
      // OWNER: script
      text: '[TODO: Try to cool it and keep it running]',
      result: '[TODO: the temperature falls, it holds]',
      hitResult: '[TODO: it melts down]',
      // OWNER: design - the chance it goes wrong: the crew dies (`event:reactor-failure`).
      risk: () => 0.3,
      onHit: { die: true },
    },
  ],
};
