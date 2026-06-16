import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { reconciliationService } from './reconciliation-service';
import { accountService } from './account-service';
import { transactionService } from './transaction-service';
import { db } from '$lib/core/db';
import type {
	Account,
	Transaction,
	ReconciliationRecord,
	ReconciliationDiscrepancy
} from '$lib/core/db';

// Mock the database
vi.mock('$lib/core/db', async () => {
	const actual = await vi.importActual('$lib/core/db');
	return {
		...actual,
		db: {
			isOpen: vi.fn(() => true),
			accounts: {
				get: vi.fn(),
				add: vi.fn(),
				update: vi.fn()
			},
			transactions: {
				update: vi.fn(() => Promise.resolve(1)),
				where: vi.fn(() => ({
					equals: vi.fn(() => ({
						and: vi.fn(() => ({
							toArray: vi.fn()
						}))
					}))
				}))
			},
			reconciliationRecords: {
				add: vi.fn(),
				update: vi.fn(),
				where: vi.fn(() => ({
					equals: vi.fn(() => ({
						and: vi.fn(() => ({
							reverse: vi.fn(() => ({
								sortBy: vi.fn((field) => Promise.resolve([])),
								toArray: vi.fn(() => Promise.resolve([]))
							}))
						}))
					}))
				}))
			},
			reconciliationDiscrepancies: {
				add: vi.fn(),
				get: vi.fn(),
				update: vi.fn(),
				where: vi.fn(() => ({
					equals: vi.fn(() => ({
						and: vi.fn(() => ({
							reverse: vi.fn(() => ({
								sortBy: vi.fn(() => Promise.resolve([])),
								toArray: vi.fn(() => Promise.resolve([]))
							}))
						}))
					}))
				}))
			},
			dataCorrections: {
				bulkAdd: vi.fn(() => Promise.resolve()),
				orderBy: vi.fn(() => ({
					reverse: vi.fn(() => ({
						limit: vi.fn(() => ({
							toArray: vi.fn(() => Promise.resolve([]))
						}))
					}))
				}))
			},
			getTransactionsByAccount: vi.fn()
		}
	};
});

// Mock the account service
vi.mock('./account-service', () => ({
	accountService: {
		getAccount: vi.fn(),
		recalculateAccountBalance: vi.fn(),
		getTransactionImpact: vi.fn(),
		updateAccount: vi.fn(() => Promise.resolve()),
		updateAccountMetadata: vi.fn()
	}
}));

// Mock the transaction service
vi.mock('./transaction-service', () => ({
	transactionService: {
		createTransaction: vi.fn()
	}
}));

describe('ReconciliationService', () => {
	// Test data
	const mockAccount: Account = {
		id: 'account-1',
		name: 'Test Checking Account',
		type: 'checking',
		currency: 'USD',
		initialBalance: 1000,
		currentBalance: 1250,
		isActive: true,
		metadata: {
			lastReconciledDate: '2024-01-15T10:00:00Z'
		},
		createdAt: '2024-01-01T00:00:00Z',
		updatedAt: '2024-01-15T10:00:00Z',
		deletedAt: null
	};

	const mockTransactions: Transaction[] = [
		{
			id: 'tx-1',
			type: 'income',
			status: 'cleared',
			confidence: 'confirmed',
			accountId: 'account-1',
			amount: 500,
			currency: 'USD',
			description: 'Salary deposit',
			categoryId: 'income-salary',
			plannedDate: '2024-01-10T00:00:00Z',
			clearedDate: '2024-01-10T00:00:00Z',
			createdAt: '2024-01-10T00:00:00Z',
			updatedAt: '2024-01-10T00:00:00Z',
			deletedAt: null
		},
		{
			id: 'tx-2',
			type: 'expense',
			status: 'cleared',
			confidence: 'confirmed',
			accountId: 'account-1',
			amount: -250,
			currency: 'USD',
			description: 'Grocery shopping',
			categoryId: 'expense-food',
			plannedDate: '2024-01-12T00:00:00Z',
			clearedDate: '2024-01-12T00:00:00Z',
			createdAt: '2024-01-12T00:00:00Z',
			updatedAt: '2024-01-12T00:00:00Z',
			deletedAt: null
		},
		{
			id: 'tx-3',
			type: 'expense',
			status: 'pending',
			confidence: 'confirmed',
			accountId: 'account-1',
			amount: -100,
			currency: 'USD',
			description: 'Pending payment',
			categoryId: 'expense-utilities',
			plannedDate: '2024-01-15T00:00:00Z',
			createdAt: '2024-01-14T00:00:00Z',
			updatedAt: '2024-01-14T00:00:00Z',
			deletedAt: null
		}
	];

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('Basic Operations', () => {
		it('should be ready when database is open', () => {
			expect(reconciliationService.ready).toBe(true);
			expect(reconciliationService.isLoading()).toBe(false);
		});

		it('should not be ready when database is closed', () => {
			vi.mocked(db.isOpen).mockReturnValue(false);
			expect(reconciliationService.ready).toBe(false);
			expect(reconciliationService.isLoading()).toBe(true);
		});
	});

	describe('Reconciliation Algorithm', () => {
		beforeEach(() => {
			vi.mocked(accountService.getAccount).mockResolvedValue(mockAccount);
			vi.mocked(db.getTransactionsByAccount).mockResolvedValue(mockTransactions);
			vi.mocked(accountService.recalculateAccountBalance).mockResolvedValue(1250);
			vi.mocked(db.reconciliationRecords.add).mockResolvedValue('record-1');
			vi.mocked(accountService.getTransactionImpact).mockImplementation(
				(tx: Transaction) => tx.amount ?? 0
			);
		});

		it('should perform successful reconciliation with no discrepancy', async () => {
			const statementBalance = 1250;
			const options = {
				tolerance: 0.01,
				includePendingTransactions: false,
				autoResolveSmallDiscrepancies: true,
				autoResolveThreshold: 0.01
			};

			const result = await reconciliationService.performReconciliation(
				'account-1',
				statementBalance,
				options
			);

			expect(result).toMatchObject({
				accountId: 'account-1',
				statementBalance,
				calculatedBalance: 1250,
				discrepancy: 0,
				reconciliationType: 'manual',
				transactionCount: 2 // Only cleared transactions
			});

			expect(db.reconciliationRecords.add).toHaveBeenCalledWith(
				expect.objectContaining({
					accountId: 'account-1',
					statementBalance,
					calculatedBalance: 1250,
					discrepancy: 0
				})
			);

			expect(accountService.updateAccountMetadata).toHaveBeenCalledWith('account-1', {
				lastReconciledDate: expect.any(String)
			});
		});

		it('should detect discrepancy and create discrepancy records', async () => {
			const statementBalance = 1300; // $50 more than calculated
			vi.mocked(db.reconciliationDiscrepancies.add).mockResolvedValue('disc-1');

			const result = await reconciliationService.performReconciliation(
				'account-1',
				statementBalance
			);

			expect(result.discrepancy).toBe(50);
			expect(db.reconciliationDiscrepancies.add).toHaveBeenCalled();
		});

		it('should include pending transactions when specified', async () => {
			vi.mocked(accountService.recalculateAccountBalance).mockResolvedValue(1150); // Including pending -100

			const result = await reconciliationService.performReconciliation('account-1', 1150, {
				includePendingTransactions: true
			});

			expect(result.transactionCount).toBe(3); // All transactions
			expect(result.discrepancy).toBe(0);
		});

		it('should auto-resolve small discrepancies', async () => {
			const statementBalance = 1250.01; // 1 cent discrepancy
			vi.mocked(db.reconciliationRecords.update).mockResolvedValue(1);

			const result = await reconciliationService.performReconciliation(
				'account-1',
				statementBalance,
				{
					autoResolveSmallDiscrepancies: true,
					autoResolveThreshold: 0.01
				}
			);

			// Phase 0.3: auto-resolve patches balance directly; no adjustment transaction is created
			expect(result.discrepancy).toBeCloseTo(0.01, 5);
			expect(accountService.updateAccount).toHaveBeenCalledWith(
				'account-1',
				expect.objectContaining({ currentBalance: expect.any(Number) })
			);
			expect(db.reconciliationRecords.update).toHaveBeenCalledWith(
				result.id,
				expect.objectContaining({ balanceAdjustmentApplied: expect.any(Number) })
			);
			expect(vi.mocked(db.dataCorrections.bulkAdd)).toHaveBeenCalled();
		});

		it('should throw error for non-existent account', async () => {
			vi.mocked(accountService.getAccount).mockResolvedValue(null);

			await expect(
				reconciliationService.performReconciliation('non-existent', 1000)
			).rejects.toThrow('Account non-existent not found');
		});
	});

	describe('Automatic Reconciliation', () => {
		beforeEach(() => {
			vi.mocked(accountService.getAccount).mockResolvedValue(mockAccount);
			vi.mocked(db.getTransactionsByAccount).mockResolvedValue(mockTransactions);
			vi.mocked(accountService.getTransactionImpact).mockImplementation(
				(tx: Transaction) => tx.amount ?? 0
			);
			vi.mocked(db.reconciliationRecords.add).mockResolvedValue('record-1');
		});

		it('should perform automatic reconciliation', async () => {
			const result = await reconciliationService.performAutomaticReconciliation('account-1');

			expect(result.reconciliationType).toBe('automatic');
			expect(result.statementBalance).toBe(1250);
			expect(result.calculatedBalance).toBe(1250);
			expect(result.discrepancy).toBe(0);
		});

		it('should throw error for non-existent account', async () => {
			vi.mocked(accountService.getAccount).mockResolvedValue(null);

			await expect(
				reconciliationService.performAutomaticReconciliation('non-existent')
			).rejects.toThrow('Account non-existent not found');
		});
	});

	describe('Skip and bootstrap', () => {
		beforeEach(() => {
			vi.mocked(accountService.getAccount).mockResolvedValue(mockAccount);
			vi.mocked(db.getTransactionsByAccount).mockResolvedValue(mockTransactions);
			vi.mocked(accountService.getTransactionImpact).mockImplementation(
				(tx: Transaction) => tx.amount ?? 0
			);
			vi.mocked(db.reconciliationRecords.add).mockResolvedValue('record-1');
		});

		it('skipReconciliationForNow creates 0-delta skipped record', async () => {
			const result = await reconciliationService.skipReconciliationForNow(
				'account-1',
				'Not now'
			);

			expect(result).toMatchObject({
				accountId: 'account-1',
				discrepancy: 0,
				reconciliationType: 'skipped',
				notes: 'Not now'
			});
			expect(db.reconciliationDiscrepancies.add).not.toHaveBeenCalled();
		});

		it('bootstrapReconciliationForAccount is idempotent when already reconciled', async () => {
			const bootstrapped = await reconciliationService.bootstrapReconciliationForAccount(
				'account-1',
				'create'
			);
			expect(bootstrapped).toBeNull();
		});

		it('bootstrapReconciliationForAccount creates automatic baseline', async () => {
			const freshAccount = { ...mockAccount, metadata: undefined };
			vi.mocked(accountService.getAccount).mockResolvedValue(freshAccount);
			vi.mocked(db.reconciliationRecords.where).mockReturnValue({
				equals: vi.fn(() => ({
					and: vi.fn(() => ({
						reverse: vi.fn(() => ({
							sortBy: vi.fn(() => Promise.resolve([]))
						}))
					}))
				}))
			} as any);

			const result = await reconciliationService.bootstrapReconciliationForAccount(
				'account-1',
				'import'
			);

			expect(result).toMatchObject({
				accountId: 'account-1',
				discrepancy: 0,
				reconciliationType: 'automatic'
			});
		});
	});

	describe('Discrepancy Detection', () => {
		beforeEach(() => {
			vi.mocked(accountService.getAccount).mockResolvedValue(mockAccount);
			vi.mocked(db.getTransactionsByAccount).mockResolvedValue([
				{
					...mockTransactions[0],
					amount: 50 // Matching discrepancy amount
				},
				{
					...mockTransactions[1],
					amount: -50,
					description: 'Duplicate transaction',
					plannedDate: '2024-01-12T00:00:00Z'
				},
				{
					...mockTransactions[1], // Exact duplicate
					id: 'tx-duplicate',
					amount: -50,
					description: 'Duplicate transaction',
					plannedDate: '2024-01-12T00:00:00Z'
				}
			]);
		});

		it('should detect amount mismatches', async () => {
			const discrepancy = 50;
			const issues = await (reconciliationService as any).analyzeTransactionPatterns(
				[{ ...mockTransactions[0], amount: 50 }],
				discrepancy
			);

			expect(issues).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						type: 'amount_mismatch',
						amount: 50,
						suspectedTransactionId: 'tx-1'
					})
				])
			);
		});

		it('should detect duplicate transactions', async () => {
			const duplicateTransactions = [
				{
					...mockTransactions[1],
					amount: -50,
					description: 'Duplicate transaction',
					plannedDate: '2024-01-12T00:00:00Z'
				},
				{
					...mockTransactions[1],
					id: 'tx-duplicate',
					amount: -50,
					description: 'Duplicate transaction',
					plannedDate: '2024-01-12T00:00:00Z'
				}
			];

			const issues = await (reconciliationService as any).analyzeTransactionPatterns(
				duplicateTransactions,
				0
			);

			expect(issues).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						type: 'duplicate_transaction',
						suspectedTransactionId: 'tx-duplicate'
					})
				])
			);
		});

		it('should detect timing differences', async () => {
			const issues = await (reconciliationService as any).analyzeTransactionPatterns(
				[mockTransactions[2]], // Pending transaction
				50
			);

			expect(issues).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						type: 'timing_difference',
						description: expect.stringContaining('pending transactions')
					})
				])
			);
		});

		it('should calculate correct discrepancy severity', async () => {
			const lowSeverity = (reconciliationService as any).calculateDiscrepancySeverity(
				0.01,
				100
			);
			const mediumSeverity = (reconciliationService as any).calculateDiscrepancySeverity(
				5,
				100
			);
			const highSeverity = (reconciliationService as any).calculateDiscrepancySeverity(
				50,
				100
			);

			expect(lowSeverity).toBe('low');
			expect(mediumSeverity).toBe('medium');
			expect(highSeverity).toBe('high');
		});
	});

	describe('Reconciliation History', () => {
		const mockRecords: ReconciliationRecord[] = [
			{
				id: 'record-1',
				accountId: 'account-1',
				reconciledDate: '2024-01-15T10:00:00Z',
				statementBalance: 1250,
				calculatedBalance: 1250,
				discrepancy: 0,
				reconciliationType: 'manual',
				transactionCount: 5,
				reconciledTransactionIds: ['tx-1', 'tx-2'],
				unreconciledTransactionIds: [],
				createdAt: '2024-01-15T10:00:00Z',
				updatedAt: '2024-01-15T10:00:00Z',
				deletedAt: null
			},
			{
				id: 'record-2',
				accountId: 'account-1',
				reconciledDate: '2024-01-10T09:00:00Z',
				statementBalance: 1000,
				calculatedBalance: 1005,
				discrepancy: -5,
				reconciliationType: 'automatic',
				transactionCount: 3,
				reconciledTransactionIds: ['tx-1'],
				unreconciledTransactionIds: ['tx-2'],
				resolvedAt: '2024-01-10T09:30:00Z',
				createdAt: '2024-01-10T09:00:00Z',
				updatedAt: '2024-01-10T09:30:00Z',
				deletedAt: null
			}
		];

		beforeEach(() => {
			vi.mocked(db.reconciliationRecords.where).mockReturnValue({
				equals: vi.fn(() => ({
					and: vi.fn(() => ({
						reverse: vi.fn(() => ({
							sortBy: vi.fn(() => Promise.resolve(mockRecords))
						}))
					}))
				}))
			} as any);
		});

		it('should return reconciliation history for account', async () => {
			const history = await reconciliationService.getReconciliationHistory('account-1');

			expect(history).toHaveLength(2);
			expect(history[0]).toMatchObject({
				id: 'record-1',
				accountId: 'account-1',
				discrepancy: 0
			});
		});

		it('should limit returned records', async () => {
			const history = await reconciliationService.getReconciliationHistory('account-1', 1);

			expect(db.reconciliationRecords.where).toHaveBeenCalledWith('accountId');
		});
	});

	describe('Reconciliation Summary', () => {
		beforeEach(() => {
			vi.mocked(accountService.getAccount).mockResolvedValue(mockAccount);
			vi.mocked(db.getTransactionsByAccount).mockResolvedValue(mockTransactions);
			vi.mocked(accountService.getTransactionImpact).mockImplementation(
				(tx: Transaction) => tx.amount ?? 0
			);
			vi.mocked(db.reconciliationRecords.where).mockReturnValue({
				equals: vi.fn(() => ({
					and: vi.fn(() => ({
						reverse: vi.fn(() => ({
							sortBy: vi.fn(() =>
								Promise.resolve([
									{
										id: 'record-1',
										calculatedBalance: 1200,
										reconciledDate: '2024-01-15T10:00:00Z'
									}
								])
							)
						}))
					}))
				}))
			} as any);
			vi.mocked(db.reconciliationDiscrepancies.where).mockReturnValue({
				equals: vi.fn(() => ({
					and: vi.fn(() => ({
						toArray: vi.fn(() =>
							Promise.resolve([
								{ id: 'disc-1', resolvedAt: null },
								{ id: 'disc-2', resolvedAt: null },
								{ id: 'disc-3', resolvedAt: '2024-01-10T00:00:00Z' }
							])
						)
					}))
				}))
			} as any);
		});

		it('should return reconciliation summary', async () => {
			const summary = await reconciliationService.getReconciliationSummary('account-1');

			expect(summary).toMatchObject({
				accountId: 'account-1',
				accountName: 'Test Checking Account',
				currentBalance: 1250,
				lastReconciledBalance: 1200,
				totalDiscrepancies: 3,
				unresolvedDiscrepancies: 2
			});

			expect(summary.daysSinceLastReconciliation).toBeGreaterThan(0);
			expect(['good', 'warning', 'critical']).toContain(summary.reconciliationHealth);
		});

		it('should calculate health status correctly', async () => {
			// Mock account with old reconciliation date
			const oldAccount = {
				...mockAccount,
				metadata: {
					lastReconciledDate: '2023-01-01T00:00:00Z' // Very old
				}
			};
			vi.mocked(accountService.getAccount).mockResolvedValue(oldAccount);

			const summary = await reconciliationService.getReconciliationSummary('account-1');
			expect(summary.reconciliationHealth).toBe('critical');
		});

		it('should handle account with no reconciliation history', async () => {
			const accountWithoutHistory = {
				...mockAccount,
				metadata: undefined
			};
			vi.mocked(accountService.getAccount).mockResolvedValue(accountWithoutHistory);

			const summary = await reconciliationService.getReconciliationSummary('account-1');
			expect(summary.daysSinceLastReconciliation).toBe(-1);
			expect(summary.lastReconciledDate).toBeUndefined();
		});

		it('should throw error for non-existent account', async () => {
			vi.mocked(accountService.getAccount).mockResolvedValue(null);

			await expect(
				reconciliationService.getReconciliationSummary('non-existent')
			).rejects.toThrow('Account non-existent not found');
		});
	});

	describe('Discrepancy Management', () => {
		const mockDiscrepancies: ReconciliationDiscrepancy[] = [
			{
				id: 'disc-1',
				accountId: 'account-1',
				discrepancyType: 'amount_mismatch',
				amount: 25,
				description: 'Transaction amount incorrect',
				suggestedAction: 'modify_transaction',
				severity: 'medium',
				createdAt: '2024-01-15T10:00:00Z',
				updatedAt: '2024-01-15T10:00:00Z',
				deletedAt: null
			},
			{
				id: 'disc-2',
				accountId: 'account-1',
				discrepancyType: 'duplicate_transaction',
				amount: 50,
				description: 'Duplicate transaction detected',
				suggestedAction: 'modify_transaction',
				severity: 'high',
				createdAt: '2024-01-14T10:00:00Z',
				updatedAt: '2024-01-15T08:00:00Z',
				deletedAt: null,
				resolvedAt: '2024-01-15T08:00:00Z'
			}
		];

		beforeEach(() => {
			vi.mocked(db.reconciliationDiscrepancies.where).mockReturnValue({
				equals: vi.fn(() => ({
					and: vi.fn(() => ({
						reverse: vi.fn(() => ({
							sortBy: vi.fn(() => Promise.resolve(mockDiscrepancies))
						}))
					}))
				}))
			} as any);
		});

		it('should return account discrepancies', async () => {
			const discrepancies = await reconciliationService.getAccountDiscrepancies('account-1');

			expect(discrepancies).toHaveLength(2);
			expect(discrepancies[0]).toMatchObject({
				id: 'disc-1',
				discrepancyType: 'amount_mismatch'
			});
		});

		it('should resolve discrepancy', async () => {
			vi.mocked(db.reconciliationDiscrepancies.get).mockResolvedValue(mockDiscrepancies[0]);
			vi.mocked(db.reconciliationDiscrepancies.update).mockResolvedValue(1);

			await reconciliationService.resolveDiscrepancy('disc-1', 'User resolved manually');

			expect(db.reconciliationDiscrepancies.update).toHaveBeenCalledWith('disc-1', {
				resolvedAt: expect.any(String)
			});
		});

		it('should throw error when resolving non-existent discrepancy', async () => {
			vi.mocked(db.reconciliationDiscrepancies.get).mockResolvedValue(undefined);

			await expect(reconciliationService.resolveDiscrepancy('non-existent')).rejects.toThrow(
				'Discrepancy non-existent not found'
			);
		});
	});

	describe('Helper Methods', () => {
		beforeEach(() => {
			vi.mocked(accountService.getAccount).mockResolvedValue(mockAccount);
			vi.mocked(db.getTransactionsByAccount).mockResolvedValue(mockTransactions);
			vi.mocked(accountService.getTransactionImpact)
				.mockReturnValueOnce(500) // Income transaction
				.mockReturnValueOnce(-250); // Expense transaction
		});

		it('should calculate reconciliation balance without pending transactions', async () => {
			const balance = await (reconciliationService as any).calculateReconciliationBalance(
				'account-1',
				{ includePendingTransactions: false }
			);

			// Initial balance (1000) + income (500) - expense (250) = 1250
			// Pending transaction (-100) should not be included
			expect(accountService.recalculateAccountBalance).not.toHaveBeenCalled();
		});

		it('should include pending transactions when specified', async () => {
			vi.mocked(accountService.recalculateAccountBalance).mockResolvedValue(1150);

			const balance = await (reconciliationService as any).calculateReconciliationBalance(
				'account-1',
				{ includePendingTransactions: true }
			);

			expect(accountService.recalculateAccountBalance).toHaveBeenCalledWith('account-1');
			expect(balance).toBe(1150);
		});

		it('should correctly identify reconciled transactions', async () => {
			const clearedTransaction = mockTransactions[0]; // status: 'cleared'
			const pendingTransaction = mockTransactions[2]; // status: 'pending'

			const isCleared = (reconciliationService as any).isTransactionReconciled(
				clearedTransaction,
				{
					includePendingTransactions: false
				}
			);

			const isPending = (reconciliationService as any).isTransactionReconciled(
				pendingTransaction,
				{
					includePendingTransactions: false
				}
			);

			const isPendingIncluded = (reconciliationService as any).isTransactionReconciled(
				pendingTransaction,
				{ includePendingTransactions: true }
			);

			expect(isCleared).toBe(true);
			expect(isPending).toBe(false);
			expect(isPendingIncluded).toBe(true);
		});
	});

	describe('Form Validation', () => {
		it('should validate reconciliation options', async () => {
			// Test with invalid options
			const invalidOptions = {
				tolerance: -1, // Should be positive
				includePendingTransactions: 'yes' as any, // Should be boolean
				autoResolveThreshold: 0 // Should be positive
			};

			vi.mocked(accountService.getAccount).mockResolvedValue(mockAccount);

			await expect(
				reconciliationService.performReconciliation('account-1', 1250, invalidOptions)
			).rejects.toThrow();
		});

		it('should use default options when not provided', async () => {
			vi.mocked(accountService.getAccount).mockResolvedValue(mockAccount);
			vi.mocked(accountService.recalculateAccountBalance).mockResolvedValue(1250);
			vi.mocked(db.getTransactionsByAccount).mockResolvedValue([]);
			vi.mocked(db.reconciliationRecords.add).mockResolvedValue('record-1');

			const result = await reconciliationService.performReconciliation('account-1', 1250);

			expect(result).toBeDefined();
			expect(db.reconciliationRecords.add).toHaveBeenCalledWith(
				expect.objectContaining({
					accountId: 'account-1',
					statementBalance: 1250
				})
			);
		});
	});
});
