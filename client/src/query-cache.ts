/**
 * LRU Cache for authorization query results
 *
 * Caches permission check results with TTL to avoid redundant queries.
 * Invalidates on mutations (grant/revoke).
 */

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

export class QueryCache<T = boolean> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize: number = 1000, ttlMs: number = 60000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  /**
   * Get cached value if not expired
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    const now = Date.now();
    if (now - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Set cache value
   */
  set(key: string, value: T): void {
    // LRU eviction: if cache full, remove oldest entry
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    });
  }

  /**
   * Invalidate specific cache keys matching pattern
   */
  invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }

    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number; hitRate?: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }
}
