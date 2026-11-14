import type Phaser from 'phaser';
import { characters } from '@/content/characters';
import type { Controls } from '@/core/input/controls';
import type { OpenEvent } from '@/core/voyage/voyageEvents';
import { Card } from '@/ui/navigation/Card';
import { theme } from '@/ui/theme';

/** Size the portrait is drawn at, px (the art is 48x48). */
const PORTRAIT = 48;
/** Space between the portrait and the name and title, px. */
const PORTRAIT_GAP = 8;
/** Offsets inside the card, px. */
const TITLE_Y = 16;
const TEXT_Y = 56;
const CHOICES_Y = 164;

/**
 * The card of an event on the way (plan D15, GDD `evt-presentation` A): the speaker's portrait
 * and name, the event's title and text, and its choices; a choice the cargo does not allow is
 * shown dim with what it needs. After the answer time runs again only on the open navigation
 * panel.
 */
export class EventCard extends Card {
  protected readonly kind = 'event' as const;
  private readonly texts: Phaser.GameObjects.Text[] = [];
  private readonly ids: string[];

  constructor(
    scene: Phaser.Scene,
    area: Phaser.Geom.Rectangle,
    controls: Controls,
    event: OpenEvent,
    private readonly onChoose: (choiceId: string) => void,
  ) {
    super(scene, area, controls, CHOICES_Y);
    const { x, y } = area;
    const speaker = (characters as Record<string, { name: string; portrait?: string }>)[
      event.speaker
    ];
    const textX = x + PORTRAIT + PORTRAIT_GAP;
    if (speaker?.portrait) {
      const portrait = scene.add.image(x, y, speaker.portrait).setOrigin(0);
      portrait.setDisplaySize(PORTRAIT, PORTRAIT);
      this.objects.push(portrait);
    }
    this.texts.push(
      this.text(textX, y, speaker?.name ?? event.speaker, 'small'),
      this.text(textX, y + TITLE_Y, event.title.toUpperCase(), 'body', true).setColor(
        theme.text.highlight,
      ),
      this.text(x, y + TEXT_Y, event.text, 'body', true),
    );
    this.ids = event.choices.map((choice) => choice.id);
    this.setChoices(
      event.choices.map((choice) =>
        // OWNER: script - the "(needs: ...)" suffix of a choice the cargo does not allow.
        choice.enabled ? choice.text : `${choice.text} (needs: ${choice.needs || '?'})`,
      ),
      0,
      event.choices.map((choice) => !choice.enabled),
    );
  }

  protected chosen(index: number): void {
    const id = this.ids[index];
    if (id !== undefined) this.onChoose(id);
  }

  protected lines(): string[] {
    return this.texts.map((text) => text.text);
  }
}
