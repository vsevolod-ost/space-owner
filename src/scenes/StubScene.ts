import { GAME_HEIGHT, GAME_WIDTH } from '@/config';
import { tr, type LocalText } from '@/core/locale/text';
import { SceneKey } from '@/scenes/keys';
import { PanelScene } from '@/ui/PanelScene';
import { Button } from '@/ui/kit/Button';
import { createText } from '@/ui/kit/text';
import { theme } from '@/ui/theme';

/** Data passed to `StubScene.open`. */
export interface StubSceneData {
  /** Heading of the section that is not built yet. */
  title: string;
  /** Text under the heading, as shown; defaults to `DETAILS` "(in development)". */
  details?: string;
}

const PANEL_WIDTH = 416;
const PANEL_HEIGHT = 176;
/** Centre of the Back button: (320, 220). */
const BACK_Y = GAME_HEIGHT / 2 + 40;
/** The default details line (up to five lines fit) and the Back button (max 18). OWNER: script */
const DETAILS: LocalText = { en: '(in development)', uk: '(у розробці)' };
const BACK_LABEL: LocalText = { en: 'Back', uk: 'Назад', max: 18 };

/**
 * Temporary panel for sections that do not exist yet: a heading, details and a Back button
 * (or Esc). Opens over the menu with `open(data)`; also the smallest working `PanelScene`.
 */
export class StubScene extends PanelScene<StubSceneData> {
  constructor() {
    super(SceneKey.Stub);
  }

  protected build({ title, details = tr(DETAILS) }: StubSceneData): void {
    const area = this.addPanel({ title, width: PANEL_WIDTH, height: PANEL_HEIGHT });
    // Up to five lines of details fit between the heading and the Back button.
    createText(this, GAME_WIDTH / 2, area.y, details, 'small', {
      align: 'center',
      lineSpacing: theme.lineSpacing,
    }).setOrigin(0.5, 0);

    new Button(this, GAME_WIDTH / 2, BACK_Y, tr(BACK_LABEL), () => this.close());
  }
}
