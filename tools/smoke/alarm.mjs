/**
 * Smoke helpers for act 2's station alarms (plan act2-stations S4): an event on the way is no
 * longer answered on the navigation panel; the panel flashes the alarm and closes by itself,
 * and the event's card opens at its deck station (`EventStationScene`). `h` is the scenario's
 * helper object (tools/smoke.mjs).
 *
 *   await answerAlarm(h)                 the first choice of the open event at its station
 *   await answerAlarm(h, { choice: 1 })  another row (`shot: 'name'`: a screenshot of the card)
 *   await openNavigation(h)              back to the navigation station, E: the panel is open
 */

/** Where the hero's feet stand to use each deck station (map px of the generated ship-deck map). */
const STANDS = {
  'station-navigation': { x: 192, y: 186 },
  airlock: { x: 596, y: 180 },
  porthole: { x: 304, y: 30 },
  radio: { x: 408, y: 72 },
};

/** The hold's access point N (`bay-access-N`, 160 + 48 (N - 1), 256, 32x8): just above it. */
const BAY_ACCESS = /^bay-access-(\d+)$/;

/** Where the hero stands to use deck object `name` (a station or a hold access point). */
export function standOf(name) {
  const bay = BAY_ACCESS.exec(name);
  if (bay) return { x: 176 + 48 * (Number(bay[1]) - 1), y: 252 };
  const stand = STANDS[name];
  if (!stand) throw new Error(`no stand point for deck object "${name}"`);
  return stand;
}

/**
 * Teleports the hero to deck object `name`'s stand point and waits until it is focused (the
 * world must be running: no panel open).
 */
export async function standAt(h, name) {
  const { x, y } = standOf(name);
  await h.waitFor(() => window.nasa.game.scene.isActive('World'), 5000);
  await h.teleport(x, y);
  await h.eval((target) => {
    window.__smokeFocusTarget = target;
  }, name);
  await h.waitFor(
    () =>
      window.nasa.game.scene.getScene('World').debugInfo().focused === window.__smokeFocusTarget,
    5000,
  );
}

/**
 * Answers the station alarm on now: waits until the navigation panel has closed by itself
 * (the flash), goes to the alarm's station, presses E, waits until the card takes input,
 * picks row `choice` (default the first; `shot`: a screenshot of the card first) and waits
 * until the card has closed and the alarm is off (or the next event's is on). Returns what was
 * answered: `{ eventId, station, choice, choiceId, card }` (`card`: the card's debugInfo as
 * opened).
 */
export async function answerAlarm(h, { choice = 0, shot = null } = {}) {
  await h.waitFor(() => window.nasa.services.stationAlarm.alarm !== null, 5000);
  const alarm = await h.eval(() => window.nasa.services.stationAlarm.alarm);
  // The panel closes by itself after the flash; opened during an alarm it stays: Esc.
  await h.waitFor(() => {
    const scene = window.nasa.game.scene;
    return (
      !scene.isActive('Navigation') ||
      scene.getScene('Navigation').debugInfo().alarm?.closing === false
    );
  }, 5000);
  if (await h.eval(() => window.nasa.game.scene.isActive('Navigation'))) await h.press('Escape');
  await h.waitFor(() => !window.nasa.game.scene.isActive('Navigation'), 5000);
  await standAt(h, alarm.station);
  await h.press('KeyE');
  await h.waitFor(() => {
    const scene = window.nasa.game.scene;
    return (
      scene.isActive('EventStation') &&
      scene.getScene('EventStation').debugInfo().card?.locked === false
    );
  }, 5000);
  const opened = await h.eval(() => window.nasa.game.scene.getScene('EventStation').debugInfo());
  if (opened.eventId !== alarm.eventId) {
    throw new Error(`the card at ${alarm.station} is for ${opened.eventId}, not ${alarm.eventId}`);
  }
  if (opened.card.disabled[choice]) {
    throw new Error(`row ${choice} of ${alarm.eventId} is disabled: ${JSON.stringify(opened)}`);
  }
  const choiceId = await h.eval(
    (index) => window.nasa.services.simulation.voyage?.openEvent?.choices[index]?.id ?? null,
    choice,
  );
  for (let i = opened.card.selected; i < choice; i++) await h.press('ArrowDown');
  await h.eval((index) => {
    window.__smokeChoice = index;
  }, choice);
  await h.waitFor(
    () =>
      window.nasa.game.scene.getScene('EventStation').debugInfo().card?.selected ===
      window.__smokeChoice,
    3000,
  );
  if (shot) await h.shot(shot);
  await h.press('Enter');
  await h.waitFor(() => !window.nasa.game.scene.isActive('EventStation'), 5000);
  // The alarm goes off a step after the answer (or the next event of the queue comes on).
  await h.eval((id) => {
    window.__smokeAnswered = id;
  }, alarm.eventId);
  await h.waitFor(
    () => window.nasa.services.stationAlarm.alarm?.eventId !== window.__smokeAnswered,
    5000,
  );
  return { eventId: alarm.eventId, station: alarm.station, choice, choiceId, card: opened.card };
}

/** Goes back to the navigation station and opens the panel (E); resolves once it is open. */
export async function openNavigation(h) {
  await standAt(h, 'station-navigation');
  await h.press('KeyE');
  await h.waitFor(() => window.nasa.game.scene.isActive('Navigation'), 5000);
}
