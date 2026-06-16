import { db } from './db';
import { clearFullDatabaseReset } from './data-reset-presets';
import { accountService } from './services/core/account-service';
import { transactionService } from './services/core/transaction-service';
import { budgetService } from './services/core/budget-service';
import { userService } from './services/core/user-service';
import type { Account, Transaction } from './db';

export async function populateSampleData() {
	console.debug('[SampleData] Starting sample data population with simplified schema');

	try {
		// Ensure database is ready by opening it
		console.debug('[SampleData] Ensuring database is ready...');
		await db.open();
		console.debug('[SampleData] Database is ready');

		// Wait for all services to be ready
		await Promise.all([
			accountService.ready,
			transactionService.ready,
			budgetService.ready,
			userService.ready
		]);

		// Clear existing data first
		await clearAllData();

		// Create categories first
		const categories = await createSampleCategories();

		// Create accounts
		const accounts = await createSampleAccounts();

		// Create transactions with simplified schema
		await createSampleTransactions(accounts, categories);

		// Create user preferences
		await createSampleUserPreferences();

		console.debug('[SampleData] Sample data population completed successfully');
	} catch (error) {
		console.error('[SampleData] Error populating sample data:', error);
		throw error;
	}
}

async function createSampleCategories() {
	console.debug('[SampleData] Creating sample categories...');

	try {
		// Create sample categories using the unified categorization system
		const categories = [
			// Income categories
			{
				name: 'Salary',
				type: 'income' as const,
				waterfallTier: 'survival' as const,
				priority: 1
			},
			{
				name: 'Freelance',
				type: 'income' as const,
				waterfallTier: 'survival' as const,
				priority: 2
			},
			{
				name: 'Investment Returns',
				type: 'income' as const,
				waterfallTier: 'growth' as const,
				priority: 1
			},

			// Expense categories
			{
				name: 'Rent',
				type: 'expense' as const,
				waterfallTier: 'survival' as const,
				priority: 1
			},
			{
				name: 'Groceries',
				type: 'expense' as const,
				waterfallTier: 'survival' as const,
				priority: 2
			},
			{
				name: 'Utilities',
				type: 'expense' as const,
				waterfallTier: 'survival' as const,
				priority: 3
			},
			{
				name: 'Transportation',
				type: 'expense' as const,
				waterfallTier: 'survival' as const,
				priority: 4
			},
			{
				name: 'Healthcare',
				type: 'expense' as const,
				waterfallTier: 'survival' as const,
				priority: 5
			},
			{
				name: 'Emergency Fund',
				type: 'expense' as const,
				waterfallTier: 'security' as const,
				priority: 1
			},
			{
				name: 'Savings',
				type: 'expense' as const,
				waterfallTier: 'security' as const,
				priority: 2
			},
			{
				name: 'Education',
				type: 'expense' as const,
				waterfallTier: 'growth' as const,
				priority: 1
			},
			{
				name: 'Entertainment',
				type: 'expense' as const,
				waterfallTier: 'lifestyle' as const,
				priority: 1
			},
			{
				name: 'Dining Out',
				type: 'expense' as const,
				waterfallTier: 'lifestyle' as const,
				priority: 2
			}
		];

		const categoryMapping: Record<string, string> = {};

		for (const categoryData of categories) {
			const category = await db.categories.add({
				id: crypto.randomUUID(),
				name: categoryData.name,
				type: categoryData.type,
				waterfallTier: categoryData.waterfallTier,
				priority: categoryData.priority,
				budgetAmount: categoryData.type === 'expense' ? 0 : undefined,
				isActive: true,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				deletedAt: null
			});

			const key = categoryData.name.toLowerCase().replace(/\s+/g, '-') + '-category';
			categoryMapping[key] = category.id;
			console.debug(
				`[SampleData] Created category: ${key} -> ${category.id} (${categoryData.name})`
			);
		}

		return categoryMapping;
	} catch (error) {
		console.error('[SampleData] Error creating categories:', error);
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
				initialBalance: 5000
			}),
			savings: await accountService.createAccount({
				name: 'Savings Account',
				type: 'savings',
				currency: 'USD',
				initialBalance: 15000
			}),
			credit: await accountService.createAccount({
				name: 'Credit Card',
				type: 'credit',
				currency: 'USD',
				initialBalance: 0
			}),
			cash: await accountService.createAccount({
				name: 'Cash',
				type: 'cash',
				currency: 'USD',
				initialBalance: 500
			})
		};

		console.debug('[SampleData] Created all sample accounts:', Object.keys(accounts));
		return accounts;
	} catch (error) {
		console.error('[SampleData] Error creating accounts:', error);
		throw error;
	}
}

async function createSampleTransactions(
	accounts: Record<string, Account>,
	categories: Record<string, string>
) {
	console.debug('[SampleData] Creating sample transactions...');

	try {
		// Get currency from accounts (all should use the same currency from user preferences)
		const checkingCurrency = accounts.checking.currency;
		const savingsCurrency = accounts.savings.currency;

		const transactions = [
			// Income transactions
			{
				accountId: accounts.checking.id,
				type: 'income' as const,
				categoryId: categories['salary-category'],
				amount: 3500,
				currency: checkingCurrency,
				description: 'Monthly salary',
				status: 'cleared' as const,
				clearedDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
			},
			{
				accountId: accounts.checking.id,
				type: 'income' as const,
				categoryId: categories['freelance-category'],
				amount: 800,
				currency: checkingCurrency,
				description: 'Freelance project payment',
				status: 'cleared' as const,
				clearedDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
			},

			// Housing expenses
			{
				accountId: accounts.checking.id,
				type: 'expense' as const,
				categoryId: categories['rent-category'],
				amount: 1200,
				currency: checkingCurrency,
				description: 'Monthly rent',
				status: 'cleared' as const,
				clearedDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
			},
			{
				accountId: accounts.checking.id,
				type: 'expense' as const,
				categoryId: categories['utilities-category'],
				amount: 150,
				currency: checkingCurrency,
				description: 'Electricity bill',
				status: 'cleared' as const,
				clearedDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
			},

			// Food expenses
			{
				accountId: accounts.checking.id,
				type: 'expense' as const,
				categoryId: categories['groceries-category'],
				amount: 200,
				currency: checkingCurrency,
				description: 'Weekly groceries',
				status: 'cleared' as const,
				clearedDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
			},
			{
				accountId: accounts.checking.id,
				type: 'expense' as const,
				categoryId: categories['dining-out-category'],
				amount: 45,
				currency: checkingCurrency,
				description: 'Dinner at restaurant',
				status: 'cleared' as const,
				clearedDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
			},

			// Transportation
			{
				accountId: accounts.checking.id,
				type: 'expense' as const,
				categoryId: categories['transportation-category'],
				amount: 80,
				currency: checkingCurrency,
				description: 'Gas for car',
				status: 'cleared' as const,
				clearedDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()
			},

			// Savings
			{
				accountId: accounts.savings.id,
				type: 'expense' as const,
				categoryId: categories['savings-category'],
				amount: 500,
				currency: savingsCurrency,
				description: 'Monthly savings transfer',
				status: 'cleared' as const,
				clearedDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
			},

			// Credit card payment
			{
				accountId: accounts.checking.id,
				type: 'expense' as const,
				categoryId: categories['savings-category'],
				amount: 300,
				currency: checkingCurrency,
				description: 'Credit card payment',
				status: 'cleared' as const,
				clearedDate: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString()
			}
		];

		for (const transactionData of transactions) {
			await transactionService.createTransaction(transactionData);
		}

		console.debug('[SampleData] Created all sample transactions');
	} catch (error) {
		console.error('[SampleData] Error creating transactions:', error);
		throw error;
	}
}

async function createSampleUserPreferences() {
	console.debug('[SampleData] Creating sample user preferences...');

	try {
		// Get currency from preferences or use USD as last resort
		const preferences = await userService.getUserPreferences();
		const currency = preferences?.currency || 'USD';

		await userService.updateUserPreferences({
			username: 'Sample User',
			theme: 'dark',
			currency: currency,
			language: 'en',
			guidanceTone: 'balanced',
			explanationDetail: 'standard',
			onboardingCompleted: true,
			defaultBudgetType: 'monthly',
			allowGlobalBorrowing: true,
			maxGlobalBorrowPercentage: 0.1,
			enableAdvancedFeatures: true,
			enablePredictiveAnalytics: true,
			analyticsEnabled: true,
			backupEnabled: true,
			deletedAt: null
		});
		console.debug('[SampleData] Created default user preferences');
	} catch (error) {
		console.error('[SampleData] Error creating user preferences:', error);
		throw error;
	}
}

export async function clearAllData() {
	console.debug('[SampleData] Clearing existing data (full database reset)...');

	try {
		await clearFullDatabaseReset();
		// Same-session wipe clears currencies; constructor init already ran once on this singleton.
		await db.reseedSystemCurrencyData();
		console.debug('[SampleData] Cleared all existing data');
	} catch (error) {
		console.error('[SampleData] Error clearing data:', error);
		throw error;
	}
}
