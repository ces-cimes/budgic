import { persistentStore } from '$lib/core/persistence.svelte';
import type { Settings } from '$lib/core/models/types';

// Sample currency data - in a real app this might come from an API
const CURRENCY_SYMBOLS: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    CAD: '$',
    AUD: '$',
    CHF: 'Fr',
    CNY: '¥',
    HKD: '$',
    SGD: '$'
};

class SettingsService {
    private _store = persistentStore<Settings>(
        'settings',
        {
            // BaseEntity
            id: crypto.randomUUID() as string & { readonly __brand: "uuid" },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isDeleted: false,

            // Settings
            currency: 'USD',
            theme: 'light',
            language: 'en',
            notificationsEnabled: true,
            firstDayOfWeek: 0 // Sunday
        },
        {
            isCollection: false
        }
    );

    // Update settings
    async updateSettings(updates: Partial<Settings>): Promise<void> {
        const currentSettings = this._store.value;
        const newSettings = {
            ...currentSettings,
            ...updates,
            updatedAt: new Date().toISOString()
        };
        await this._store.set(newSettings);
    }

    // Get currency symbol
    getCurrencySymbol(currencyCode: string): string {
        return CURRENCY_SYMBOLS[currencyCode] || currencyCode;
    }

    // Get current settings
    get settings() {
        return this._store.value;
    }
}

export const settingsService = new SettingsService();