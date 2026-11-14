import Phaser from 'phaser';
import { stationName } from '@/content/locations/ship-deck';
import { services } from '@/core/services';
import { deltaVMS } from '@/core/simulation/rocket';
import type { Telemetry } from '@/core/simulation/telemetry';
import type { AutopilotState, SimulationSnapshot, Vec2 } from '@/core/simulation/types';
import type { LegForecast } from '@/core/voyage/forecast';
import type { Voyage } from '@/core/voyage/Voyage';
import { SceneKey } from '@/scenes/keys';
import type { Point } from '@/world/Actor';
import { PanelScene } from '@/ui/PanelScene';
import { Button } from '@/ui/kit/Button';
import { createText } from '@/ui/kit/text';
import { Toast } from '@/ui/kit/Toast';
import { AlarmNotice } from '@/ui/navigation/AlarmNotice';
import type { CardInfo } from '@/ui/navigation/Card';
import { GateCard, type GateChoice } from '@/ui/navigation/GateCard';
import { GateRibbon, type RibbonView } from '@/ui/navigation/GateRibbon';
import {
  alarmText,
  causeText,
  resourceRows,
  ROW_IDS,
  shownDay,
  statusOf,
  telemetryLines,
  type Level,
  type RowId,
  type RowView,
  type Status,
} from '@/ui/navigation/navigationView';
import { StatusColumn, type ColumnView } from '@/ui/navigation/StatusColumn';
import { SystemMap, type GateState } from '@/ui/navigation/SystemMap';
import { theme } from '@/ui/theme';

/** What `NavigationScene.debugInfo()` returns. */
export interface NavigationDebugInfo {
  /** Whether a voyage is started (false outside act 2, e.g. `?location=ship-deck`). */
  started: boolean;
  /** The voyage's phase (`VoyagePhase`), or null when not started. */
  phase: string | null;
  /** Leg flown (or gate parked at) and the last gate reached (-1: none). */
  legIndex: number;
  gateIndex: number;
  /** Autopilot phase and whether it fires the engine; null if not started. */
  autopilot: { phase: AutopilotState['phase']; thrusting: boolean } | null;
  /** Whether simulated time advances now (`simulation.isRunning`: no hold reason). */
  run: boolean;
  /** The status word as shown (RUN, HOLD, DRIFTING, LANDED, LOST, OFFLINE). */
  status: Status;
  /** Day of the voyage as shown (from 1; 0 when not started). */
  day: number;
  /** The "Next: ..." line and the detail line under it, as shown. */
  next: string;
  detail: string;
  /** Simulated seconds per real second (not shown: GDD `ux-panel-layout`). */
  timeScale: number;
  /**
   * The ship's mass now, kg, unrounded (M(t), `ShipState.massKg`; the first telemetry line);
   * 0 when not started.
   */
  massKg: number;
  /** The flight data now, unrounded (`SimulationService.telemetry`); null when not started. */
  telemetry: Telemetry | null;
  /** The column's telemetry lines as shown (empty when not started). */
  telemetryLines: string[];
  /** Delta-v the fuel gives now, m/s, unrounded (the FUEL row's "Δv"); 0 when not running. */
  dvMS: number;
  /** Each resource row: value text and level, as shown (null when not started). */
  rows: Record<RowId, { value: string; level: Level }> | null;
  /** Death causes whose alarm is on (red rows, D14). */
  alarms: string[];
  /** The open gate card, with `fuelShort`; null: the column or the alarm. */
  card: (CardInfo & { fuelShort?: boolean }) | null;
  /**
   * The alarm shown in place of the column while an event waits for an answer at a deck
   * station (its lines), and whether the panel closes by itself (the flash); null: none.
   */
  alarm: { lines: string[]; closing: boolean } | null;
  /** The log as kept (oldest first). */
  log: string[];
  /** The toast on screen, or null. */
  toast: string | null;
  /** Points in the trail. */
  trail: number;
  /** Button centres in game pixels, for `h.click(x, y)` (hidden while a card is open). */
  buttons: { close: Point };
}

const PANEL_WIDTH = 624;
const PANEL_HEIGHT = 344;
/** Gap between the station alarm's timer box and the Close button under it, px. */
const ALARM_BAR_GAP = 8;
/** Height of the gate ribbon at the top and the gap under it, px. */
const RIBBON_HEIGHT = 24;
const RIBBON_GAP = 8;
/** Side of the square map, px (the outermost orbit, Mars's, 140 px from the Sun, D27). */
const MAP_SIZE = 288;
/** Gap between the map and the right column, px. */
const COLUMN_GAP = 12;
const CLOSE_BUTTON = { width: 104, height: 24 };
/** The key legend over the buttons and its distance above the column's bottom, px. OWNER: script */
const LEGEND = 'E/Esc: close';
const LEGEND_Y = 36;
/** Most trail points kept: older ones are thinned out (every other one dropped). */
const TRAIL_MAX = 600;
/** Log entries kept (the column shows those that fit). */
const LOG_MAX = 12;
/** The toast's bottom above the map's bottom (its caption), and its side margin, px. */
const TOAST_ABOVE = 28;
const TOAST_MARGIN = 16;
/** Sound of an alarm (D14). */
const ALARM_SOUND = 'sfx-alarm';
/**
 * How long the panel shows an event's alarm before it closes by itself, so the player runs to
 * the event's deck station, ms (plan act2-stations D6). Part of the station timer. OWNER: design
 */
export const ALARM_FLASH_MS = 700;

/**
 * Navigation panel of act 2 (plan S8; GDD `ux-panel-layout` B, `gate-panel-view` A,
 * `evt-presentation` A, `ux-panel-keys`), opened by the navigation station on the ship deck.
 * The world is paused under it; the player does not steer (the autopilot flies the chain of
 * gates). Layout, 640x360:
 * - the gate ribbon across the top: the Earth and six gates, passed / current / ahead, the
 *   ship moving along its leg;
 * - the map on the left: the whole system in root scale ("Map not to scale"), orbits, bodies,
 *   gate rings, the ship's trail and triangle, the forecast's mark where the first stock runs
 *   out (D7, D27);
 * - the column on the right: RUN / HOLD / DRIFTING / LANDED / LOST, the day, "Next: MARS in
 *   51 d", six resource rows (OXYGEN, SUPPLIES, POWER in days, FUEL in gates, HEAT and COMMS
 *   as states with a trend; normal / low / critical), two telemetry lines (mass, its rate and
 *   the engine's acceleration; local gravity and escape speed), the log, the key legend and
 *   buttons;
 * - at a gate the column gives way to the gate card (`GateCard`); at an event, to its alarm
 *   (`AlarmNotice`: the event and its deck station, plan act2-stations D6): the panel closes by
 *   itself after `ALARM_FLASH_MS` and the event is answered at that station
 *   (`EventStationScene`); opened again during the alarm it shows the notice until closed.
 *
 * Simulated time runs whenever the panel is open on a leg and nothing else holds it (a gate's
 * card, an event, the pause menu, a hidden tab); it stands while the panel is closed. Keys:
 * `cancel` (Esc) or `interact` (E) or the button closes. On a card the keys belong to its
 * choice list: Esc does not dismiss a decision, and the press that closed a card is ignored for
 * that frame. Alarms (D14): a toast, a sound and the row in red. The trail and the log stay
 * for the voyage across openings. Everything comes from `services.simulation`
 * (docs/HOWTO-simulation.md).
 */
export class NavigationScene extends PanelScene {
  private map?: SystemMap;
  private ribbon?: GateRibbon;
  private column?: StatusColumn;
  private legend?: Phaser.GameObjects.Text;
  private closeButton?: Button;
  private toast?: Toast;
  private card: GateCard | null = null;
  /** The alarm shown in place of the column while an event is open, or null. */
  private notice: AlarmNotice | null = null;
  /** Closes the panel at the end of the alarm's flash; null when not flashing. */
  private flash: Phaser.Time.TimerEvent | null = null;
  /** What the column gives way to ("gate:0", "event:hull-breach"), null: nothing. */
  private cardKey: string | null = null;
  /** The forecast the gate card shows (to update it once the forecast is in). */
  private cardForecast: LegForecast | null = null;
  private columnArea = new Phaser.Geom.Rectangle();
  /** Keys pressed in this frame or earlier are ignored (the panel or a card just changed). */
  private ignoreInputFrame = -1;
  /** The voyage the trail and the log belong to: a new voyage starts them again. */
  private voyageShown: Voyage | null = null;
  /** Ship positions in metres, oldest first. */
  private trail: Vec2[] = [];
  private log: string[] = [];
  private shown: { column: ColumnView | null; alarms: string[] } = { column: null, alarms: [] };

  constructor() {
    super(SceneKey.Navigation);
  }

  protected build(): void {
    // Time runs while the panel is open (unless a gate, an event, pause or blur holds it).
    services.simulation.release('panel');
    // Esc and E are handled in `update`: not on a card.
    this.closeOnCancel = false;
    this.ignoreInputFrame = this.game.loop.frame;
    const area = this.addPanel({ width: PANEL_WIDTH, height: PANEL_HEIGHT });
    const top = area.y + RIBBON_HEIGHT + RIBBON_GAP;
    const mapArea = new Phaser.Geom.Rectangle(area.x, top, MAP_SIZE, area.bottom - top);
    const columnX = area.x + MAP_SIZE + COLUMN_GAP;
    this.columnArea = new Phaser.Geom.Rectangle(
      columnX,
      top,
      area.right - columnX,
      area.bottom - top,
    );

    const simulation = services.simulation;
    const system = simulation.system;
    const gates = simulation.content?.gates ?? [];
    if (system) {
      this.map = new SystemMap(this, mapArea, system, gates);
      const home = system.bodies.find((body) => body.role === 'home')?.name ?? 'Earth';
      const names = [home, ...gates.map((gate) => system.get(gate.body).name)];
      this.ribbon = new GateRibbon(
        this,
        new Phaser.Geom.Rectangle(area.x, area.y, area.width, RIBBON_HEIGHT),
        names,
      );
    }
    this.column = new StatusColumn(this, this.columnArea);
    const col = this.columnArea;
    this.legend = createText(this, col.x, col.bottom - LEGEND_Y, LEGEND, 'small');
    const buttonY = col.bottom - CLOSE_BUTTON.height / 2;
    this.closeButton = new Button(
      this,
      col.right - CLOSE_BUTTON.width / 2,
      buttonY,
      'Close',
      () => this.close(),
      CLOSE_BUTTON,
    );
    // Over the map, above its caption: it covers no row, card or button.
    this.toast = new Toast(
      this,
      Math.round(mapArea.centerX),
      mapArea.bottom - TOAST_ABOVE,
      MAP_SIZE - TOAST_MARGIN * 2,
    );

    this.syncVoyage();
    this.column.drawLog(this.log);

    const events = services.events;
    const unsubscribe = [
      events.on('simulationTick', () => this.onTick()),
      events.on('gateReached', ({ body }) =>
        this.addLog(`reached ${this.bodyName(body).toUpperCase()}`),
      ),
      events.on('voyageEvent', ({ eventId }) =>
        this.addLog(services.simulation.voyage?.openEvent?.title ?? eventId),
      ),
      events.on('voyageEventResolved', ({ text }) => {
        if (!text) return;
        this.addLog(text);
        this.toast?.show(text);
      }),
      events.on('shipAlarm', ({ cause, days }) => {
        const text = alarmText(cause, days);
        this.addLog(text);
        this.toast?.show(text);
        services.audio.playSfx(ALARM_SOUND);
      }),
      events.on('voyageEnded', ({ outcome }) =>
        this.addLog(
          outcome.kind === 'landed'
            ? `landed on ${this.bodyName(outcome.body).toUpperCase()}`
            : `LOST: ${causeText(outcome.cause)}`,
        ),
      ),
    ];
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      // Time stands whenever the panel is closed.
      services.simulation.hold('panel');
      for (const off of unsubscribe) off();
      this.card?.destroy();
      this.card = null;
      this.notice?.destroy();
      this.notice = null;
      this.flash = null;
      this.cardKey = null;
      this.cardForecast = null;
      this.map = this.ribbon = this.column = undefined;
      this.legend = this.toast = undefined;
      this.closeButton = undefined;
    });
    this.syncCard(true);
    this.redraw();
  }

  /**
   * Keeps the card in step with the voyage, then reads the keys: `cancel` or `interact` closes;
   * not while a card is open (its list has them).
   */
  update(): void {
    this.syncVoyage();
    this.syncCard();
    this.drawColumn();
    const frame = this.game.loop.frame;
    if (this.card || frame <= this.ignoreInputFrame) return;
    if (this.controls.justPressed('cancel') || this.controls.justPressed('interact')) {
      this.close();
    }
  }

  /** State for the smoke tool and the console: `window.nasa.game.scene.getScene('Navigation')`. */
  /**
   * Where the station alarm's timer box goes while this panel shows the alarm: the bottom-right
   * corner of the free space under the alarm text, above the Close button, so the box covers
   * neither the gate ribbon nor the text. Null when no alarm is shown here (the box then keeps
   * its top-right corner).
   */
  alarmBarSpot(): { right: number; bottom: number } | null {
    if (!this.notice || !this.closeButton) return null;
    const col = this.columnArea;
    return { right: col.right, bottom: col.bottom - CLOSE_BUTTON.height - ALARM_BAR_GAP };
  }

  debugInfo(): NavigationDebugInfo {
    const simulation = services.simulation;
    const voyage = simulation.voyage;
    const pilot = simulation.autopilot;
    const snapshot = simulation.snapshot();
    const center = (button?: Button): Point =>
      button?.visible ? { x: button.x, y: button.y } : { x: -1, y: -1 };
    const column = this.shown.column;
    const rows = column?.rows
      ? (Object.fromEntries(
          ROW_IDS.map((id) => [
            id,
            { value: column.rows?.[id].value, level: column.rows?.[id].level },
          ]),
        ) as Record<RowId, { value: string; level: Level }>)
      : null;
    const alarm = this.notice ? { lines: this.notice.lines, closing: this.flash !== null } : null;
    const card = this.card
      ? {
          ...this.card.debugInfo(),
          ...(this.card instanceof GateCard ? { fuelShort: this.card.fuelShort } : {}),
        }
      : null;
    return {
      started: simulation.isStarted,
      phase: voyage?.phase ?? null,
      legIndex: voyage?.legIndex ?? -1,
      gateIndex: voyage?.gateIndex ?? -1,
      autopilot: pilot ? { phase: pilot.phase, thrusting: pilot.thrusting } : null,
      run: simulation.isRunning,
      status: column?.status ?? 'OFFLINE',
      day: voyage ? shownDay(voyage.day) : 0,
      next: column?.next ?? '',
      detail: column?.detail ?? '',
      timeScale: Math.round(snapshot?.timeScale ?? 0),
      massKg: snapshot?.ship.massKg ?? 0,
      dvMS: snapshot && simulation.content ? fuelDv(simulation.content.ship.ispS, snapshot) : 0,
      telemetry: simulation.telemetry(),
      telemetryLines: this.column?.telemetryText ?? [],
      rows,
      alarms: [...this.shown.alarms],
      card,
      alarm,
      log: [...this.log],
      toast: this.toast?.message ?? null,
      trail: this.trail.length,
      buttons: { close: center(this.closeButton) },
    };
  }

  /** A new voyage (started again) begins a new trail and log. */
  private syncVoyage(): void {
    const simulation = services.simulation;
    const voyage = simulation.voyage;
    if (voyage !== this.voyageShown) {
      this.voyageShown = voyage;
      this.trail = [];
      this.log = [];
      const first = simulation.content?.gates[0]?.body;
      if (voyage && first) this.addLog(`on course for ${this.bodyName(first).toUpperCase()}`);
      this.column?.drawLog(this.log);
    }
  }

  private onTick(): void {
    const snapshot = services.simulation.snapshot();
    if (snapshot) {
      this.trail.push({ x: snapshot.ship.x, y: snapshot.ship.y });
      if (this.trail.length > TRAIL_MAX) this.trail = this.trail.filter((_, i) => i % 2 === 0);
    }
    this.redraw();
  }

  /**
   * Opens the card the voyage asks for (a gate's), or the alarm of an open event, or closes
   * them, and hands the gate card the forecast once it is computed. An event that opens while
   * the panel is open (not `atOpen`) flashes its alarm and closes the panel (D6).
   */
  private syncCard(atOpen = false): void {
    const voyage = services.simulation.voyage;
    let key: string | null = null;
    if (voyage?.phase === 'atGate') key = `gate:${voyage.gateIndex}`;
    else if (voyage?.phase === 'event') key = `event:${voyage.openEvent?.id ?? ''}`;
    if (key !== this.cardKey) {
      if (this.card) {
        this.card.destroy();
        this.card = null;
        // The press that chose on the card must not act on the panel in the same frame.
        this.ignoreInputFrame = this.game.loop.frame;
      }
      this.notice?.destroy();
      this.notice = null;
      this.flash?.remove();
      this.flash = null;
      this.cardKey = key;
      this.cardForecast = null;
      if (voyage?.phase === 'event') {
        this.notice = this.openNotice(voyage);
        if (!atOpen) this.flash = this.time.delayedCall(ALARM_FLASH_MS, () => this.close());
      } else if (voyage && key) {
        this.card = this.openGateCard(voyage);
      }
      const showColumn = this.card === null && this.notice === null;
      this.column?.setVisible(showColumn);
      this.legend?.setVisible(showColumn);
      // The alarm can be closed with the button too; a card cannot.
      this.closeButton?.setVisible(this.card === null);
      this.redraw();
    }
    if (this.card instanceof GateCard && voyage && voyage.forecast !== this.cardForecast) {
      this.cardForecast = voyage.forecast;
      this.card.setForecast(voyage.forecast);
      this.redraw();
    }
  }

  /** The alarm of the open event: its title and the deck station it is answered at. */
  private openNotice(voyage: Voyage): AlarmNotice {
    const alarm = services.stationAlarm.alarm;
    return new AlarmNotice(this, this.columnArea, {
      title: voyage.openEvent?.title ?? '',
      station: alarm ? stationName(alarm.station) : '?',
    });
  }

  private openGateCard(voyage: Voyage): GateCard | null {
    const simulation = services.simulation;
    const gates = simulation.content?.gates ?? [];
    const gate = gates[voyage.gateIndex];
    if (!gate) return null;
    const next = gates[voyage.gateIndex + 1];
    return new GateCard(
      this,
      this.columnArea,
      this.controls,
      {
        gate: voyage.gateIndex,
        total: gates.length,
        body: this.bodyName(gate.body),
        next: voyage.atLastGate || !next ? null : this.bodyName(next.body),
        day: shownDay(voyage.day),
        tier: services.voyage.colonyTier(gate.body, voyage.simulation.cargo),
        heatMax: voyage.simulation.snapshot().resources.heat.max,
      },
      (choice: GateChoice) => {
        if (choice === 'goOn') simulation.goOn();
        else simulation.stopHere();
      },
    );
  }

  private redraw(): void {
    this.drawMap();
    this.drawColumn();
  }

  /** The map and the ribbon. */
  private drawMap(): void {
    const simulation = services.simulation;
    const voyage = simulation.voyage;
    const snapshot = simulation.snapshot();
    const gates = this.gateStates(voyage, simulation.content?.gates.length ?? 0);
    const lost = voyage?.phase === 'drifting' || voyage?.outcome?.kind === 'died';
    const shipColor = lost ? theme.map.mark : theme.map.ship;
    const forecast = voyage && voyage.phase !== 'ended' ? voyage.forecast : null;
    const depletion = forecast?.firstDepletion ?? null;
    this.map?.draw({
      timeS: snapshot?.timeS ?? 0,
      ship: snapshot?.ship ?? null,
      shipColor,
      trail: this.trail,
      gates,
      mark: depletion ? { x: depletion.x, y: depletion.y } : null,
    });
    this.ribbon?.draw({ gates, ship: this.ribbonShip(voyage), shipColor });
  }

  /** The status column (also every frame: holds may change from outside). */
  private drawColumn(): void {
    this.column?.draw(this.columnView());
  }

  /** What the column shows now. OWNER: script - the "next", day and leg lines. */
  private columnView(): ColumnView {
    const simulation = services.simulation;
    const voyage = simulation.voyage;
    const snapshot = simulation.snapshot();
    const content = simulation.content;
    if (!voyage || !snapshot || !content) {
      const view: ColumnView = {
        status: 'OFFLINE',
        day: '',
        next: 'Simulation not running (act 2 only)',
        nextColor: theme.text.dim,
        detail: '',
        rows: null,
        telemetry: [],
      };
      this.shown = { column: view, alarms: [] };
      return view;
    }
    const run = simulation.isRunning;
    const phase = voyage.phase;
    const outcome = voyage.outcome;
    const status = statusOf(phase, run, outcome);
    const target = voyage.legIndex;
    const gates = content.gates;
    const name = this.bodyName(gates[target]?.body ?? '').toUpperCase();
    let next = `Next: ${name}`;
    let nextColor: string = theme.text.normal;
    const forecast = voyage.forecast;
    if (outcome?.kind === 'landed') {
      next = `Landed on ${this.bodyName(outcome.body).toUpperCase()}`;
      nextColor = theme.text.good;
    } else if (outcome?.kind === 'died') {
      next = `Lost: ${causeText(outcome.cause)}, day ${shownDay(outcome.day)}`;
      nextColor = theme.text.alarm;
    } else if (phase === 'drifting') {
      next = `Out of fuel before ${name}`;
      nextColor = theme.text.alarm;
    } else if (phase === 'atGate') {
      next = `At ${name}`;
      nextColor = theme.text.highlight;
    } else if (forecast && forecast.leg === target && forecast.arrives) {
      const days = Math.max(0, Math.ceil(forecast.startDay + forecast.legDays - voyage.day));
      next = `Next: ${name} in ${days} d`;
    }
    const alarms = simulation
      .forecastLife()
      .filter((death) => death.alarm)
      .map((death) => death.cause as string);
    const legForecast =
      forecast && forecast.leg === target && phase !== 'atGate' && phase !== 'ended'
        ? forecast
        : null;
    const legs = content.legs;
    const telemetry = simulation.telemetry();
    const rows: Record<RowId, RowView> = resourceRows({
      snapshot,
      forecast: legForecast,
      alarms,
      drifting: phase === 'drifting',
      fuelDvMS: fuelDv(content.ship.ispS, snapshot),
      comms: { now: legs[target]?.comms ?? 'ok', next: legs[target + 1]?.comms ?? null },
    });
    const view: ColumnView = {
      status,
      day: `Day ${shownDay(voyage.day)}`,
      next,
      nextColor,
      detail: `Leg ${target + 1}/${gates.length} · ${engineWord(snapshot.autopilot)}`,
      rows,
      telemetry: telemetry ? telemetryLines(telemetry) : [],
    };
    this.shown = { column: view, alarms };
    return view;
  }

  /** Each gate passed, current (flown to, parked at, landed on, died on the way to) or ahead. */
  private gateStates(voyage: Voyage | null, count: number): GateState[] {
    let current = -1;
    const outcome = voyage?.outcome;
    if (outcome) current = outcome.kind === 'landed' ? outcome.gate : outcome.leg;
    else if (voyage) current = voyage.phase === 'atGate' ? voyage.gateIndex : voyage.legIndex;
    return Array.from({ length: count }, (_, i) =>
      i < current ? 'passed' : i === current ? 'current' : 'ahead',
    );
  }

  /** Where the ship is on the ribbon. */
  private ribbonShip(voyage: Voyage | null): RibbonView['ship'] {
    if (!voyage) return null;
    const outcome = voyage.outcome;
    if (outcome?.kind === 'landed') return { leg: outcome.gate, fraction: 1 };
    if (outcome?.kind === 'died') return { leg: outcome.leg, fraction: outcome.legFraction };
    if (voyage.phase === 'atGate') return { leg: voyage.gateIndex, fraction: 1 };
    return { leg: voyage.legIndex, fraction: voyage.legFraction };
  }

  /** Adds "Day N: text" to the log. OWNER: script - the log lines are written at its callers. */
  private addLog(text: string): void {
    const voyage = services.simulation.voyage;
    const day = voyage ? shownDay(voyage.day) : 0;
    this.log.push(`Day ${day}: ${text}`);
    if (this.log.length > LOG_MAX) this.log.shift();
    this.column?.drawLog(this.log);
  }

  private bodyName(id: string): string {
    if (!id) return '';
    return services.simulation.system?.get(id).name ?? id;
  }
}

/** Delta-v the fuel of `snapshot` gives at its mass, m/s (the rocket equation). */
function fuelDv(ispS: number, snapshot: SimulationSnapshot): number {
  return deltaVMS(ispS, snapshot.ship.massKg, snapshot.resources.fuel.value);
}

/** What the engine does, for the detail line. OWNER: script */
function engineWord(pilot: AutopilotState): string {
  switch (pilot.phase) {
    case 'flying':
      return pilot.thrusting ? 'burn' : 'coast';
    case 'docking':
      return 'docking';
    case 'arrived':
    case 'finished':
      return 'parked';
    case 'drifting':
      return 'drift';
  }
}
