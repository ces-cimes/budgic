export interface CacheEntry<T = any> {
  key: string;
  value: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  maxSize: number;
  hitRate: number;
  memoryUsage: number;
}

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum number of entries
  maxMemory?: number; // Maximum memory usage in bytes
  enableCompression?: boolean;
  enablePersistence?: boolean;
}

class CacheService {
  private cache = new Map<string, CacheEntry>();
  private stats = {
    hits: 0,
    misses: 0,
    size: 0,
    maxSize: 1000,
    memoryUsage: 0
  };
  
  private options: Required<CacheOptions> = {
    ttl: 5 * 60 * 1000, // 5 minutes default
    maxSize: 1000,
    maxMemory: 50 * 1024 * 1024, // 50MB default
    enableCompression: false,
    enablePersistence: false
  };

  constructor(options: CacheOptions = {}) {
    this.options = { ...this.options, ...options };
    this.stats.maxSize = this.options.maxSize;
    
    // Start cleanup interval
    setInterval(() => this.cleanup(), 60000); // Cleanup every minute
    
    // Load persisted cache if enabled
    if (this.options.enablePersistence) {
      this.loadFromStorage();
    }
  }

  /**
   * Set a value in the cache
   */
  set<T>(key: string, value: T, ttl?: number): void {
    try {
      // Check if we need to evict entries
      this.ensureCapacity();
      
      const entry: CacheEntry<T> = {
        key,
        value,
        timestamp: Date.now(),
        ttl: ttl || this.options.ttl,
        accessCount: 0,
        lastAccessed: Date.now()
      };

      this.cache.set(key, entry);
      this.stats.size = this.cache.size;
      this.updateMemoryUsage();
      
      // Persist to storage if enabled
      if (this.options.enablePersistence) {
        this.saveToStorage();
      }
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  /**
   * Get a value from the cache
   */
  get<T>(key: string): T | null {
    try {
      const entry = this.cache.get(key) as CacheEntry<T>;
      
      if (!entry) {
        this.stats.misses++;
        return null;
      }

      // Check if entry has expired
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        this.stats.misses++;
        this.stats.size = this.cache.size;
        return null;
      }

      // Update access statistics
      entry.accessCount++;
      entry.lastAccessed = Date.now();
      this.stats.hits++;
      
      return entry.value;
    } catch (error) {
      console.error('Cache get error:', error);
      this.stats.misses++;
      return null;
    }
  }

  /**
   * Check if a key exists in the cache
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.size = this.cache.size;
      return false;
    }
    
    return true;
  }

  /**
   * Delete a key from the cache
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.size = this.cache.size;
      this.updateMemoryUsage();
      
      if (this.options.enablePersistence) {
        this.saveToStorage();
      }
    }
    return deleted;
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear();
    this.stats.size = 0;
    this.stats.memoryUsage = 0;
    
    if (this.options.enablePersistence) {
      this.saveToStorage();
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    
    return {
      ...this.stats,
      hitRate
    };
  }

  /**
   * Get all cache keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Set multiple values at once
   */
  setMultiple<T>(entries: Array<{ key: string; value: T; ttl?: number }>): void {
    for (const { key, value, ttl } of entries) {
      this.set(key, value, ttl);
    }
  }

  /**
   * Get multiple values at once
   */
  getMultiple<T>(keys: string[]): Map<string, T | null> {
    const result = new Map<string, T | null>();
    
    for (const key of keys) {
      result.set(key, this.get<T>(key));
    }
    
    return result;
  }

  /**
   * Invalidate cache entries by pattern
   */
  invalidatePattern(pattern: string | RegExp): number {
    let invalidatedCount = 0;
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.delete(key);
        invalidatedCount++;
      }
    }
    
    return invalidatedCount;
  }

  /**
   * Get cache entry metadata
   */
  getEntryInfo(key: string): (Omit<CacheEntry, 'value'> & { isExpired: boolean }) | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    const { value, ...info } = entry;
    return {
      ...info,
      isExpired: this.isExpired(entry)
    };
  }

  /**
   * Warm up cache with data
   */
  async warmup<T>(
    keys: string[],
    fetchFunction: (key: string) => Promise<T>,
    ttl?: number
  ): Promise<void> {
    const promises = keys.map(async (key) => {
      try {
        const value = await fetchFunction(key);
        this.set(key, value, ttl);
      } catch (error) {
        console.error(`Failed to warmup cache for key ${key}:`, error);
      }
    });
    
    await Promise.all(promises);
  }

  /**
   * Prefetch data for likely future requests
   */
  async prefetch<T>(
    key: string,
    fetchFunction: () => Promise<T>,
    ttl?: number
  ): Promise<void> {
    try {
      const value = await fetchFunction();
      this.set(key, value, ttl);
    } catch (error) {
      console.error(`Failed to prefetch cache for key ${key}:`, error);
    }
  }

  // Private helper methods

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private ensureCapacity(): void {
    // Check size limit
    if (this.cache.size >= this.options.maxSize) {
      this.evictLRU();
    }
    
    // Check memory limit
    if (this.stats.memoryUsage > this.options.maxMemory) {
      this.evictByMemory();
    }
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.delete(oldestKey);
    }
  }

  private evictByMemory(): void {
    // Sort entries by memory usage (estimated by access count)
    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.accessCount - b.accessCount);
    
    // Remove entries until we're under the memory limit
    for (const [key] of entries) {
      this.delete(key);
      if (this.stats.memoryUsage <= this.options.maxMemory * 0.8) {
        break;
      }
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        expiredKeys.push(key);
      }
    }
    
    for (const key of expiredKeys) {
      this.delete(key);
    }
  }

  private updateMemoryUsage(): void {
    // Rough estimation of memory usage
    let totalSize = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      totalSize += key.length * 2; // UTF-16 characters
      totalSize += JSON.stringify(entry.value).length * 2;
      totalSize += 100; // Overhead for object structure
    }
    
    this.stats.memoryUsage = totalSize;
  }

  private saveToStorage(): void {
    try {
      const data = {
        entries: Array.from(this.cache.entries()),
        timestamp: Date.now()
      };
      
      localStorage.setItem('budgic_cache', JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save cache to storage:', error);
    }
  }

  private loadFromStorage(): void {
    try {
      const data = localStorage.getItem('budgic_cache');
      if (!data) return;
      
      const parsed = JSON.parse(data);
      const age = Date.now() - parsed.timestamp;
      
      // Only load if cache is less than 1 hour old
      if (age < 60 * 60 * 1000) {
        for (const [key, entry] of parsed.entries) {
          // Adjust timestamp for time passed
          entry.timestamp += age;
          this.cache.set(key, entry);
        }
        
        this.stats.size = this.cache.size;
        this.updateMemoryUsage();
      }
    } catch (error) {
      console.error('Failed to load cache from storage:', error);
    }
  }
}

// Create default cache instance
export const cacheService = new CacheService();

// Create specialized cache instances
export const transactionCache = new CacheService({
  ttl: 2 * 60 * 1000, // 2 minutes
  maxSize: 500,
  enablePersistence: true
});

export const accountCache = new CacheService({
  ttl: 10 * 60 * 1000, // 10 minutes
  maxSize: 100,
  enablePersistence: true
});

export const analyticsCache = new CacheService({
  ttl: 30 * 60 * 1000, // 30 minutes
  maxSize: 200,
  enableCompression: true
}); 