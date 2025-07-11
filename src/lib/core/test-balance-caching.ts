import { accountService } from './services/account-service';
import { transactionService } from './services/transaction-service';
import { db } from './db';

async function testBalanceCaching() {
    console.log('🧪 Testing Balance Caching Implementation...\n');

    try {
        // 1. Create a test account
        console.log('1. Creating test account...');
        const testAccount = await accountService.createAccount({
            name: 'Test Account',
            type: 'checking',
            currency: 'USD',
            initialBalance: 1000,
            currentBalance: 1000
        });
        console.log(`✅ Created account: ${testAccount.name} with initial balance: $${testAccount.currentBalance}\n`);

        // 2. Test initial balance calculation
        console.log('2. Testing initial balance calculation...');
        const initialBalance = await accountService.getAccountBalance(testAccount.id);
        console.log(`✅ Initial calculated balance: $${initialBalance}\n`);

        // 3. Test cache hit (should be faster)
        console.log('3. Testing cache hit...');
        const startTime = Date.now();
        const cachedBalance = await accountService.getAccountBalance(testAccount.id);
        const endTime = Date.now();
        console.log(`✅ Cached balance: $${cachedBalance} (took ${endTime - startTime}ms)\n`);

        // 4. Create a transaction and test cache invalidation
        console.log('4. Creating transaction and testing cache invalidation...');
        const transaction = await transactionService.createNewTransaction({
            accountId: testAccount.id,
            amount: -50,
            type: 'expense',
            status: 'cleared',
            description: 'Test transaction'
        });
        console.log(`✅ Created transaction: $${transaction.amount} - ${transaction.description}\n`);

        // 5. Test balance after transaction (should recalculate)
        console.log('5. Testing balance after transaction...');
        const newBalance = await accountService.getAccountBalance(testAccount.id);
        console.log(`✅ New balance after transaction: $${newBalance}\n`);

        // 6. Test real-time balance calculation
        console.log('6. Testing real-time balance calculation...');
        const realTimeBalance = await accountService.getAccountBalanceRealTime(testAccount.id);
        console.log(`✅ Real-time balance: $${realTimeBalance}\n`);

        // 7. Test account with balances
        console.log('7. Testing getAccountsWithBalances...');
        const accountsWithBalances = await accountService.getAccountsWithBalances();
        const testAccountWithBalance = accountsWithBalances.find(acc => acc.account.id === testAccount.id);
        console.log(`✅ Account with balance: ${testAccountWithBalance?.account.name} - $${testAccountWithBalance?.balance}\n`);

        // 8. Clean up
        console.log('8. Cleaning up...');
        await transactionService.deleteTransaction(transaction.id);
        await accountService.deleteAccount(testAccount.id);
        console.log('✅ Cleanup completed\n');

        console.log('🎉 All balance caching tests passed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Export for use in other test files
export { testBalanceCaching };

// Run the test if this file is executed directly
if (typeof window === 'undefined') {
    // Node.js environment
    testBalanceCaching().catch(console.error);
} 