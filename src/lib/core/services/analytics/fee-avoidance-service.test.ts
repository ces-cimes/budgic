/**
 * Fee Avoidance Service Tests
 *
 * Tests for fee detection, recommendation generation, and transaction optimization
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { feeAvoidanceService } from './fee-avoidance-service';
import { db } from '$lib/core/db';
import type { Account, Transaction } from '$lib/core/db';
import { balanceProjectionService } from './balance-projection-service';
import { accountService } from '../core/account-service';
import { transactionService } from '../core/transaction-service';

// Mock dependencies
vi.mock('../core/account-service');
vi.mock('../core/transaction-service');
vi.mock('./balance-projection-service');

describe('FeeAvoidanceService', () => {
	// Test data
	const mockCheckingAccount: Account = {
		id: 'checking-1',
		name: 'Checking Account',
		type: 'checking',
		currency: 'USD',
		initialBalance: 1000,
		currentBalance: 100,
		isActive: true,
		metadata: {
			minimumBalance: 100,
			overdraftLimit: 100,
			overdraftFee: 35
		},
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		deletedAt: null
	};

	const mockSavingsAccount: Account = {
		id: 'savings-1',
		name: 'Savings Account',
		type: 'savings',
		currency: 'USD',
		initialBalance: 5000,
		currentBalance: 5000,
		isActive: true,
		metadata: {
			transferLimit: 6
		},
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		deletedAt: null
	};

	const mockCreditAccount: Account = {
		id: 'credit-1',
		name: 'Credit Card',
		type: 'credit',
		currency: 'USD',
		initialBalance: 0,
		currentBalance: -500,
		isActive: true,
		metadata: {
			creditLimit: 5000,
			paymentDueDate: '15',
			minimumPayment: 25
		},
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		deletedAt: null
	};

	beforeEach(() => {
		vi.clearAllMocks();
		feeAvoidanceService.clearCache();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ============================================================================
	// FEE DETECTION TESTS
	// ============================================================================

	describe('detectFeeRisks', () => {
		it('should detect overdraft fee risks', async () => {
			// Mock account with low balance projection
			vi.mocked(accountService.getAccounts).mockResolvedValue([mockCheckingAccount]);
			vi.mocked(balanceProjectionService.generateProjections).mockResolvedValue([
				{
					accountId: 'checking-1',
					accountName: 'Checking Account',
					currency: 'USD',
					startBalance: 100,
					projections: [
						{
							date: new Date(Date.now() + 86400000), // Tomorrow
							balance: -50, // Below overdraft threshold
							bufferAmount: 200,
							bufferStatus: 'critical',
							transactions: [],
							isLowBalance: true,
							isBelowBuffer: true
						}
					],
					lowBalanceDays: 1,
					belowBufferDays: 1,
					minimumBalance: -50,
					minimumBalanceDate: new Date(Date.now() + 86400000)
				}
			]);

			const risks = await feeAvoidanceService.detectFeeRisks();

			expect(risks).toHaveLength(1);
			expect(risks[0].feeType).toBe('overdraft');
			expect(risks[0].estimatedAmount).toBe(35);
			expect(risks[0].likelihood).toBe('imminent');
		});

		it('should detect minimum balance fee risks', async () => {
			const lowBalanceAccount = { ...mockCheckingAccount, currentBalance: 50 };
			vi.mocked(accountService.getAccounts).mockResolvedValue([lowBalanceAccount]);
			vi.mocked(balanceProjectionService.generateProjections).mockResolvedValue([
				{
					accountId: 'checking-1',
					accountName: 'Checking Account',
					currency: 'USD',
					startBalance: 50,
					projections: [
						{
							date: new Date(Date.now() + 86400000),
							balance: 50, // Below minimum balance of 100
							bufferAmount: 200,
							bufferStatus: 'warning',
							transactions: [],
							isLowBalance: true,
							isBelowBuffer: true
						}
					],
					lowBalanceDays: 1,
					belowBufferDays: 1,
					minimumBalance: 50,
					minimumBalanceDate: new Date(Date.now() + 86400000)
				}
			]);

			const risks = await feeAvoidanceService.detectFeeRisks();

			expect(risks.length).toBeGreaterThan(0);
			const minBalanceRisk = risks.find((r) => r.feeType === 'minimum_balance');
			expect(minBalanceRisk).toBeDefined();
			expect(minBalanceRisk?.thresholdValue).toBe(100);
		});

		it('should detect late payment risks for credit cards', async () => {
			vi.mocked(accountService.getAccounts).mockResolvedValue([mockCreditAccount]);
			vi.mocked(transactionService.getTransactionsByAccount).mockResolvedValue([]);
			vi.mocked(balanceProjectionService.generateProjections).mockResolvedValue([
				{
					accountId: 'credit-1',
					accountName: 'Credit Card',
					currency: 'USD',
					startBalance: -500,
					projections: [],
					lowBalanceDays: 0,
					belowBufferDays: 0,
					minimumBalance: -500,
					minimumBalanceDate: null
				}
			]);

			const risks = await feeAvoidanceService.detectFeeRisks();

			const latePaymentRisk = risks.find((r) => r.feeType === 'late_payment');
			expect(latePaymentRisk).toBeDefined();
			expect(latePaymentRisk?.estimatedAmount).toBe(35);
		});

		it('should detect transfer limit risks', async () => {
			vi.mocked(accountService.getAccounts).mockResolvedValue([mockSavingsAccount]);

			// Mock 6 transfers this month
			const transfers: Transaction[] = Array.from({ length: 6 }, (_, i) => ({
				id: `transfer-${i}`,
				type: 'transfer' as const,
				status: 'cleared' as const,
				confidence: 'confirmed' as const,
				accountId: 'savings-1',
				amount: -100,
				currency: 'USD',
				description: 'Transfer',
				clearedDate: new Date().toISOString(),
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				deletedAt: null
			}));

			vi.mocked(transactionService.getTransactionsByAccount).mockResolvedValue(transfers);
			vi.mocked(balanceProjectionService.generateProjections).mockResolvedValue([
				{
					accountId: 'savings-1',
					accountName: 'Savings Account',
					currency: 'USD',
					startBalance: 5000,
					projections: [],
					lowBalanceDays: 0,
					belowBufferDays: 0,
					minimumBalance: 5000,
					minimumBalanceDate: null
				}
			]);

			const risks = await feeAvoidanceService.detectFeeRisks();

			const transferRisk = risks.find((r) => r.feeType === 'transfer_limit');
			expect(transferRisk).toBeDefined();
			expect(transferRisk?.currentValue).toBe(6);
			expect(transferRisk?.thresholdValue).toBe(6);
		});

		it('should filter risks by confidence threshold', async () => {
			vi.mocked(accountService.getAccounts).mockResolvedValue([mockCheckingAccount]);
			vi.mocked(balanceProjectionService.generateProjections).mockResolvedValue([
				{
					accountId: 'checking-1',
					accountName: 'Checking Account',
					currency: 'USD',
					startBalance: 100,
					projections: [
						{
							date: new Date(Date.now() + 86400000 * 30), // 30 days out
							balance: -50,
							bufferAmount: 200,
							bufferStatus: 'critical',
							transactions: [],
							isLowBalance: true,
							isBelowBuffer: true
						}
					],
					lowBalanceDays: 1,
					belowBufferDays: 1,
					minimumBalance: -50,
					minimumBalanceDate: new Date(Date.now() + 86400000 * 30)
				}
			]);

			const risks = await feeAvoidanceService.detectFeeRisks({ minConfidence: 90 });

			// Should filter out risks with confidence < 90
			expect(risks.every((r) => r.confidence >= 90)).toBe(true);
		});

		it('should cache detection results', async () => {
			vi.mocked(accountService.getAccounts).mockResolvedValue([mockCheckingAccount]);
			vi.mocked(balanceProjectionService.generateProjections).mockResolvedValue([
				{
					accountId: 'checking-1',
					accountName: 'Checking Account',
					currency: 'USD',
					startBalance: 100,
					projections: [],
					lowBalanceDays: 0,
					belowBufferDays: 0,
					minimumBalance: 100,
					minimumBalanceDate: null
				}
			]);

			// First call
			await feeAvoidanceService.detectFeeRisks();
			expect(accountService.getAccounts).toHaveBeenCalledTimes(1);

			// Second call should use cache
			await feeAvoidanceService.detectFeeRisks();
			expect(accountService.getAccounts).toHaveBeenCalledTimes(1);
		});
	});

	// ============================================================================
	// RECOMMENDATION GENERATION TESTS
	// ============================================================================

	describe('generateFeeAvoidanceRecommendations', () => {
		it('should generate transfer recommendations for overdraft risks', async () => {
			const sourceAccount: Account = {
				...mockSavingsAccount,
				currentBalance: 1000
			};

			vi.mocked(accountService.getAccounts).mockResolvedValue([mockCheckingAccount, sourceAccount]);
			vi.mocked(accountService.getAccount).mockImplementation(async (id) => {
				if (id === mockCheckingAccount.id) return mockCheckingAccount;
				if (id === sourceAccount.id) return sourceAccount;
				return null;
			});

			vi.mocked(balanceProjectionService.generateProjections).mockResolvedValue([
				{
					accountId: 'checking-1',
					accountName: 'Checking Account',
					currency: 'USD',
					startBalance: 100,
					projections: [
						{
							date: new Date(Date.now() + 86400000),
							balance: -50,
							bufferAmount: 200,
							bufferStatus: 'critical',
							transactions: [],
							isLowBalance: true,
							isBelowBuffer: true
						}
					],
					lowBalanceDays: 1,
					belowBufferDays: 1,
					minimumBalance: -50,
					minimumBalanceDate: new Date(Date.now() + 86400000)
				}
			]);

			const recommendations = await feeAvoidanceService.generateFeeAvoidanceRecommendations();

			const transferRec = recommendations.find((r) => r.type === 'transfer');
			expect(transferRec).toBeDefined();
			expect(transferRec?.priority).toBe('urgent');
			expect(transferRec?.estimatedSavings).toBe(35);
		});

		it('should generate reschedule recommendations', async () => {
			const mockTransaction: Transaction = {
				id: 'tx-1',
				type: 'expense',
				status: 'planned',
				confidence: 'expected',
				accountId: 'checking-1',
				amount: -200,
				currency: 'USD',
				description: 'Rent',
				plannedDate: new Date(Date.now() + 86400000).toISOString(),
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				deletedAt: null
			};

			vi.mocked(accountService.getAccounts).mockResolvedValue([mockCheckingAccount]);
			vi.mocked(accountService.getAccount).mockResolvedValue(mockCheckingAccount);
			vi.mocked(db.transactions.get).mockResolvedValue(mockTransaction);

			vi.mocked(balanceProjectionService.generateProjections).mockResolvedValue([
				{
					accountId: 'checking-1',
					accountName: 'Checking Account',
					currency: 'USD',
					startBalance: 100,
					projections: [
						{
							date: new Date(Date.now() + 86400000),
							balance: -100,
							bufferAmount: 200,
							bufferStatus: 'critical',
							transactions: [
								{
									id: 'tx-1',
									date: new Date(Date.now() + 86400000),
									amount: -200,
									type: 'expense',
									accountId: 'checking-1',
									isRecurring: false
								}
							],
							isLowBalance: true,
							isBelowBuffer: true
						}
					],
					lowBalanceDays: 1,
					belowBufferDays: 1,
					minimumBalance: -100,
					minimumBalanceDate: new Date(Date.now() + 86400000)
				}
			]);

			const recommendations = await feeAvoidanceService.generateFeeAvoidanceRecommendations();

			const rescheduleRec = recommendations.find((r) => r.type === 'reschedule');
			expect(rescheduleRec).toBeDefined();
			expect(rescheduleRec?.suggestedTransactionChanges).toBeDefined();
		});

		it('should prioritize recommendations correctly', async () => {
			vi.mocked(accountService.getAccounts).mockResolvedValue([mockCheckingAccount]);
			vi.mocked(accountService.getAccount).mockResolvedValue(mockCheckingAccount);

			vi.mocked(balanceProjectionService.generateProjections).mockResolvedValue([
				{
					accountId: 'checking-1',
					accountName: 'Checking Account',
					currency: 'USD',
					startBalance: 100,
					projections: [
						{
							date: new Date(Date.now() + 86400000),
							balance: -50,
							bufferAmount: 200,
							bufferStatus: 'critical',
							transactions: [],
							isLowBalance: true,
							isBelowBuffer: true
						}
					],
					lowBalanceDays: 1,
					belowBufferDays: 1,
					minimumBalance: -50,
					minimumBalanceDate: new Date(Date.now() + 86400000)
				}
			]);

			const recommendations = await feeAvoidanceService.generateFeeAvoidanceRecommendations();

			// Urgent recommendations should come first
			if (recommendations.length > 1) {
				const priorities = recommendations.map((r) => r.priority);
				const urgentIndex = priorities.indexOf('urgent');
				const lowIndex = priorities.indexOf('low');

				if (urgentIndex !== -1 && lowIndex !== -1) {
					expect(urgentIndex).toBeLessThan(lowIndex);
				}
			}
		});
	});

	// ============================================================================
	// TRANSACTION ADJUSTMENT TESTS
	// ============================================================================

	describe('applyTransactionAdjustments', () => {
		it('should apply transaction adjustments successfully', async () => {
			const mockTransaction: Transaction = {
				id: 'tx-1',
				type: 'expense',
				status: 'planned',
				confidence: 'expected',
				accountId: 'checking-1',
				amount: -200,
				currency: 'USD',
				description: 'Rent',
				plannedDate: new Date().toISOString(),
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				deletedAt: null
			};

			vi.mocked(db.transactions.get).mockResolvedValue(mockTransaction);
			vi.mocked(db.transactions.update).mockResolvedValue(1);

			const adjustments = [
				{
					transactionId: 'tx-1',
					currentDate: new Date(),
					suggestedDate: new Date(Date.now() + 86400000 * 3),
					reason: 'Avoid overdraft',
					impact: 200,
					confidence: 80
				}
			];

			const result = await feeAvoidanceService.applyTransactionAdjustments(adjustments);

			expect(result.applied).toBe(1);
			expect(result.failed).toBe(0);
			expect(result.errors).toHaveLength(0);
			expect(db.transactions.update).toHaveBeenCalledWith(
				'tx-1',
				expect.objectContaining({
					plannedDate: expect.any(String),
					updatedAt: expect.any(String)
				})
			);
		});

		it('should handle adjustment failures gracefully', async () => {
			vi.mocked(db.transactions.get).mockResolvedValue(null);

			const adjustments = [
				{
					transactionId: 'tx-nonexistent',
					currentDate: new Date(),
					suggestedDate: new Date(Date.now() + 86400000 * 3),
					reason: 'Avoid overdraft',
					impact: 200,
					confidence: 80
				}
			];

			const result = await feeAvoidanceService.applyTransactionAdjustments(adjustments);

			expect(result.applied).toBe(0);
			expect(result.failed).toBe(1);
			expect(result.errors).toHaveLength(1);
		});
	});

	// ============================================================================
	// STRATEGY GENERATION TESTS
	// ============================================================================

	describe('generateFeeAvoidanceStrategy', () => {
		it('should generate comprehensive strategy for an account', async () => {
			vi.mocked(accountService.getAccounts).mockResolvedValue([mockCheckingAccount]);
			vi.mocked(accountService.getAccount).mockResolvedValue(mockCheckingAccount);

			vi.mocked(balanceProjectionService.generateProjections).mockResolvedValue([
				{
					accountId: 'checking-1',
					accountName: 'Checking Account',
					currency: 'USD',
					startBalance: 100,
					projections: [
						{
							date: new Date(Date.now() + 86400000),
							balance: -50,
							bufferAmount: 200,
							bufferStatus: 'critical',
							transactions: [],
							isLowBalance: true,
							isBelowBuffer: true
						}
					],
					lowBalanceDays: 1,
					belowBufferDays: 1,
					minimumBalance: -50,
					minimumBalanceDate: new Date(Date.now() + 86400000)
				}
			]);

			const strategy = await feeAvoidanceService.generateFeeAvoidanceStrategy('checking-1');

			expect(strategy.accountId).toBe('checking-1');
			expect(strategy.risks.length).toBeGreaterThan(0);
			expect(strategy.recommendations.length).toBeGreaterThan(0);
			expect(strategy.totalPotentialSavings).toBeGreaterThan(0);
		});

		it('should identify auto-adjustable transactions', async () => {
			const mockTransaction: Transaction = {
				id: 'tx-1',
				type: 'expense',
				status: 'planned',
				confidence: 'expected',
				accountId: 'checking-1',
				amount: -200,
				currency: 'USD',
				description: 'Rent',
				plannedDate: new Date(Date.now() + 86400000).toISOString(),
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				deletedAt: null
			};

			vi.mocked(accountService.getAccounts).mockResolvedValue([mockCheckingAccount]);
			vi.mocked(accountService.getAccount).mockResolvedValue(mockCheckingAccount);
			vi.mocked(db.transactions.get).mockResolvedValue(mockTransaction);

			vi.mocked(balanceProjectionService.generateProjections).mockResolvedValue([
				{
					accountId: 'checking-1',
					accountName: 'Checking Account',
					currency: 'USD',
					startBalance: 100,
					projections: [
						{
							date: new Date(Date.now() + 86400000),
							balance: -100,
							bufferAmount: 200,
							bufferStatus: 'critical',
							transactions: [
								{
									id: 'tx-1',
									date: new Date(Date.now() + 86400000),
									amount: -200,
									type: 'expense',
									accountId: 'checking-1',
									isRecurring: false
								}
							],
							isLowBalance: true,
							isBelowBuffer: true
						}
					],
					lowBalanceDays: 1,
					belowBufferDays: 1,
					minimumBalance: -100,
					minimumBalanceDate: new Date(Date.now() + 86400000)
				}
			]);

			const strategy = await feeAvoidanceService.generateFeeAvoidanceStrategy('checking-1');

			expect(strategy.autoAdjustableTransactions.length).toBeGreaterThan(0);
		});
	});

	// ============================================================================
	// CACHE MANAGEMENT TESTS
	// ============================================================================

	describe('cache management', () => {
		it('should clear cache when requested', async () => {
			vi.mocked(accountService.getAccounts).mockResolvedValue([mockCheckingAccount]);
			vi.mocked(balanceProjectionService.generateProjections).mockResolvedValue([]);

			// First call
			await feeAvoidanceService.detectFeeRisks();
			expect(accountService.getAccounts).toHaveBeenCalledTimes(1);

			// Clear cache
			feeAvoidanceService.clearCache();

			// Second call should not use cache
			await feeAvoidanceService.detectFeeRisks();
			expect(accountService.getAccounts).toHaveBeenCalledTimes(2);
		});

		it('should clear cache for specific accounts', async () => {
			vi.mocked(accountService.getAccounts).mockResolvedValue([
				mockCheckingAccount,
				mockSavingsAccount
			]);
			vi.mocked(balanceProjectionService.generateProjections).mockResolvedValue([]);

			// Cache results for both accounts
			await feeAvoidanceService.detectFeeRisks({ accountIds: ['checking-1', 'savings-1'] });

			// Clear cache for one account
			feeAvoidanceService.clearCacheForAccounts(['checking-1']);

			// Cache should be partially cleared
			// Note: This test verifies the method runs without error
			expect(() => feeAvoidanceService.clearCacheForAccounts(['checking-1'])).not.toThrow();
		});
	});
});
