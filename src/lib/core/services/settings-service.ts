import { db, generateUUID } from '$lib/core/db';
import type { Settings, UserPreferences } from '$lib/core/db';
import { validationService } from './validation-service';

class SettingsService {
    public get ready() {
        return Promise.resolve();
    }

    public isLoading() {
        return false;
    }

    async load() {
        // No-op with Dexie as data is loaded on-demand
    }

    // ============================================================================
    // DYNAMIC SETTINGS METHODS (for key-value settings that can't be predefined)
    // ============================================================================

    // Generic settings methods
    async getSetting(key: string): Promise<string | null> {
        const setting = await db.dynamicSettings
            .where('key').equals(key)
            .filter(setting => !setting.deletedAt)
            .first();
        
        return setting?.value || null;
    }

    async setSetting(key: string, value: string, dataType: 'string' | 'number' | 'boolean' | 'json' = 'string'): Promise<void> {
        const existing = await db.dynamicSettings
            .where('key').equals(key)
            .filter(setting => !setting.deletedAt)
            .first();

        if (existing) {
            // Validate setting data before update
            const validation = await validationService.validateTagUpdate(existing.id, { value, dataType } as any);
            if (!validation.isValid) {
                throw new Error(`Invalid setting data: ${validation.errors.join(', ')}`);
            }

            await db.dynamicSettings.update(existing.id, {
                value,
                dataType,
                updatedAt: new Date().toISOString()
            });
        } else {
            // Validate setting data before creation
            const validation = await validationService.validateTagCreation({ key, value, dataType } as any);
            if (!validation.isValid) {
                throw new Error(`Invalid setting data: ${validation.errors.join(', ')}`);
            }

            const newSetting: Settings = {
                id: generateUUID(),
                key,
                value,
                dataType,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                deletedAt: null
            };
            await db.dynamicSettings.add(newSetting);
        }
    }

    async deleteSetting(key: string): Promise<void> {
        const setting = await db.dynamicSettings
            .where('key').equals(key)
            .filter(setting => !setting.deletedAt)
            .first();
        
        if (setting) {
            await db.dynamicSettings.update(setting.id, {
                deletedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        }
    }

    // Typed settings methods
    async getStringSetting(key: string, defaultValue: string = ''): Promise<string> {
        const value = await this.getSetting(key);
        return value || defaultValue;
    }

    async getNumberSetting(key: string, defaultValue: number = 0): Promise<number> {
        const value = await this.getSetting(key);
        if (!value) return defaultValue;
        
        const parsed = parseFloat(value);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    async getBooleanSetting(key: string, defaultValue: boolean = false): Promise<boolean> {
        const value = await this.getSetting(key);
        if (!value) return defaultValue;
        
        return value === 'true';
    }

    async getJsonSetting<T>(key: string, defaultValue: T): Promise<T> {
        const value = await this.getSetting(key);
        if (!value) return defaultValue;
        
        try {
            return JSON.parse(value);
        } catch {
            return defaultValue;
        }
    }

    async setStringSetting(key: string, value: string): Promise<void> {
        await this.setSetting(key, value, 'string');
    }

    async setNumberSetting(key: string, value: number): Promise<void> {
        await this.setSetting(key, value.toString(), 'number');
    }

    async setBooleanSetting(key: string, value: boolean): Promise<void> {
        await this.setSetting(key, value.toString(), 'boolean');
    }

    async setJsonSetting(key: string, value: any): Promise<void> {
        await this.setSetting(key, JSON.stringify(value), 'json');
    }

    // ============================================================================
    // USER PREFERENCES METHODS (structured settings with type safety)
    // ============================================================================

    async getUserPreferences(): Promise<UserPreferences | null> {
        const preferences = await db.userPreferences.filter(pref => !pref.deletedAt).first();
        return preferences || null;
    }

    async createUserPreferences(data: Partial<UserPreferences>): Promise<UserPreferences> {
        const preferences: UserPreferences = {
            id: generateUUID(),
            // User Profile
            username: data.username || 'User',
            
            // Income and Budget Preferences
            incomeMode: data.incomeMode || 'adaptive',
            incomeConfidenceThreshold: data.incomeConfidenceThreshold ?? 0.8,
            defaultBudgetType: data.defaultBudgetType || 'daily',
            
            // Global Budget Settings
            allowGlobalBorrowing: data.allowGlobalBorrowing ?? true,
            maxGlobalBorrowPercentage: data.maxGlobalBorrowPercentage ?? 0.1,
            spendingMomentumCooldown: data.spendingMomentumCooldown ?? 30,
            velocityAlertThreshold: data.velocityAlertThreshold ?? 2.0,
            
            // Alert Preferences
            dailyBudgetReminders: data.dailyBudgetReminders ?? true,
            overspendingAlerts: data.overspendingAlerts ?? true,
            goalMilestoneAlerts: data.goalMilestoneAlerts ?? true,
            
            // Life Stage and Context
            lifeStage: data.lifeStage || 'mid_career',
            incomeVolatility: data.incomeVolatility || 'medium',
            stressLevel: data.stressLevel || 'medium',
            
            // UI Preferences
            theme: data.theme || 'dark',
            language: data.language || 'en',
            currency: data.currency || 'USD',
            firstDayOfWeek: data.firstDayOfWeek ?? 0,
            
            // Date Display Preferences
            dateDisplayFormat: data.dateDisplayFormat || 'time',
            plannedDateDisplayFormat: data.plannedDateDisplayFormat || 'date',
            clearedDateDisplayFormat: data.clearedDateDisplayFormat || 'time',
            
            // Notification Preferences
            notificationsEnabled: data.notificationsEnabled ?? true,
            
            // User Maturity and Onboarding
            userMaturityLevel: data.userMaturityLevel || 'beginner',
            onboardingCompleted: data.onboardingCompleted ?? false,
            
            // Feature Flags
            enableAdvancedFeatures: data.enableAdvancedFeatures ?? false,
            enablePredictiveAnalytics: data.enablePredictiveAnalytics ?? true,
            enableEmotionalIntelligence: data.enableEmotionalIntelligence ?? true,
            enableContextualSuggestions: data.enableContextualSuggestions ?? true,
            
            // Privacy and Data Preferences
            dataSharingEnabled: data.dataSharingEnabled ?? false,
            analyticsEnabled: data.analyticsEnabled ?? true,
            backupEnabled: data.backupEnabled ?? true,
            
            // Performance Preferences
            cacheEnabled: data.cacheEnabled ?? true,
            offlineModeEnabled: data.offlineModeEnabled ?? false,
            
            // Import/Export Preferences
            autoImportEnabled: data.autoImportEnabled ?? false,
            exportFormat: data.exportFormat || 'json',
            
            // Accessibility Preferences
            highContrastMode: data.highContrastMode ?? false,
            reducedMotion: data.reducedMotion ?? false,
            fontSize: data.fontSize || 'medium',
            
            // User Actions Tracking Preferences
            userActionsTrackingEnabled: data.userActionsTrackingEnabled ?? true,
            userActionsTrackingPreferences: data.userActionsTrackingPreferences ?? {
                transaction_timing: true,
                budget_adherence: true,
                spending_patterns: true,
                habit_formation: true
            },
            userActionsRetentionDays: data.userActionsRetentionDays ?? 365,
            
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null
        };

        await db.userPreferences.add(preferences);
        return preferences;
    }

    async updateUserPreferences(updates: Partial<UserPreferences>): Promise<void> {
        const preferences = await this.getUserPreferences();
        if (!preferences) {
            await this.createUserPreferences(updates);
            return;
        }

        await db.userPreferences.update(preferences.id, {
            ...updates,
            updatedAt: new Date().toISOString()
        });
    }

    // ============================================================================
    // CONVENIENCE METHODS FOR COMMON SETTINGS
    // ============================================================================

    // User Profile
    async getUsername(): Promise<string> {
        const prefs = await this.getUserPreferences();
        return prefs?.username || 'User';
    }

    async setUsername(username: string): Promise<void> {
        await this.updateUserPreferences({ username });
    }

    // Income and Budget Preferences
    async getIncomeMode(): Promise<'pessimistic' | 'optimistic' | 'adaptive'> {
        const prefs = await this.getUserPreferences();
        return prefs?.incomeMode || 'adaptive';
    }

    async setIncomeMode(mode: 'pessimistic' | 'optimistic' | 'adaptive'): Promise<void> {
        await this.updateUserPreferences({ incomeMode: mode });
    }

    async getDefaultBudgetType(): Promise<'daily' | 'weekly' | 'monthly'> {
        const prefs = await this.getUserPreferences();
        return prefs?.defaultBudgetType || 'daily';
    }

    async setDefaultBudgetType(type: 'daily' | 'weekly' | 'monthly'): Promise<void> {
        await this.updateUserPreferences({ defaultBudgetType: type });
    }

    async getAllowGlobalBorrowing(): Promise<boolean> {
        const prefs = await this.getUserPreferences();
        return prefs?.allowGlobalBorrowing ?? true;
    }

    async setAllowGlobalBorrowing(allow: boolean): Promise<void> {
        await this.updateUserPreferences({ allowGlobalBorrowing: allow });
    }

    // Life Stage and Context (for enhanced budget service)
    async getLifeStage(): Promise<'student' | 'early_career' | 'mid_career' | 'late_career' | 'pre_retirement' | 'retired'> {
        const prefs = await this.getUserPreferences();
        return prefs?.lifeStage || 'mid_career';
    }

    async setLifeStage(stage: 'student' | 'early_career' | 'mid_career' | 'late_career' | 'pre_retirement' | 'retired'): Promise<void> {
        await this.updateUserPreferences({ lifeStage: stage });
    }

    async getIncomeVolatility(): Promise<'low' | 'medium' | 'high'> {
        const prefs = await this.getUserPreferences();
        return prefs?.incomeVolatility || 'medium';
    }

    async setIncomeVolatility(volatility: 'low' | 'medium' | 'high'): Promise<void> {
        await this.updateUserPreferences({ incomeVolatility: volatility });
    }

    async getStressLevel(): Promise<'low' | 'medium' | 'high'> {
        const prefs = await this.getUserPreferences();
        return prefs?.stressLevel || 'medium';
    }

    async setStressLevel(level: 'low' | 'medium' | 'high'): Promise<void> {
        await this.updateUserPreferences({ stressLevel: level });
    }

    // UI Preferences
    async getTheme(): Promise<'light' | 'dark'> {
        const prefs = await this.getUserPreferences();
        return prefs?.theme || 'dark';
    }

    async setTheme(theme: 'light' | 'dark'): Promise<void> {
        await this.updateUserPreferences({ theme });
    }

    async getLanguage(): Promise<'en' | 'ru'> {
        const prefs = await this.getUserPreferences();
        return prefs?.language || 'en';
    }

    async setLanguage(language: 'en' | 'ru'): Promise<void> {
        await this.updateUserPreferences({ language });
    }

    async getCurrency(): Promise<string> {
        const prefs = await this.getUserPreferences();
        return prefs?.currency || 'USD';
    }

    async setCurrency(currency: string): Promise<void> {
        await this.updateUserPreferences({ currency });
    }

    async getFirstDayOfWeek(): Promise<number> {
        const prefs = await this.getUserPreferences();
        return prefs?.firstDayOfWeek ?? 0;
    }

    async setFirstDayOfWeek(day: number): Promise<void> {
        await this.updateUserPreferences({ firstDayOfWeek: day });
    }

    // Date Display Preferences
    async getDateDisplayFormat(): Promise<'date' | 'time' | 'datetime'> {
        const prefs = await this.getUserPreferences();
        return prefs?.dateDisplayFormat || 'time';
    }

    async setDateDisplayFormat(format: 'date' | 'time' | 'datetime'): Promise<void> {
        await this.updateUserPreferences({ dateDisplayFormat: format });
    }

    async getPlannedDateDisplayFormat(): Promise<'date' | 'time' | 'datetime'> {
        const prefs = await this.getUserPreferences();
        return prefs?.plannedDateDisplayFormat || 'date';
    }

    async setPlannedDateDisplayFormat(format: 'date' | 'time' | 'datetime'): Promise<void> {
        await this.updateUserPreferences({ plannedDateDisplayFormat: format });
    }

    async getClearedDateDisplayFormat(): Promise<'date' | 'time' | 'datetime'> {
        const prefs = await this.getUserPreferences();
        return prefs?.clearedDateDisplayFormat || 'time';
    }

    async setClearedDateDisplayFormat(format: 'date' | 'time' | 'datetime'): Promise<void> {
        await this.updateUserPreferences({ clearedDateDisplayFormat: format });
    }

    // Notification Preferences
    async getNotificationsEnabled(): Promise<boolean> {
        const prefs = await this.getUserPreferences();
        return prefs?.notificationsEnabled ?? true;
    }

    async setNotificationsEnabled(enabled: boolean): Promise<void> {
        await this.updateUserPreferences({ notificationsEnabled: enabled });
    }

    // User Maturity and Onboarding
    async getUserMaturityLevel(): Promise<'beginner' | 'intermediate' | 'advanced' | 'expert'> {
        const prefs = await this.getUserPreferences();
        return prefs?.userMaturityLevel || 'beginner';
    }

    async setUserMaturityLevel(level: 'beginner' | 'intermediate' | 'advanced' | 'expert'): Promise<void> {
        await this.updateUserPreferences({ userMaturityLevel: level });
    }

    async getOnboardingCompleted(): Promise<boolean> {
        const prefs = await this.getUserPreferences();
        return prefs?.onboardingCompleted ?? false;
    }

    async setOnboardingCompleted(completed: boolean): Promise<void> {
        await this.updateUserPreferences({ onboardingCompleted: completed });
    }

    // Feature Flags
    async getEnableAdvancedFeatures(): Promise<boolean> {
        const prefs = await this.getUserPreferences();
        return prefs?.enableAdvancedFeatures ?? false;
    }

    async setEnableAdvancedFeatures(enabled: boolean): Promise<void> {
        await this.updateUserPreferences({ enableAdvancedFeatures: enabled });
    }

    async getEnablePredictiveAnalytics(): Promise<boolean> {
        const prefs = await this.getUserPreferences();
        return prefs?.enablePredictiveAnalytics ?? true;
    }

    async setEnablePredictiveAnalytics(enabled: boolean): Promise<void> {
        await this.updateUserPreferences({ enablePredictiveAnalytics: enabled });
    }

    async getEnableEmotionalIntelligence(): Promise<boolean> {
        const prefs = await this.getUserPreferences();
        return prefs?.enableEmotionalIntelligence ?? true;
    }

    async setEnableEmotionalIntelligence(enabled: boolean): Promise<void> {
        await this.updateUserPreferences({ enableEmotionalIntelligence: enabled });
    }

    async getEnableContextualSuggestions(): Promise<boolean> {
        const prefs = await this.getUserPreferences();
        return prefs?.enableContextualSuggestions ?? true;
    }

    async setEnableContextualSuggestions(enabled: boolean): Promise<void> {
        await this.updateUserPreferences({ enableContextualSuggestions: enabled });
    }

    // Privacy and Data Preferences
    async getDataSharingEnabled(): Promise<boolean> {
        const prefs = await this.getUserPreferences();
        return prefs?.dataSharingEnabled ?? false;
    }

    async setDataSharingEnabled(enabled: boolean): Promise<void> {
        await this.updateUserPreferences({ dataSharingEnabled: enabled });
    }

    async getAnalyticsEnabled(): Promise<boolean> {
        const prefs = await this.getUserPreferences();
        return prefs?.analyticsEnabled ?? true;
    }

    async setAnalyticsEnabled(enabled: boolean): Promise<void> {
        await this.updateUserPreferences({ analyticsEnabled: enabled });
    }

    async getBackupEnabled(): Promise<boolean> {
        const prefs = await this.getUserPreferences();
        return prefs?.backupEnabled ?? true;
    }

    async setBackupEnabled(enabled: boolean): Promise<void> {
        await this.updateUserPreferences({ backupEnabled: enabled });
    }

    // Performance Preferences
    async getCacheEnabled(): Promise<boolean> {
        const prefs = await this.getUserPreferences();
        return prefs?.cacheEnabled ?? true;
    }

    async setCacheEnabled(enabled: boolean): Promise<void> {
        await this.updateUserPreferences({ cacheEnabled: enabled });
    }

    async getOfflineModeEnabled(): Promise<boolean> {
        const prefs = await this.getUserPreferences();
        return prefs?.offlineModeEnabled ?? false;
    }

    async setOfflineModeEnabled(enabled: boolean): Promise<void> {
        await this.updateUserPreferences({ offlineModeEnabled: enabled });
    }

    // Import/Export Preferences
    async getAutoImportEnabled(): Promise<boolean> {
        const prefs = await this.getUserPreferences();
        return prefs?.autoImportEnabled ?? false;
    }

    async setAutoImportEnabled(enabled: boolean): Promise<void> {
        await this.updateUserPreferences({ autoImportEnabled: enabled });
    }

    async getExportFormat(): Promise<'json' | 'csv' | 'pdf'> {
        const prefs = await this.getUserPreferences();
        return prefs?.exportFormat || 'json';
    }

    async setExportFormat(format: 'json' | 'csv' | 'pdf'): Promise<void> {
        await this.updateUserPreferences({ exportFormat: format });
    }

    // Accessibility Preferences
    async getHighContrastMode(): Promise<boolean> {
        const prefs = await this.getUserPreferences();
        return prefs?.highContrastMode ?? false;
    }

    async setHighContrastMode(enabled: boolean): Promise<void> {
        await this.updateUserPreferences({ highContrastMode: enabled });
    }

    async getReducedMotion(): Promise<boolean> {
        const prefs = await this.getUserPreferences();
        return prefs?.reducedMotion ?? false;
    }

    async setReducedMotion(enabled: boolean): Promise<void> {
        await this.updateUserPreferences({ reducedMotion: enabled });
    }

    async getFontSize(): Promise<'small' | 'medium' | 'large'> {
        const prefs = await this.getUserPreferences();
        return prefs?.fontSize || 'medium';
    }

    async setFontSize(size: 'small' | 'medium' | 'large'): Promise<void> {
        await this.updateUserPreferences({ fontSize: size });
    }

    // ============================================================================
    // DATE FORMATTING UTILITY METHODS
    // ============================================================================

    formatDate(date: string | Date, format: 'date' | 'time' | 'datetime' = 'time'): string {
        const dateObj = typeof date === 'string' ? new Date(date) : date;
        
        switch (format) {
            case 'date':
                return dateObj.toLocaleDateString(undefined, { 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric' 
                });
            case 'time':
                return dateObj.toLocaleTimeString(undefined, { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
            case 'datetime':
                return dateObj.toLocaleString(undefined, { 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric',
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
            default:
                return dateObj.toLocaleString();
        }
    }

    // ============================================================================
    // EXPORT/IMPORT METHODS
    // ============================================================================

    async exportSettings(): Promise<Record<string, any>> {
        const [userPreferences, dynamicSettings] = await Promise.all([
            this.getUserPreferences(),
            db.dynamicSettings.filter(setting => !setting.deletedAt).toArray()
        ]);

        return {
            userPreferences: userPreferences || {},
            dynamicSettings: dynamicSettings.map(setting => ({
                key: setting.key,
                value: setting.value,
                dataType: setting.dataType
            })),
            exportDate: new Date().toISOString(),
            version: '1.0'
        };
    }

    async importSettings(data: Record<string, any>): Promise<void> {
        if (data.userPreferences) {
            await this.updateUserPreferences(data.userPreferences);
        }

        if (data.dynamicSettings && Array.isArray(data.dynamicSettings)) {
            for (const setting of data.dynamicSettings) {
                await this.setSetting(setting.key, setting.value, setting.dataType);
            }
        }
    }
}

export const settingsService = new SettingsService(); 