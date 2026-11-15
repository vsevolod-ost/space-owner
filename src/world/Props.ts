import type Phaser from 'phaser';
import type { BackgroundLayer, Binding, PropLayer, PropSpec } from '@/content/locations/types';
import type { GameState } from '@/core/state/GameState';
import type { MapObject } from '@/world/LocationLoader';
import { isPresent } from '@/world/presence';

/** No tint: the colour multiplied over an untinted picture. */
const NO_TINT = 0xffffff;

/** A background layer as built: its spec and its image. */
export interface BuiltBackgroundLayer {
  layer: BackgroundLayer;
  image: Phaser.GameObjects.Image;
}

/** What `Props` draws: the location's objects and bindings, and its background layers. */
export interface PropsOptions {
  objects: readonly MapObject[];
  bindings: Readonly<Record<string, Binding>>;
  background: readonly BuiltBackgroundLayer[];
}

/** What one drawn prop shows, for `debugInfo`: `crate`, `items:1`; and its tint, if any. */
export interface PropDebugInfo {
  layers: string[];
  tint: number | null;
}

/** What `Props.debugInfo()` returns. */
export interface PropsDebugInfo {
  /** Drawn props by the name of their map object. */
  props: Record<string, PropDebugInfo>;
  /** Whether each background layer is shown, by its image key. */
  background: Record<string, boolean>;
}

/**
 * The pictures of a location that follow the flags: `prop` objects and interactables with a
 * `prop`, and which layers of a layered background show. `refresh(state)` redraws them all from the
 * state; WorldScene calls it on entering and after flags change (not during a dialogue or a
 * cutscene).
 */
export class Props {
  private drawn = new Map<string, { images: Phaser.GameObjects.Image[]; tint: number | null }>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: PropsOptions,
  ) {}

  /** Redraws every prop whose object is there now and shows or hides the background layers. */
  refresh(state: GameState): void {
    this.clear();
    for (const { layer, image } of this.options.background) {
      image.setVisible(layer.when?.(state) ?? true);
    }
    for (const object of this.options.objects) {
      const binding = this.options.bindings[object.name];
      if (!binding || binding.kind !== object.kind) continue; // reported by loadLocation
      if (binding.kind !== 'prop' && binding.kind !== 'interactable') continue;
      if (!binding.prop || !isPresent(binding, state)) continue;
      this.draw(object, binding.prop, state);
    }
  }

  /** Removes every drawn prop (the background stays). */
  clear(): void {
    for (const { images } of this.drawn.values()) {
      for (const image of images) image.destroy();
    }
    this.drawn.clear();
  }

  /**
   * What each drawn prop shows, by the name of its map object, and whether each background
   * layer is shown, by its image key.
   */
  debugInfo(): PropsDebugInfo {
    const background = Object.fromEntries(
      this.options.background.map(({ layer, image }) => [layer.image, image.visible]),
    );
    const props = Object.fromEntries(
      [...this.drawn].map(([name, { images, tint }]) => [
        name,
        {
          layers: images.map((image) =>
            image.frame.name === '__BASE'
              ? image.texture.key
              : `${image.texture.key}:${image.frame.name}`,
          ),
          tint,
        },
      ]),
    );
    return { props, background };
  }

  private draw(object: MapObject, spec: PropSpec, state: GameState): void {
    const layers = typeof spec.layers === 'function' ? spec.layers(state) : spec.layers;
    if (layers.length === 0) return;
    const tint = spec.tint?.(state);
    const centre = { x: object.x + object.width / 2, y: object.y + object.height / 2 };
    // Like actors (depth = feet y): what stands below the object's bottom edge draws in front.
    const depth = object.y + object.height;
    const images = layers.map((layer) => {
      const image = this.makeImage(layer);
      const x = Math.round(centre.x - image.width / 2 + (layer.offset?.x ?? 0));
      const y = Math.round(centre.y - image.height / 2 + (layer.offset?.y ?? 0));
      // Same depth for all layers: they draw in the order they were added, back to front.
      image.setOrigin(0).setPosition(x, y).setDepth(depth);
      applyTint(image, tint);
      return image;
    });
    this.drawn.set(object.name, { images, tint: tintOrNull(tint) });
  }

  private makeImage(layer: PropLayer): Phaser.GameObjects.Image {
    if ('image' in layer) return this.scene.add.image(0, 0, layer.image);
    return this.scene.add.image(0, 0, layer.spritesheet, layer.frame);
  }
}

/** Multiplies `tint` over the image, or clears the tint for undefined / white. */
function applyTint(image: Phaser.GameObjects.Image, tint: number | undefined): void {
  const value = tintOrNull(tint);
  if (value === null) image.clearTint();
  else image.setTint(value);
}

function tintOrNull(tint: number | undefined): number | null {
  return tint === undefined || tint === NO_TINT ? null : tint;
}
