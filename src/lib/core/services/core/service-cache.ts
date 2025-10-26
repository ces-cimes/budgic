/**
 * Service Cache Manager
 * 
 * Provides intelligent caching for service operations to improve performance
 * and reduce database load. Supports TTL (Time To Live), cache invalidation,
 * and memory-efficient storage.
 * 
 * @example
 * ```typescript
 * import { serviceCache } from '$lib/core/services/core/service-cache';
 * 
 * // Cache a result for 5 minutes
 * const result = await serviceCache.getOrSet('accounts', () => 
 *   accountService.getAccounts(), 5 * 60 * 1000
 * );
 * 
 * // Invalidate cache when data changes
 * serviceCache.invalidate('accounts');
 * ```
 */

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
    hits: number;
}

interface CacheStats {
    hits: number;
    misses: number;
    size: number;
    memoryUsage: number;
}

class ServiceCache {
    private cache = new Map<string, CacheEntry<any>>();
    private stats: CacheStats = {
        hits: 0,
        misses: 0,
        size: 0,
        memoryUsage: 0
    };

    /**
     * Get cached data or execute function and cache result
     * 
     * @param key - Cache key
     * @param fn - Function to execute if cache miss
     * @param ttl - Time to live in milliseconds (default: 5 minutes)
     * @returns Cached or computed data
     */
    async getOrSet<T>(key: string, fn: () => Promise<T>, ttl: number = 5 * 60 * 1000): Promise<T> {
        const cached = this.get<T>(key);
        if (cached !== null) {
            this.stats.hits++;
            return cached;
        }

        this.stats.misses++;
        const data = await fn();
        this.set(key, data, ttl);
        return data;
    }

    /**
     * Get cached data by key
     * 
     * @param key - Cache key
     * @returns Cached data or null if not found/expired
     */
    get<T>(key: string): T | null {
        const entry = this.cache.get(key);
        
        if (!entry) {
            return null;
        }

        // Check if expired
        if (Date.now() - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            this.updateStats();
            return null;
        }

        entry.hits++;
        return entry.data;
    }

    /**
     * Set cached data with TTL
     * 
     * @param key - Cache key
     * @param data - Data to cache
     * @param ttl - Time to live in milliseconds
     */
    set<T>(key: string, data: T, ttl: number = 5 * 60 * 1000): void {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl,
            hits: 0
        });
        this.updateStats();
    }

    /**
     * Invalidate cache entry by key
     * 
     * @param key - Cache key to invalidate
     */
    invalidate(key: string): void {
        this.cache.delete(key);
        this.updateStats();
    }

    /**
     * Invalidate cache entries matching pattern
     * 
     * @param pattern - Regex pattern to match keys
     */
    invalidatePattern(pattern: RegExp): void {
        for (const key of this.cache.keys()) {
            if (pattern.test(key)) {
                this.cache.delete(key);
            }
        }
        this.updateStats();
    }

    /**
     * Clear all cached data
     */
    clear(): void {
        this.cache.clear();
        this.updateStats();
    }

    /**
     * Get cache statistics
     * 
     * @returns Current cache statistics
     */
    getStats(): CacheStats {
        return { ...this.stats };
    }

    /**
     * Get cache hit rate percentage
     * 
     * @returns Hit rate as percentage (0-100)
     */
    getHitRate(): number {
        const total = this.stats.hits + this.stats.misses;
        return total > 0 ? (this.stats.hits / total) * 100 : 0;
    }

    /**
     * Clean up expired entries
     */
    cleanup(): void {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > entry.ttl) {
                this.cache.delete(key);
            }
        }
        this.updateStats();
    }

    /**
     * Get all cache keys
     * 
     * @returns Array of cache keys
     */
    getKeys(): string[] {
        return Array.from(this.cache.keys());
    }

    /**
     * Check if key exists in cache
     * 
     * @param key - Cache key to check
     * @returns True if key exists and is not expired
     */
    has(key: string): boolean {
        const entry = this.cache.get(key);
        if (!entry) return false;
        
        // Check if expired
        if (Date.now() - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            this.updateStats();
            return false;
        }
        
        return true;
    }

    /**
     * Update internal statistics
     */
    private updateStats(): void {
        this.stats.size = this.cache.size;
        this.stats.memoryUsage = this.estimateMemoryUsage();
    }

    /**
     * Estimate memory usage of cache
     * 
     * @returns Estimated memory usage in bytes
     */
    private estimateMemoryUsage(): number {
        let usage = 0;
        for (const [key, entry] of this.cache.entries()) {
            usage += key.length * 2; // String characters
            usage += JSON.stringify(entry.data).length * 2; // Data
            usage += 32; // Entry overhead
        }
        return usage;
    }
}

/**
 * Singleton instance of ServiceCache
 * 
 * This is the main cache instance used throughout the application.
 * It provides intelligent caching for service operations.
 */
export const serviceCache = new ServiceCache();

// Auto-cleanup every 5 minutes
setInterval(() => {
    serviceCache.cleanup();
}, 5 * 60 * 1000);

/**
 * Cache decorator for service methods
 * 
 * Automatically caches method results with configurable TTL
 * 
 * @param ttl - Time to live in milliseconds
 * @param keyGenerator - Function to generate cache key from method arguments
 * 
 * @example
 * ```typescript
 * class MyService {
 *   @cacheMethod(5 * 60 * 1000, (id: string) => `account-${id}`)
 *   async getAccount(id: string): Promise<Account> {
 *     return await db.accounts.get(id);
 *   }
 * }
 * ```
 */
export function cacheMethod<T extends (...args: any[]) => Promise<any>>(
    ttl: number = 5 * 60 * 1000,
    keyGenerator?: (...args: Parameters<T>) => string
) {
    return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
        const method = descriptor.value;
        
        descriptor.value = async function (...args: any[]) {
            const key = keyGenerator 
                ? keyGenerator(...args)
                : `${target.constructor.name}-${propertyName}-${JSON.stringify(args)}`;
            
            return await serviceCache.getOrSet(key, () => method.apply(this, args), ttl);
        };
        
        return descriptor;
    };
}

/**
 * Cache invalidation decorator for service methods
 * 
 * Automatically invalidates cache when method is called
 * 
 * @param pattern - Cache key pattern to invalidate
 * 
 * @example
 * ```typescript
 * class MyService {
 *   @invalidateCache('account-*')
 *   async updateAccount(id: string, data: any): Promise<Account> {
 *     return await db.accounts.update(id, data);
 *   }
 * }
 * ```
 */
export function invalidateCache(pattern: string) {
    return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
        const method = descriptor.value;
        
        descriptor.value = async function (...args: any[]) {
            const result = await method.apply(this, args);
            
            // Invalidate cache entries matching pattern
            const regex = new RegExp(pattern.replace(/\*/g, '.*'));
            serviceCache.invalidatePattern(regex);
            
            return result;
        };
        
        return descriptor;
    };
}
