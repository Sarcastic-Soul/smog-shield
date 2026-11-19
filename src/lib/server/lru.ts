/** Small LRU cache built on Map's insertion order. */
export class LruCache<V> {
  private readonly store = new Map<string, V>();

  constructor(private readonly max: number) {}

  get(key: string): V | undefined {
    const value = this.store.get(key);
    if (value === undefined) return undefined;
    this.store.delete(key);
    this.store.set(key, value);
    return value;
  }

  set(key: string, value: V): void {
    this.store.delete(key);
    this.store.set(key, value);
    const [oldest] = this.store.keys();
    if (this.store.size > this.max && oldest !== undefined) this.store.delete(oldest);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  get size(): number {
    return this.store.size;
  }
}
