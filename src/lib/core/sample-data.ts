import { accountService } from './services/account-service';
import { categoryService } from './services/category-service';
import { transactionService } from './services/transaction-service.svelte';
import type { Category, Account, Transaction } from '$lib/core/models/types';

export async function populateSampleData() {
    console.debug('[SampleData] Starting sample data population');
    
    // Clear existing data first
    await clearAllData();
    
    // Create categories
    const categories = await createSampleCategories();
    
    // Create accounts
    const accounts = await createSampleAccounts();
    
    // Create transactions
    await createSampleTransactions(accounts, categories);
    
    console.debug('[SampleData] Sample data population completed');
}

async function clearAllData() {
    console.debug('[SampleData] Clearing existing data...');
    (await transactionService.getTransactions()).forEach(t => transactionService.deleteTransaction(t.id));
    (await accountService.getAccounts()).forEach(a => accountService.deleteAccount(a.id));
    (await categoryService.getCategories()).forEach(c => categoryService.deleteCategory(c.id));
}

async function createSampleCategories(): Promise<Record<string, Category>> {
    console.debug('[SampleData] Creating sample categories...');
    
    const categories = {
        // Income
        salary: await categoryService.createCategory({
            name: 'Salary & Work',
            type: 'income'
        }),
        otherIncome: await categoryService.createCategory({
            name: 'Other Income',
            type: 'income'
        }),

        // Expenses
        housing: await categoryService.createCategory({
            name: 'Housing & Essentials',
            type: 'expense'
        }),
        food: await categoryService.createCategory({
            name: 'Food',
            type: 'expense'
        }),
        /*transportation: await categoryService.createCategory({
            name: 'Transportation',
            type: 'expense'
        }),
        health: await categoryService.createCategory({
            name: 'Health & Care',
            type: 'expense'
        }),
        discretionary: await categoryService.createCategory({
            name: 'Discretionary',
            type: 'expense'
        }),
        subs: await categoryService.createCategory({
            name: 'Subs',
            type: 'expense'
        }),
        occasional: await categoryService.createCategory({
            name: 'Occasional',
            type: 'expense'
        }),

        // Savings goals
        laptop: await categoryService.createCategory({
            name: 'Laptop',
            type: 'expense'
        }),
        emergency: await categoryService.createCategory({
            name: 'Emergency',
            type: 'expense'
        }),
        vacation: await categoryService.createCategory({
            name: 'Vacation',
            type: 'expense'
        })*/
    };

    console.debug('[SampleData] Created all sample categories: ', categories);
    return categories;
}

async function createSampleAccounts(): Promise<Record<string, Account>> {
    console.debug('[SampleData] Creating sample accounts...');
    
    const accounts = {
        tBank: await accountService.createAccount({
            name: 'black T-Bank',
            type: 'checking'
        }),
        savings: await accountService.createAccount({
            name: 'Savings',
            type: 'savings'
        }),
        checking: await accountService.createAccount({
            name: 'Checking',
            type: 'checking'
        })
    };

    console.debug('[SampleData] Created all sample accounts: ', accounts);
    return accounts;
}

async function createSampleTransactions(
    accounts: Record<string, Account>,
    categories: Record<string, Category>
) {
    console.debug('[SampleData] Creating sample transactions...');

    console.debug('[SampleData] Awaiting Category and Account stores...');

    await categoryService.ready;
    console.debug('[SampleData] CategoryService ready');
    await accountService.ready;
    console.debug('[SampleData] AccountService ready');

    // Salary deposit
    await transactionService.createNewTransaction({
        accountId: accounts.tBank.id,
        categoryId: categories.salary.id,
        clearedAmount: 50000,
        type: 'payment',
        status: 'cleared',
        clearedDate: new Date().toISOString(),
        description: 'Monthly Salary'
    });

    // Rent payment
    await transactionService.createNewTransaction({
        accountId: accounts.checking.id,
        categoryId: categories.housing.id,
        pendingAmount: 1060,
        type: 'payment',
        status: 'pending',
        pendingDate: new Date().toISOString(),
        description: 'Rent Payment'
    });

    // Savings transfer
    await transactionService.createNewTransaction({
        accountId: accounts.checking.id,
        toAccountId: accounts.savings.id,
        categoryId: categories.housing.id,
        clearedAmount: 200,
        type: 'transfer',
        status: 'cleared',
        clearedDate: new Date().toISOString(),
        description: 'Emergency Fund Transfer'
    });

    // Grocery shopping
    await transactionService.createNewTransaction({
        accountId: accounts.tBank.id,
        categoryId: categories.food.id,
        clearedAmount: 350,
        type: 'payment',
        status: 'cleared',
        clearedDate: new Date().toISOString(),
        description: 'Weekly Groceries'
    });

    console.debug('[SampleData] Created all sample transactions');
}