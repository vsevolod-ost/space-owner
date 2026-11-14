/**
 * Returns `localStorage`, or an in-memory stand-in when the browser refuses access
 * (private mode in some browsers, storage disabled by policy). The game then runs
 * without persistence instead of failing at startup.
 */
export function getStorage(): Storage {
  try {
    const storage = window.localStorage;
    const probe = '__nasa_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    console.warn('localStorage is unavailable; saves and settings will not persist.');
    return new MemoryStorage();
  }
}

/** Minimal `Storage` implementation backed by a Map. */
class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}
