/**
 * Look of the whole UI in one place: colours, spacing and text sizes. Kit components and
 * scenes read these values instead of writing their own numbers, so a restyle is one edit here.
 * Panels and buttons are drawn in code from `panel` and `button`, see docs/HOWTO-ui.md.
 */
export const theme = {
  /** Text colours, CSS strings for Phaser text styles. */
  text: {
    /** Normal text. */
    normal: '#ffffff',
    /** Secondary text: details, hints, disabled items. */
    dim: '#b8c4d6',
    /** The selected item of a choice list. */
    highlight: '#ffd34d',
    /** An alarm: a death is near (navigation panel, D14). */
    alarm: '#ff5a4d',
    /** A warning: a stock is low, a forecast is tight (navigation panel). */
    warn: '#ffa64d',
    /** Good news: the navigation panel's RUN, a stock that lasts. */
    good: '#6cc04a',
  },
  /**
   * Font sizes, px. Press Start 2P is drawn on an 8x8 grid: sizes must be multiples of 8 or
   * glyph edges fall between pixels and blur.
   */
  fontSize: {
    /** Body text, buttons, toasts, choices. */
    body: 8,
    /** Headings of screens and panels. */
    title: 16,
  },
  /** Extra space between lines of multi-line text, px. */
  lineSpacing: 4,
  /** Panels (`Panel`): a deep-space plate, its outline and the corner marks. OWNER: art */
  panel: { fill: 0x0f0e17, fillAlpha: 0.95, stroke: 0x6366f1, accent: 0xa855f7 },
  /**
   * Buttons (`Button`) per state: plate fill, outline colour and outline width, px. OWNER: art
   */
  button: {
    normal: { fill: 0x181825, stroke: 0x6366f1, line: 1 },
    hover: { fill: 0x2e2b44, stroke: 0xa855f7, line: 2 },
    pressed: { fill: 0x0f0e17, stroke: 0x38bdf8, line: 2 },
  },
  /**
   * The main menu's sky: gradient from top to bottom, far stars, the colours near stars pick
   * from. OWNER: art
   */
  menu: {
    sky: { top: 0x030712, bottom: 0x0f172a },
    farStar: 0xffffff,
    nearStars: [0xffffff, 0x38bdf8, 0x818cf8, 0xf472b6],
  },
  /** Panels: how far the frame (outline, corner marks) reaches in from the edge, px. */
  panelBorder: 8,
  /** Space between a panel's edge and its content, px. Keep >= panelBorder. */
  panelPadding: 12,
  /** Space between a small label's edge (toast, hint) and its text, px. */
  labelPadding: 4,
  /** Vertical gap between rows of a choice list, px. */
  rowGap: 6,
  /** Dark layer behind panel scenes, over the paused world. */
  backdrop: { color: 0x000000, alpha: 0.5 },
  /** Colour of the full-screen fade between locations and in cutscenes. */
  faderColor: 0x000000,
  /** Opacity of a disabled button. */
  disabledAlpha: 0.4,
  /**
   * Bars of amounts (the station alarm's timer): empty part, and the filled part when normal,
   * low (warn) and critical (alarm). The navigation panel's resource bars use `ship`.
   */
  bar: { back: 0x1c2333, fill: 0x6cc04a, warn: 0xe08a2c, alarm: 0xd8402f },
  /**
   * The navigation panel's status column in the ship art's palette (metal #C0CBDC / #8B9CB2 /
   * #5E6786, hull #124E89 / #3B4664, tanks #D57443 / #FFAF34, lights #FEE661, engine glow
   * #28E8F2). The art has no bright red, so the alarm is a lightened #763A3F that reads on
   * dark. Resource bars keep their icon's colour; the frame and value show the level.
   * OWNER: art
   */
  ship: {
    status: {
      RUN: '#28e8f2',
      LANDED: '#fee661',
      HOLD: '#8b9cb2',
      DRIFTING: '#d57443',
      LOST: '#e5686b',
      OFFLINE: '#5e6786',
    },
    levelText: { normal: '#c0cbdc', low: '#ffaf34', critical: '#e5686b' },
    levelFrame: { normal: 0x3b4664, low: 0xffaf34, critical: 0xc2454b },
    /** The colour of each resource's icon in the `panel-icons` sheet. */
    resourceBar: {
      oxygen: 0x50a0e6,
      supplies: 0xaa8250,
      power: 0xe6d23c,
      fuel: 0xdc7828,
      heat: 0xf05a8c,
      comms: 0x9696aa,
    },
  },
  /**
   * The navigation panel's map and gate ribbon: orbits, the ship's trail and triangle, gates
   * passed / current / ahead, the forecast's mark where the first stock runs out.
   */
  map: {
    orbit: 0x46546e,
    trail: 0x8fd3ff,
    ship: 0xffffff,
    gatePassed: 0x6cc04a,
    gateCurrent: 0xffd34d,
    gateAhead: 0x5a6680,
    mark: 0xff5a4d,
  },
  /**
   * Act 2's station alarm (plan act2-stations S5): the blinking pointer over the station on the
   * deck. The timer bar uses `bar` (its `alarm` colour in the last third).
   */
  stationAlarm: { marker: 0xff5a4d },
  /** An empty slot of the HOLD strip (warehouse, ship deck). */
  holdSlot: 0x1c2333,
  /** How long a toast stays on screen, ms. */
  toastMs: 2000,
} as const;
