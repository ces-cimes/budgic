import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Transaction } from '$lib/core/db';

const { transactionStore, nextUuid } = vi.hoisted(() => {
	const transactionStore = new Map<string, Transaction>();
	let counter = 0;
	const nextUuid = () => `dep-test-uuid-${++counter}`;
	return { transactionStore, nextUuid };
});

vi.mock('$lib/core/db', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/core/db')>();
	return {
		...actual,
		db: {
			isOpen: () => true,
			transactions: {
				get: vi.fn(async (id: string) => transactionStore.get(id)),
				update: vi.fn(async (id: string, changes: Partial<Transaction>) => {
					const existing = transactionStore.get(id);
					if (!existing) return 0;
					transactionStore.set(id, {
						...existing,
						...changes,
						updatedAt: changes.updatedAt ?? new Date().toISOString()
					});
					return 1;
				}),
				bulkAdd: vi.fn(async (txs: Transaction[]) => {
					for (const tx of txs) {
						transactionStore.set(tx.id, { ...tx });
					}
				}),
				add: vi.fn(async (tx: Transaction) => {
					transactionStore.set(tx.id, { ...tx });
				}),
				delete: vi.fn(async (id: string) => {
					transactionStore.delete(id);
				}),
				filter: vi.fn((predicate: (tx: Transaction) => boolean) => ({
					toArray: vi.fn(async () =>
						Array.from(transactionStore.values()).filter((tx) => predicate(tx))
					)
				}))
			}
		},
		generateUUID: vi.fn(() => nextUuid())
	};
});

import { dependencyTrackingService } from './dependency-tracking-service';
import { db, generateUUID } from '$lib/core/db';

describe('DependencyTrackingService', () => {
	let testTransactions: Transaction[] = [];

	beforeEach(async () => {
		transactionStore.clear();

		// Create test transactions
		const tx1: Transaction = {
			id: generateUUID(),
			type: 'expense',
			status: 'planned',
			accountId: 'test-account-1',
			amount: -100,
			currency: 'USD',
			description: 'Transaction 1',
			plannedDate: new Date('2024-01-15').toISOString(),
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			deletedAt: null
		};

		const tx2: Transaction = {
			id: generateUUID(),
			type: 'expense',
			status: 'planned',
			accountId: 'test-account-1',
			amount: -200,
			currency: 'USD',
			description: 'Transaction 2',
			plannedDate: new Date('2024-01-20').toISOString(),
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			deletedAt: null
		};

		const tx3: Transaction = {
			id: generateUUID(),
			type: 'expense',
			status: 'planned',
			accountId: 'test-account-1',
			amount: -300,
			currency: 'USD',
			description: 'Transaction 3',
			plannedDate: new Date('2024-01-25').toISOString(),
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			deletedAt: null
		};

		await db.transactions.bulkAdd([tx1, tx2, tx3]);
		testTransactions = [tx1, tx2, tx3];
	});

	afterEach(() => {
		transactionStore.clear();
		testTransactions = [];
	});

	describe('addDependency', () => {
		it('should add a dependency between two transactions', async () => {
			const [tx1, tx2] = testTransactions;

			await dependencyTrackingService.addDependency(tx2.id, tx1.id, 'required');

			const dependencies = await dependencyTrackingService.getDependencies(tx2.id);
			expect(dependencies).toHaveLength(1);
			expect(dependencies[0].transactionId).toBe(tx2.id);
			expect(dependencies[0].dependsOnId).toBe(tx1.id);
			expect(dependencies[0].type).toBe('required');
		});

		it('should prevent self-dependency', async () => {
			const [tx1] = testTransactions;

			await expect(dependencyTrackingService.addDependency(tx1.id, tx1.id)).rejects.toThrow(
				'Transaction cannot depend on itself'
			);
		});

		it('should prevent circular dependencies', async () => {
			const [tx1, tx2, tx3] = testTransactions;

			// Create chain: tx3 -> tx2 -> tx1
			await dependencyTrackingService.addDependency(tx3.id, tx2.id);
			await dependencyTrackingService.addDependency(tx2.id, tx1.id);

			// Try to create circular dependency: tx1 -> tx3
			await expect(dependencyTrackingService.addDependency(tx1.id, tx3.id)).rejects.toThrow(
				'circular dependency'
			);
		});

		it('should update existing dependency type', async () => {
			const [tx1, tx2] = testTransactions;

			await dependencyTrackingService.addDependency(tx2.id, tx1.id, 'required');
			await dependencyTrackingService.addDependency(tx2.id, tx1.id, 'suggested');

			const dependencies = await dependencyTrackingService.getDependencies(tx2.id);
			expect(dependencies).toHaveLength(1);
			expect(dependencies[0].type).toBe('suggested');
		});

		it('should throw error if transaction not found', async () => {
			const [tx1] = testTransactions;
			const nonExistentId = generateUUID();

			await expect(
				dependencyTrackingService.addDependency(nonExistentId, tx1.id)
			).rejects.toThrow('not found');
		});

		it('should add metadata to dependency', async () => {
			const [tx1, tx2] = testTransactions;
			const metadata = { reason: 'Payment must be processed first', priority: 'high' };

			await dependencyTrackingService.addDependency(tx2.id, tx1.id, 'required', metadata);

			const dependencies = await dependencyTrackingService.getDependencies(tx2.id);
			expect(dependencies[0].metadata).toEqual(metadata);
		});
	});

	describe('removeDependency', () => {
		it('should remove a dependency', async () => {
			const [tx1, tx2] = testTransactions;

			await dependencyTrackingService.addDependency(tx2.id, tx1.id);
			await dependencyTrackingService.removeDependency(tx2.id, tx1.id);

			const dependencies = await dependencyTrackingService.getDependencies(tx2.id);
			expect(dependencies).toHaveLength(0);
		});

		it('should handle removing non-existent dependency', async () => {
			const [tx1, tx2] = testTransactions;

			await expect(
				dependencyTrackingService.removeDependency(tx2.id, tx1.id)
			).resolves.not.toThrow();
		});
	});

	describe('getDependencies', () => {
		it('should get all dependencies for a transaction', async () => {
			const [tx1, tx2, tx3] = testTransactions;

			await dependencyTrackingService.addDependency(tx3.id, tx1.id, 'required');
			await dependencyTrackingService.addDependency(tx3.id, tx2.id, 'suggested');

			const dependencies = await dependencyTrackingService.getDependencies(tx3.id);
			expect(dependencies).toHaveLength(2);
			expect(dependencies.map((d) => d.dependsOnId)).toContain(tx1.id);
			expect(dependencies.map((d) => d.dependsOnId)).toContain(tx2.id);
		});

		it('should return empty array for transaction with no dependencies', async () => {
			const [tx1] = testTransactions;

			const dependencies = await dependencyTrackingService.getDependencies(tx1.id);
			expect(dependencies).toHaveLength(0);
		});
	});

	describe('getDependents', () => {
		it('should get all transactions that depend on this transaction', async () => {
			const [tx1, tx2, tx3] = testTransactions;

			await dependencyTrackingService.addDependency(tx2.id, tx1.id);
			await dependencyTrackingService.addDependency(tx3.id, tx1.id);

			const dependents = await dependencyTrackingService.getDependents(tx1.id);
			expect(dependents).toHaveLength(2);
			expect(dependents.map((d) => d.transactionId)).toContain(tx2.id);
			expect(dependents.map((d) => d.transactionId)).toContain(tx3.id);
		});

		it('should return empty array for transaction with no dependents', async () => {
			const [tx3] = testTransactions;

			const dependents = await dependencyTrackingService.getDependents(tx3.id);
			expect(dependents).toHaveLength(0);
		});
	});

	describe('clearDependencies', () => {
		it('should remove all dependencies from a transaction', async () => {
			const [tx1, tx2, tx3] = testTransactions;

			await dependencyTrackingService.addDependency(tx3.id, tx1.id);
			await dependencyTrackingService.addDependency(tx3.id, tx2.id);
			await dependencyTrackingService.clearDependencies(tx3.id);

			const dependencies = await dependencyTrackingService.getDependencies(tx3.id);
			expect(dependencies).toHaveLength(0);
		});
	});

	describe('clearDependents', () => {
		it('should remove all dependents from a transaction', async () => {
			const [tx1, tx2, tx3] = testTransactions;

			await dependencyTrackingService.addDependency(tx2.id, tx1.id);
			await dependencyTrackingService.addDependency(tx3.id, tx1.id);
			await dependencyTrackingService.clearDependents(tx1.id);

			const dependents = await dependencyTrackingService.getDependents(tx1.id);
			expect(dependents).toHaveLength(0);
		});
	});

	describe('validateDependencyGraph', () => {
		it('should validate a valid dependency graph', async () => {
			const [tx1, tx2, tx3] = testTransactions;

			// Create valid chain: tx3 -> tx2 -> tx1
			await dependencyTrackingService.addDependency(tx3.id, tx2.id);
			await dependencyTrackingService.addDependency(tx2.id, tx1.id);

			const validation = await dependencyTrackingService.validateDependencyGraph(tx3.id);
			expect(validation.isValid).toBe(true);
			expect(validation.errors).toHaveLength(0);
		});

		it('should detect missing dependency transactions', async () => {
			const [tx1] = testTransactions;
			const nonExistentId = generateUUID();

			// Manually add a dependency to a non-existent transaction
			await db.transactions.update(tx1.id, {
				dependencies: [nonExistentId]
			});

			const validation = await dependencyTrackingService.validateDependencyGraph(tx1.id);
			expect(validation.isValid).toBe(false);
			expect(validation.errors.some((e) => e.includes('not found'))).toBe(true);
		});

		it('should warn about date conflicts', async () => {
			const [tx1, tx2] = testTransactions;

			// tx1 is scheduled after tx2, but tx2 depends on tx1 (wrong order)
			await dependencyTrackingService.addDependency(tx1.id, tx2.id);

			const validation = await dependencyTrackingService.validateDependencyGraph(tx1.id);
			expect(validation.warnings.length).toBeGreaterThan(0);
		});

		it('should warn about deep dependency chains', async () => {
			// Create a deep chain (6 transactions)
			const deepChain = [];
			for (let i = 0; i < 6; i++) {
				const tx: Transaction = {
					id: generateUUID(),
					type: 'expense',
					status: 'planned',
					accountId: 'test-account-1',
					amount: -100,
					currency: 'USD',
					description: `Deep Transaction ${i}`,
					plannedDate: new Date(`2024-01-${10 + i}`).toISOString(),
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					deletedAt: null
				};
				await db.transactions.add(tx);
				deepChain.push(tx);
			}

			// Create chain
			for (let i = 1; i < deepChain.length; i++) {
				await dependencyTrackingService.addDependency(deepChain[i].id, deepChain[i - 1].id);
			}

			const validation = await dependencyTrackingService.validateDependencyGraph(
				deepChain[deepChain.length - 1].id
			);
			expect(validation.warnings.some((w) => w.includes('deep'))).toBe(true);

			// Cleanup
			for (const tx of deepChain) {
				await db.transactions.delete(tx.id);
			}
		});
	});

	describe('detectCircularDependencies', () => {
		it('should detect simple circular dependency', async () => {
			const [tx1, tx2] = testTransactions;

			// Manually create circular dependency (bypass validation)
			await db.transactions.update(tx1.id, { dependencies: [tx2.id] });
			await db.transactions.update(tx2.id, { dependencies: [tx1.id] });

			const cycles = await dependencyTrackingService.detectCircularDependencies(tx1.id);
			expect(cycles).not.toBeNull();
			expect(cycles!.length).toBeGreaterThan(0);
		});

		it('should detect complex circular dependency', async () => {
			const [tx1, tx2, tx3] = testTransactions;

			// Manually create circular dependency: tx1 -> tx2 -> tx3 -> tx1
			await db.transactions.update(tx1.id, { dependencies: [tx2.id] });
			await db.transactions.update(tx2.id, { dependencies: [tx3.id] });
			await db.transactions.update(tx3.id, { dependencies: [tx1.id] });

			const cycles = await dependencyTrackingService.detectCircularDependencies(tx1.id);
			expect(cycles).not.toBeNull();
			expect(cycles!.length).toBeGreaterThan(0);
		});

		it('should return null for no circular dependencies', async () => {
			const [tx1, tx2, tx3] = testTransactions;

			// Create valid chain
			await dependencyTrackingService.addDependency(tx3.id, tx2.id);
			await dependencyTrackingService.addDependency(tx2.id, tx1.id);

			const cycles = await dependencyTrackingService.detectCircularDependencies(tx3.id);
			expect(cycles).toBeNull();
		});
	});

	describe('getDependencyChain', () => {
		it('should get complete dependency chain', async () => {
			const [tx1, tx2, tx3] = testTransactions;

			// Create chain: tx3 -> tx2 -> tx1
			await dependencyTrackingService.addDependency(tx3.id, tx2.id);
			await dependencyTrackingService.addDependency(tx2.id, tx1.id);

			const chain = await dependencyTrackingService.getDependencyChain(tx3.id);
			expect(chain.totalDependencies).toBe(2);
			expect(chain.dependencies.map((d) => d.id)).toContain(tx1.id);
			expect(chain.dependencies.map((d) => d.id)).toContain(tx2.id);
			expect(chain.maxDepth).toBe(3);
		});

		it('should get dependents in chain', async () => {
			const [tx1, tx2, tx3] = testTransactions;

			// Create chain: tx1 <- tx2 <- tx3
			await dependencyTrackingService.addDependency(tx2.id, tx1.id);
			await dependencyTrackingService.addDependency(tx3.id, tx2.id);

			const chain = await dependencyTrackingService.getDependencyChain(tx1.id);
			expect(chain.totalDependents).toBe(2);
			expect(chain.dependents.map((d) => d.id)).toContain(tx2.id);
			expect(chain.dependents.map((d) => d.id)).toContain(tx3.id);
		});
	});

	describe('getTopologicalOrder', () => {
		it('should return transactions in topological order', async () => {
			const [tx1, tx2, tx3] = testTransactions;

			// Create dependencies: tx3 -> tx2 -> tx1
			await dependencyTrackingService.addDependency(tx3.id, tx2.id);
			await dependencyTrackingService.addDependency(tx2.id, tx1.id);

			const order = await dependencyTrackingService.getTopologicalOrder([
				tx1.id,
				tx2.id,
				tx3.id
			]);

			// tx1 should come before tx2, tx2 before tx3
			expect(order.indexOf(tx1.id)).toBeLessThan(order.indexOf(tx2.id));
			expect(order.indexOf(tx2.id)).toBeLessThan(order.indexOf(tx3.id));
		});

		it('should throw error for circular dependencies', async () => {
			const [tx1, tx2] = testTransactions;

			// Manually create circular dependency
			await db.transactions.update(tx1.id, { dependencies: [tx2.id] });
			await db.transactions.update(tx2.id, { dependencies: [tx1.id] });

			await expect(
				dependencyTrackingService.getTopologicalOrder([tx1.id, tx2.id])
			).rejects.toThrow('circular dependencies');
		});

		it('should handle transactions with no dependencies', async () => {
			const [tx1, tx2, tx3] = testTransactions;

			const order = await dependencyTrackingService.getTopologicalOrder([
				tx1.id,
				tx2.id,
				tx3.id
			]);

			expect(order).toHaveLength(3);
			expect(order).toContain(tx1.id);
			expect(order).toContain(tx2.id);
			expect(order).toContain(tx3.id);
		});
	});

	describe('canAddDependency', () => {
		it('should allow valid dependency', async () => {
			const [tx1, tx2] = testTransactions;

			const result = await dependencyTrackingService.canAddDependency(tx2.id, tx1.id);
			expect(result.canAdd).toBe(true);
		});

		it('should prevent self-dependency', async () => {
			const [tx1] = testTransactions;

			const result = await dependencyTrackingService.canAddDependency(tx1.id, tx1.id);
			expect(result.canAdd).toBe(false);
			expect(result.reason).toContain('itself');
		});

		it('should prevent circular dependency', async () => {
			const [tx1, tx2] = testTransactions;

			await dependencyTrackingService.addDependency(tx2.id, tx1.id);

			const result = await dependencyTrackingService.canAddDependency(tx1.id, tx2.id);
			expect(result.canAdd).toBe(false);
			expect(result.reason).toContain('circular');
		});

		it('should check transaction existence', async () => {
			const [tx1] = testTransactions;
			const nonExistentId = generateUUID();

			const result = await dependencyTrackingService.canAddDependency(tx1.id, nonExistentId);
			expect(result.canAdd).toBe(false);
			expect(result.reason).toContain('not found');
		});
	});

	describe('getDependencyStatistics', () => {
		it('should calculate dependency statistics', async () => {
			const [tx1, tx2, tx3] = testTransactions;

			// Create dependencies
			await dependencyTrackingService.addDependency(tx3.id, tx2.id);
			await dependencyTrackingService.addDependency(tx2.id, tx1.id);
			await dependencyTrackingService.addDependency(tx3.id, tx1.id);

			const stats = await dependencyTrackingService.getDependencyStatistics();
			expect(stats.totalTransactionsWithDependencies).toBe(2); // tx2 and tx3
			expect(stats.totalDependencyRelationships).toBe(3);
			expect(stats.maxDependencyChainLength).toBeGreaterThan(0);
		});

		it('should return zero statistics for no dependencies', async () => {
			const stats = await dependencyTrackingService.getDependencyStatistics();
			expect(stats.totalTransactionsWithDependencies).toBe(0);
			expect(stats.totalDependencyRelationships).toBe(0);
		});
	});

	describe('validateAllDependencyGraphs', () => {
		it('should validate all dependency graphs', async () => {
			const [tx1, tx2, tx3] = testTransactions;

			// Create valid dependencies
			await dependencyTrackingService.addDependency(tx3.id, tx2.id);
			await dependencyTrackingService.addDependency(tx2.id, tx1.id);

			const result = await dependencyTrackingService.validateAllDependencyGraphs();
			expect(result.isValid).toBe(true);
			expect(result.invalidTransactions).toBe(0);
		});

		it('should detect invalid graphs', async () => {
			const [tx1] = testTransactions;
			const nonExistentId = generateUUID();

			// Create invalid dependency
			await db.transactions.update(tx1.id, {
				dependencies: [nonExistentId]
			});

			const result = await dependencyTrackingService.validateAllDependencyGraphs();
			expect(result.isValid).toBe(false);
			expect(result.invalidTransactions).toBeGreaterThan(0);
			expect(result.errors.length).toBeGreaterThan(0);
		});
	});

	describe('getTransactionsWithDependencies', () => {
		it('should get all transactions with dependencies', async () => {
			const [tx1, tx2, tx3] = testTransactions;

			await dependencyTrackingService.addDependency(tx3.id, tx2.id);
			await dependencyTrackingService.addDependency(tx2.id, tx1.id);

			const transactions = await dependencyTrackingService.getTransactionsWithDependencies();
			expect(transactions.length).toBeGreaterThanOrEqual(2);
			expect(transactions.map((t) => t.id)).toContain(tx2.id);
			expect(transactions.map((t) => t.id)).toContain(tx3.id);
		});

		it('should exclude deleted transactions', async () => {
			const [tx1, tx2] = testTransactions;

			await dependencyTrackingService.addDependency(tx2.id, tx1.id);
			await db.transactions.update(tx2.id, { deletedAt: new Date().toISOString() });

			const transactions = await dependencyTrackingService.getTransactionsWithDependencies();
			expect(transactions.map((t) => t.id)).not.toContain(tx2.id);
		});
	});

	describe('Edge Cases', () => {
		it('should handle multiple dependencies of different types', async () => {
			const [tx1, tx2, tx3] = testTransactions;

			await dependencyTrackingService.addDependency(tx3.id, tx1.id, 'required');
			await dependencyTrackingService.addDependency(tx3.id, tx2.id, 'suggested');

			const dependencies = await dependencyTrackingService.getDependencies(tx3.id);
			expect(dependencies).toHaveLength(2);

			const requiredDep = dependencies.find((d) => d.dependsOnId === tx1.id);
			const suggestedDep = dependencies.find((d) => d.dependsOnId === tx2.id);

			expect(requiredDep?.type).toBe('required');
			expect(suggestedDep?.type).toBe('suggested');
		});

		it('should handle diamond dependency pattern', async () => {
			const [tx1, tx2, tx3] = testTransactions;
			const tx4: Transaction = {
				id: generateUUID(),
				type: 'expense',
				status: 'planned',
				accountId: 'test-account-1',
				amount: -400,
				currency: 'USD',
				description: 'Transaction 4',
				plannedDate: new Date('2024-01-30').toISOString(),
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				deletedAt: null
			};
			await db.transactions.add(tx4);

			// Diamond: tx4 depends on tx2 and tx3, both depend on tx1
			await dependencyTrackingService.addDependency(tx2.id, tx1.id);
			await dependencyTrackingService.addDependency(tx3.id, tx1.id);
			await dependencyTrackingService.addDependency(tx4.id, tx2.id);
			await dependencyTrackingService.addDependency(tx4.id, tx3.id);

			const chain = await dependencyTrackingService.getDependencyChain(tx4.id);
			expect(chain.totalDependencies).toBe(4);

			// Cleanup
			await db.transactions.delete(tx4.id);
		});
	});
});
