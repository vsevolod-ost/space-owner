import { DEBUG } from '@/config';
import { recordEvent } from '@/debug/globals';

/** Listener of one event; receives the payload passed to `emit`. */
export type EventHandler<Payload> = (payload: Payload) => void;

/**
 * Typed publish/subscribe bus. `Events` maps each event name to its payload type, so `emit`
 * and the handlers are checked by TypeScript. Scenes and services talk through it instead of
 * reaching into each other (`scene.get(...)`). No Phaser inside: usable from src/core.
 *
 * In debug mode every emitted event is also appended to `window.__nasaEvents` for the smoke
 * tool (`h.waitEvent`).
 */
export class EventBus<Events extends object> {
  private readonly handlers = new Map<keyof Events, Set<EventHandler<never>>>();

  /** Subscribes `handler` to `name`. Returns a function that unsubscribes it. */
  on<K extends keyof Events>(name: K, handler: EventHandler<Events[K]>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(handler);
    return () => this.off(name, handler);
  }

  /** Subscribes `handler` to the next `name` event only. Returns a function that unsubscribes it. */
  once<K extends keyof Events>(name: K, handler: EventHandler<Events[K]>): () => void {
    const wrapper: EventHandler<Events[K]> = (payload) => {
      this.off(name, wrapper);
      handler(payload);
    };
    return this.on(name, wrapper);
  }

  /** Removes a handler added with `on`. Unknown handlers are ignored. */
  off<K extends keyof Events>(name: K, handler: EventHandler<Events[K]>): void {
    const set = this.handlers.get(name);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) this.handlers.delete(name);
  }

  /**
   * Calls every handler of `name` with `payload`, in subscription order. Handlers added or
   * removed during the call take effect from the next emit. An exception in one handler is
   * logged with `console.error` and does not stop the others.
   */
  emit<K extends keyof Events>(name: K, payload: Events[K]): void {
    if (DEBUG) recordEvent(String(name), payload);
    const set = this.handlers.get(name);
    if (!set) return;
    for (const handler of [...set] as EventHandler<Events[K]>[]) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`EventBus: a '${String(name)}' handler threw`, error);
      }
    }
  }
}
