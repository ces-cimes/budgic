import { db } from './db';
import { accountService } from './services/account-service';
import { tagDimensionService } from './services/tag-dimension-service';
import { tagService } from './services/tag-service';
import { transactionService, type TransactionOrGroup } from './services/transaction-service';
import { settingsService } from './services/settings-service';
import { planService } from './services/plan-service';
import { plannedTransactionService } from './services/planned-transaction-service';
import type { Transaction } from './db';

// Helper function to flatten TransactionOrGroup into individual transactions
const flattenTransactionGroups = (groups: TransactionOrGroup[]): Transaction[] => {
    const flattened: Transaction[] = [];
    for (const group of groups) {
        if (group.type === 'single') {
            flattened.push(group.representative);
        } else {
            // For splits, add all transactions in the group
            flattened.push(...group.transactions);
        }
    }
    return flattened;
};

export async function testDatabase() {
    console.log('Testing database functionality...');

    // Check browser environment
    console.log('Browser environment check:');
    console.log('- User Agent:', navigator.userAgent);
    console.log('- IndexedDB supported:', 'indexedDB' in window);
    console.log('- WebSQL supported:', 'webkitIndexedDB' in window);
    console.log('- LocalStorage supported:', 'localStorage' in window);
    console.log('- SessionStorage supported:', 'sessionStorage' in window);

    try {
        // Test 0: Check if database is accessible
        console.log('\n0. Testing database connection...');
        try {
            console.log('Attempting to open database...');
            await db.open();
            console.log('✅ Database opened successfully');
            
            // Check database version
            const version = db.verno;
            console.log('Database version:', version);
            
            // Check if tables exist
            const tableNames = db.tables.map(table => table.name);
            console.log('Available tables:', tableNames);
        } catch (error) {
            console.error('❌ Failed to open database:', error);
            console.error('Error type:', typeof error);
            console.error('Error constructor:', error?.constructor?.name);
            throw error;
        }

        // Test 1: Create and retrieve accounts
        console.log('\n1. Testing accounts...');
        try {
            console.log('Creating test account...');
            const testAccount = await accountService.createAccount({
                name: 'Test Account',
                type: 'checking',
                currency: 'USD',
                initialBalance: 1000,
                currentBalance: 1000
            });
            console.log('✅ Account created:', testAccount.id);
            
            console.log('Retrieving accounts...');
            const accounts = await accountService.getAccounts();
            console.log(`✅ Found ${accounts.length} accounts`);
        } catch (error) {
            console.error('❌ Account test failed:', error);
            console.error('Error details:', {
                name: (error as Error).name,
                message: (error as Error).message,
                stack: (error as Error).stack
            });
            throw error;
        }
        
        // Test 2: Create and retrieve tag dimensions
        console.log('\n2. Testing tag dimensions...');
        try {
            console.log('Creating test tag dimension...');
            const testTagDimension = await tagDimensionService.createTagDimension({
                name: 'Test Dimension',
                description: 'A test tag dimension',
                isSystem: false
            });
            console.log('✅ Tag dimension created:', testTagDimension.id);
            
            console.log('Retrieving tag dimensions...');
            const tagDimensions = await tagDimensionService.getTagDimensions();
            console.log(`✅ Found ${tagDimensions.length} tag dimensions`);
        } catch (error) {
            console.error('❌ Tag dimension test failed:', error);
            console.error('Error details:', {
                name: (error as Error).name,
                message: (error as Error).message,
                stack: (error as Error).stack
            });
            throw error;
        }
        
        // Test 3: Create and retrieve tags
        console.log('\n3. Testing tags...');
        try {
            console.log('Creating test tag...');
            const testTag = await tagService.createTag({
                name: 'Test Tag',
                dimension: 'Test Dimension',
                color: '#FF0000'
            });
            console.log('✅ Tag created:', testTag.id);
            
            console.log('Retrieving tags...');
            const tags = await tagService.getActiveTags();
            console.log(`✅ Found ${tags.length} tags`);
        } catch (error) {
            console.error('❌ Tag test failed:', error);
            console.error('Error details:', {
                name: (error as Error).name,
                message: (error as Error).message,
                stack: (error as Error).stack
            });
            throw error;
        }
        
        // Test 4: Create and retrieve transactions
        console.log('\n4. Testing transactions...');
        try {
            console.log('Getting accounts for transaction test...');
            const accounts = await accountService.getAccounts();
            if (accounts.length === 0) {
                throw new Error('No accounts available for transaction test');
            }
            
            console.log('Creating test transaction...');
            const testTransaction = await transactionService.createNewTransaction({
                accountId: accounts[0].id,
                whatTag: 'groceries',
                whyTag: 'essential',
                amount: -100,
                type: 'expense',
                status: 'cleared',
                currency: 'USD',
                description: 'Test transaction',
                clearedDate: new Date().toISOString()
            });
            console.log('✅ Transaction created:', testTransaction.id);
            
            console.log('Retrieving transactions...');
            const transactionGroups = await transactionService.getTransactions();
            const transactions = flattenTransactionGroups(transactionGroups as TransactionOrGroup[]);
            console.log(`✅ Found ${transactions.length} transactions`);
        } catch (error) {
            console.error('❌ Transaction test failed:', error);
            console.error('Error details:', {
                name: (error as Error).name,
                message: (error as Error).message,
                stack: (error as Error).stack
            });
            throw error;
        }
        
        // Test 5: Test settings
        console.log('\n5. Testing settings...');
        try {
            console.log('Setting test setting...');
            await settingsService.setStringSetting('test_setting', 'test_value');
            console.log('Retrieving test setting...');
            const testSetting = await settingsService.getStringSetting('test_setting');
            console.log('✅ Test setting loaded:', testSetting);
        } catch (error) {
            console.error('❌ Settings test failed:', error);
            console.error('Error details:', {
                name: (error as Error).name,
                message: (error as Error).message,
                stack: (error as Error).stack
            });
            throw error;
        }
        
        // Test 6: Test database queries
        console.log('\n6. Testing database queries...');
        try {
            console.log('Running database queries...');
            const activeAccounts = await db.getActiveAccounts();
            const activeTagDimensions = await db.getActiveTagDimensions();
            const activeTags = await db.getActiveTags();
            const activeTransactions = await db.getActiveTransactions();
            
            console.log(`✅ Database queries: ${activeAccounts.length} accounts, ${activeTagDimensions.length} tag dimensions, ${activeTags.length} tags, ${activeTransactions.length} transactions`);
        } catch (error) {
            console.error('❌ Database queries test failed:', error);
            console.error('Error details:', {
                name: (error as Error).name,
                message: (error as Error).message,
                stack: (error as Error).stack
            });
            throw error;
        }
        
        // Test 7: Test soft delete
        console.log('\n7. Testing soft delete...');
        try {
            console.log('Getting accounts for soft delete test...');
            const accounts = await accountService.getAccounts();
            if (accounts.length > 0) {
                console.log('Deleting first account...');
                await accountService.deleteAccount(accounts[0].id);
                console.log('Getting accounts after delete...');
                const accountsAfterDelete = await accountService.getAccounts();
                console.log(`✅ Accounts after soft delete: ${accountsAfterDelete.length}`);
            } else {
                console.log('⚠️ No accounts to test soft delete');
            }
        } catch (error) {
            console.error('❌ Soft delete test failed:', error);
            console.error('Error details:', {
                name: (error as Error).name,
                message: (error as Error).message,
                stack: (error as Error).stack
            });
            throw error;
        }
        
        // Test 8: Test batch operations (create new account for this test)
        console.log('\n8. Testing batch operations...');
        try {
            console.log('Creating batch test account...');
            const batchTestAccount = await accountService.createAccount({
                name: 'Batch Test Account',
                type: 'savings',
                currency: 'USD',
                initialBalance: 2000,
                currentBalance: 2000
            });
            
            console.log('Creating batch test transaction...');
            const testTransaction2 = await transactionService.createNewTransaction({
                accountId: batchTestAccount.id,
                whatTag: 'transportation',
                whyTag: 'essential',
                amount: -200,
                type: 'expense',
                status: 'cleared',
                currency: 'USD',
                description: 'Batch test transaction',
                clearedDate: new Date().toISOString()
            });
            
            console.log('Getting all transactions for batch update...');
            const allTransactionGroups = await transactionService.getTransactions();
            const allTransactions = flattenTransactionGroups(allTransactionGroups as TransactionOrGroup[]);
            const updates = allTransactions.map(tx => ({
                id: tx.id,
                data: { description: 'Updated via batch' }
            }));
            
            console.log('Performing batch update...');
            const updatedTransactions = await transactionService.batchUpdateTransactions(updates);
            console.log(`✅ Batch updated ${updatedTransactions.length} transactions`);
        } catch (error) {
            console.error('❌ Batch operations test failed:', error);
            console.error('Error details:', {
                name: (error as Error).name,
                message: (error as Error).message,
                stack: (error as Error).stack
            });
            throw error;
        }
        
        // Test 9: Test plans
        console.log('\n9. Testing plans...');
        try {
            console.log('Creating test plan...');
            const testPlan = await planService.createPlan({
                targetType: 'what',
                targetSystemTag: 'what',
                targetTagId: 'groceries',
                planType: 'daily',
                startDate: new Date().toISOString(),
                endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
                allocatedAmount: 1000,
                rolloverAmount: 0,
                borrowedAmount: 0,
                allowRollover: true,
                allowBorrowing: true
            });
            console.log('✅ Plan created:', testPlan.id);
            
            console.log('Retrieving plans...');
            const plans = await planService.getPlans();
            console.log(`✅ Found ${plans.length} plans`);
        } catch (error) {
            console.error('❌ Plans test failed:', error);
            console.error('Error details:', {
                name: (error as Error).name,
                message: (error as Error).message,
                stack: (error as Error).stack
            });
            throw error;
        }
        
        // Test 10: Test planned transactions
        console.log('\n10. Testing planned transactions...');
        try {
            console.log('Getting accounts for planned transaction test...');
            const accounts = await accountService.getAccounts();
            if (accounts.length === 0) {
                throw new Error('No accounts available for planned transaction test');
            }
            
            console.log('Creating test planned transaction...');
            const testPlannedTransaction = await plannedTransactionService.createPlannedTransaction({
                accountId: accounts[0].id,
                amount: 150,
                description: 'Test planned transaction',
                plannedDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
                confidence: 'expected'
            });
            console.log('✅ Planned transaction created:', testPlannedTransaction.id);
            
            console.log('Retrieving planned transactions...');
            const plannedTransactions = await plannedTransactionService.getPlannedTransactions();
            console.log(`✅ Found ${plannedTransactions.length} planned transactions`);
        } catch (error) {
            console.error('❌ Planned transactions test failed:', error);
            console.error('Error details:', {
                name: (error as Error).name,
                message: (error as Error).message,
                stack: (error as Error).stack
            });
            throw error;
        }
        
        console.log('\n✅ All database tests passed!');
        
    } catch (error) {
        console.error('❌ Database test failed:', error);
        console.error('Error details:', {
            name: (error as Error).name,
            message: (error as Error).message,
            stack: (error as Error).stack
        });
        throw error;
    }
}

// Simple database initialization test
export async function testDatabaseInit() {
    console.log('Testing database initialization...');
    
    try {
        // Check if we can create a new database instance
        console.log('Creating database instance...');
        const testDb = new (await import('./db')).BudgicDB();
        
        console.log('Opening database...');
        await testDb.open();
        console.log('✅ Database opened successfully');
        
        console.log('Closing database...');
        await testDb.close();
        console.log('✅ Database closed successfully');
        
        return true;
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        console.error('Error details:', {
            name: (error as Error).name,
            message: (error as Error).message,
            stack: (error as Error).stack
        });
        return false;
    }
}

// Run the test if this file is executed directly
if (typeof window !== 'undefined') {
    // Browser environment
    (window as any).testDatabase = testDatabase;
    (window as any).testDatabaseInit = testDatabaseInit;
    
    // Add a simple connectivity test
    (window as any).testDatabaseConnection = async () => {
        console.log('Testing basic database connection...');
        try {
            await db.open();
            console.log('✅ Database connection successful');
            await db.close();
            console.log('✅ Database closed successfully');
            return true;
        } catch (error) {
            console.error('❌ Database connection failed:', error);
            return false;
        }
    };
} else {
    // Node.js environment
    testDatabase().catch(console.error);
} 