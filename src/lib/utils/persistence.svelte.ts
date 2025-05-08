import { browser } from '$app/environment';
import localForage from 'localforage';

// Configure localForage once
if (browser) {
    localForage.config({
        driver: [
            localForage.INDEXEDDB,
            localForage.WEBSQL,
            localForage.LOCALSTORAGE
        ],
        name: 'budgic',
        storeName: 'data',
        description: 'Budget application data store'
    });
}

type StoreOptions<T> = {
    validate?: (data: unknown) => data is T;
    onError?: (error: unknown) => void;
    debounce?: number;
};

export function persistentStore<T>(
    key: string,
    initialValue: T,
    options: StoreOptions<T> = {}
) {
    // State with loading indicator
    let value = $state(initialValue);
    let isLoading = $state(true);
    let error = $state<Error | null>(null);

    // Default validator
    const validate = options.validate || ((data: unknown): data is T => {
        return data !== null && typeof data === 'object';
    });

    // Safe serialization
    const serialize = (data: T): string => {
        try {
            return JSON.stringify(data, (_, value) => {
                // Convert Dates to ISO strings
                if (value instanceof Date) return value.toISOString();
                return value;
            });
        } catch (e) {
            handleError(new Error('Serialization failed'));
            console.log(e);
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
        } catch (e) {
            handleError(e instanceof Error ? e : new Error('Deserialization failed'));
            return initialValue;
        }
    };

    // Error handling
    const handleError = (err: unknown) => {
        error = err instanceof Error ? err : new Error(String(err));
        options.onError?.(error);
        console.error(`[persistentStore] Error (${key}):`, error);
    };

    // Browser-compatible debounce implementation
    let debounceTimeout: number | undefined;
    const save = (data: T) => {
        if (debounceTimeout !== undefined) {
            clearTimeout(debounceTimeout);
        }
        debounceTimeout = window.setTimeout(async () => {
            try {
                await localForage.setItem(key, serialize(data));
            } catch (e) {
                handleError(e);
            }
        }, options.debounce ?? 100);
    };

    // Initial load
    if (browser) {
        (async () => {
            try {
                const stored = await localForage.getItem<string>(key);
                value = deserialize(stored);
            } catch (e) {
                handleError(e);
            } finally {
                isLoading = false;
            }
        })();
    } else {
        isLoading = false;
    }

    // Return store API
    return {
        get value() { return value; },
        set value(v: T) {
            value = v;
            if (!isLoading && browser) save(v);
        },
        get isLoading() { return isLoading; },
        get error() { return error; },
        clearError: () => error = null,
        
        // Migration helper
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
            } catch (e) {
                handleError(e);
            }
            return false;
        }
    };
}