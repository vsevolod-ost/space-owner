/**
 * Look of the whole UI in one place: colours, spacing and text sizes. Kit components and
 * scenes read these values instead of writing their own numbers, so a restyle is one edit here.
 * The look is a flight console: steel bezels and dark glass from the ship art, cyan for focus,
 * amber for the selected text, hazard stripes for an alarm. Panels and buttons are drawn in code
 * from `panel` and `button`, see docs/HOWTO-ui.md.
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
  /**
   * Panels (`Panel`): a screen in a steel bezel, in the ship art's palette. `fill` is the glass,
   * `outline` the dark line outside and inside the bezel, `light` / `shade` its lit and shaded
   * edges, `frame` its face, `accent` the two lit strips on it. OWNER: art
   */
  panel: {
    fill: 0x0d1321,
    fillAlpha: 0.95,
    outline: 0x070a12,
    light: 0x8b9cb2,
    frame: 0x5e6786,
    shade: 0x3b4664,
    accent: 0x28e8f2,
  },
  /**
   * Buttons (`Button`), a key of the console, per state: the key's face, the lit and shaded
   * edges of its rim and the gloss line under the top edge; `lip` is the key's side, seen under
   * the face until it is pressed. Hover is also the look of keyboard focus. OWNER: art
   */
  button: {
    normal: { fill: 0x1c2740, light: 0x8b9cb2, shade: 0x3b4664, gloss: 0x2a3a5c },
    hover: { fill: 0x27365a, light: 0x28e8f2, shade: 0x28e8f2, gloss: 0x3a4f7c },
    pressed: { fill: 0x141c30, light: 0x1aa3ad, shade: 0x1aa3ad, gloss: 0x141c30 },
    lip: 0x070a12,
  },
  /**
   * The selected row of a list (`ChoiceList`, the settings): a tinted band, the lit bar at its
   * left and the arrow; `disabled` replaces all three on a row that cannot be chosen.
   */
  selection: {
    enabled: { band: 0x28e8f2, bandAlpha: 0.14, bar: 0x28e8f2, arrow: 0xffd34d },
    disabled: { band: 0x5e6786, bandAlpha: 0.14, bar: 0x5e6786, arrow: 0x5e6786 },
  },
  /** Thin rules between the parts of a panel, and the lit segment in the middle of a title's. */
  rule: { line: 0x3b4664, accent: 0x28e8f2 },
  /** Hazard stripes (the station alarm's box), as on the airlock's frame. */
  hazard: { base: 0xffaf34, stripe: 0x1a1410 },
  /**
   * The main menu's sky: gradient from top to bottom, far stars, the colours near stars pick
   * from. OWNER: art
   */
  menu: {
    sky: { top: 0x030712, bottom: 0x0f172a },
    farStar: 0xffffff,
    nearStars: [0xffffff, 0x38bdf8, 0x818cf8, 0xf472b6],
  },
  /** Panels: room kept clear for the frame (the bezel is 4 px) from the edge, px. */
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
  /** A slot of the HOLD strip (warehouse, ship deck): a well and the lit edge at its bottom right. */
  holdSlot: { well: 0x070a12, edge: 0x2a3550 },
  /** How long a toast stays on screen, ms. */
  toastMs: 2000,
} as const;
