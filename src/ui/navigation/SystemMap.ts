import Phaser from 'phaser';
import { TODO, tr, type LocalText } from '@/core/locale/text';
import type { SolarSystem } from '@/core/simulation/SolarSystem';
import type { Body, GateDef, ShipState, Vec2 } from '@/core/simulation/types';
import type { Point } from '@/world/Actor';
import { createText } from '@/ui/kit/text';
import { theme } from '@/ui/theme';

/** A gate's state on the map and the ribbon (GDD `gate-panel-view` A). */
export type GateState = 'passed' | 'current' | 'ahead';

/** What `SystemMap.draw` shows. */
export interface MapView {
  /** Simulated time: where the bodies are. */
  timeS: number;
  /** The ship, or null before the voyage. */
  ship: ShipState | null;
  /** Colour of the ship's triangle (red while drifting or lost). */
  shipColor: number;
  /** The ship's past positions, m, oldest first. */
  trail: readonly Vec2[];
  /** State of each gate, in flight order. */
  gates: readonly GateState[];
  /** Where the forecast says the first stock runs out (m), or null (D7). */
  mark: Vec2 | null;
}

/**
 * Radius of the outermost orbit on the map, px (plan D27; Mars's orbit now, the Earth's about
 * 114 px). Distances from the Sun are drawn in root scale: r_px = k * sqrt(r).
 */
const MAP_RADIUS = 140;
/**
 * Distance of a moon from its planet on the map, px: real moon orbits are far below a pixel
 * in root scale. A display cheat only ("Map not to scale").
 */
const MOON_OFFSET = 6;
/**
 * Near a planet with moons the ship is drawn magnified like the moons (so it parks on the
 * moon's dot); from `BLEND_FROM` to `BLEND_TO` moon orbits away it blends into the root scale.
 */
const BLEND_FROM = 2;
const BLEND_TO = 10;
/** Radii of the dots: the Sun, planets, moons, px. */
const SUN_DOT = 4;
const PLANET_DOT = 2;
const MOON_DOT = 1;
/** The map's note in its bottom-left corner. OWNER: script */
// budget: two lines of about 9 chars (the corner is free of orbits only that far)
const SCALE_NOTE: LocalText = { en: 'Map not\nto scale', uk: TODO };
/** Radius of the ring around a gate's body, px. */
const GATE_RING = 4;
/** Half size of the forecast's mark (an x), px. */
const MARK_HALF = 3;
/** Ship triangle: length nose to tail and half width of the tail, px. */
const SHIP_LENGTH = 7;
const SHIP_HALF_WIDTH = 3;
/** Distance from a dot to its name, px. */
const LABEL_GAP = 5;
/** Orbits smaller than this are not drawn, px. */
const MIN_ORBIT = 2;

/** Ring colour of a gate state. */
export const GATE_COLORS: Readonly<Record<GateState, number>> = {
  passed: theme.map.gatePassed,
  current: theme.map.gateCurrent,
  ahead: theme.map.gateAhead,
};

/** A planet with moons, where the ship is drawn magnified. */
interface MoonSystem {
  body: Body;
  /** The largest moon orbit around it, m. */
  moonOrbitM: number;
}

/**
 * The navigation panel's map (plan D7, D27): the whole solar system in root scale (it fits the
 * outermost orbit, whichever it is, and keeps the inner planets apart), with moons pushed out to `MOON_OFFSET`; orbits,
 * bodies, the gate bodies' names and rings in three states, the ship's trail and triangle,
 * the forecast's mark where the first stock runs out, and "Map not to scale".
 */
export class SystemMap {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly labels = new Map<string, Phaser.GameObjects.Text>();
  /** The Sun on screen. */
  private readonly center: Point;
  /** px per sqrt(m). */
  private readonly k: number;
  private readonly moonSystems: MoonSystem[];
  /** Gate index of each gate body. */
  private readonly gateOf = new Map<string, number>();

  constructor(
    scene: Phaser.Scene,
    private readonly area: Phaser.Geom.Rectangle,
    private readonly system: SolarSystem,
    gates: readonly GateDef[],
  ) {
    this.center = { x: Math.round(area.centerX), y: Math.round(area.centerY) };
    const outermost = Math.max(
      1,
      ...system.bodies.filter((b) => b.parent === undefined).map((b) => b.orbitRadiusM),
    );
    this.k = MAP_RADIUS / Math.sqrt(outermost);
    this.moonSystems = system.bodies
      .filter((b) => system.bodies.some((moon) => moon.parent === b.id))
      .map((body) => ({
        body,
        moonOrbitM: Math.max(
          ...system.bodies.filter((m) => m.parent === body.id).map((m) => m.orbitRadiusM),
        ),
      }));
    gates.forEach((gate, index) => this.gateOf.set(gate.body, index));

    this.graphics = scene.add.graphics();
    for (const body of system.bodies) {
      // Names of the gates' bodies and of the home planet; the rest stay unnamed (crowded).
      if (!this.gateOf.has(body.id) && body.role !== 'home') continue;
      this.labels.set(body.id, createText(scene, 0, 0, tr(body.name), 'small'));
    }
    createText(scene, area.x, area.bottom, tr(SCALE_NOTE), 'small', {
      lineSpacing: theme.lineSpacing,
    }).setOrigin(0, 1);
  }

  /** Draws everything for `view`. */
  draw(view: MapView): void {
    const g = this.graphics;
    const system = this.system;
    g.clear();

    const screen = new Map<string, Point>();
    const position = new Map<string, Vec2>();
    for (const body of system.bodies) {
      const at = system.positionOf(body, view.timeS);
      position.set(body.id, at);
      const parentAt = body.parent === undefined ? undefined : screen.get(body.parent);
      const parentPos = body.parent === undefined ? undefined : position.get(body.parent);
      if (!parentAt || !parentPos) {
        screen.set(body.id, this.root(at));
        continue;
      }
      const dx = at.x - parentPos.x;
      const dy = at.y - parentPos.y;
      const length = Math.hypot(dx, dy) || 1;
      screen.set(body.id, {
        x: Math.round(parentAt.x + (dx / length) * MOON_OFFSET),
        y: Math.round(parentAt.y - (dy / length) * MOON_OFFSET),
      });
    }

    g.lineStyle(1, theme.map.orbit, 1);
    for (const body of system.bodies) {
      if (body.orbitRadiusM <= 0) continue;
      if (body.parent === undefined) {
        const radius = Math.round(this.k * Math.sqrt(body.orbitRadiusM));
        if (radius >= MIN_ORBIT) g.strokeCircle(this.center.x, this.center.y, radius);
      }
    }

    for (const body of system.bodies) {
      const at = screen.get(body.id);
      if (!at) continue;
      g.fillStyle(body.color, 1);
      g.fillCircle(at.x, at.y, dotRadius(body));
      const gate = this.gateOf.get(body.id);
      const state = gate === undefined ? undefined : view.gates[gate];
      if (state) {
        g.lineStyle(1, GATE_COLORS[state], 1);
        g.strokeCircle(at.x, at.y, GATE_RING);
      }
    }
    this.placeLabels(screen, view.gates);

    const project = (p: Vec2) => this.project(p, position, screen);
    if (view.trail.length > 1) {
      g.lineStyle(1, theme.map.trail, 0.6);
      g.beginPath();
      view.trail.forEach((metres, index) => {
        const p = project(metres);
        if (index === 0) g.moveTo(p.x, p.y);
        else g.lineTo(p.x, p.y);
      });
      g.strokePath();
    }

    if (view.mark) {
      const m = project(view.mark);
      g.lineStyle(1, theme.map.mark, 1);
      g.lineBetween(m.x - MARK_HALF, m.y - MARK_HALF, m.x + MARK_HALF, m.y + MARK_HALF);
      g.lineBetween(m.x - MARK_HALF, m.y + MARK_HALF, m.x + MARK_HALF, m.y - MARK_HALF);
    }

    if (view.ship) {
      const ship = project(view.ship);
      // Screen y points down: the heading angle turns the other way.
      const dx = Math.cos(view.ship.heading);
      const dy = -Math.sin(view.ship.heading);
      const tail = { x: ship.x - (dx * SHIP_LENGTH) / 2, y: ship.y - (dy * SHIP_LENGTH) / 2 };
      g.fillStyle(view.shipColor, 1);
      g.fillTriangle(
        Math.round(ship.x + (dx * SHIP_LENGTH) / 2),
        Math.round(ship.y + (dy * SHIP_LENGTH) / 2),
        Math.round(tail.x - dy * SHIP_HALF_WIDTH),
        Math.round(tail.y + dx * SHIP_HALF_WIDTH),
        Math.round(tail.x + dy * SHIP_HALF_WIDTH),
        Math.round(tail.y - dx * SHIP_HALF_WIDTH),
      );
    }
  }

  /**
   * Names next to their dots, on the side away from the Sun (moons below, planets above, so a
   * planet and its moon part); a name that would overlap one already placed is hidden. The
   * current gate's name is placed first, then the others in flight order.
   */
  private placeLabels(screen: Map<string, Point>, gates: readonly GateState[]): void {
    const rank = (id: string): number => {
      const gate = this.gateOf.get(id);
      if (gate === undefined) return gates.length;
      return gates[gate] === 'current' ? -1 : gate;
    };
    const order = [...this.labels.keys()].sort((a, b) => rank(a) - rank(b));
    const placed: Phaser.Geom.Rectangle[] = [];
    for (const id of order) {
      const label = this.labels.get(id);
      const at = screen.get(id);
      if (!label || !at) continue;
      const gate = this.gateOf.get(id);
      const state = gate === undefined ? undefined : gates[gate];
      const moon = this.system.get(id).parent !== undefined;
      // Away from the Sun, unless the name would leave the map on that side.
      const width = Math.ceil(label.width);
      const left =
        at.x < this.center.x
          ? at.x - LABEL_GAP - width >= this.area.x
          : at.x + LABEL_GAP + width > this.area.right;
      label
        .setPosition(
          left ? at.x - LABEL_GAP : at.x + LABEL_GAP,
          moon ? at.y + LABEL_GAP : at.y - LABEL_GAP,
        )
        .setOrigin(left ? 1 : 0, moon ? 0 : 1)
        .setColor(state === 'current' ? theme.text.highlight : theme.text.dim);
      const bounds = label.getBounds();
      const overlaps = placed.some((other) =>
        Phaser.Geom.Intersects.RectangleToRectangle(bounds, other),
      );
      label.setVisible(!overlaps);
      if (!overlaps) placed.push(bounds);
    }
  }

  /** A position relative to the Sun (m, y up) in root scale on screen (whole px, y down). */
  private root(p: Vec2): Point {
    const r = Math.hypot(p.x, p.y);
    if (r === 0) return { ...this.center };
    const scale = (this.k * Math.sqrt(r)) / r;
    return {
      x: Math.round(this.center.x + p.x * scale),
      y: Math.round(this.center.y - p.y * scale),
    };
  }

  /**
   * A point in space (the ship, its trail, the mark) on screen: root scale, except near a
   * planet with moons, where it is magnified like the moons and blends into the root scale
   * further out (`BLEND_FROM`, `BLEND_TO`).
   */
  private project(p: Vec2, position: Map<string, Vec2>, screen: Map<string, Point>): Point {
    const root = this.root(p);
    for (const { body, moonOrbitM } of this.moonSystems) {
      const planet = position.get(body.id);
      const planetAt = screen.get(body.id);
      if (!planet || !planetAt) continue;
      const dx = p.x - planet.x;
      const dy = p.y - planet.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= moonOrbitM * BLEND_TO) continue;
      // Magnified like the moons, but no further out than BLEND_FROM moon offsets.
      const scale = Math.min(MOON_OFFSET / moonOrbitM, (MOON_OFFSET * BLEND_FROM) / distance);
      const local = { x: planetAt.x + dx * scale, y: planetAt.y - dy * scale };
      const t = Phaser.Math.Clamp(
        (distance / moonOrbitM - BLEND_FROM) / (BLEND_TO - BLEND_FROM),
        0,
        1,
      );
      return {
        x: Math.round(local.x + (root.x - local.x) * t),
        y: Math.round(local.y + (root.y - local.y) * t),
      };
    }
    return root;
  }
}

function dotRadius(body: Body): number {
  if (body.parent !== undefined) return MOON_DOT;
  return body.orbitRadiusM === 0 ? SUN_DOT : PLANET_DOT;
}
