import type { BackgroundLayer, Binding, LocationDef } from '@/content/locations/types';
import { services } from '@/core/services';

/** Bindings already built from a function, per location (built once, closures kept). */
const built = new WeakMap<LocationDef, Readonly<Record<string, Binding>>>();
/** Background layers already built from a function, per location. */
const builtBackgrounds = new WeakMap<LocationDef, readonly BackgroundLayer[]>();

/**
 * The bindings of location `def`: its `bindings` object, or what its `bindings` function
 * builds from the game's registries (`BindingSources`: the cargo registry through
 * `services.voyage`), built once per location.
 */
export function bindingsOf(def: LocationDef): Readonly<Record<string, Binding>> {
  if (typeof def.bindings !== 'function') return def.bindings;
  let bindings = built.get(def);
  if (!bindings) {
    bindings = def.bindings({ voyage: services.voyage });
    built.set(def, bindings);
  }
  return bindings;
}

/**
 * The background layers of location `def`: one layer of a single image, its layer list, or
 * what its `background` function builds from the game's registries, built once per location.
 */
export function backgroundOf(def: LocationDef): readonly BackgroundLayer[] {
  const background = def.background;
  if (typeof background === 'string') return [{ image: background }];
  if (typeof background !== 'function') return background;
  let layers = builtBackgrounds.get(def);
  if (!layers) {
    layers = background({ voyage: services.voyage });
    builtBackgrounds.set(def, layers);
  }
  return layers;
}
