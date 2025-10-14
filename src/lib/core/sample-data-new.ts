import { db } from './db';
import { accountService } from './services/account-service';
import { transactionService } from './services/transaction-service';
import { transferService } from './services/transfer-service';
import { settingsService } from './services/settings-service';
import { budgetService } from './services/budget-service';
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
            settingsService.ready,
            budgetService.ready
        ]);
        
        // Clear existing data first
        await clearAllData();
        
        // Create budget categories first
        const budgetCategories = await createSampleBudgetCategories();
        
        // Create accounts
        const accounts = await createSampleAccounts();
        
        // Create transactions with new tag system
        await createSampleTransactions(accounts, budgetCategories);
        
        // Create planned transactions
        await createSamplePlannedTransactions(accounts, budgetCategories);
        
        // Create settings and user preferences
        await createSampleSettings();
        
        console.debug('[SampleData] Sample data population completed successfully');
    } catch (error) {
        console.error('[SampleData] Error populating sample data:', error);
        throw error;
    }
}

async function createSampleBudgetCategories() {
    console.debug('[SampleData] Creating sample budget categories...');
    
    // First, ensure budget categories exist by calling getBudgetCategories
    // This will create default categories if they don't exist
    const existingCategories = await budgetService.getBudgetCategories();
    console.debug('[SampleData] Existing budget categories:', existingCategories);
    
    // Create a mapping from category names to IDs
    const categoryMapping: Record<string, string> = {};
    
    for (const category of existingCategories) {
        const key = category.name.toLowerCase().replace(/\s+/g, '-') + '-category';
        categoryMapping[key] = category.id;
        console.debug(`[SampleData] Mapped category: ${key} -> ${category.id} (${category.name})`);
    }
    
    return categoryMapping;
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

async function createSampleTransactions(accounts: Record<string, Account>, budgetCategories: Record<string, string>) {
    console.debug('[SampleData] Creating sample transactions...');
    
    try {
        const transactions = [
            // Income transactions
            {
                accountId: accounts.checking.id,
                type: 'income',
                whatTag: 'salary' as WhatTagType,
                budgetCategoryId: budgetCategories['income-category'],
                amount: 3500,
                description: 'Monthly salary',
                status: 'cleared' as const,
                clearedDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
                accountId: accounts.checking.id,
                type: 'income',
                whatTag: 'freelance' as WhatTagType,
                budgetCategoryId: budgetCategories['income-category'],
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
                budgetCategoryId: budgetCategories['rent-category'] || budgetCategories['groceries-category'],
                amount: 1200,
                description: 'Monthly rent',
                status: 'cleared' as const,
                clearedDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
                accountId: accounts.checking.id,
                type: 'expense',
                whatTag: 'utilities' as WhatTagType,
                budgetCategoryId: budgetCategories['rent-category'] || budgetCategories['groceries-category'],
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
                budgetCategoryId: budgetCategories['rent-category'] || budgetCategories['groceries-category'],
                amount: 85,
                description: 'Weekly groceries',
                status: 'cleared' as const,
                clearedDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
                accountId: accounts.checking.id,
                type: 'expense',
                whatTag: 'dining' as WhatTagType,
                budgetCategoryId: budgetCategories['transportation-category'] || budgetCategories['utilities-category'],
                amount: 45,
                description: 'Dinner with friends',
                status: 'cleared' as const,
                clearedDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
                accountId: accounts.checking.id,
                type: 'expense',
                whatTag: 'coffee' as WhatTagType,
                budgetCategoryId: budgetCategories['transportation-category'] || budgetCategories['utilities-category'],
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
                budgetCategoryId: budgetCategories['rent-category'] || budgetCategories['groceries-category'],
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
                budgetCategoryId: budgetCategories['entertainment-category'],
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

        // Create split transactions
        await createSampleSplitTransactions(accounts, budgetCategories);

        console.debug('[SampleData] Created all sample transactions successfully');
    } catch (error) {
        console.error('[SampleData] Error creating transactions:', error);
        throw error;
    }
}

async function createSampleSplitTransactions(accounts: Record<string, Account>, budgetCategories: Record<string, string>) {
    console.debug('[SampleData] Creating sample split transactions...');
    
    try {
        // Split Transaction 1: Grocery shopping with multiple categories
        const grocerySplit = [
            {
                accountId: accounts.checking.id,
                type: 'expense' as const,
                whatTag: 'groceries' as WhatTagType,
                budgetCategoryId: budgetCategories['groceries-category'] || budgetCategories['rent-category'],
                amount: 45.50,
                description: 'Food items',
                status: 'cleared' as const,
                currency: 'USD',
                clearedDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
                accountId: accounts.checking.id,
                type: 'expense' as const,
                whatTag: 'groceries' as WhatTagType,
                budgetCategoryId: budgetCategories['utilities-category'] || budgetCategories['transportation-category'],
                amount: 12.30,
                description: 'Cleaning supplies',
                status: 'cleared' as const,
                currency: 'USD',
                clearedDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
                accountId: accounts.checking.id,
                type: 'expense' as const,
                whatTag: 'groceries' as WhatTagType,
                budgetCategoryId: budgetCategories['entertainment-category'],
                amount: 8.75,
                description: 'Personal care items',
                status: 'cleared' as const,
                currency: 'USD',
                clearedDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
            }
        ];

        await transactionService.createSplitTransactionGroup(grocerySplit, 'Grocery Shopping');

        // Split Transaction 2: Restaurant bill split between food and drinks
        const restaurantSplit = [
            {
                accountId: accounts.checking.id,
                type: 'expense' as const,
                whatTag: 'dining' as WhatTagType,
                budgetCategoryId: budgetCategories['dining-out-category'] || budgetCategories['entertainment-category'],
                amount: 28.50,
                description: 'Main course',
                status: 'cleared' as const,
                currency: 'USD',
                clearedDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
                accountId: accounts.checking.id,
                type: 'expense' as const,
                whatTag: 'dining' as WhatTagType,
                budgetCategoryId: budgetCategories['dining-out-category'] || budgetCategories['entertainment-category'],
                amount: 12.00,
                description: 'Drinks',
                status: 'cleared' as const,
                currency: 'USD',
                clearedDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
                accountId: accounts.checking.id,
                type: 'expense' as const,
                whatTag: 'dining' as WhatTagType,
                budgetCategoryId: budgetCategories['dining-out-category'] || budgetCategories['entertainment-category'],
                amount: 6.50,
                description: 'Tip',
                status: 'cleared' as const,
                currency: 'USD',
                clearedDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
            }
        ];

        await transactionService.createSplitTransactionGroup(restaurantSplit, 'Restaurant Dinner');

        // Intuitive Transfer Transaction (using new single transaction approach)
        await transferService.createTransfer(
            accounts.checking.id,
            accounts.savings.id,
            500, // Positive amount - much more intuitive!
            'Emergency fund contribution',
            {
                status: 'cleared',
                whatTag: 'investment' as WhatTagType,
                budgetCategoryId: budgetCategories['savings-category'] || budgetCategories['income-category'],
                clearedDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
                currency: 'USD',
                feeAmount: 0, // No fees for this example
                feeAccountId: accounts.checking.id,
                feeCategoryId: 'banking_fees',
                feeWhatTag: 'banking_fees' as WhatTagType
            }
        );

        // Split Transaction 4: Online shopping with multiple items
        const onlineShoppingSplit = [
            {
                accountId: accounts.credit.id,
                type: 'expense' as const,
                whatTag: 'shopping' as WhatTagType,
                budgetCategoryId: budgetCategories['shopping-category'] || budgetCategories['entertainment-category'],
                amount: 45.99,
                description: 'Work shirt',
                status: 'cleared' as const,
                currency: 'USD',
                clearedDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
                accountId: accounts.credit.id,
                type: 'expense' as const,
                whatTag: 'shopping' as WhatTagType,
                budgetCategoryId: budgetCategories['shopping-category'] || budgetCategories['entertainment-category'],
                amount: 29.99,
                description: 'Phone charger',
                status: 'cleared' as const,
                currency: 'USD',
                clearedDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
                accountId: accounts.credit.id,
                type: 'expense' as const,
                whatTag: 'shopping' as WhatTagType,
                budgetCategoryId: budgetCategories['entertainment-category'],
                amount: 12.99,
                description: 'Programming book',
                status: 'cleared' as const,
                currency: 'USD',
                clearedDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
            }
        ];

        await transactionService.createSplitTransactionGroup(onlineShoppingSplit, 'Online Shopping');

        // Split Transaction 5: Medical expenses with insurance
        const medicalSplit = [
            {
                accountId: accounts.checking.id,
                type: 'expense' as const,
                whatTag: 'medical' as WhatTagType,
                budgetCategoryId: budgetCategories['utilities-category'] || budgetCategories['rent-category'],
                amount: 150,
                description: 'Doctor visit copay',
                status: 'cleared' as const,
                currency: 'USD',
                clearedDate: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
                accountId: accounts.checking.id,
                type: 'expense' as const,
                whatTag: 'medical' as WhatTagType,
                budgetCategoryId: budgetCategories['utilities-category'] || budgetCategories['rent-category'],
                amount: 45,
                description: 'Prescription medication',
                status: 'cleared' as const,
                currency: 'USD',
                clearedDate: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString()
            }
        ];

        await transactionService.createSplitTransactionGroup(medicalSplit, 'Medical Visit');

        // Split Transaction 6: Car maintenance
        const carMaintenanceSplit = [
            {
                accountId: accounts.checking.id,
                type: 'expense' as const,
                whatTag: 'transportation' as WhatTagType,
                budgetCategoryId: budgetCategories['transportation-category'] || budgetCategories['utilities-category'],
                amount: 120,
                description: 'Oil change',
                status: 'cleared' as const,
                currency: 'USD',
                clearedDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
                accountId: accounts.checking.id,
                type: 'expense' as const,
                whatTag: 'transportation' as WhatTagType,
                budgetCategoryId: budgetCategories['transportation-category'] || budgetCategories['utilities-category'],
                amount: 85,
                description: 'Tire rotation',
                status: 'cleared' as const,
                currency: 'USD',
                clearedDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
                accountId: accounts.checking.id,
                type: 'expense' as const,
                whatTag: 'transportation' as WhatTagType,
                budgetCategoryId: budgetCategories['transportation-category'] || budgetCategories['utilities-category'],
                amount: 200,
                description: 'Brake inspection',
                status: 'cleared' as const,
                currency: 'USD',
                clearedDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
            }
        ];

        await transactionService.createSplitTransactionGroup(carMaintenanceSplit, 'Car Maintenance');

        console.debug('[SampleData] Created all sample split transactions successfully');
    } catch (error) {
        console.error('[SampleData] Error creating split transactions:', error);
        throw error;
    }
}

async function createSamplePlannedTransactions(accounts: Record<string, Account>, budgetCategories: Record<string, string>) {
    console.debug('[SampleData] Creating sample planned transactions...');
    
    try {
        const plannedTransactions = [
            {
                accountId: accounts.checking.id,
                type: 'expense',
                whatTag: 'groceries' as WhatTagType,
                budgetCategoryId: budgetCategories['rent-category'] || budgetCategories['groceries-category'],
                amount: 100,
                description: 'Weekly grocery shopping',
                plannedDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
                confidence: 'expected' as const
            },
            {
                accountId: accounts.checking.id,
                type: 'expense',
                whatTag: 'dining' as WhatTagType,
                budgetCategoryId: budgetCategories['dining-out-category'],
                amount: 60,
                description: 'Birthday dinner',
                plannedDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
                confidence: 'confirmed' as const
            },
            {
                accountId: accounts.checking.id,
                type: 'expense',
                whatTag: 'clothing' as WhatTagType,
                budgetCategoryId: budgetCategories['shopping-category'],
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

        // Create split planned transactions
        await createSampleSplitPlannedTransactions(accounts, budgetCategories);

        console.debug('[SampleData] Created all sample planned transactions successfully');
    } catch (error) {
        console.error('[SampleData] Error creating planned transactions:', error);
        throw error;
    }
}

async function createSampleSplitPlannedTransactions(accounts: Record<string, Account>, budgetCategories: Record<string, string>) {
    console.debug('[SampleData] Creating sample split planned transactions...');
    
    try {
        // Split Planned Transaction 1: Vacation expenses
        const vacationSplit = [
            {
                accountId: accounts.checking.id,
                type: 'expense' as const,
                whatTag: 'entertainment' as WhatTagType,
                budgetCategoryId: budgetCategories['entertainment-category'],
                amount: 800,
                description: 'Flight tickets',
                status: 'planned' as const,
                currency: 'USD',
                plannedDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
                confidence: 'confirmed' as const
            },
            {
                accountId: accounts.checking.id,
                type: 'expense' as const,
                whatTag: 'entertainment' as WhatTagType,
                budgetCategoryId: budgetCategories['entertainment-category'],
                amount: 400,
                description: 'Hotel accommodation',
                status: 'planned' as const,
                currency: 'USD',
                plannedDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
                confidence: 'confirmed' as const
            },
            {
                accountId: accounts.checking.id,
                type: 'expense' as const,
                whatTag: 'entertainment' as WhatTagType,
                budgetCategoryId: budgetCategories['dining-out-category'] || budgetCategories['entertainment-category'],
                amount: 200,
                description: 'Meals during vacation',
                status: 'planned' as const,
                currency: 'USD',
                plannedDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
                confidence: 'estimated' as const
            }
        ];

        await transactionService.createSplitTransactionGroup(vacationSplit, 'Vacation Expenses');

        // Split Planned Transaction 2: Home improvement project
        const homeImprovementSplit = [
            {
                accountId: accounts.checking.id,
                type: 'expense' as const,
                whatTag: 'maintenance' as WhatTagType,
                budgetCategoryId: budgetCategories['utilities-category'] || budgetCategories['rent-category'],
                amount: 300,
                description: 'Paint and supplies',
                status: 'planned' as const,
                currency: 'USD',
                plannedDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
                confidence: 'expected' as const
            },
            {
                accountId: accounts.checking.id,
                type: 'expense' as const,
                whatTag: 'maintenance' as WhatTagType,
                budgetCategoryId: budgetCategories['utilities-category'] || budgetCategories['rent-category'],
                amount: 150,
                description: 'Tools and equipment',
                status: 'planned' as const,
                currency: 'USD',
                plannedDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
                confidence: 'expected' as const
            },
            {
                accountId: accounts.checking.id,
                type: 'expense' as const,
                whatTag: 'maintenance' as WhatTagType,
                budgetCategoryId: budgetCategories['utilities-category'] || budgetCategories['rent-category'],
                amount: 100,
                description: 'Miscellaneous supplies',
                status: 'planned' as const,
                currency: 'USD',
                plannedDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
                confidence: 'estimated' as const
            }
        ];

        await transactionService.createSplitTransactionGroup(homeImprovementSplit, 'Home Improvement Project');

        // Split Planned Transaction 3: Holiday shopping
        const holidayShoppingSplit = [
            {
                accountId: accounts.credit.id,
                type: 'expense' as const,
                whatTag: 'shopping' as WhatTagType,
                budgetCategoryId: budgetCategories['entertainment-category'],
                amount: 75,
                description: 'Gift for family member',
                status: 'planned' as const,
                currency: 'USD',
                plannedDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
                confidence: 'expected' as const
            },
            {
                accountId: accounts.credit.id,
                type: 'expense' as const,
                whatTag: 'shopping' as WhatTagType,
                budgetCategoryId: budgetCategories['entertainment-category'],
                amount: 50,
                description: 'Gift for friend',
                status: 'planned' as const,
                currency: 'USD',
                plannedDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
                confidence: 'expected' as const
            },
            {
                accountId: accounts.credit.id,
                type: 'expense' as const,
                whatTag: 'shopping' as WhatTagType,
                budgetCategoryId: budgetCategories['entertainment-category'],
                amount: 25,
                description: 'Gift wrapping supplies',
                status: 'planned' as const,
                currency: 'USD',
                plannedDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
                confidence: 'estimated' as const
            }
        ];

        await transactionService.createSplitTransactionGroup(holidayShoppingSplit, 'Holiday Shopping');

        console.debug('[SampleData] Created all sample split planned transactions successfully');
    } catch (error) {
        console.error('[SampleData] Error creating split planned transactions:', error);
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

export async function clearAllData() {
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
            db.budgetCategories,
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
            await db.budgetCategories.clear();
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

export async function clearSampleData() {
    console.debug('[SampleData] Clearing sample data only...');
    
    try {
        // Get all accounts to identify sample accounts
        const allAccounts = await db.accounts.toArray();
        const sampleAccountNames = ['Main Checking', 'Savings Account', 'Credit Card', 'Cash'];
        const sampleAccountIds = allAccounts
            .filter(account => sampleAccountNames.includes(account.name))
            .map(account => account.id);
        
        // Get all transactions to identify sample transactions
        const allTransactions = await db.transactions.toArray();
        const sampleTransactionDescriptions = [
            'Monthly salary',
            'Freelance project payment',
            'Monthly rent',
            'Electricity and water',
            'Weekly groceries',
            'Dinner with friends',
            'Morning coffee',
            'Gas fill-up',
            'Movie streaming subscription',
            'Weekly grocery shopping',
            'Birthday dinner',
            'New work clothes',
            // Split transaction descriptions
            'Food items',
            'Cleaning supplies',
            'Personal care items',
            'Main course',
            'Drinks',
            'Tip',
            'Emergency fund contribution',
            'Work shirt',
            'Phone charger',
            'Programming book',
            'Flight tickets',
            'Hotel accommodation',
            'Meals during vacation',
            'Paint and supplies',
            'Tools and equipment',
            'Miscellaneous supplies',
            'Doctor visit copay',
            'Prescription medication',
            'Oil change',
            'Tire rotation',
            'Brake inspection',
            'Gift for family member',
            'Gift for friend',
            'Gift wrapping supplies'
        ];
        const sampleTransactionIds = allTransactions
            .filter(transaction => transaction.description && sampleTransactionDescriptions.includes(transaction.description))
            .map(transaction => transaction.id);
        
        // Clear sample data in a transaction
        await db.transaction('rw', [
            db.accounts,
            db.transactions,
            db.transactionTags,
            db.tags,
            db.tagDimensions,
            db.budgetCategories,
            db.dynamicSettings,
            db.userPreferences,
            db.categorizationRules,
            db.importPresets,
            db.importHistory,
            db.spendingInsights
        ], async () => {
            // Delete sample accounts
            if (sampleAccountIds.length > 0) {
                await db.accounts.bulkDelete(sampleAccountIds);
                console.debug(`[SampleData] Deleted ${sampleAccountIds.length} sample accounts`);
            }
            
            // Delete sample transactions
            if (sampleTransactionIds.length > 0) {
                await db.transactions.bulkDelete(sampleTransactionIds);
                console.debug(`[SampleData] Deleted ${sampleTransactionIds.length} sample transactions`);
            }
            
            // Clear all tags and related data (they're mostly sample data)
            await db.transactionTags.clear();
            await db.tags.clear();
            await db.tagDimensions.clear();
            
            // Clear budget categories (they're sample data)
            await db.budgetCategories.clear();
            
            // Clear settings and preferences (they're sample data)
            await db.dynamicSettings.clear();
            await db.userPreferences.clear();
            await db.categorizationRules.clear();
            await db.importPresets.clear();
            await db.importHistory.clear();
            await db.spendingInsights.clear();
        });
        
        console.debug('[SampleData] Sample data cleared successfully');
    } catch (error) {
        console.error('[SampleData] Error clearing sample data:', error);
        throw error;
    }
}

export async function ensureDatabaseReady(): Promise<void> {
    await db.open();
} 