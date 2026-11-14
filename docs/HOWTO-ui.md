# How the UI works

All UI is drawn by Phaser (no HTML) with a small kit in `src/ui/kit/`: a 9-slice panel, a button,
a text helper, a label, a toast, a choice list and a fader. Colours, spacing and text sizes live
in one file, `src/ui/theme.ts`. Phaser 4 API reference: `node_modules/phaser/skills/*/SKILL.md`
(`sprites-and-images` for nine-slice, `scenes`, `input-keyboard-mouse-touch`, `tweens`) and
`node_modules/phaser/types/phaser.d.ts`.

Rules for every piece of UI:

- Create text only with `createText` (never `this.add.text`): it sets the font and the sizes.
- Font sizes are multiples of 8 (the font is Press Start 2P, drawn on an 8×8 grid); use
  `theme.fontSize`.
- Positions and sizes are whole pixels (`Math.round`); the kit rounds what it is given.
- **No text baked into button or panel art.** Labels are drawn by the game, so a renamed button is
  a code change, not a new picture.
- Colours and spacing come from `theme`, not from numbers in place.

## Screen layout

The game is 640×360 pixels, scaled up by a whole factor. Scenes draw in this order, bottom to top:

| Scene        | What it shows                                                                |
| ------------ | ---------------------------------------------------------------------------- |
| `MainMenu`   | Background, logo, button panel.                                              |
| `World`      | The location, hero, NPCs. Its camera moves; nothing in it is UI.             |
| `Ui`         | `UiScene`: the "E" hint, toasts, the dialogue window, the fader on top.      |
| panel scenes | `PanelScene` subclasses (stub, pause, settings, navigation) over everything. |
| `Debug`      | `DebugScene`: the debug overlay (F3, `?overlay=1`), above the panels.        |

`UiScene` (`src/scenes/UiScene.ts`) is launched by `BootScene` and runs for the whole game,
above the menu and the world. Its camera never moves, so everything in it is placed in screen
pixels. Inside it, `UiDepth` orders the layers: `hint` 0, `dialogue` 10, `toast` 20, `fader` 100,
`title` 110 (act titles show above the fader).

What other code calls on it (the world reaches it as `ctx.ui` in location scripts):

```ts
ui.toast('A dusty terminal.'); // message at the bottom for 2 s
ui.placeHint({ x, y }); // WorldScene does this every frame
await ui.fader.fadeOut(500); // black screen (cutscenes use it)
await ui.fader.fadeIn(500);
await ui.openDialogue('engineer-advice', ctx); // dialogue window, see docs/HOWTO-dialogue.md
ui.controls.justPressed('confirm'); // UiScene's own keyboard, never locked by the world
```

## Theme

`src/ui/theme.ts`:

| Field                                      | Meaning                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| `text.normal`, `text.dim`                  | Text colours: normal and secondary (details, disabled).                 |
| `text.highlight`                           | Selected item of a choice list.                                         |
| `text.alarm`, `text.warn`, `text.good`     | Navigation panel: critical, low, good (RUN, LANDED).                    |
| `fontSize.body` (8), `fontSize.title` (16) | Text sizes; multiples of 8 only.                                        |
| `lineSpacing`                              | Extra space between lines of multi-line text.                           |
| `panelTint`                                | Colour multiplied into the panel art (`0xffffff` = as drawn).           |
| `panelBorder`                              | Corner size of `ui/panel.png` (8). Change it with the art.              |
| `buttonBorder`                             | Corner size of `ui/button-*.png` (4), used by resized buttons.          |
| `panelPadding`, `labelPadding`             | Space between a panel's / label's edge and its content.                 |
| `rowGap`                                   | Gap between choice list rows.                                           |
| `backdrop`                                 | Dark layer behind panel scenes.                                         |
| `faderColor`, `disabledAlpha`, `toastMs`   | Fade colour, disabled button opacity, toast duration.                   |
| `bar`                                      | Resource bars (navigation panel): `back`, `fill`, `warn`, `alarm`.      |
| `map`                                      | Navigation map and gate ribbon: orbits, trail, ship, gate states, mark. |

## Kit components

All are Phaser game objects added to the scene they are created in.

### `createText(scene, x, y, text, variant = 'body', style = {})` — `kit/text.ts`

Text in the game font. Variants: `title` (16 px), `body` (8 px), `small` (8 px, dim colour).
`style` adds Phaser text style fields (`align`, `wordWrap`, `color`).

```ts
createText(this, 320, 40, 'Settings', 'title').setOrigin(0.5, 0);
```

### `new Panel(scene, x, y, width, height)` — `kit/Panel.ts`

Framed background from `ui/panel.png`, stretched as a 9-slice (corners stay as drawn). `(x, y)` is
the top-left corner. `panel.resize(width, height)` changes the size.

```ts
const panel = new Panel(this, 120, 80, 400, 200);
```

### `new Button(scene, x, y, label, onClick, { width?, height? })` — `kit/Button.ts`

Button from `ui/button-{normal,hover,pressed}.png` with the label drawn on top. `(x, y)` is the
centre. Mouse only: hover, press, click on release; a click plays the `ui-click` sound (so does a
choice in a `ChoiceList`). `setEnabled(false)` fades it and ignores input; `isEnabled()`, `label`.
The default size is the art's 160x36; another `width`/`height` stretches the art as a 9-slice
with `theme.buttonBorder` corners (the settings panel's 24x20 "-" / "+" buttons).

```ts
new Button(this, 320, 220, 'Back', () => this.close());
new Button(this, 400, 150, '+', () => louder(), { width: 24, height: 20 });
```

### `new Label(scene, x, y, text, { variant?, originX?, originY?, wrapWidth? })` — `kit/Label.ts`

Short text on a panel fitted around it. `originX/originY` say which point of the label sits at
`(x, y)` (like `setOrigin`; default centre). `setText` refits it; `text` reads it.

```ts
const hint = new Label(this, 100, 50, 'E', { originX: 0.5, originY: 1 });
```

### `new Toast(scene, x, y, wrapWidth)` — `kit/Toast.ts`

A `Label` that hides itself. `(x, y)` is the bottom centre. `show(text, ms = theme.toastMs)`,
`hide()`, `message` (text on screen or null). UiScene owns one; call `ui.toast(text)` instead of
making another.

```ts
const toast = new Toast(this, 320, 344, 576);
toast.show('Saved');
```

### `new ChoiceList(scene, x, y, controls, { width?, cancelable? })` — `kit/ChoiceList.ts`

Vertical list of options. `(x, y)` is the top-left of the first row. Keys: up/down (arrows, W/S),
`confirm` (Enter, Space) chooses, `cancel` (Esc) emits `ChoiceList.CANCELLED` if `cancelable`.
Mouse: hover selects, click chooses. Emits `ChoiceList.CHOSEN` with the index.
`setChoices(items, selected = 0, disabled = [])` (`disabled[i]` true: row `i` is dim and cannot
be chosen; keys and the mouse skip it, but `selected` stays on it even when disabled: the cursor
never jumps to another, maybe irreversible, row by itself), `select(i)`, `choose(i)`,
`lockFor(ms)` / `locked` (ignore keys and clicks for `ms` of scene time), `selectedIndex`, `items`,
`rowCenter(i)`; `width` / `height` are its size after `setChoices`; `destroy()` removes it.

`controls` must be the controls of the scene the list lives in (`ui.controls` in UiScene,
`this.controls` in a panel scene), not the world's — those are locked during dialogue. A key
pressed in the same frame the list was filled is ignored, so the key that opened it does not
choose at once.

```ts
const panel = new Panel(this, 200, 120, 240, 0); // create the background first: it draws below
const list = new ChoiceList(this, 212, 132, this.controls, { width: 216 });
list.setChoices(['Yes', 'No']);
panel.resize(240, list.height + 24);
list.once(ChoiceList.CHOSEN, (index: number) => {
  list.destroy();
  panel.destroy();
});
```

### `new Fader(scene)` — `kit/Fader.ts`

Full-screen rectangle in `theme.faderColor`. `fadeOut(ms)` covers the screen, `fadeIn(ms)`
uncovers it; both return a promise that resolves when done (`0` ms = at once). The screen stays
covered between the two. A new fade cuts a running one short (its promise resolves). Use the one
in UiScene, `ui.fader`: it covers the world, the hint and toasts. Location changes
(`services.flow.goTo`) use it with 250 ms each way.

```ts
await ui.fader.fadeOut(250);
// swap what is behind it
await ui.fader.fadeIn(250);
```

## Panel scenes (pause, settings, navigation)

A panel that opens over the game is its own scene extending `PanelScene`
(`src/ui/PanelScene.ts`):

- `open(data?)` starts it on top of everything, pauses every running scene under it except
  the overlay scenes `UiScene` and `DebugScene` (`OVERLAY_SCENES` in `src/scenes/keys.ts`; the world stops: physics, timers, its input; the simulation keeps ticking because it
  runs on `game.events`), and turns off UiScene's input. Returns a promise that resolves when the
  panel closes. Opening an open panel just waits for it.
- `close()` stops it; the paused scenes resume and UiScene's input returns (next frame).
- Esc (`cancel`) closes it by default; set `this.closeOnCancel = false` in `build` to handle Esc
  yourself. If you override `update`, call `super.update()`.
- `this.controls` is the panel's own keyboard (actions from `src/core/input/controls.ts`). The
  world's controls are paused with the world, and presses made while a scene was paused are
  dropped when it resumes, so the Esc that closes a panel does not reach the world.
- A dark backdrop (`theme.backdrop`) covers the screen behind the panel and catches clicks.
- `addPanel({ title?, width, height })` draws a centred `Panel` with the title and returns the
  content area inside it (`Phaser.Geom.Rectangle`: `x`, `y`, `width`, `height`, `centerX`, …).

`StubScene` (`src/scenes/StubScene.ts`) is the smallest working example; the game's pause menu
is `src/scenes/PauseScene.ts` (opened by `WorldScene` on Esc), and `src/scenes/SettingsScene.ts`
shows a panel with its own keyboard handling, opened over the menu or over the pause menu
(panels stack; the top one closes first). A complete new panel, sketched
here as a simpler pause panel with a reason:

```ts
// A sketch in the shape of src/scenes/PauseScene.ts (the real file uses a ChoiceList)
import { services } from '@/core/services';
import { SceneKey } from '@/scenes/keys';
import { PanelScene } from '@/ui/PanelScene';
import { Button } from '@/ui/kit/Button';
import { ChoiceList } from '@/ui/kit/ChoiceList';
import { createText } from '@/ui/kit/text';

/** Data for `PauseScene.open`. */
export interface PauseSceneData {
  reason?: string;
}

/** Pause menu over the world. */
export class PauseScene extends PanelScene<PauseSceneData> {
  constructor() {
    super(SceneKey.Pause); // 1. add `Pause: 'Pause'` to SceneKey in src/scenes/keys.ts
  }

  protected build({ reason = 'Paused' }: PauseSceneData): void {
    const area = this.addPanel({ title: 'Pause', width: 256, height: 176 });
    createText(this, area.centerX, area.y, reason, 'small').setOrigin(0.5, 0);

    // Keyboard and mouse: a choice list.
    const list = new ChoiceList(this, area.x + 48, area.y + 24, this.controls, { width: 160 });
    list.setChoices(['Resume', 'Settings']);
    list.on(ChoiceList.CHOSEN, (index: number) => {
      if (index === 0) this.close();
      // index 1: open the settings panel over this one (it pauses this scene).
    });

    // Mouse only: a button.
    new Button(this, area.centerX, area.bottom - 18, 'Main menu', () => {
      this.close(); // close the panel first, then leave
      services.flow.toMainMenu();
    });
  }
}
```

2. Register it in `src/main.ts`: add `PauseScene` to the `scene` list after `UiScene`.
3. Open it from anywhere that has the game or a scene:

```ts
import type { PauseScene } from '@/scenes/PauseScene';

await (this.scene.get(SceneKey.Pause) as PauseScene).open({ reason: 'Taking a break' });
// the world runs again here
```

Panels stack: a panel opened from a panel pauses the lower one, and closing it resumes it.

## UI art

Files live in `public/assets/ui/` and are registered in `src/assets/images.ts`. Placeholders are
generated by `tools/placeholders.py` (`buttons()`, `panel()`); to replace one, overwrite the PNG
with art of the same size and keep the name — no code change.

| File                     | Key               | Size   | Notes                                                               |
| ------------------------ | ----------------- | ------ | ------------------------------------------------------------------- |
| `ui/panel.png`           | `ui-panel`        | 24×24  | 9-slice: 8 px corners and edges, the 8×8 centre stretches. No text. |
| `ui/button-normal.png`   | `button-normal`   | 160×36 | Button at rest. No text. Resized buttons keep 4 px corners/edges.   |
| `ui/button-hover.png`    | `button-hover`    | 160×36 | Under the mouse.                                                    |
| `ui/button-pressed.png`  | `button-pressed`  | 160×36 | Held down.                                                          |
| `ui/cursor-interact.png` | `cursor-interact` | 16×16  | Not used yet; the "E" hint is a `Label`.                            |

A panel with a different border width needs `theme.panelBorder` changed to match. A button of a
different size needs the menu layout constants (`BUTTON_WIDTH`, `BUTTON_HEIGHT`,
`BUTTON_SPACING` in `src/scenes/MainMenuScene.ts`) changed too. Partly transparent panel art
(the placeholder is fully opaque) lets what is behind show through.
