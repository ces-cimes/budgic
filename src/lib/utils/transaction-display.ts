import type { Transaction } from '$lib/core/db';
import type { TransactionOrGroup } from './transaction-utils';

export interface ProcessedTransaction extends Transaction {
	categoryName?: string;
	categoryColor?: string;
	categoryTier?: 'survival' | 'security' | 'growth' | 'lifestyle';
	isOverdue?: boolean;
	isFuture?: boolean;
	isPlanned?: boolean;
	groupCount?: number;
	confidenceLevel?: 'confirmed' | 'likely' | 'maybe';
	isRecurring?: boolean;
	isGroup?: boolean;
	groupName?: string;
	groupId?: string;
}

export interface ProcessedTransactionGroup {
	type: 'single' | 'group';
	id: string;
	transactions: ProcessedTransaction[];
	representative: ProcessedTransaction;
	totalAmount: number;
	commonFields: {
		accountId: string;
		clearedDate?: string;
		plannedDate?: string;
		groupName?: string;
		groupId?: string;
	};
}

/**
 * Process a single transaction with additional metadata for display
 */
export async function processTransaction(tx: Transaction): Promise<ProcessedTransaction> {
	// Determine confidence level based on transaction data
	let confidenceLevel: 'confirmed' | 'likely' | 'maybe' = 'maybe';
	if (tx.confidence === 'confirmed') {
		confidenceLevel = 'confirmed';
	} else if (tx.confidence === 'expected' || (tx.amount || 0) > 0) {
		confidenceLevel = 'likely';
	}

	// Check if overdue (planned date is in the past)
	const isOverdue = tx.plannedDate ? new Date(tx.plannedDate) < new Date() : false;

	// Check if recurring (has description that suggests recurrence)
	const isRecurring =
		tx.description?.toLowerCase().includes('monthly') ||
		tx.description?.toLowerCase().includes('rent') ||
		tx.description?.toLowerCase().includes('subscription') ||
		false;

	// Get category information (simplified - no more complex tag system)
	const categoryName = tx.categoryId ? 'Category' : undefined; // Will be populated by caller
	const categoryColor = tx.categoryId ? '#3B82F6' : undefined; // Default color
	const categoryTier = tx.categoryId ? ('survival' as const) : undefined; // Default tier

	return {
		...tx,
		categoryName,
		categoryColor,
		categoryTier,
		isOverdue,
		isFuture: tx.plannedDate ? new Date(tx.plannedDate) > new Date() : false,
		isPlanned: tx.status === 'planned',
		groupCount: tx.groupId ? 1 : 0, // Will be updated by caller
		confidenceLevel,
		isRecurring,
		isGroup: Boolean(tx.groupId),
		groupName: tx.groupName,
		groupId: tx.groupId
	};
}

/**
 * Process a group of transactions with additional metadata
 */
export async function processTransactionGroup(
	group: TransactionOrGroup
): Promise<ProcessedTransactionGroup> {
	const processedTransactions = await Promise.all(
		group.transactions.map((tx) => processTransaction(tx))
	);

	// Update group count for all transactions in the group
	const groupCount = processedTransactions.length;
	processedTransactions.forEach((tx) => {
		tx.groupCount = groupCount;
	});

	return {
		...group,
		transactions: processedTransactions,
		representative: processedTransactions[0] // First transaction is representative
	};
}

/**
 * Process multiple transactions or groups
 */
export async function processTransactions(
	transactions: Transaction[]
): Promise<ProcessedTransaction[]> {
	return Promise.all(transactions.map((tx) => processTransaction(tx)));
}

/**
 * Process multiple transaction groups
 */
export async function processTransactionGroups(
	groups: TransactionOrGroup[]
): Promise<ProcessedTransactionGroup[]> {
	return Promise.all(groups.map((group) => processTransactionGroup(group)));
}
