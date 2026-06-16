/**
 * Dependency Tracking Service
 *
 * Manages transaction dependencies for optimization algorithm.
 * Provides dependency graph validation, circular dependency detection,
 * and dependency chain analysis.
 */

import { db } from '$lib/core/db';
import type { Transaction } from '$lib/core/db';
import { transactionService } from './transaction-service';

export interface DependencyRelationship {
	transactionId: string;
	dependsOnId: string;
	type: 'required' | 'suggested' | 'blocking' | 'sequential' | 'conditional';
	metadata?: Record<string, any>;
}

export interface DependencyValidationResult {
	isValid: boolean;
	errors: string[];
	warnings: string[];
	cycles?: string[][];
}

export interface DependencyChain {
	transactionId: string;
	dependencies: Array<{
		id: string;
		type: string;
		depth: number;
		transaction: Transaction;
	}>;
	dependents: Array<{
		id: string;
		type: string;
		depth: number;
		transaction: Transaction;
	}>;
	totalDependencies: number;
	totalDependents: number;
	maxDepth: number;
}

class DependencyTrackingService {
	public get ready() {
		return db.isOpen();
	}

	public isLoading() {
		return !this.ready;
	}

	// ============================================================================
	// DEPENDENCY MANAGEMENT
	// ============================================================================

	/**
	 * Add a dependency relationship between two transactions
	 */
	async addDependency(
		transactionId: string,
		dependsOnId: string,
		type: DependencyRelationship['type'] = 'required',
		metadata?: Record<string, any>
	): Promise<void> {
		// Validate transactions exist
		const transaction = await db.transactions.get(transactionId);
		const dependsOn = await db.transactions.get(dependsOnId);

		if (!transaction) {
			throw new Error(`Transaction ${transactionId} not found`);
		}

		if (!dependsOn) {
			throw new Error(`Dependency transaction ${dependsOnId} not found`);
		}

		// Prevent self-dependency
		if (transactionId === dependsOnId) {
			throw new Error('Transaction cannot depend on itself');
		}

		// Check for circular dependencies before adding
		const wouldCreateCycle = await this.wouldCreateCycle(transactionId, dependsOnId);
		if (wouldCreateCycle) {
			throw new Error(
				`Adding dependency would create a circular dependency: ${transactionId} -> ${dependsOnId}`
			);
		}

		// Get existing dependencies
		const dependencies = transaction.dependencies || [];
		const dependencyMetadata = transaction.dependencyMetadata || {};

		// Check if dependency already exists
		if (dependencies.includes(dependsOnId)) {
			// Update type and metadata
			dependencyMetadata[dependsOnId] = { type, metadata };
			await db.transactions.update(transactionId, {
				dependencyType: type,
				dependencyMetadata,
				updatedAt: new Date().toISOString()
			});
			return;
		}

		// Add new dependency
		dependencies.push(dependsOnId);
		dependencyMetadata[dependsOnId] = { type, metadata };

		await db.transactions.update(transactionId, {
			dependencies,
			dependencyType: type,
			dependencyMetadata,
			updatedAt: new Date().toISOString()
		});
	}

	/**
	 * Remove a dependency relationship
	 */
	async removeDependency(transactionId: string, dependsOnId: string): Promise<void> {
		const transaction = await db.transactions.get(transactionId);

		if (!transaction) {
			throw new Error(`Transaction ${transactionId} not found`);
		}

		const dependencies = transaction.dependencies || [];
		const dependencyMetadata = transaction.dependencyMetadata || {};

		// Remove dependency
		const updatedDependencies = dependencies.filter((id) => id !== dependsOnId);

		// Remove metadata
		delete dependencyMetadata[dependsOnId];

		await db.transactions.update(transactionId, {
			dependencies: updatedDependencies,
			dependencyMetadata,
			updatedAt: new Date().toISOString()
		});
	}

	/**
	 * Get all transactions that this transaction depends on
	 */
	async getDependencies(transactionId: string): Promise<DependencyRelationship[]> {
		const transaction = await db.transactions.get(transactionId);

		if (!transaction) {
			throw new Error(`Transaction ${transactionId} not found`);
		}

		const dependencies = transaction.dependencies || [];
		const dependencyMetadata = transaction.dependencyMetadata || {};

		return dependencies.map((dependsOnId) => {
			const metadata = dependencyMetadata[dependsOnId] || {};
			return {
				transactionId,
				dependsOnId,
				type: metadata.type || transaction.dependencyType || 'required',
				metadata: metadata.metadata
			};
		});
	}

	/**
	 * Get all transactions that depend on this transaction
	 */
	async getDependents(transactionId: string): Promise<DependencyRelationship[]> {
		const allTransactions = await db.transactions
			.filter((tx) => !tx.deletedAt && (tx.dependencies?.length ?? 0) > 0)
			.toArray();

		const dependents: DependencyRelationship[] = [];

		for (const tx of allTransactions) {
			const dependencies = tx.dependencies || [];
			if (dependencies.includes(transactionId)) {
				const dependencyMetadata = tx.dependencyMetadata || {};
				const metadata = dependencyMetadata[transactionId] || {};
				dependents.push({
					transactionId: tx.id,
					dependsOnId: transactionId,
					type: metadata.type || tx.dependencyType || 'required',
					metadata: metadata.metadata
				});
			}
		}

		return dependents;
	}

	/**
	 * Remove all dependencies from a transaction
	 */
	async clearDependencies(transactionId: string): Promise<void> {
		await db.transactions.update(transactionId, {
			dependencies: [],
			dependencyMetadata: {},
			updatedAt: new Date().toISOString()
		});
	}

	/**
	 * Remove all dependents (transactions that depend on this one)
	 */
	async clearDependents(transactionId: string): Promise<void> {
		const dependents = await this.getDependents(transactionId);

		for (const dependent of dependents) {
			await this.removeDependency(dependent.transactionId, transactionId);
		}
	}

	// ============================================================================
	// GRAPH VALIDATION
	// ============================================================================

	/**
	 * Validate the dependency graph for a transaction
	 */
	async validateDependencyGraph(transactionId: string): Promise<DependencyValidationResult> {
		const errors: string[] = [];
		const warnings: string[] = [];

		const transaction = await db.transactions.get(transactionId);

		if (!transaction) {
			return {
				isValid: false,
				errors: [`Transaction ${transactionId} not found`],
				warnings: []
			};
		}

		// Check for circular dependencies
		const cycles = await this.findAllCycles(transactionId);
		if (cycles.length > 0) {
			errors.push(`Found ${cycles.length} circular dependency cycle(s)`);
		}

		// Check if all dependency transactions exist
		const dependencies = transaction.dependencies || [];
		for (const dependsOnId of dependencies) {
			const dependsOn = await db.transactions.get(dependsOnId);
			if (!dependsOn) {
				errors.push(`Dependency transaction ${dependsOnId} not found`);
			} else if (dependsOn.deletedAt) {
				warnings.push(`Dependency transaction ${dependsOnId} is deleted`);
			}
		}

		// Check for date conflicts
		if (transaction.plannedDate) {
			for (const dependsOnId of dependencies) {
				const dependsOn = await db.transactions.get(dependsOnId);
				if (dependsOn?.plannedDate) {
					const txDate = new Date(transaction.plannedDate);
					const depDate = new Date(dependsOn.plannedDate);
					if (txDate < depDate) {
						warnings.push(
							`Transaction is scheduled before its dependency ${dependsOnId}`
						);
					}
				}
			}
		}

		// Check for dependency depth (warn if too deep)
		const chain = await this.getDependencyChain(transactionId);
		if (chain.maxDepth > 5) {
			warnings.push(`Dependency chain is very deep (${chain.maxDepth} levels)`);
		}

		return {
			isValid: errors.length === 0,
			errors,
			warnings,
			cycles: cycles.length > 0 ? cycles : undefined
		};
	}

	/**
	 * Check if adding a dependency would create a cycle
	 */
	private async wouldCreateCycle(transactionId: string, dependsOnId: string): Promise<boolean> {
		// If dependsOn has a path back to transaction, adding this dependency would create a cycle
		const visited = new Set<string>();
		const queue: string[] = [dependsOnId];

		while (queue.length > 0) {
			const currentId = queue.shift()!;

			if (currentId === transactionId) {
				return true; // Found a path back to the original transaction
			}

			if (visited.has(currentId)) {
				continue;
			}

			visited.add(currentId);

			const current = await db.transactions.get(currentId);
			const dependencies = current?.dependencies || [];

			for (const depId of dependencies) {
				if (!visited.has(depId)) {
					queue.push(depId);
				}
			}
		}

		return false;
	}

	/**
	 * Detect circular dependencies starting from a transaction
	 */
	async detectCircularDependencies(transactionId: string): Promise<string[][] | null> {
		const cycles = await this.findAllCycles(transactionId);
		return cycles.length > 0 ? cycles : null;
	}

	/**
	 * Find all cycles in the dependency graph starting from a transaction
	 */
	private async findAllCycles(startId: string): Promise<string[][]> {
		const cycles: string[][] = [];
		const visited = new Set<string>();
		const recursionStack = new Set<string>();
		const path: string[] = [];

		const dfs = async (currentId: string): Promise<void> => {
			// Check if transaction exists before processing
			const current = await db.transactions.get(currentId);
			if (!current) {
				console.warn(
					'[DependencyTracking] Transaction not found in cycle detection:',
					currentId
				);
				return; // Skip if transaction doesn't exist
			}

			visited.add(currentId);
			recursionStack.add(currentId);
			path.push(currentId);

			const dependencies = current.dependencies || [];

			for (const depId of dependencies) {
				if (!depId) continue; // Skip invalid dependency IDs

				if (!visited.has(depId)) {
					await dfs(depId);
				} else if (recursionStack.has(depId)) {
					// Found a cycle
					const cycleStartIndex = path.indexOf(depId);
					const cycle = path.slice(cycleStartIndex);
					cycle.push(depId); // Complete the cycle
					cycles.push(cycle);
				}
			}

			path.pop();
			recursionStack.delete(currentId);
		};

		await dfs(startId);
		return cycles;
	}

	// ============================================================================
	// DEPENDENCY ANALYSIS
	// ============================================================================

	/**
	 * Get the complete dependency chain for a transaction
	 */
	async getDependencyChain(transactionId: string): Promise<DependencyChain> {
		const transaction = await db.transactions.get(transactionId);

		if (!transaction) {
			throw new Error(`Transaction ${transactionId} not found`);
		}

		const dependencies: DependencyChain['dependencies'] = [];
		const dependents: DependencyChain['dependents'] = [];
		let maxDepth = 0;

		// Get all dependencies recursively
		const getDepsRecursive = async (txId: string, depth: number, visited: Set<string>) => {
			if (visited.has(txId)) return; // Prevent infinite loops
			visited.add(txId);

			const deps = await this.getDependencies(txId);
			maxDepth = Math.max(maxDepth, depth);

			for (const dep of deps) {
				const depTx = await db.transactions.get(dep.dependsOnId);
				if (depTx) {
					dependencies.push({
						id: dep.dependsOnId,
						type: dep.type,
						depth,
						transaction: depTx
					});
					await getDepsRecursive(dep.dependsOnId, depth + 1, visited);
				}
			}
		};

		// Get all dependents recursively
		const getDependentsRecursive = async (
			txId: string,
			depth: number,
			visited: Set<string>
		) => {
			if (visited.has(txId)) return; // Prevent infinite loops
			visited.add(txId);

			const deps = await this.getDependents(txId);
			maxDepth = Math.max(maxDepth, depth);

			for (const dep of deps) {
				const depTx = await db.transactions.get(dep.transactionId);
				if (depTx) {
					dependents.push({
						id: dep.transactionId,
						type: dep.type,
						depth,
						transaction: depTx
					});
					await getDependentsRecursive(dep.transactionId, depth + 1, visited);
				}
			}
		};

		await getDepsRecursive(transactionId, 1, new Set());
		await getDependentsRecursive(transactionId, 1, new Set());

		return {
			transactionId,
			dependencies,
			dependents,
			totalDependencies: dependencies.length,
			totalDependents: dependents.length,
			maxDepth
		};
	}

	/**
	 * Get topological order for a set of transactions
	 * Returns transactions in an order that respects all dependencies
	 */
	async getTopologicalOrder(transactionIds: string[]): Promise<string[]> {
		const inDegree = new Map<string, number>();
		const adjList = new Map<string, string[]>();

		// Initialize
		for (const id of transactionIds) {
			inDegree.set(id, 0);
			adjList.set(id, []);
		}

		// Build graph
		for (const id of transactionIds) {
			const transaction = await db.transactions.get(id);
			const dependencies = transaction?.dependencies || [];

			for (const depId of dependencies) {
				if (transactionIds.includes(depId)) {
					adjList.get(depId)?.push(id);
					inDegree.set(id, (inDegree.get(id) || 0) + 1);
				}
			}
		}

		// Kahn's algorithm for topological sort
		const queue: string[] = [];
		const result: string[] = [];

		// Find all nodes with no incoming edges
		for (const [id, degree] of inDegree.entries()) {
			if (degree === 0) {
				queue.push(id);
			}
		}

		while (queue.length > 0) {
			const current = queue.shift()!;
			result.push(current);

			const neighbors = adjList.get(current) || [];
			for (const neighbor of neighbors) {
				const newDegree = (inDegree.get(neighbor) || 0) - 1;
				inDegree.set(neighbor, newDegree);

				if (newDegree === 0) {
					queue.push(neighbor);
				}
			}
		}

		// Check for cycles
		if (result.length !== transactionIds.length) {
			throw new Error('Cannot create topological order: circular dependencies detected');
		}

		return result;
	}

	/**
	 * Check if a dependency can be safely added
	 */
	async canAddDependency(
		transactionId: string,
		dependsOnId: string
	): Promise<{
		canAdd: boolean;
		reason?: string;
	}> {
		// Check if transactions exist
		const transaction = await db.transactions.get(transactionId);
		const dependsOn = await db.transactions.get(dependsOnId);

		if (!transaction) {
			return { canAdd: false, reason: 'Transaction not found' };
		}

		if (!dependsOn) {
			return { canAdd: false, reason: 'Dependency transaction not found' };
		}

		// Check for self-dependency
		if (transactionId === dependsOnId) {
			return { canAdd: false, reason: 'Transaction cannot depend on itself' };
		}

		// Check for circular dependency
		const wouldCreateCycle = await this.wouldCreateCycle(transactionId, dependsOnId);
		if (wouldCreateCycle) {
			return { canAdd: false, reason: 'Would create circular dependency' };
		}

		// Check if transactions are in the same account (warning, not blocking)
		if (transaction.accountId !== dependsOn.accountId) {
			// This is allowed but might be noteworthy
		}

		return { canAdd: true };
	}

	/**
	 * Get all transactions with dependencies
	 */
	async getTransactionsWithDependencies(): Promise<Transaction[]> {
		return await db.transactions
			.filter((tx) => !tx.deletedAt && (tx.dependencies?.length ?? 0) > 0)
			.toArray();
	}

	/**
	 * Get dependency statistics
	 */
	async getDependencyStatistics(): Promise<{
		totalTransactionsWithDependencies: number;
		totalDependencyRelationships: number;
		averageDependenciesPerTransaction: number;
		maxDependencyChainLength: number;
		circularDependencies: number;
	}> {
		const transactionsWithDeps = await this.getTransactionsWithDependencies();
		let totalRelationships = 0;
		let maxChainLength = 0;
		let circularDeps = 0;

		for (const tx of transactionsWithDeps) {
			const depCount = tx.dependencies?.length || 0;
			totalRelationships += depCount;

			const chain = await this.getDependencyChain(tx.id);
			maxChainLength = Math.max(maxChainLength, chain.maxDepth);

			const cycles = await this.detectCircularDependencies(tx.id);
			if (cycles && cycles.length > 0) {
				circularDeps++;
			}
		}

		return {
			totalTransactionsWithDependencies: transactionsWithDeps.length,
			totalDependencyRelationships: totalRelationships,
			averageDependenciesPerTransaction:
				transactionsWithDeps.length > 0
					? totalRelationships / transactionsWithDeps.length
					: 0,
			maxDependencyChainLength: maxChainLength,
			circularDependencies: circularDeps
		};
	}

	/**
	 * Validate all dependency graphs in the database
	 */
	async validateAllDependencyGraphs(): Promise<{
		isValid: boolean;
		totalTransactions: number;
		validTransactions: number;
		invalidTransactions: number;
		errors: Array<{ transactionId: string; errors: string[] }>;
	}> {
		const transactionsWithDeps = await this.getTransactionsWithDependencies();
		const errors: Array<{ transactionId: string; errors: string[] }> = [];

		for (const tx of transactionsWithDeps) {
			const validation = await this.validateDependencyGraph(tx.id);
			if (!validation.isValid) {
				errors.push({
					transactionId: tx.id,
					errors: validation.errors
				});
			}
		}

		return {
			isValid: errors.length === 0,
			totalTransactions: transactionsWithDeps.length,
			validTransactions: transactionsWithDeps.length - errors.length,
			invalidTransactions: errors.length,
			errors
		};
	}
}

export const dependencyTrackingService = new DependencyTrackingService();
