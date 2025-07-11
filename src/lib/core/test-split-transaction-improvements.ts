import { db, validateSplitTransaction, validateNewSplitTransaction, BalanceUtils, TransactionUtils } from '$lib/core/db';
import type { Transaction } from '$lib/core/db';

/**
 * Comprehensive test suite for split transaction improvements
 */
export class SplitTransactionTestSuite {
	
	/**
	 * Test improved amount validation logic
	 */
	static testAmountValidation() {
		console.log('Testing improved amount validation...');
		
		// Test 1: Positive expense (cashback scenario) - should be allowed
		const cashbackSplit: Transaction[] = [
			{
				id: '1', type: 'expense', status: 'cleared', accountId: 'acc1', amount: 50, currency: 'USD',
				splitId: 'split1', splitName: 'Cashback', createdAt: '', updatedAt: '', deletedAt: null, description: 'Cashback'
			},
			{
				id: '2', type: 'expense', status: 'cleared', accountId: 'acc1', amount: -30, currency: 'USD',
				splitId: 'split1', splitName: 'Cashback', createdAt: '', updatedAt: '', deletedAt: null, description: 'Original purchase'
			}
		];
		
		const cashbackValidation = BalanceUtils.validateSplitSum(cashbackSplit);
		console.log('Cashback split validation:', cashbackValidation.isValid ? 'PASS' : 'FAIL', cashbackValidation);
		
		// Test 2: Negative income (chargeback scenario) - should be allowed
		const chargebackSplit: Transaction[] = [
			{
				id: '3', type: 'income', status: 'cleared', accountId: 'acc1', amount: -25, currency: 'USD',
				splitId: 'split2', splitName: 'Chargeback', createdAt: '', updatedAt: '', deletedAt: null, description: 'Chargeback'
			},
			{
				id: '4', type: 'income', status: 'cleared', accountId: 'acc1', amount: 100, currency: 'USD',
				splitId: 'split2', splitName: 'Chargeback', createdAt: '', updatedAt: '', deletedAt: null, description: 'Original income'
			}
		];
		
		const chargebackValidation = BalanceUtils.validateSplitSum(chargebackSplit);
		console.log('Chargeback split validation:', chargebackValidation.isValid ? 'PASS' : 'FAIL', chargebackValidation);
		
		// Test 3: Transfer split validation
		const transferSplit: Transaction[] = [
			{
				id: '5', type: 'transfer', status: 'cleared', accountId: 'acc1', toAccountId: 'acc2', amount: 100, currency: 'USD',
				splitId: 'split3', splitName: 'Transfer', createdAt: '', updatedAt: '', deletedAt: null, description: 'Transfer part 1'
			},
			{
				id: '6', type: 'transfer', status: 'cleared', accountId: 'acc1', toAccountId: 'acc2', amount: 50, currency: 'USD',
				splitId: 'split3', splitName: 'Transfer', createdAt: '', updatedAt: '', deletedAt: null, description: 'Transfer part 2'
			}
		];
		
		const transferValidation = BalanceUtils.validateSplitSum(transferSplit);
		console.log('Transfer split validation:', transferValidation.isValid ? 'PASS' : 'FAIL', transferValidation);
	}
	
	/**
	 * Test split name consistency validation
	 */
	static testSplitNameConsistency() {
		console.log('Testing split name consistency validation...');
		
		// Test 1: Consistent split names - should pass
		const consistentSplit: Transaction[] = [
			{
				id: '1', type: 'expense', status: 'cleared', accountId: 'acc1', amount: -50, currency: 'USD',
				splitId: 'split1', splitName: 'Grocery Shopping', createdAt: '', updatedAt: '', deletedAt: null, description: 'Produce'
			},
			{
				id: '2', type: 'expense', status: 'cleared', accountId: 'acc1', amount: -30, currency: 'USD',
				splitId: 'split1', splitName: 'Grocery Shopping', createdAt: '', updatedAt: '', deletedAt: null, description: 'Dairy'
			}
		];
		
		const consistentValidation = validateSplitTransaction(consistentSplit);
		console.log('Consistent split names:', consistentValidation.isValid ? 'PASS' : 'FAIL', consistentValidation);
		
		// Test 2: Inconsistent split names - should fail
		const inconsistentSplit: Transaction[] = [
			{
				id: '3', type: 'expense', status: 'cleared', accountId: 'acc1', amount: -50, currency: 'USD',
				splitId: 'split2', splitName: 'Grocery Shopping', createdAt: '', updatedAt: '', deletedAt: null, description: 'Produce'
			},
			{
				id: '4', type: 'expense', status: 'cleared', accountId: 'acc1', amount: -30, currency: 'USD',
				splitId: 'split2', splitName: 'Different Name', createdAt: '', updatedAt: '', deletedAt: null, description: 'Dairy'
			}
		];
		
		const inconsistentValidation = validateSplitTransaction(inconsistentSplit);
		console.log('Inconsistent split names:', !inconsistentValidation.isValid ? 'PASS' : 'FAIL', inconsistentValidation);
	}
	
	/**
	 * Test enhanced master transaction selection
	 */
	static async testMasterTransactionSelection() {
		console.log('Testing enhanced master transaction selection...');
		
		// Create test split transactions
		const testSplitId = 'test-split-' + Date.now();
		const testTransactions: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>[] = [
			{
				type: 'expense', status: 'cleared', accountId: 'acc1', amount: -100, currency: 'USD',
				splitId: testSplitId, splitName: 'Test Split', description: 'Large amount, no description'
			},
			{
				type: 'expense', status: 'cleared', accountId: 'acc1', amount: -50, currency: 'USD',
				splitId: testSplitId, splitName: 'Test Split', description: 'Smaller amount, with description'
			}
		];
		
		try {
			// Create the split
			await db.createSplitTransactionGroup(testTransactions, 'Test Split');
			
			// Get the master transaction
			const master = await db.getSplitMasterTransaction(testSplitId);
			console.log('Master transaction selection:', master?.description === 'Smaller amount, with description' ? 'PASS' : 'FAIL', master);
			
			// Clean up
			await db.deleteSplitTransactionGroup(testSplitId);
		} catch (error) {
			console.error('Test failed:', error);
		}
	}
	
	/**
	 * Test comprehensive validation
	 */
	static testComprehensiveValidation() {
		console.log('Testing comprehensive validation...');
		
		// Test 1: Valid split with all required fields
		const validSplit: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>[] = [
			{
				type: 'expense', status: 'cleared', accountId: 'acc1', amount: -50, currency: 'USD',
				whatTag: 'groceries', whyTag: 'essential', payeeId: 'payee1', description: 'Part 1'
			},
			{
				type: 'expense', status: 'cleared', accountId: 'acc1', amount: -30, currency: 'USD',
				whatTag: 'groceries', whyTag: 'essential', payeeId: 'payee1', description: 'Part 2'
			}
		];
		
		const validValidation = validateNewSplitTransaction(validSplit);
		console.log('Valid split validation:', validValidation.isValid ? 'PASS' : 'FAIL', validValidation);
		
		// Test 2: Invalid split with different types
		const invalidSplit: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>[] = [
			{
				type: 'expense', status: 'cleared', accountId: 'acc1', amount: -50, currency: 'USD',
				whatTag: 'groceries', whyTag: 'essential', payeeId: 'payee1', description: 'Part 1'
			},
			{
				type: 'income', status: 'cleared', accountId: 'acc1', amount: 30, currency: 'USD',
				whatTag: 'groceries', whyTag: 'essential', payeeId: 'payee1', description: 'Part 2'
			}
		];
		
		const invalidValidation = validateNewSplitTransaction(invalidSplit);
		console.log('Invalid split validation:', !invalidValidation.isValid ? 'PASS' : 'FAIL', invalidValidation);
	}
	
	/**
	 * Run all tests
	 */
	static async runAllTests() {
		console.log('=== Split Transaction Improvements Test Suite ===\n');
		
		this.testAmountValidation();
		console.log('');
		
		this.testSplitNameConsistency();
		console.log('');
		
		await this.testMasterTransactionSelection();
		console.log('');
		
		this.testComprehensiveValidation();
		console.log('');
		
		console.log('=== Test Suite Complete ===');
	}
}

// Export for use in other test files
export default SplitTransactionTestSuite; 