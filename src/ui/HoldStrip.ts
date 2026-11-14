import Phaser from 'phaser';
import { GAME_WIDTH } from '@/config';
import type { FlagReader } from '@/core/voyage/loadout';
import type { VoyageService } from '@/core/voyage/VoyageService';
import { Panel } from '@/ui/kit/Panel';
import { createText } from '@/ui/kit/text';
import { theme } from '@/ui/theme';

/** Size of an item icon in the `items` sheet and of a slot of the strip, px. */
const SLOT = 16;
/** Gap between slots, px. */
const GAP = 2;
/** Gap between the caption and the first slot, px. */
const CAPTION_GAP = 4;
/** Room for the caption `HOLD n/7` (8 glyphs of 8 px), px. */
const CAPTION_WIDTH = 64;
/** Distance of the strip from the top of the screen, px. */
const TOP = 4;
/**
 * Depth of the strip in the world scene: above every actor and prop (their depth is their feet
 * y, at most the map's height).
 */
export const HOLD_STRIP_DEPTH = 100_000;

/** What `HoldStrip.debugInfo()` returns: the caption and the icon frame of each filled slot. */
export interface HoldStripInfo {
  text: string;
  icons: number[];
}

/**
 * The HOLD strip (plan D21, GDD `cargo-manifest-ui` A): a panel at the top centre of the screen
 * with `HOLD n/7` and one slot per bay, filled with the icon of the cargo there (fuel first, the
 * deck's bay order). Fixed to the screen in a world scene (scroll factor 0). `refresh(flags)`
 * redraws it; WorldScene calls it on entering and with every rebuild after flags change.
 */
export class HoldStrip extends Phaser.GameObjects.Container {
  private readonly caption: Phaser.GameObjects.Text;
  private icons: Phaser.GameObjects.Image[] = [];
  private frames: number[] = [];

  constructor(
    scene: Phaser.Scene,
    private readonly voyage: VoyageService,
  ) {
    super(scene, 0, 0);
    const bays = voyage.cargo.bays;
    const pad = theme.labelPadding;
    const width = pad * 2 + CAPTION_WIDTH + CAPTION_GAP + bays * (SLOT + GAP) - GAP;
    const height = pad * 2 + SLOT;
    this.setPosition(Math.round((GAME_WIDTH - width) / 2), TOP);
    const panel = new Panel(scene, 0, 0, width, height);
    this.caption = createText(scene, pad, pad + (SLOT - theme.fontSize.body) / 2, '', 'body');
    const slots = scene.add.graphics();
    slots.fillStyle(theme.holdSlot, 1);
    for (let i = 0; i < bays; i++) slots.fillRect(this.slotX(i), pad, SLOT, SLOT);
    this.add([panel, slots, this.caption]);
    this.setScrollFactor(0).setDepth(HOLD_STRIP_DEPTH);
    scene.add.existing(this);
  }

  /** Redraws the caption and the icons from the `cargo.<id>` flags. OWNER: script - the caption. */
  refresh(flags: FlagReader): this {
    const bays = this.voyage.cargo.bays;
    const hold = this.voyage.hold(flags);
    const used = hold.reduce((sum, id) => sum + this.voyage.item(id).bays, 0);
    this.caption.setText(`HOLD ${used}/${bays}`);
    for (const icon of this.icons) icon.destroy();
    this.frames = hold.slice(0, bays).map((id) => this.voyage.item(id).icon ?? 0);
    this.icons = this.frames.map((frame, i) =>
      this.scene.add.image(this.slotX(i), theme.labelPadding, 'items', frame).setOrigin(0),
    );
    this.add(this.icons);
    return this;
  }

  /** The caption and the icon frame of each filled slot, for `WorldScene.debugInfo`. */
  debugInfo(): HoldStripInfo {
    return { text: this.caption.text, icons: [...this.frames] };
  }

  /** Left edge of slot `i` inside the strip, px. */
  private slotX(i: number): number {
    return theme.labelPadding + CAPTION_WIDTH + CAPTION_GAP + i * (SLOT + GAP);
  }
}
