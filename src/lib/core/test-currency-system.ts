import { db, CurrencyUtils, DateUtils, BalanceUtils } from './db';
import { currencyService } from './services/currency-service';
import { transactionService } from './services/transaction-service';
import { accountService } from './services/account-service';

/**
 * Test the currency system implementation
 */
export async function testCurrencySystem() {
	console.log('🧪 Testing Currency System...');

	try {
		// Test 1: Currency validation
		console.log('\n1. Testing currency validation...');
		
		// Valid currency codes
		const validCodes = ['USD', 'EUR', 'BTC', 'ETH'];
		for (const code of validCodes) {
			const isValid = CurrencyUtils.isValidCurrencyCode(code);
			console.log(`  ${code}: ${isValid ? '✅' : '❌'}`);
		}

		// Invalid currency codes
		const invalidCodes = ['US', 'USDD', 'usd', '123'];
		for (const code of invalidCodes) {
			const isValid = CurrencyUtils.isValidCurrencyCode(code);
			console.log(`  ${code}: ${isValid ? '❌' : '✅'}`);
		}

		// Test 2: Amount validation
		console.log('\n2. Testing amount validation...');
		
		const amountTests = [
			{ amount: 100, currency: 'USD', expected: true },
			{ amount: 1000001, currency: 'USD', expected: false }, // Over 1M limit
			{ amount: 100.123, currency: 'USD', expected: false }, // Too many decimals
			{ amount: 100.123456789, currency: 'BTC', expected: false }, // Too many decimals for BTC
			{ amount: 100.12345678, currency: 'BTC', expected: true }, // Valid for BTC
			{ amount: NaN, currency: 'USD', expected: false },
			{ amount: Infinity, currency: 'USD', expected: false }
		];

		for (const test of amountTests) {
			const validation = CurrencyUtils.validateAmount(test.amount, test.currency);
			const passed = validation.isValid === test.expected;
			console.log(`  ${test.amount} ${test.currency}: ${passed ? '✅' : '❌'} ${validation.error || ''}`);
		}

		// Test 3: Date validation
		console.log('\n3. Testing date validation...');
		
		const now = new Date();
		const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
		const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

		const dateTests = [
			{ date: yesterday.toISOString(), status: 'cleared' as const, expected: true },
			{ date: tomorrow.toISOString(), status: 'cleared' as const, expected: false },
			{ date: yesterday.toISOString(), status: 'planned' as const, expected: false },
			{ date: tomorrow.toISOString(), status: 'planned' as const, expected: true },
			{ date: 'invalid-date', status: 'cleared' as const, expected: false }
		];

		for (const test of dateTests) {
			const validation = DateUtils.validateTransactionDate(test.date, test.status);
			const passed = validation.isValid === test.expected;
			console.log(`  ${test.date} (${test.status}): ${passed ? '✅' : '❌'} ${validation.error || ''}`);
		}

		// Test 4: Currency service
		console.log('\n4. Testing currency service...');
		
		const currencies = await currencyService.getActiveCurrencies();
		console.log(`  Found ${currencies.length} active currencies`);
		
		const usdCurrency = await currencyService.getCurrencyByCode('USD');
		console.log(`  USD currency: ${usdCurrency ? '✅' : '❌'}`);
		
		if (usdCurrency) {
			const displayInfo = await currencyService.getCurrencyDisplayInfo('USD');
			console.log(`  USD display info: ${displayInfo ? '✅' : '❌'}`);
			if (displayInfo) {
				console.log(`    Symbol: ${displayInfo.symbol}, Placement: ${displayInfo.placement}, Decimals: ${displayInfo.decimalPlaces}`);
				console.log(`    Example: ${displayInfo.formattedExample}`);
			}
		}

		// Test 5: Amount formatting
		console.log('\n5. Testing amount formatting...');
		
		const formattingTests = [
			{ amount: 1234.56, currency: 'USD' },
			{ amount: 1234.56, currency: 'EUR' },
			{ amount: 1234, currency: 'JPY' },
			{ amount: 0.12345678, currency: 'BTC' }
		];

		for (const test of formattingTests) {
			const formatted = CurrencyUtils.formatAmount(test.amount, test.currency);
			console.log(`  ${test.amount} ${test.currency}: ${formatted}`);
		}

		console.log('\n✅ Currency system tests completed successfully!');

	} catch (error) {
		console.error('❌ Currency system tests failed:', error);
	}
}

/**
 * Test transaction validation with currencies
 */
export async function testTransactionValidation() {
	console.log('\n🧪 Testing Transaction Validation...');

	try {
		// Create a test account first
		const testAccount = await accountService.createAccount({
			name: 'Test Account',
			type: 'checking',
			currency: 'USD',
			initialBalance: 1000
		});

		console.log(`  Created test account: ${testAccount.name}`);

		// Test valid transaction
		console.log('\n1. Testing valid transaction...');
		const validTransaction = await transactionService.createNewTransaction({
			accountId: testAccount.id,
			amount: 50.00,
			type: 'expense',
			status: 'cleared',
			currency: 'USD',
			description: 'Test transaction',
			clearedDate: new Date().toISOString()
		});
		console.log(`  ✅ Created valid transaction: ${validTransaction.id}`);

		// Test invalid amount
		console.log('\n2. Testing invalid amount...');
		try {
			await transactionService.createNewTransaction({
				accountId: testAccount.id,
				amount: 2000000, // Over 1M limit
				type: 'expense',
				status: 'cleared',
				currency: 'USD',
				description: 'Invalid amount test'
			});
			console.log('  ❌ Should have failed');
		} catch (error) {
			console.log(`  ✅ Correctly rejected: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}

		// Test invalid date
		console.log('\n3. Testing invalid date...');
		try {
			const futureDate = new Date();
			futureDate.setFullYear(futureDate.getFullYear() + 1);
			
			await transactionService.createNewTransaction({
				accountId: testAccount.id,
				amount: 50.00,
				type: 'expense',
				status: 'cleared',
				currency: 'USD',
				description: 'Future date test',
				clearedDate: futureDate.toISOString()
			});
			console.log('  ❌ Should have failed');
		} catch (error) {
			console.log(`  ✅ Correctly rejected: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}

		// Test invalid currency
		console.log('\n4. Testing invalid currency...');
		try {
			await transactionService.createNewTransaction({
				accountId: testAccount.id,
				amount: 50.00,
				type: 'expense',
				status: 'cleared',
				currency: 'INVALID',
				description: 'Invalid currency test'
			});
			console.log('  ❌ Should have failed');
		} catch (error) {
			console.log(`  ✅ Correctly rejected: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}

		console.log('\n✅ Transaction validation tests completed successfully!');

	} catch (error) {
		console.error('❌ Transaction validation tests failed:', error);
	}
}

// Run tests if this file is executed directly
if (typeof window !== 'undefined') {
	// Browser environment - export for manual testing
	(window as any).testCurrencySystem = testCurrencySystem;
	(window as any).testTransactionValidation = testTransactionValidation;
} else {
	// Node.js environment - run tests
	testCurrencySystem().then(() => {
		return testTransactionValidation();
	}).catch(console.error);
} 