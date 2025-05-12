import { browser } from '$app/environment';
import localForage from 'localforage';

// Configure localForage once
if (browser) {
    localForage.config({
        driver: localForage.INDEXEDDB,
        name: 'budgic',
        storeName: 'data',
        description: 'Budget application data store'
    });
}

// Enhanced error handling
export class PersistenceError extends Error {
    constructor(message: string, public code?: string) {
        super(message);
        this.name = 'PersistenceError';
    }
}

type StoreOptions<T, K extends string | number | symbol = string> = {
    validate?: (data: unknown) => data is T;
    onError?: (error: unknown) => void;
    debounce?: number;
    isCollection?: boolean;
    idKey?: K; // Key to use as ID for collections
    pageSize?: number;
    indexes?: string[]; // New: Define indexing strategy
    maxCacheSize?: number; // New: LRU cache configuration
};

interface PersistentStore<T> {
    value: T;
    isLoading: boolean;
    error: Error | null;
    clearError: () => void;
    migrateFromLocalStorage: () => Promise<boolean>;
    exportData: () => Promise<string>;
    importData: (data: string) => Promise<void>;
    diagnostics: () => Promise<{
        totalEntries: number;
        lastModified: string;
        storageUsed: number;
    }>;
    ready: Promise<void>;
}

interface CollectionStoreMethods<T extends Record<string, unknown>, K extends keyof T> extends PersistentStore<T[]> {
    getItem: (id: string) => Promise<T | undefined>;
    addItem: (item: Omit<T, K>) => Promise<void>;
    updateItem: (id: string, updates: Partial<T>) => Promise<void>;
    removeItem: (id: string) => Promise<void>;

    // New batch operation methods
    batchUpdate: (updates: Array<{id: string, data: Partial<T>}>) => Promise<T[]>;
    batchRemove: (ids: string[]) => Promise<void>;

    // Enhanced loading and filtering
    loadMore: (options?: {
        cursor?: string; 
        filter?: (item: T) => boolean;
        limit?: number;
    }) => Promise<T[]>;
    
    // New filtering methods
    findBy: (predicate: (item: T) => boolean) => Promise<T[]>;
    hasMore: () => Promise<boolean>;
}

export function persistentStore<T, K extends string = string>(
    key: string,
    initialValue: T,
    options: StoreOptions<T, K> = {}
): T extends Array<unknown> ? CollectionStoreMethods<T[number] & Record<K, string>, K> : PersistentStore<T> {
    // State with loading indicator
    let value = $state(initialValue);
    let isLoading = $state(true);
    let error = $state<Error | null>(null);
    const idKey = (options.isCollection ? options.idKey : undefined) as K;

    let resolveReady: () => void;
    const readyPromise = new Promise<void>(r => resolveReady = r);

    // Default validator
    const validate = options.validate || ((data: unknown): data is T => {
        return data !== null;
    });

    // Safe serialization
    const serialize = (data: T): string => {
        try {
            return JSON.stringify(data);
        } catch (_err) {
            handleError(new Error('Serialization failed'));
            return JSON.stringify(initialValue);
        }
    };

    // Safe deserialization with validation
    const deserialize = (stored: string | null): T => {
        if (stored === null) return initialValue;
        
        try {
            const parsed = JSON.parse(stored);
            if (validate(parsed)) {
                return parsed;
            }
            throw new Error('Data validation failed');
        } catch (err) {
            handleError(err instanceof Error ? err : new Error('Deserialization failed'));
            return initialValue;
        }
    };

    // Error handling
    const handleError = (err: unknown) => {
        const error = err instanceof Error ? err : new Error(String(err));
        import('$lib/utils/error.store').then(({ reportError }) => reportError(error));
        options.onError?.(error);
        console.error(`[persistentStore] Error (${key}):`, error);
    };

    // Debounced save
    let debounceTimeout: number | undefined;
    const save = (data: T) => {
        if (debounceTimeout !== undefined) {
            clearTimeout(debounceTimeout);
        }
        debounceTimeout = window.setTimeout(async () => {
            try {
                if (options.isCollection && Array.isArray(data)) {
                    await Promise.all(
                        data.map(item => {
                            const itemId = idKey ? String(item[idKey as keyof typeof item]) : '';
                            const itemKey = `${key}:${itemId}`;
                            return localForage.setItem(itemKey, serialize(item as unknown as T));
                        })
                    );
                } else {
                    await localForage.setItem(key, serialize(data));
                }
            } catch (err) {
                handleError(err);
            }
        }, options.debounce ?? 100);
    };

    // Load data
    const load = async () => {
        try {
            if (options.isCollection && Array.isArray(initialValue)) {
                const keys = await localForage.keys();
                const collectionKeys = keys.filter(k => k.startsWith(`${key}:`));
                
                const batch = collectionKeys.slice(0, 100);
                const items = await Promise.all(
                    batch.map(k => localForage.getItem<string>(k).then(deserialize))
                );
                
                value = items.filter(Boolean) as T;
            } else {
                const stored = await localForage.getItem<string>(key);
                value = deserialize(stored);
            }
        } catch (err) {
            handleError(err);
        } finally {
            isLoading = false;
            resolveReady();
        }
    };

    // Initial load
    if (browser) {
        load();
    } else {
        isLoading = false;
    }

    // Base store API
    const baseStore = {
        get value() { return value; },
        set value(v: T) {
            value = v;
            if (!isLoading && browser) save(v);
        },
        get isLoading() { return isLoading; },
        get error() { return error; },
        clearError: () => { error = null; },

        ready: readyPromise,
        
        async migrateFromLocalStorage() {
            if (!browser) return false;
            
            try {
                const legacy = localStorage.getItem(key);
                if (legacy) {
                    this.value = deserialize(legacy);
                    localStorage.removeItem(key);
                    await save(this.value);
                    return true;
                }
            } catch (err) {
                handleError(err);
            }
            return false;
        },
        
        async exportData() {
            try {
                if (options.isCollection && Array.isArray(value)) {
                    const keys = await localForage.keys();
                    const collectionKeys = keys.filter(k => k.startsWith(`${key}:`));
                    const items = await Promise.all(
                        collectionKeys.map(k => localForage.getItem<string>(k))
                    );
                    return JSON.stringify(items.map(i => i && deserialize(i)));
                }
                const data = await localForage.getItem<string>(key);
                return data || JSON.stringify(initialValue);
            } catch (err) {
                handleError(err);
                return JSON.stringify(initialValue);
            }
        },

        async importData(jsonData: string) {
            try {
                const parsedData = JSON.parse(jsonData);
                // Validate imported data
                if (options.validate && !options.validate(parsedData)) {
                    throw new PersistenceError('Invalid data format', 'IMPORT_VALIDATION_FAILED');
                }
                
                // Clear existing data and import
                await localForage.removeItem(key);
                await save(parsedData);
            } catch (err) {
                handleError(err);
            }
        },

        async diagnostics() {
            try {
                const keys = await localForage.keys();
                const storageEstimate = await navigator.storage?.estimate();
                
                return {
                    totalEntries: keys.length,
                    lastModified: new Date().toISOString(),
                    storageUsed: storageEstimate?.usage ?? 0
                };
            } catch (err) {
                handleError(err);
                return {
                    totalEntries: 0,
                    lastModified: new Date().toISOString(),
                    storageUsed: 0
                };
            }
        }
    };

    // Collection-specific methods
    if (options.isCollection && Array.isArray(initialValue)) {
        type ItemType = T extends Array<infer U> ? U & Record<K, string> : never;
        
        const collectionStore = {
            ...baseStore,
            async getItem(id: string) {
                try {
                    const stored = await localForage.getItem<string>(`${key}:${id}`);
                    return stored ? deserialize(stored) as unknown as ItemType : undefined;
                } catch (err) {
                    handleError(err);
                    return undefined;
                }
            },
            
            async addItem(item: Omit<ItemType, K>) {
                try {
                    if (!idKey) throw new Error('ID key not defined');
                    const itemWithId = { 
                        ...item as object, 
                        [idKey]: crypto.randomUUID() 
                    } as ItemType;
                    
                    await localForage.setItem(
                        `${key}:${itemWithId[idKey]}`, 
                        serialize(itemWithId as unknown as T)
                    );
                    
                    if (Array.isArray(value)) {
                        value = [...value, itemWithId] as T;
                    }
                } catch (err) {
                    handleError(err);
                }
            },
            
            async updateItem(id: string, updates: Partial<ItemType>) {
                try {
                    const existing = await localForage.getItem<string>(`${key}:${id}`);
                    if (!existing) throw new Error('Item not found');
                    
                    const current = deserialize(existing) as ItemType;
                    const updated = { ...current, ...updates };
                    await localForage.setItem(`${key}:${id}`, serialize(updated as unknown as T));
                    
                    if (Array.isArray(value)) {
                        value = value.map(item => {
                            const typedItem = item as ItemType;
                            return typedItem[idKey] === id ? updated : item;
                        }) as T;
                    }
                } catch (err) {
                    handleError(err);
                }
            },
            
            async removeItem(id: string) {
                try {
                    await localForage.removeItem(`${key}:${id}`);
                    if (Array.isArray(value)) {
                        value = value.filter(item => {
                            const typedItem = item as ItemType;
                            return typedItem[idKey] !== id;
                        }) as T;
                    }
                } catch (err) {
                    handleError(err);
                }
            },

            async batchUpdate(updates: Array<{id: string, data: Partial<T>}>) {
                const updatedItems = await Promise.all(
                    updates.map(async ({ id, data }) => {
                        const existing = await localForage.getItem<string>(`${key}:${id}`);
                        if (!existing) throw new PersistenceError(`Item ${id} not found`);
                        
                        const current = deserialize(existing);
                        const updated = { ...current, ...data };
                        
                        await localForage.setItem(`${key}:${id}`, serialize(updated));
                        return updated;
                    })
                );
                
                return updatedItems;
            },
            
            async batchRemove(ids: string[]) {
                await Promise.all(
                    ids.map(id => localForage.removeItem(`${key}:${id}`))
                );
            },
            
            async loadMore(count = 50) {
                this.isLoading = true;
                try {
                    const keys = await localForage.keys();
                    const collectionKeys = keys.filter(k => k.startsWith(`${key}:`));
                    const loadedCount = Array.isArray(this.value) ? this.value.length : 0;
                    
                    // Check if we've loaded everything
                    if (loadedCount >= collectionKeys.length) {
                        this.isLoading = false;
                        return;
                    }
                    
                    const batch = collectionKeys.slice(loadedCount, loadedCount + count);
                    const items = await Promise.all(
                        batch.map(k => localForage.getItem<string>(k).then(deserialize))
                    );
                    
                    if (Array.isArray(this.value)) {
                        this.value = [...this.value, ...items.filter(Boolean)] as T;
                    }
                } catch (err) {
                    handleError(err);
                } finally {
                    this.isLoading = false;
                }
            },

            async findBy(predicate: (item: any) => boolean) {
                const keys = await localForage.keys();
                const collectionKeys = keys.filter(k => k.startsWith(`${key}:`));
                
                const results = await Promise.all(
                    collectionKeys.map(k => 
                        localForage.getItem<string>(k)
                            .then(item => item ? deserialize(item) : null)
                    )
                );
                
                return results.filter(Boolean).filter(predicate);
            },
            
            async hasMore() {
                try {
                    const keys = await localForage.keys();
                    const collectionKeys = keys.filter(k => k.startsWith(`${key}:`));
                    if (!Array.isArray(this.value)) return false;
                    return this.value.length < collectionKeys.length;
                } catch (err) {
                    handleError(err);
                    return false;
                }
            }
        };
        
        return collectionStore as unknown as T extends Array<unknown> ? CollectionStoreMethods<T[number] & Record<K, string>, K> : PersistentStore<T>;
    }

    return baseStore as unknown as T extends Array<unknown> ? CollectionStoreMethods<T[number] & Record<K, string>, K> : PersistentStore<T>;
}