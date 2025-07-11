import { db } from './db';
import { accountService } from './services/account-service';
import { transactionService } from './services/transaction-service';
import { settingsService } from './services/settings-service';
import type { Account, WhatTagType, WhyTagType, TransactionType } from './db';

export async function populateSampleData() {
    console.debug('[SampleData] Starting sample data population with new tag system');
    
    try {
        // Ensure database is ready by opening it
        console.debug('[SampleData] Ensuring database is ready...');
        await db.open();
        console.debug('[SampleData] Database is ready');
        
        // Wait for all services to be ready
        await Promise.all([
            accountService.ready,
            transactionService.ready,
            settingsService.ready
        ]);
        
        // Clear existing data first
        await clearAllData();
        
        // Create accounts
        const accounts = await createSampleAccounts();
        
        // Create transactions with new tag system
        await createSampleTransactions(accounts);
        
        // Create planned transactions
        await createSamplePlannedTransactions(accounts);
        
        // Create settings and user preferences
        await createSampleSettings();
        
        console.debug('[SampleData] Sample data population completed successfully');
    } catch (error) {
        console.error('[SampleData] Error populating sample data:', error);
        throw error;
    }
}

async function clearAllData() {
    console.debug('[SampleData] Clearing all data...');

    try {
        // Clear all tables
        await db.transaction('rw', [
            db.accounts,
            db.tagDimensions,
            db.tags,
            db.transactionTags,
            db.transactions,
            db.bankTransactions,
            db.dynamicSettings,
            db.userPreferences,
            db.categorizationRules,
            db.importPresets,
            db.importHistory,
            db.spendingInsights
        ], async () => {
            await db.accounts.clear();
            await db.tagDimensions.clear();
            await db.tags.clear();
            await db.transactionTags.clear();
            await db.transactions.clear();
            await db.bankTransactions.clear();
            await db.dynamicSettings.clear();
            await db.userPreferences.clear();
            await db.categorizationRules.clear();
            await db.importPresets.clear();
            await db.importHistory.clear();
            await db.spendingInsights.clear();
        });

        console.debug('[SampleData] All data cleared successfully');
    } catch (error) {
        console.error('[SampleData] Error clearing data:', error);
        throw error;
    }
}

async function createSampleAccounts(): Promise<Record<string, Account>> {
    console.debug('[SampleData] Creating sample accounts...');
    
    try {
        const accounts = {
            checking: await accountService.createAccount({
                name: 'Main Checking',
                type: 'checking',
                currency: 'USD',
                initialBalance: 5000,
                currentBalance: 5000
            }),
            savings: await accountService.createAccount({
                name: 'Savings Account',
                type: 'savings',
                currency: 'USD',
                initialBalance: 15000,
                currentBalance: 15000
            }),
            credit: await accountService.createAccount({
                name: 'Credit Card',
                type: 'credit',
                currency: 'USD',
                initialBalance: 0,
                currentBalance: -2500
            }),
            cash: await accountService.createAccount({
                name: 'Cash',
                type: 'cash',
                currency: 'USD',
                initialBalance: 500,
                currentBalance: 500
            })
        };

        console.debug('[SampleData] Created all sample accounts:', Object.keys(accounts));
        return accounts;
    } catch (error) {
        console.error('[SampleData] Error creating accounts:', error);
        throw error;
    }
}

async function createSampleTransactions(accounts: Record<string, Account>) {
    console.debug('[SampleData] Creating sample transactions...');
    
    try {
        const transactions = [
            // Income transactions
            {
                accountId: accounts.checking.id,
                type: 'income',
                whatTag: 'salary' as WhatTagType,
                whyTag: 'income' as WhyTagType,
                amount: 3500,
                description: 'Monthly salary',
                status: 'cleared' as const,
                clearedDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
                accountId: accounts.checking.id,
                type: 'income',
                whatTag: 'freelance' as WhatTagType,
                whyTag: 'income' as WhyTagType,
                amount: 800,
                description: 'Freelance project payment',
                status: 'cleared' as const,
                clearedDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
            },

            // Housing expenses
            {
                accountId: accounts.checking.id,
                type: 'expense',
                whatTag: 'rent' as WhatTagType,
                whyTag: 'essential' as WhyTagType,
                amount: 1200,
                description: 'Monthly rent',
                status: 'cleared' as const,
                clearedDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
                accountId: accounts.checking.id,
                type: 'expense',
                whatTag: 'utilities' as WhatTagType,
                whyTag: 'essential' as WhyTagType,
                amount: 150,
                description: 'Electricity and water',
                status: 'cleared' as const,
                clearedDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
            },

            // Food expenses
            {
                accountId: accounts.checking.id,
                type: 'expense',
                whatTag: 'groceries' as WhatTagType,
                whyTag: 'essential' as WhyTagType,
                amount: 85,
                description: 'Weekly groceries',
                status: 'cleared' as const,
                clearedDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
                accountId: accounts.checking.id,
                type: 'expense',
                whatTag: 'dining' as WhatTagType,
                whyTag: 'convenience' as WhyTagType,
                amount: 45,
                description: 'Dinner with friends',
                status: 'cleared' as const,
                clearedDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
                accountId: accounts.checking.id,
                type: 'expense',
                whatTag: 'coffee' as WhatTagType,
                whyTag: 'convenience' as WhyTagType,
                amount: 4.50,
                description: 'Morning coffee',
                status: 'cleared' as const,
                clearedDate: new Date().toISOString()
            },

            // Transportation
            {
                accountId: accounts.checking.id,
                type: 'expense',
                whatTag: 'gas' as WhatTagType,
                whyTag: 'essential' as WhyTagType,
                amount: 65,
                description: 'Gas fill-up',
                status: 'cleared' as const,
                clearedDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()
            },

            // Entertainment
            {
                accountId: accounts.checking.id,
                type: 'expense',
                whatTag: 'entertainment' as WhatTagType,
                whyTag: 'entertainment' as WhyTagType,
                amount: 15,
                description: 'Movie streaming subscription',
                status: 'cleared' as const,
                clearedDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
            }
        ];

        for (const transactionData of transactions) {
            await transactionService.createNewTransaction({
                ...transactionData,
                type: transactionData.type as TransactionType,
                currency: 'USD'
            });
        }

        console.debug('[SampleData] Created all sample transactions successfully');
    } catch (error) {
        console.error('[SampleData] Error creating transactions:', error);
        throw error;
    }
}

async function createSamplePlannedTransactions(accounts: Record<string, Account>) {
    console.debug('[SampleData] Creating sample planned transactions...');
    
    try {
        const plannedTransactions = [
            {
                accountId: accounts.checking.id,
                type: 'expense',
                whatTag: 'groceries' as WhatTagType,
                whyTag: 'essential' as WhyTagType,
                amount: 100,
                description: 'Weekly grocery shopping',
                plannedDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
                confidence: 'expected' as const
            },
            {
                accountId: accounts.checking.id,
                type: 'expense',
                whatTag: 'dining' as WhatTagType,
                whyTag: 'social' as WhyTagType,
                amount: 60,
                description: 'Birthday dinner',
                plannedDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
                confidence: 'confirmed' as const
            },
            {
                accountId: accounts.checking.id,
                type: 'expense',
                whatTag: 'clothing' as WhatTagType,
                whyTag: 'discretionary' as WhyTagType,
                amount: 120,
                description: 'New work clothes',
                plannedDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                confidence: 'estimated' as const
            }
        ];

        for (const plannedData of plannedTransactions) {
            await transactionService.createNewTransaction({
                ...plannedData,
                type: plannedData.type as TransactionType,
                currency: 'USD',
                status: 'planned'
            });
        }

        console.debug('[SampleData] Created all sample planned transactions successfully');
    } catch (error) {
        console.error('[SampleData] Error creating planned transactions:', error);
        throw error;
    }
}

async function createSampleSettings() {
    console.debug('[SampleData] Creating sample user preferences...');
    
    try {
        // Create default user preferences
        await settingsService.createUserPreferences({
            // Life Stage and Context
            lifeStage: 'mid_career',
            incomeVolatility: 'medium',
            stressLevel: 'low',
            
            // UI Preferences
            theme: 'dark',
            language: 'en',
            currency: 'USD',
            firstDayOfWeek: 0,
            
            // Date Display Preferences
            dateDisplayFormat: 'time',
            plannedDateDisplayFormat: 'date',
            clearedDateDisplayFormat: 'time',
            
            // Notification Preferences
            notificationsEnabled: true,
            
            // User Maturity and Onboarding
            userMaturityLevel: 'beginner',
            onboardingCompleted: false,
            
            // Feature Flags
            enableAdvancedFeatures: false,
            enablePredictiveAnalytics: true,
            enableEmotionalIntelligence: true,
            enableContextualSuggestions: true,
            
            // Privacy and Data Preferences
            dataSharingEnabled: false,
            analyticsEnabled: true,
            backupEnabled: true,
            
            // Performance Preferences
            cacheEnabled: true,
            offlineModeEnabled: false,
            
            // Import/Export Preferences
            autoImportEnabled: false,
            exportFormat: 'json',
            
            // Accessibility Preferences
            highContrastMode: false,
            reducedMotion: false,
            fontSize: 'medium'
        });

        console.debug('[SampleData] Created sample user preferences successfully');
    } catch (error) {
        console.error('[SampleData] Error creating user preferences:', error);
        throw error;
    }
}

export async function hasSampleData(): Promise<boolean> {
    try {
        const accountCount = await db.accounts.count();
        const transactionCount = await db.transactions.count();
        const tagCount = await db.tags.count();
        
        return accountCount > 0 && transactionCount > 0 && tagCount > 0;
    } catch (error) {
        console.error('[SampleData] Error checking for sample data:', error);
        return false;
    }
}

export async function clearSampleData() {
    await clearAllData();
}

export async function ensureDatabaseReady(): Promise<void> {
    await db.open();
} 