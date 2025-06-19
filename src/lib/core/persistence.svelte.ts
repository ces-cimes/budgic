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

export class PersistenceError extends Error {
    constructor(message: string, public code?: string) {
        super(message);
        this.name = 'PersistenceError';
    }
}

type StoreOptions<T> = {
    validate?: (data: unknown) => data is T;
    onError?: (error: unknown) => void;
    debounce?: number;
    isCollection?: boolean;
    idKey?: string;
    pageSize?: number;
    indexes?: string[];
    maxCacheSize?: number;
};

interface PersistentStore<T> {
    getValue(): T;
    setValue(v: T): void;
    getIsLoading(): boolean;
    getError(): Error | null;
    
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
    debugRawKeys: () => Promise<string[]>;
}

export interface CollectionStore<T> extends PersistentStore<T[]> {
    getItem: (id: string) => Promise<T | undefined>;
    addItem: (item: Omit<T, string>) => Promise<void>;
    updateItem: (id: string, updates: Partial<T>) => Promise<void>;
    removeItem: (id: string) => Promise<void>;
    batchUpdate: (updates: Array<{id: string, data: Partial<T>}>) => Promise<T[]>;
    batchRemove: (ids: string[]) => Promise<void>;
    loadMore: (options?: {
        cursor?: string; 
        filter?: (item: T) => boolean;
        limit?: number;
    }) => Promise<T[]>;
    findBy: (predicate: (item: T) => boolean) => Promise<T[]>;
    hasMore: () => Promise<boolean>;
}

export function persistentStore<T>(
    key: string,
    initialValue: T | T[],
    options: StoreOptions<T> = {}
): PersistentStore<T> | CollectionStore<T> {
    let _value: T | T[] = initialValue;
    let _isLoading = true;
    let _error: Error | null = null;

    const idKey = options.isCollection ? options.idKey : undefined;

    let resolveReady: () => void;
    const readyPromise = new Promise<void>(r => resolveReady = r);

    const validate = options.validate || ((data: unknown): data is T => {
        return data !== null;
    });

    const serialize = (data: T): string => {
        try {
            return JSON.stringify(data);
        } catch (_err) {
            handleError(new Error('Serialization failed'));
            return JSON.stringify(initialValue);
        }
    };

    const deserialize = (stored: string | null): T => {
        if (stored === null) {
            console.debug("[Persistence] No stored data, using initial value");
            return initialValue as T;
        }

        try {
            const parsed = JSON.parse(stored);
            if (!validate(parsed)) throw new Error('Validation failed');
            return parsed as T;
        } catch (err) {
            handleError(err);
            return initialValue as T;
        }
    };

    const handleError = (err: unknown) => {
        const error = err instanceof Error ? err : new Error(String(err));
        options.onError?.(error);
        console.error(`[persistentStore] Error (${key}):`, error);
        _error = error;
    };

    let debounceTimeout: number | undefined;
    const save = (data: T | T[]) => {
        if (debounceTimeout !== undefined) clearTimeout(debounceTimeout);
        debounceTimeout = window.setTimeout(async () => {
            try {
                if (options.isCollection && Array.isArray(data)) {
                    await Promise.all(data.map(item => {
                        const itemId = (item as Record<string, unknown>)[idKey!] as string;
                        return localForage.setItem(`${key}:${itemId}`, serialize(item));
                    }));
                } else {
                    await localForage.setItem(key, serialize(data as T));
                }
            } catch (err) {
                handleError(err);
            }
        }, options.debounce ?? 100);
    };

    const load = async () => {
        try {
            await localForage.ready();
            
            if (options.isCollection && Array.isArray(initialValue)) {
                const keys = await localForage.keys();
                const collectionKeys = keys.filter(k => k.startsWith(`${key}:`));
                
                const items = await Promise.all(
                    collectionKeys.map(k => 
                        localForage.getItem<string>(k).then(deserialize)
                    )
                );

                _value = items.filter(item => item !== null) as T[];
            } else {
                _value = deserialize(await localForage.getItem<string>(key));
            }
        } catch (err) {
            handleError(err);
        } finally {
            _isLoading = false;
            resolveReady();
        }
    };

    if (browser) load();

    const baseStore: PersistentStore<T> = {
        getValue: () => _value as T,
        setValue: (v: T) => {
            _value = v;
            if (!_isLoading && browser) save(v);
        },
        getIsLoading: () => _isLoading,
        getError: () => _error,
        clearError: () => { _error = null; },
        ready: readyPromise,

        async debugRawKeys() {
            return localForage.keys();
        },
        
        async migrateFromLocalStorage() {
            if (!browser) return false;
            try {
                const legacy = localStorage.getItem(key);
                if (legacy) {
                    const data = deserialize(legacy);
                    this.setValue(data);
                    localStorage.removeItem(key);
                    return true;
                }
                return false;
            } catch (err) {
                handleError(err);
                return false;
            }
        },
        
        async exportData() {
            try {
                if (options.isCollection && Array.isArray(_value)) {
                    const keys = await localForage.keys();
                    const items = await Promise.all(
                        keys.filter(k => k.startsWith(`${key}:`))
                            .map(k => localForage.getItem<string>(k))
                    );
                    return JSON.stringify(items.map(deserialize));
                }
                return JSON.stringify(deserialize(await localForage.getItem(key)));
            } catch (err) {
                handleError(err);
                return JSON.stringify(initialValue);
            }
        },

        async importData(jsonData: string) {
            try {
                const parsedData = JSON.parse(jsonData);
                
                if (options.isCollection) {
                    if (!Array.isArray(parsedData)) {
                        throw new PersistenceError('Collection data must be an array', 'IMPORT_INVALID_FORMAT');
                    }
        
                    // Clear existing collection items
                    const keys = await localForage.keys();
                    await Promise.all(
                        keys.filter(k => k.startsWith(`${key}:`))
                            .map(k => localForage.removeItem(k))
                    );
        
                    // Validate and store new items
                    const itemsToSave = parsedData.map(item => {
                        if (options.validate && !options.validate(item)) {
                            throw new PersistenceError('Invalid item in collection data', 'IMPORT_ITEM_VALIDATION_FAILED');
                        }
                        const itemId = (item as Record<string, unknown>)[idKey!] as string;
                        return { key: `${key}:${itemId}`, value: item };
                    });
        
                    await Promise.all(
                        itemsToSave.map(({ key, value }) => 
                            localForage.setItem(key, serialize(value as T))
                        )
                    );
                    
                    // TODO: properly set the value
                    //this.setValue(parsedData);
                } else {
                    if (options.validate && !options.validate(parsedData)) {
                        throw new PersistenceError('Invalid data format', 'IMPORT_VALIDATION_FAILED');
                    }
                    await localForage.removeItem(key);
                    this.setValue(parsedData);
                }
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

    if (options.isCollection && Array.isArray(initialValue)) {
        const collectionStore: CollectionStore<T> = {
            ...baseStore,
            getValue: () => _value as T[],
            setValue: (v: T[]) => {
                _value = v;
                if (!_isLoading && browser) save(v);
            },

            async getItem(id: string) {
                try {
                    console.debug('[Persistence] Getting item: ', `${key}:${id}`);
                    return deserialize(await localForage.getItem(`${key}:${id}`));
                } catch (err) {
                    handleError(err);
                    return undefined;
                }
            },
            
            async addItem(item: Omit<T, string>) {
                try {
                    // Preserve existing ID or generate new one
                    const finalItem = { 
                        ...item,
                        [idKey!]: (item as Record<string, unknown>)[idKey!] || crypto.randomUUID()
                    } as T;
                
                    await localForage.setItem(
                        `${key}:${(finalItem as Record<string, unknown>)[idKey!]}`, 
                        serialize(finalItem)
                    );
                    this.setValue([...this.getValue(), finalItem]);
                } catch (err) {
                    handleError(err);
                }
            },
            
            async updateItem(id: string, updates: Partial<T>) {
                try {
                    const current = deserialize(await localForage.getItem(`${key}:${id}`));
                    const updated = { ...current, ...updates };
                    await localForage.setItem(`${key}:${id}`, serialize(updated as T));
                    this.setValue(this.getValue().map(item => 
                        (item as Record<string, unknown>)[idKey!] === id ? updated : item
                    ));
                } catch (err) {
                    handleError(err);
                }
            },
            
            async removeItem(id: string) {
                try {
                    await localForage.removeItem(`${key}:${id}`);
                    this.setValue(this.getValue().filter(item => 
                        (item as Record<string, unknown>)[idKey!] !== id
                    ));
                } catch (err) {
                    handleError(err);
                }
            },

            async batchUpdate(updates: Array<{id: string, data: Partial<T>}>) {
                const updatedItems = await Promise.all(updates.map(async ({ id, data }) => {
                    const current = deserialize(await localForage.getItem(`${key}:${id}`));
                    const updated = { ...current, ...data };
                    await localForage.setItem(`${key}:${id}`, serialize(updated as T));
                    return updated;
                }));
                this.setValue(this.getValue().map(item => 
                    updatedItems.find(u => (u as Record<string, unknown>)[idKey!] === 
                        (item as Record<string, unknown>)[idKey!]) || item
                ));
                return updatedItems;
            },
            
            async batchRemove(ids: string[]) {
                await Promise.all(ids.map(id => localForage.removeItem(`${key}:${id}`)));
                this.setValue(this.getValue().filter(item => 
                    !ids.includes((item as Record<string, unknown>)[idKey!] as string)
                ));
            },
            
            async loadMore(options = {}) {
                const { limit = 50 } = options;
                try {
                    const keys = await localForage.keys();
                    const collectionKeys = keys.filter(k => k.startsWith(`${key}:`));
                    const loadedCount = this.getValue().length;
                    
                    if (loadedCount >= collectionKeys.length) return [];
                    
                    const batch = collectionKeys.slice(loadedCount, loadedCount + limit);
                    const items = await Promise.all(batch.map(k => 
                        localForage.getItem<string>(k).then(deserialize)
                    ));
                    
                    this.setValue([...this.getValue(), ...items]);
                    return items;
                } catch (err) {
                    handleError(err);
                    return [];
                }
            },

            async findBy(predicate: (item: T) => boolean) {
                const keys = await localForage.keys();
                const items = await Promise.all(
                    keys.filter(k => k.startsWith(`${key}:`))
                        .map(k => localForage.getItem<string>(k).then(deserialize))
                );
                return items.filter(predicate);
            },
            
            async hasMore() {
                const keys = await localForage.keys();
                return this.getValue().length < keys.filter(k => k.startsWith(`${key}:`)).length;
            }
        };
        return collectionStore;
    }

    return baseStore;
}