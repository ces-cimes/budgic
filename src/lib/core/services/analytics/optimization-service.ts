/**
 * Transaction Optimization Service
 * 
 * Implements the core transaction optimization algorithm that analyzes planned transactions,
 * account limits, and spending patterns to help users avoid overdrafts, minimize fees,
 * optimize credit utilization, and maintain financial stability.
 * 
 * Features:
 * - Constraint satisfaction engine (hard/soft constraints)
 * - Transaction scheduling optimizer with simulated annealing
 * - Multi-account optimization
 * - Dependency-aware optimization
 * - Fee avoidance integration
 * - Balance projection integration
 * - Optimization history and comparison
 */

import { db, generateUUID, calculateTransactionImpact } from '$lib/core/db';
import type { Account, Transaction, FlexibilityTier } from '$lib/core/db';
import { accountService } from '../core/account-service';
import { transactionService } from '../core/transaction-service';
import { dependencyTrackingService } from '../core/dependency-tracking-service';
import { balanceProjectionService } from './balance-projection-service';
import { feeAvoidanceService } from './fee-avoidance-service';
import { learningAdaptationService } from './learning-adaptation-service';
import { getBufferAmount, getBufferStatus, getBufferThresholds } from '$lib/utils/account-metadata-utils';
import { getMaxFlexibilityDays, validateFlexibilityMovement } from '$lib/utils/flexibility-tier-utils';
import { 
	addDays, 
	subDays, 
	startOfDay, 
	isAfter, 
	isBefore, 
	format, 
	parseISO,
	differenceInDays,
	isEqual
} from 'date-fns';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Optimization constraints
 */
export interface OptimizationConstraints {
	// Hard constraints (must satisfy)
	criticalThreshold?: number; // Account balance below this is critical
	warningThreshold?: number; // Account balance below this triggers warning
	comfortThreshold?: number; // Account balance below this is suboptimal
	
	// Soft constraints (optimize for)
	preferBufferMaintenance?: boolean;
	preferFeeAvoidance?: boolean;
	preferCreditUtilization?: boolean; // Keep credit utilization optimal
	targetCreditUtilization?: number; // Target credit utilization (0-1)
	maxCreditUtilization?: number; // Maximum acceptable credit utilization
	
	// Account-specific constraints
	accountConstraints?: Map<string, AccountConstraints>;
}

export interface AccountConstraints {
	criticalThreshold?: number;
	warningThreshold?: number;
	comfortThreshold?: number;
	bufferAmount?: number;
}

/**
 * Optimization weights (configurable scoring weights)
 */
export interface OptimizationWeights {
	bufferCritical: number; // Weight for critical buffer violations
	bufferWarning: number; // Weight for warning buffer violations
	bufferComfort: number; // Weight for comfort buffer violations
	utilizationCritical: number; // Weight for critical credit utilization
	utilizationWarning: number; // Weight for warning credit utilization
	delayPenalty: number; // Weight for transaction delay penalty
	feeAvoidance: number; // Weight for fee avoidance
	allowanceImpact: number; // Weight for allowance impact
	accountOptimization: number; // Weight for account selection optimization
}

/**
 * Default optimization weights
 */
export const DEFAULT_WEIGHTS: OptimizationWeights = {
	bufferCritical: 1.0,
	bufferWarning: 0.8,
	bufferComfort: 0.5,
	utilizationCritical: 0.9,
	utilizationWarning: 0.7,
	delayPenalty: 0.6,
	feeAvoidance: 1.0,
	allowanceImpact: 0.7,
	accountOptimization: 0.5
};

/**
 * Transaction movement candidate
 */
export interface TransactionMovement {
	transactionId: string;
	originalDate: Date;
	newDate: Date;
	daysMoved: number;
	reason?: string;
}

/**
 * Optimized plan (candidate solution)
 */
export interface OptimizedPlan {
	id: string;
	transactions: Map<string, Transaction>; // Transaction ID -> Transaction with new dates
	movements: TransactionMovement[];
	score: number;
	improvements: PlanImprovement[];
	createdAt: Date;
	metadata?: {
		iterations: number;
		converged: boolean;
	};
}

/**
 * Plan improvement metrics
 */
export interface PlanImprovement {
	type: 'fee_avoidance' | 'buffer_improvement' | 'utilization_improvement' | 'delay_reduction';
	description: string;
	value: number; // Monetary value or improvement amount
	transactionsAffected: string[];
}

/**
 * Optimization result
 */
export interface OptimizationResult {
	success: boolean;
	originalPlan: Map<string, Transaction>;
	optimizedPlan: OptimizedPlan | null;
	baselineScore: number;
	optimizedScore: number;
	improvement: number; // Score improvement
	recommendations: OptimizationRecommendation[];
	errors?: string[];
	warnings?: string[];
	metadata: {
		iterations: number;
		converged: boolean;
		executionTime: number;
		transactionsEvaluated: number;
		transactionsMoved: number;
	};
}

/**
 * Optimization recommendation
 */
export interface OptimizationRecommendation {
	id: string;
	type: 'apply' | 'review' | 'manual';
	priority: 'low' | 'medium' | 'high' | 'urgent';
	title: string;
	description: string;
	estimatedSavings?: number;
	estimatedImprovement?: number;
	transactionsAffected: string[];
	suggestedMovements: TransactionMovement[];
	actionable: boolean;
	metadata: Record<string, any>;
}

/**
 * Optimization history entry
 */
export interface OptimizationHistoryEntry {
	id: string;
	runAt: Date;
	result: OptimizationResult;
	applied: boolean;
	appliedAt?: Date;
	userFeedback?: 'accepted' | 'rejected' | 'modified';
}

/**
 * Optimization options
 */
export interface OptimizationOptions {
	accountIds?: string[]; // Accounts to optimize (default: all active)
	startDate?: Date; // Start date for optimization window
	endDate?: Date; // End date for optimization window
	daysAhead?: number; // Days ahead to optimize (default: 90)
	constraints?: OptimizationConstraints;
	weights?: Partial<OptimizationWeights>;
	maxIterations?: number; // Maximum optimization iterations (default: 1000)
	convergenceThreshold?: number; // Score change threshold for convergence (default: 0.01)
	enableSimulatedAnnealing?: boolean; // Enable simulated annealing (default: true)
	initialTemperature?: number; // Initial temperature for simulated annealing (default: 1000)
	coolingRate?: number; // Cooling rate for simulated annealing (default: 0.95)
}

// ============================================================================
// OPTIMIZATION SERVICE
// ============================================================================

class OptimizationService {
	private history: Map<string, OptimizationHistoryEntry> = new Map();
	private readonly MAX_HISTORY_ENTRIES = 50;

	/**
	 * Run optimization algorithm
	 */
	async optimize(options: OptimizationOptions = {}): Promise<OptimizationResult> {
		const startTime = Date.now();
		console.log('[Optimization] Starting optimization', { options });
		
		try {
			// Validate dependencies first
			console.log('[Optimization] Validating dependencies...');
			const validationResult = await this.validateDependencies();
			console.log('[Optimization] Dependency validation result:', validationResult);
			if (!validationResult.isValid) {
				return {
					success: false,
					originalPlan: new Map(),
					optimizedPlan: null,
					baselineScore: 0,
					optimizedScore: 0,
					improvement: 0,
					recommendations: [],
					errors: validationResult.errors,
					warnings: validationResult.warnings,
					metadata: {
						iterations: 0,
						converged: false,
						executionTime: Date.now() - startTime,
						transactionsEvaluated: 0,
						transactionsMoved: 0
					}
				};
			}

			// Get transactions to optimize
			console.log('[Optimization] Getting transactions to optimize...');
			const transactions = await this.getTransactionsToOptimize(options);
			console.log('[Optimization] Found transactions:', transactions.length);
			
			// Create original plan
			console.log('[Optimization] Creating original plan...');
			const originalPlan = new Map<string, Transaction>();
			transactions.forEach(tx => {
				if (!tx) {
					console.error('[Optimization] Found undefined transaction!');
					return;
				}
				originalPlan.set(tx.id, { ...tx });
			});
			console.log('[Optimization] Original plan created with', originalPlan.size, 'transactions');

			// Evaluate baseline score
			const baselineScore = await this.evaluatePlan(originalPlan, options);

			// Run optimization algorithm
			const optimizedPlan = await this.runOptimization(originalPlan, options);

			// Generate recommendations
			const recommendations = await this.generateRecommendations(
				originalPlan,
				optimizedPlan,
				options
			);

			// Calculate improvement
			const improvement = optimizedPlan.score - baselineScore;

			const result: OptimizationResult = {
				success: true,
				originalPlan,
				optimizedPlan,
				baselineScore,
				optimizedScore: optimizedPlan.score,
				improvement,
				recommendations,
				warnings: validationResult.warnings,
				metadata: {
					iterations: optimizedPlan.metadata?.iterations || 0,
					converged: optimizedPlan.metadata?.converged || false,
					executionTime: Date.now() - startTime,
					transactionsEvaluated: transactions.length,
					transactionsMoved: optimizedPlan.movements.length
				}
			};

			// Save to history
			await this.saveToHistory(result);

			return result;
		} catch (error) {
			console.error('Optimization error:', error);
			return {
				success: false,
				originalPlan: new Map(),
				optimizedPlan: null,
				baselineScore: 0,
				optimizedScore: 0,
				improvement: 0,
				recommendations: [],
				errors: [error instanceof Error ? error.message : 'Unknown error'],
				metadata: {
					iterations: 0,
					converged: false,
					executionTime: Date.now() - startTime,
					transactionsEvaluated: 0,
					transactionsMoved: 0
				}
			};
		}
	}

	/**
	 * Get transactions to optimize
	 */
	private async getTransactionsToOptimize(
		options: OptimizationOptions
	): Promise<Transaction[]> {
		const startDate = options.startDate || startOfDay(new Date());
		const daysAhead = options.daysAhead || 90;
		const endDate = options.endDate || addDays(startDate, daysAhead);

		console.log('[Optimization] Getting transactions by date range:', {
			startDate: startDate.toISOString(),
			endDate: endDate.toISOString()
		});

		// Get transactions in the optimization window
		const allTransactions = await transactionService.getTransactionsByDateRange(
			startDate.toISOString(),
			endDate.toISOString()
		);
		console.log('[Optimization] Retrieved', allTransactions.length, 'transactions from date range');
		console.log('[Optimization] Transaction sample:', allTransactions.slice(0, 3).map(tx => ({
			id: tx?.id,
			accountId: tx?.accountId,
			status: tx?.status,
			hasDeletedAt: tx ? 'deletedAt' in tx : 'tx is undefined'
		})));

		// Get valid account IDs to filter transactions
		console.log('[Optimization] Getting valid accounts...');
		const allAccounts = await accountService.getAccounts();
		console.log('[Optimization] Found', allAccounts.length, 'valid accounts');
		const validAccountIds = new Set(allAccounts.map(a => a.id));

		// Filter by account if specified, and ensure accounts exist
		let transactions = allTransactions.filter(tx => {
			if (!tx) {
				console.warn('[Optimization] Found undefined transaction in filter step');
				return false;
			}
			// Ensure transaction has a valid account
			if (!tx.accountId || !validAccountIds.has(tx.accountId)) {
				return false;
			}
			// Filter by account if specified
			if (options.accountIds && options.accountIds.length > 0) {
				return options.accountIds.includes(tx.accountId);
			}
			return true;
		});
		console.log('[Optimization] After account filtering:', transactions.length, 'transactions');

		// Only include planned transactions with flexibility
		transactions = transactions.filter(tx => {
			if (!tx) {
				console.warn('[Optimization] Found undefined transaction in flexibility filter');
				return false;
			}
			if (tx.status !== 'planned') return false;
			if (!tx.plannedDate) return false;
			if (!tx.flexibilityTier || tx.flexibilityTier === 'fixed') return false;
			return true;
		});
		console.log('[Optimization] Final filtered transactions:', transactions.length);

		return transactions;
	}

	/**
	 * Validate dependencies before optimization
	 */
	private async validateDependencies(): Promise<{
		isValid: boolean;
		errors: string[];
		warnings: string[];
	}> {
		const errors: string[] = [];
		const warnings: string[] = [];

		try {
			// Get all planned transactions
			console.log('[Optimization] Getting planned transactions for dependency validation...');
			const transactions = await transactionService.getTransactionsByStatus('planned');
			console.log('[Optimization] Found', transactions.length, 'planned transactions for validation');

			// Validate dependency graph
			// Note: validateDependencyGraph already checks for circular dependencies internally
			const checkedTransactions = new Set<string>();
			for (const tx of transactions) {
				if (!tx || !tx.id) continue;
				if (checkedTransactions.has(tx.id)) continue; // Avoid checking same transaction twice
				checkedTransactions.add(tx.id);
				
				// Only validate transactions that have dependencies
				if (tx.dependencies && tx.dependencies.length > 0) {
					try {
						const validation = await dependencyTrackingService.validateDependencyGraph(tx.id);
						if (!validation.isValid) {
							errors.push(...validation.errors);
						}
						if (validation.warnings && validation.warnings.length > 0) {
							warnings.push(...validation.warnings);
						}
					} catch (error) {
						console.error('[Optimization] Error validating dependencies for transaction', tx.id, error);
						warnings.push(`Could not validate dependencies for transaction ${tx.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
					}
				}
			}
		} catch (error) {
			errors.push(error instanceof Error ? error.message : 'Dependency validation failed');
		}

		return {
			isValid: errors.length === 0,
			errors,
			warnings
		};
	}

	/**
	 * Run optimization algorithm (simulated annealing)
	 */
	private async runOptimization(
		originalPlan: Map<string, Transaction>,
		options: OptimizationOptions
	): Promise<OptimizedPlan> {
		const maxIterations = options.maxIterations || 1000;
		const convergenceThreshold = options.convergenceThreshold || 0.01;
		const enableSimulatedAnnealing = options.enableSimulatedAnnealing !== false;
		const initialTemperature = options.initialTemperature || 1000;
		const coolingRate = options.coolingRate || 0.95;

		// Initialize
		let currentPlan = new Map(originalPlan);
		let currentScore = await this.evaluatePlan(currentPlan, options);
		let bestPlan = new Map(currentPlan);
		let bestScore = currentScore;

		const movements: TransactionMovement[] = [];
		let iterations = 0;
		let convergenceCount = 0;
		const requiredConvergence = 10;
		let previousScore = currentScore;

		// Get flexible transactions
		const flexibleTransactions = Array.from(currentPlan.values()).filter(tx => {
			return tx.flexibilityTier && tx.flexibilityTier !== 'fixed';
		});

		// Optimization loop
		while (iterations < maxIterations) {
			let improved = false;

			// Try moving each flexible transaction
			for (const transaction of flexibleTransactions) {
				const validDateRange = this.getValidDateRange(transaction, options);
				
				// Try a few candidate dates
				const candidates = this.generateCandidateDates(
					transaction,
					validDateRange,
					5 // Try 5 candidate dates
				);

				for (const candidateDate of candidates) {
					// Create candidate plan
					const candidatePlan = new Map(currentPlan);
					const candidateTx = { ...transaction };
					
					if (candidateTx.plannedDate) {
						const originalDate = parseISO(candidateTx.plannedDate);
						candidateTx.plannedDate = candidateDate.toISOString();
						
						// Handle dependency propagation
						const propagatedPlan = await this.propagateDependencies(
							candidatePlan,
							candidateTx,
							candidateDate
						);
						
						// Validate constraints
						const isValid = await this.validateConstraints(propagatedPlan, options);
						if (!isValid) continue;

						// Evaluate candidate
						const candidateScore = await this.evaluatePlan(propagatedPlan, options);

						// Acceptance criteria
						let accept = false;
						if (candidateScore > currentScore) {
							accept = true;
						} else if (enableSimulatedAnnealing) {
							const temperature = initialTemperature * Math.pow(coolingRate, iterations);
							if (temperature > 0) {
								const delta = candidateScore - currentScore;
								const acceptanceProbability = Math.exp(delta / temperature);
								accept = Math.random() < acceptanceProbability;
							}
						}

						if (accept) {
							currentPlan = propagatedPlan;
							currentScore = candidateScore;
							improved = true;

							const daysMoved = differenceInDays(candidateDate, originalDate);
							if (Math.abs(daysMoved) > 0) {
								movements.push({
									transactionId: transaction.id,
									originalDate,
									newDate: candidateDate,
									daysMoved,
									reason: `Score improvement: ${candidateScore.toFixed(2)}`
								});
							}

							if (candidateScore > bestScore) {
								bestPlan = new Map(currentPlan);
								bestScore = candidateScore;
							}
						}
					}
				}
			}

			// Check convergence
			const scoreChange = Math.abs(currentScore - previousScore) / Math.max(Math.abs(previousScore), 1);
			if (scoreChange < convergenceThreshold) {
				convergenceCount++;
				if (convergenceCount >= requiredConvergence) {
					break; // Converged
				}
			} else {
				convergenceCount = 0;
			}

			previousScore = currentScore;
			iterations++;
		}

		// Generate improvements
		const improvements = await this.calculateImprovements(originalPlan, bestPlan, options);

		return {
			id: generateUUID(),
			transactions: bestPlan,
			movements,
			score: bestScore,
			improvements,
			createdAt: new Date(),
			metadata: {
				iterations,
				converged: convergenceCount >= requiredConvergence
			}
		};
	}

	/**
	 * Get valid date range for a transaction based on flexibility tier
	 */
	private getValidDateRange(
		transaction: Transaction,
		options: OptimizationOptions
	): { start: Date; end: Date } {
		if (!transaction.plannedDate || !transaction.flexibilityTier) {
			const today = startOfDay(new Date());
			return { start: today, end: today };
		}

		const originalDate = parseISO(transaction.plannedDate);
		const maxDays = getMaxFlexibilityDays(transaction.flexibilityTier);
		
		// Apply directional constraint
		let startDate = originalDate;
		let endDate = originalDate;

		if (transaction.directionalConstraint === 'forward-only') {
			startDate = originalDate;
			endDate = addDays(originalDate, maxDays);
		} else if (transaction.directionalConstraint === 'backward-only') {
			startDate = subDays(originalDate, maxDays);
			endDate = originalDate;
		} else {
			// Bidirectional
			startDate = subDays(originalDate, maxDays);
			endDate = addDays(originalDate, maxDays);
		}

		// Respect optimization window
		const optStart = options.startDate || startOfDay(new Date());
		const optEnd = options.endDate || addDays(optStart, options.daysAhead || 90);
		
		startDate = isAfter(startDate, optStart) ? startDate : optStart;
		endDate = isBefore(endDate, optEnd) ? endDate : optEnd;

		return { start: startDate, end: endDate };
	}

	/**
	 * Generate candidate dates for a transaction
	 */
	private generateCandidateDates(
		transaction: Transaction,
		validRange: { start: Date; end: Date },
		count: number
	): Date[] {
		const candidates: Date[] = [];
		const daysDiff = differenceInDays(validRange.end, validRange.start);
		
		if (daysDiff === 0) {
			return [validRange.start];
		}

		// Always include original date if in range
		if (transaction.plannedDate) {
			const originalDate = parseISO(transaction.plannedDate);
			if (!isBefore(originalDate, validRange.start) && !isAfter(originalDate, validRange.end)) {
				candidates.push(originalDate);
			}
		}

		// Generate evenly spaced candidates
		const step = Math.max(1, Math.floor(daysDiff / (count - 1)));
		for (let i = 0; i < count && candidates.length < count; i++) {
			const candidate = addDays(validRange.start, i * step);
			if (!candidates.some(c => isEqual(c, candidate))) {
				candidates.push(candidate);
			}
		}

		return candidates;
	}

	/**
	 * Propagate dependencies when a transaction is moved
	 */
	private async propagateDependencies(
		plan: Map<string, Transaction>,
		movedTransaction: Transaction,
		newDate: Date
	): Promise<Map<string, Transaction>> {
		const propagatedPlan = new Map(plan);
		
		// Find all transactions that depend on the moved transaction
		const dependents = Array.from(plan.values()).filter(tx => {
			return tx.dependencies && tx.dependencies.includes(movedTransaction.id);
		});

		// Adjust dependent transactions if needed
		for (const dependent of dependents) {
			if (!dependent.plannedDate) continue;
			
			const dependentDate = parseISO(dependent.plannedDate);
			
			// If dependent is scheduled before the moved transaction, move it
			if (isBefore(dependentDate, newDate)) {
				// Try to move dependent to after the moved transaction
				const newDependentDate = addDays(newDate, 1);
				const validation = validateFlexibilityMovement(
					dependent.flexibilityTier,
					dependentDate,
					newDependentDate
				);

				if (validation.isValid) {
					const updatedDependent = { ...dependent };
					updatedDependent.plannedDate = newDependentDate.toISOString();
					propagatedPlan.set(dependent.id, updatedDependent);
				}
			}
		}

		return propagatedPlan;
	}

	/**
	 * Validate constraints for a plan
	 */
	private async validateConstraints(
		plan: Map<string, Transaction>,
		options: OptimizationOptions
	): Promise<boolean> {
		// Get constraints
		const constraints = options.constraints || {};
		
		// Get valid account IDs from transactions in the plan
		const transactionAccountIds = Array.from(plan.values())
			.map(tx => tx.accountId)
			.filter((id): id is string => !!id);
		
		// Get valid accounts to ensure we only project for existing accounts
		const allAccounts = await accountService.getAccounts();
		const validAccountIds = allAccounts
			.filter(a => a.isActive)
			.map(a => a.id);
		
		// Use intersection of transaction accounts and valid accounts
		const accountIdsToProject = options.accountIds 
			? options.accountIds.filter(id => validAccountIds.includes(id))
			: transactionAccountIds.filter(id => validAccountIds.includes(id));

		if (accountIdsToProject.length === 0) {
			return true; // No valid accounts to validate
		}
		
		// Generate projections for the plan
		const projections = await balanceProjectionService.generateProjections({
			daysAhead: options.daysAhead || 90,
			accountIds: accountIdsToProject
		});

		// Check hard constraints (critical thresholds)
		for (const projection of projections) {
			// Get account to determine proper buffer thresholds
			const account = await accountService.getAccount(projection.accountId);
			if (!account) continue;

			// Use account-specific buffer thresholds if available, otherwise use constraints or defaults
			const accountConstraints = constraints.accountConstraints?.get(projection.accountId);
			const bufferThresholds = getBufferThresholds(account);
			
			// Priority: accountConstraints > constraints > account buffer thresholds > 0
			const criticalThreshold = accountConstraints?.criticalThreshold ?? 
				constraints.criticalThreshold ?? 
				bufferThresholds.critical;

			for (const daily of projection.projections) {
				if (daily.balance < criticalThreshold) {
					return false; // Hard constraint violated
				}
			}
		}

		return true;
	}

	/**
	 * Evaluate plan score
	 * 
	 * The score is a composite metric that evaluates the financial health of a transaction plan:
	 * - Lower (more negative) scores indicate more problems (buffer violations, fees, etc.)
	 * - Higher (less negative or positive) scores indicate better financial position
	 * 
	 * Score components:
	 * 1. Buffer violations: Penalties for balances below critical/warning/comfort thresholds
	 *    - Critical: -10,000 per day per violation (balance below 50% of buffer)
	 *    - Warning: -100 * deficit per day (balance below buffer level)
	 *    - Comfort: -10 * deficit per day (balance below 125% of buffer)
	 * 2. Transaction delays: Penalty for moving high-priority transactions
	 *    - Penalty = priority * days moved * delayPenalty weight
	 * 3. Fee avoidance: Reward for avoiding fees
	 *    - Reward = fees avoided * feeAvoidance weight
	 * 
	 * The absolute score value is less important than the improvement (optimized - baseline).
	 * A positive improvement means the optimized plan is better than the baseline.
	 */
	private async evaluatePlan(
		plan: Map<string, Transaction>,
		options: OptimizationOptions
	): Promise<number> {
		const weights = { ...DEFAULT_WEIGHTS, ...options.weights };
		let score = 0;

		// Get valid account IDs from transactions in the plan
		const transactionAccountIds = Array.from(plan.values())
			.map(tx => tx.accountId)
			.filter((id): id is string => !!id);
		
		// Get valid accounts to ensure we only project for existing accounts
		const allAccounts = await accountService.getAccounts();
		const validAccountIds = allAccounts
			.filter(a => a.isActive)
			.map(a => a.id);
		
		// Use intersection of transaction accounts and valid accounts
		const accountIdsToProject = options.accountIds 
			? options.accountIds.filter(id => validAccountIds.includes(id))
			: transactionAccountIds.filter(id => validAccountIds.includes(id));

		// Get projections for the plan
		const projections = await balanceProjectionService.generateProjections({
			daysAhead: options.daysAhead || 90,
			accountIds: accountIdsToProject.length > 0 ? accountIdsToProject : undefined
		});

		// Evaluate buffer violations
		const constraints = options.constraints || {};
		for (const projection of projections) {
			// Get account to determine proper buffer thresholds
			const account = await accountService.getAccount(projection.accountId);
			if (!account) continue;

			// Use account-specific buffer thresholds if available, otherwise use constraints or defaults
			const accountConstraints = constraints.accountConstraints?.get(projection.accountId);
			const bufferThresholds = getBufferThresholds(account);
			
			// Priority: accountConstraints > constraints > account buffer thresholds
			// If all are 0 or undefined, skip buffer violation checks for this account
			// (this prevents massive penalties when accounts have no buffer requirements)
			const criticalThreshold = accountConstraints?.criticalThreshold ?? 
				constraints.criticalThreshold ?? 
				bufferThresholds.critical;
			const warningThreshold = accountConstraints?.warningThreshold ?? 
				constraints.warningThreshold ?? 
				bufferThresholds.warning;
			const comfortThreshold = accountConstraints?.comfortThreshold ?? 
				constraints.comfortThreshold ?? 
				bufferThresholds.comfort;

			// Only check buffer violations if we have meaningful thresholds
			// If all thresholds are 0, the account has no buffer requirements
			if (criticalThreshold === 0 && warningThreshold === 0 && comfortThreshold === 0) {
				continue; // Skip buffer violation checks for accounts with no buffer requirements
			}

			for (const daily of projection.projections) {
				if (daily.balance < criticalThreshold) {
					score -= weights.bufferCritical * 10000;
				} else if (daily.balance < warningThreshold) {
					score -= weights.bufferWarning * 100 * (warningThreshold - daily.balance);
				} else if (daily.balance < comfortThreshold) {
					score -= weights.bufferComfort * 10 * (comfortThreshold - daily.balance);
				}
			}
		}

		// Evaluate transaction delays (penalize moving high-priority transactions)
		for (const transaction of plan.values()) {
			// Get original transaction to compare
			const originalTx = await db.transactions.get(transaction.id);
			if (!originalTx || !originalTx.plannedDate || !transaction.plannedDate) continue;

			const originalDate = parseISO(originalTx.plannedDate);
			const newDate = parseISO(transaction.plannedDate);
			const daysMoved = Math.abs(differenceInDays(newDate, originalDate));

			if (daysMoved > 0) {
				const priority = transaction.priority || 5;
				score -= weights.delayPenalty * priority * daysMoved;
			}
		}

		// Evaluate fee avoidance (reward avoiding fees)
		const feeRisks = await feeAvoidanceService.detectFeeRisks({
			accountIds: options.accountIds,
			daysAhead: options.daysAhead || 90
		});

		const feesAvoided = feeRisks.reduce((sum, risk) => sum + risk.estimatedAmount, 0);
		score += weights.feeAvoidance * feesAvoided;

		return score;
	}

	/**
	 * Calculate improvements between original and optimized plan
	 */
	private async calculateImprovements(
		originalPlan: Map<string, Transaction>,
		optimizedPlan: Map<string, Transaction>,
		options: OptimizationOptions
	): Promise<PlanImprovement[]> {
		const improvements: PlanImprovement[] = [];

		// Calculate fee avoidance
		const originalFees = await this.estimateFees(originalPlan, options);
		const optimizedFees = await this.estimateFees(optimizedPlan, options);
		const feesAvoided = originalFees - optimizedFees;

		if (feesAvoided > 0) {
			improvements.push({
				type: 'fee_avoidance',
				description: `Avoided ${feesAvoided.toFixed(2)} in fees`,
				value: feesAvoided,
				transactionsAffected: Array.from(optimizedPlan.keys())
			});
		}

		// Calculate buffer improvements
		const originalProjections = await balanceProjectionService.generateProjections({
			daysAhead: options.daysAhead || 90,
			accountIds: options.accountIds
		});
		
		// TODO: Recalculate with optimized plan (would need to temporarily update transactions)
		// For now, we'll estimate based on movements

		return improvements;
	}

	/**
	 * Estimate fees for a plan
	 */
	private async estimateFees(
		plan: Map<string, Transaction>,
		options: OptimizationOptions
	): Promise<number> {
		const feeRisks = await feeAvoidanceService.detectFeeRisks({
			accountIds: options.accountIds,
			daysAhead: options.daysAhead || 90
		});

		return feeRisks.reduce((sum, risk) => sum + risk.estimatedAmount, 0);
	}

	/**
	 * Generate optimization recommendations
	 * Uses learned preferences to personalize recommendations
	 */
	private async generateRecommendations(
		originalPlan: Map<string, Transaction>,
		optimizedPlan: OptimizedPlan | null,
		options: OptimizationOptions
	): Promise<OptimizationRecommendation[]> {
		const recommendations: OptimizationRecommendation[] = [];

		if (!optimizedPlan || optimizedPlan.movements.length === 0) {
			return recommendations;
		}

		// Get learned preferences for optimization suggestions
		const suggestionWeight = await learningAdaptationService.getPreferenceValue('optimization_suggestion_weight') || 1.0;
		
		// Filter movements based on learned category flexibility
		const filteredMovements = await this.filterMovementsByFlexibility(optimizedPlan.movements);

		// Group movements by impact
		const highImpactMovements = filteredMovements.filter(m => Math.abs(m.daysMoved) > 7);
		const mediumImpactMovements = filteredMovements.filter(m => 
			Math.abs(m.daysMoved) > 3 && Math.abs(m.daysMoved) <= 7
		);

		// Apply learned weight to recommendation priority
		const basePriority = suggestionWeight < 0.5 ? 'low' : suggestionWeight > 1.5 ? 'high' : 'medium';

		// Create recommendation for high-impact changes
		if (highImpactMovements.length > 0) {
			recommendations.push({
				id: generateUUID(),
				type: 'review',
				priority: basePriority === 'high' ? 'high' : 'medium',
				title: 'Significant Transaction Adjustments',
				description: `${highImpactMovements.length} transactions can be moved to improve your financial position.`,
				estimatedSavings: optimizedPlan.improvements
					.filter(i => i.type === 'fee_avoidance')
					.reduce((sum, i) => sum + i.value, 0),
				estimatedImprovement: optimizedPlan.score - (await this.evaluatePlan(originalPlan, options)),
				transactionsAffected: highImpactMovements.map(m => m.transactionId),
				suggestedMovements: highImpactMovements,
				actionable: true,
				metadata: {
					learnedWeight: suggestionWeight,
					filteredCount: filteredMovements.length,
					originalCount: optimizedPlan.movements.length
				}
			});
		}

		// Create recommendation for medium-impact changes
		if (mediumImpactMovements.length > 0) {
			recommendations.push({
				id: generateUUID(),
				type: 'apply',
				priority: basePriority,
				title: 'Optimize Transaction Timing',
				description: `Small adjustments to ${mediumImpactMovements.length} transactions can help avoid fees and maintain better balances.`,
				estimatedSavings: optimizedPlan.improvements
					.filter(i => i.type === 'fee_avoidance')
					.reduce((sum, i) => sum + i.value, 0),
				transactionsAffected: mediumImpactMovements.map(m => m.transactionId),
				suggestedMovements: mediumImpactMovements,
				actionable: true,
				metadata: {
					learnedWeight: suggestionWeight,
					filteredCount: filteredMovements.length,
					originalCount: optimizedPlan.movements.length
				}
			});
		}

		return recommendations;
	}

	/**
	 * Filter movements based on learned category flexibility
	 */
	private async filterMovementsByFlexibility(
		movements: TransactionMovement[]
	): Promise<TransactionMovement[]> {
		const filtered: TransactionMovement[] = [];

		for (const movement of movements) {
			const transaction = await db.transactions.get(movement.transactionId);
			if (!transaction || !transaction.categoryId) {
				filtered.push(movement); // Include if no category
				continue;
			}

			// Get learned flexibility for this category
			const flexibilityKey = `${transaction.categoryId}_flexibility`;
			const flexibility = await learningAdaptationService.getPreferenceValue(flexibilityKey);

			// If flexibility is low (<0.3), only include if movement is small
			if (flexibility !== null && flexibility < 0.3) {
				if (Math.abs(movement.daysMoved) <= 3) {
					filtered.push(movement); // Only small movements for low-flexibility categories
				}
			} else {
				filtered.push(movement); // Include all movements for flexible categories
			}
		}

		return filtered;
	}

	/**
	 * Save optimization result to history
	 */
	private async saveToHistory(result: OptimizationResult): Promise<void> {
		const entry: OptimizationHistoryEntry = {
			id: generateUUID(),
			runAt: new Date(),
			result,
			applied: false
		};

		this.history.set(entry.id, entry);

		// Limit history size
		if (this.history.size > this.MAX_HISTORY_ENTRIES) {
			const entries = Array.from(this.history.values());
			entries.sort((a, b) => b.runAt.getTime() - a.runAt.getTime());
			const toRemove = entries.slice(this.MAX_HISTORY_ENTRIES);
			toRemove.forEach(e => this.history.delete(e.id));
		}
	}

	/**
	 * Get optimization history
	 */
	getHistory(): OptimizationHistoryEntry[] {
		return Array.from(this.history.values()).sort(
			(a, b) => b.runAt.getTime() - a.runAt.getTime()
		);
	}

	/**
	 * Get a specific optimization result from history
	 */
	getHistoryEntry(id: string): OptimizationHistoryEntry | null {
		return this.history.get(id) || null;
	}

	/**
	 * Apply optimization result (update transactions)
	 */
	async applyOptimization(optimizedPlan: OptimizedPlan): Promise<void> {
		// Update transactions with new dates
		for (const movement of optimizedPlan.movements) {
			const transaction = await db.transactions.get(movement.transactionId);
			if (transaction && transaction.plannedDate) {
				await transactionService.updateTransaction(movement.transactionId, {
					plannedDate: movement.newDate.toISOString()
				});
			}
		}

		// Mark as applied in history
		const historyEntry = Array.from(this.history.values()).find(
			e => e.result.optimizedPlan?.id === optimizedPlan.id
		);
		if (historyEntry) {
			historyEntry.applied = true;
			historyEntry.appliedAt = new Date();
		}
	}

	/**
	 * Compare two optimization results
	 */
	async compareOptimizations(
		result1: OptimizationResult,
		result2: OptimizationResult
	): Promise<{
		scoreDifference: number;
		movementDifference: number;
		improvementDifference: number;
		commonMovements: TransactionMovement[];
		uniqueMovements1: TransactionMovement[];
		uniqueMovements2: TransactionMovement[];
	}> {
		const movements1 = result1.optimizedPlan?.movements || [];
		const movements2 = result2.optimizedPlan?.movements || [];

		const commonMovements = movements1.filter(m1 =>
			movements2.some(m2 => m1.transactionId === m2.transactionId)
		);

		const uniqueMovements1 = movements1.filter(m1 =>
			!movements2.some(m2 => m1.transactionId === m2.transactionId)
		);

		const uniqueMovements2 = movements2.filter(m2 =>
			!movements1.some(m1 => m1.transactionId === m2.transactionId)
		);

		return {
			scoreDifference: (result2.optimizedScore || 0) - (result1.optimizedScore || 0),
			movementDifference: movements2.length - movements1.length,
			improvementDifference: result2.improvement - result1.improvement,
			commonMovements,
			uniqueMovements1,
			uniqueMovements2
		};
	}
}

export const optimizationService = new OptimizationService();
