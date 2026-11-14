import Phaser from 'phaser';
import { services } from '@/core/services';
import { DAY_S } from '@/core/simulation/constants';
import type { Body, SimulationSnapshot, Vec2 } from '@/core/simulation/types';
import { RESOURCE_IDS } from '@/core/simulation/types';
import { SceneKey } from '@/scenes/keys';
import type { Point } from '@/world/Actor';
import { PanelScene } from '@/ui/PanelScene';
import { Button } from '@/ui/kit/Button';
import { createText } from '@/ui/kit/text';
import { theme } from '@/ui/theme';

/** What `NavigationScene.debugInfo()` returns. */
export interface NavigationDebugInfo {
  /** Whether the simulation is started (false outside act 2, e.g. `?location=ship-deck`). */
  started: boolean;
  /** Whether the ship's engine is on. */
  thrust: boolean;
  /** Simulated seconds per real second, as shown ("T x..."). */
  timeScale: number;
  /** Day of the voyage, as shown (from 1). */
  day: number;
  /** Points in the trail. */
  trail: number;
  /** Button centres in game pixels, for `h.click(x, y)`. */
  buttons: { thrust: Point; close: Point };
}

const PANEL_WIDTH = 608;
const PANEL_HEIGHT = 344;
/** Side of the square map on the left of the panel, px. */
const MAP_SIZE = 296;
/** Radius of the outermost orbit on the map, px: the map scale fits it in. */
const MAP_RADIUS = 140;
/** Gap between the map and the right column, px. */
const COLUMN_GAP = 16;
/** Height of a text line in the right column, px. */
const LINE = 14;
/** Distance between resource rows, px. */
const RESOURCE_ROW = 16;
/** Width of a resource name column and of a resource bar, px. */
const RESOURCE_LABEL_WIDTH = 64;
const BAR_WIDTH = 144;
const BAR_HEIGHT = 8;
/** Gap between a bar and its percentage, px. */
const BAR_GAP = 8;
const THRUST_BUTTON = { width: 136, height: 24 };
const CLOSE_BUTTON = { width: 96, height: 24 };
/** Points kept in the ship's trail (one per `simulationTick`, about four per second). */
const TRAIL_LENGTH = 200;
/**
 * Smallest distance between a moon and its planet on the map, px. At the scale that fits
 * Mars's orbit the Moon is a quarter of a pixel from the Earth; it is drawn this far out along
 * its real direction, so it can be seen. A display cheat only: the simulation is not affected.
 */
const MIN_MOON_OFFSET = 6;
/** Orbits smaller than this on the map are not drawn, px. */
const MIN_ORBIT_RADIUS = 2;
/** Distance from a dot to its name, px. */
const LABEL_GAP = 5;
/** Radii of the dots: the Sun, planets, moons, px. */
const SUN_DOT = 5;
const PLANET_DOT = 3;
const MOON_DOT = 1;
/** Ship triangle: length nose to tail and half width of the tail, px. */
const SHIP_LENGTH = 8;
const SHIP_HALF_WIDTH = 3;
/** Map colours: orbits, trail, ship. */
const ORBIT_COLOR = 0x46546e;
const TRAIL_COLOR = 0x8fd3ff;
const SHIP_COLOR = 0xffffff;

/**
 * Navigation panel, opened by the navigation station on the ship deck: the solar
 * system with the bodies on their orbits, the ship as a triangle pointing where it heads and its
 * recent trail, the time scale and the day of the voyage, a bar per ship resource, and buttons
 * "Thrust on/off" and "Close" (Esc closes too). The world is paused under it; the simulation
 * keeps running and the panel redraws on every `simulationTick`. Everything shown comes from
 * `services.simulation.snapshot()` (docs/HOWTO-simulation.md).
 */
export class NavigationScene extends PanelScene {
  private map?: Phaser.GameObjects.Graphics;
  private bars?: Phaser.GameObjects.Graphics;
  private bodyLabels = new Map<string, Phaser.GameObjects.Text>();
  private resourceValues: Phaser.GameObjects.Text[] = [];
  private timeText?: Phaser.GameObjects.Text;
  private dayText?: Phaser.GameObjects.Text;
  private thrustText?: Phaser.GameObjects.Text;
  private notRunning?: Phaser.GameObjects.Text;
  private thrustButton?: Button;
  private closeButton?: Button;
  /** Ship positions in metres, oldest first. */
  private trail: Vec2[] = [];
  /** Map centre (the Sun) in game pixels, and metres per pixel. */
  private center: Point = { x: 0, y: 0 };
  private metresPerPixel = 1;
  /** Left edge and top of the right column, px. */
  private column: Point = { x: 0, y: 0 };
  private shown = { timeScale: 0, day: 0 };

  constructor() {
    super(SceneKey.Navigation);
  }

  protected build(): void {
    const area = this.addPanel({ title: 'Navigation', width: PANEL_WIDTH, height: PANEL_HEIGHT });
    this.center = { x: Math.round(area.x + MAP_SIZE / 2), y: Math.round(area.y + MAP_SIZE / 2) };
    const system = services.simulation.system;
    const outermost = Math.max(1, ...(system?.bodies.map((body) => body.orbitRadiusM) ?? []));
    this.metresPerPixel = outermost / MAP_RADIUS;
    this.column = { x: area.x + MAP_SIZE + COLUMN_GAP, y: area.y };

    this.map = this.add.graphics();
    this.bars = this.add.graphics();
    for (const body of system?.bodies ?? []) {
      this.bodyLabels.set(body.id, createText(this, 0, 0, body.name, 'small'));
    }
    const { x, y } = this.column;
    this.timeText = createText(this, x, y, '', 'body');
    this.dayText = createText(this, x, y + LINE, '', 'body');
    this.thrustText = createText(this, x, y + LINE * 2, '', 'body');
    const firstRow = y + LINE * 4;
    this.resourceValues = RESOURCE_IDS.map((id, i) => {
      const rowY = firstRow + i * RESOURCE_ROW;
      createText(this, x, rowY, id, 'small');
      const valueX = x + RESOURCE_LABEL_WIDTH + BAR_WIDTH + BAR_GAP;
      return createText(this, valueX, rowY, '', 'body');
    });
    this.notRunning = createText(
      this,
      this.center.x,
      area.bottom - LINE,
      'Simulation not running (act 2 only)',
      'small',
    ).setOrigin(0.5, 0);

    const buttonY = area.bottom - THRUST_BUTTON.height / 2;
    this.thrustButton = new Button(
      this,
      x + THRUST_BUTTON.width / 2,
      buttonY,
      'Thrust on/off',
      () => this.toggleThrust(),
      THRUST_BUTTON,
    );
    this.closeButton = new Button(
      this,
      area.right - CLOSE_BUTTON.width / 2,
      buttonY,
      'Close',
      () => this.close(),
      CLOSE_BUTTON,
    );

    this.trail = [];
    const unsubscribe = services.events.on('simulationTick', () => this.onTick());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubscribe();
      this.map = undefined;
      this.bars = undefined;
      this.bodyLabels = new Map();
      this.resourceValues = [];
      this.timeText = this.dayText = this.thrustText = this.notRunning = undefined;
      this.thrustButton = this.closeButton = undefined;
      this.trail = [];
    });
    this.onTick();
  }

  /** State for the smoke tool and the console: `window.nasa.game.scene.getScene('Navigation')`. */
  debugInfo(): NavigationDebugInfo {
    const center = (button?: Button): Point => ({ x: button?.x ?? -1, y: button?.y ?? -1 });
    return {
      started: services.simulation.isStarted,
      thrust: services.simulation.thrust,
      timeScale: this.shown.timeScale,
      day: this.shown.day,
      trail: this.trail.length,
      buttons: { thrust: center(this.thrustButton), close: center(this.closeButton) },
    };
  }

  private toggleThrust(): void {
    services.simulation.setThrust(!services.simulation.thrust);
    this.redraw(services.simulation.snapshot());
  }

  private onTick(): void {
    const snapshot = services.simulation.snapshot();
    if (snapshot) {
      this.trail.push({ x: snapshot.ship.x, y: snapshot.ship.y });
      if (this.trail.length > TRAIL_LENGTH) this.trail.shift();
    }
    this.redraw(snapshot);
  }

  private redraw(snapshot: SimulationSnapshot | null): void {
    this.notRunning?.setVisible(snapshot === null);
    this.thrustButton?.setEnabled(snapshot !== null);
    this.drawMap(snapshot);
    this.drawStatus(snapshot);
  }

  /** Orbits, bodies with their names, the trail and the ship. */
  private drawMap(snapshot: SimulationSnapshot | null): void {
    const map = this.map;
    const system = services.simulation.system;
    if (!map || !system) return;
    const timeS = snapshot?.timeS ?? 0;
    map.clear();

    // Screen position of every body; moons pushed out to MIN_MOON_OFFSET (see there).
    const screen = new Map<string, Point>();
    for (const body of system.bodies) {
      const position = system.positionOf(body, timeS);
      const parent = body.parent === undefined ? undefined : system.get(body.parent);
      const parentAt = parent ? screen.get(parent.id) : undefined;
      if (!parent || !parentAt) {
        screen.set(body.id, this.toScreen(position));
        continue;
      }
      const from = system.positionOf(parent, timeS);
      const offset = { x: position.x - from.x, y: position.y - from.y };
      const pixels = Math.hypot(offset.x, offset.y) / this.metresPerPixel;
      const scale = Math.max(pixels, MIN_MOON_OFFSET) / Math.max(pixels, Number.EPSILON);
      screen.set(body.id, {
        x: Math.round(parentAt.x + (offset.x / this.metresPerPixel) * scale),
        y: Math.round(parentAt.y - (offset.y / this.metresPerPixel) * scale),
      });
    }

    map.lineStyle(1, ORBIT_COLOR, 1);
    for (const body of system.bodies) {
      const radius = Math.round(body.orbitRadiusM / this.metresPerPixel);
      if (radius < MIN_ORBIT_RADIUS) continue;
      const around = body.parent === undefined ? this.center : screen.get(body.parent);
      if (around) map.strokeCircle(around.x, around.y, radius);
    }

    for (const body of system.bodies) {
      const at = screen.get(body.id);
      if (!at) continue;
      map.fillStyle(body.color, 1);
      map.fillCircle(at.x, at.y, dotRadius(body));
      const label = this.bodyLabels.get(body.id);
      // Planets' names above-right of the dot, moons' below-right, so the Earth and the Moon
      // do not overlap.
      const moon = body.parent !== undefined;
      label
        ?.setPosition(at.x + LABEL_GAP, moon ? at.y + LABEL_GAP : at.y - LABEL_GAP)
        .setOrigin(0, moon ? 0 : 1);
    }

    if (!snapshot) return;
    if (this.trail.length > 1) {
      map.lineStyle(1, TRAIL_COLOR, 0.6);
      map.beginPath();
      this.trail.forEach((metres, index) => {
        const p = this.toScreen(metres);
        if (index === 0) map.moveTo(p.x, p.y);
        else map.lineTo(p.x, p.y);
      });
      map.strokePath();
    }
    const ship = this.toScreen(snapshot.ship);
    // Screen y points down: the heading angle turns the other way.
    const dx = Math.cos(snapshot.ship.heading);
    const dy = -Math.sin(snapshot.ship.heading);
    const tail = { x: ship.x - (dx * SHIP_LENGTH) / 2, y: ship.y - (dy * SHIP_LENGTH) / 2 };
    map.fillStyle(SHIP_COLOR, 1);
    map.fillTriangle(
      Math.round(ship.x + (dx * SHIP_LENGTH) / 2),
      Math.round(ship.y + (dy * SHIP_LENGTH) / 2),
      Math.round(tail.x - dy * SHIP_HALF_WIDTH),
      Math.round(tail.y + dx * SHIP_HALF_WIDTH),
      Math.round(tail.x + dy * SHIP_HALF_WIDTH),
      Math.round(tail.y - dx * SHIP_HALF_WIDTH),
    );
  }

  /** Time scale, day, engine state and a bar per resource. */
  private drawStatus(snapshot: SimulationSnapshot | null): void {
    const timeScale = Math.round(snapshot?.timeScale ?? 0);
    const day = snapshot ? Math.floor(snapshot.timeS / DAY_S) + 1 : 0;
    this.shown = { timeScale, day };
    this.timeText?.setText(`T×${timeScale}`);
    this.dayText?.setText(`Day ${day}`);
    this.thrustText?.setText(`Thrust ${services.simulation.thrust ? 'ON' : 'off'}`);

    const bars = this.bars;
    if (!bars) return;
    bars.clear();
    const barX = this.column.x + RESOURCE_LABEL_WIDTH;
    const firstRow = this.column.y + LINE * 4;
    RESOURCE_IDS.forEach((id, i) => {
      const resource = snapshot?.resources[id];
      const fraction = resource && resource.max > 0 ? resource.value / resource.max : 0;
      const y = firstRow + i * RESOURCE_ROW;
      bars.fillStyle(theme.bar.back, 1);
      bars.fillRect(barX, y, BAR_WIDTH, BAR_HEIGHT);
      bars.fillStyle(theme.bar.fill, 1);
      bars.fillRect(barX, y, Math.round(BAR_WIDTH * fraction), BAR_HEIGHT);
      this.resourceValues[i]?.setText(resource ? `${Math.round(fraction * 100)}%` : '-');
    });
  }

  /** Metres in the solar system (y up) to whole game pixels on the map (y down). */
  private toScreen(p: Vec2): Point {
    return {
      x: Math.round(this.center.x + p.x / this.metresPerPixel),
      y: Math.round(this.center.y - p.y / this.metresPerPixel),
    };
  }
}

function dotRadius(body: Body): number {
  if (body.parent !== undefined) return MOON_DOT;
  return body.orbitRadiusM === 0 ? SUN_DOT : PLANET_DOT;
}
