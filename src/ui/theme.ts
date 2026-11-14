/**
 * Look of the whole UI in one place: colours, spacing and text sizes. Kit components and
 * scenes read these values instead of writing their own numbers, so a restyle is one edit here.
 * Art (panel frame, button states) lives in `public/assets/ui/`, see docs/HOWTO-ui.md.
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
  /** Tint multiplied into the panel art (0xffffff = the art as drawn). */
  panelTint: 0xffffff,
  /** Panels: corner and edge size of `ui/panel.png` (9-slice), px. Must match the art. */
  panelBorder: 8,
  /**
   * Buttons: corner and edge size of `ui/button-*.png` when a button is drawn at another size
   * than the art's 160x36 (9-slice), px. Must match the art.
   */
  buttonBorder: 4,
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
   * Bars of amounts (resources in the navigation panel): empty part, and the filled part when
   * normal, low (warn) and critical (alarm).
   */
  bar: { back: 0x1c2333, fill: 0x6cc04a, warn: 0xe08a2c, alarm: 0xd8402f },
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
