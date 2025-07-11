import type { Transaction } from '$lib/core/db';
import type { TransactionOrGroup } from '$lib/core/services/transaction-service';
import { tagService } from '$lib/core/services/tag-service';


export interface ProcessedTransaction extends Transaction {
	tagNames?: {
		what?: string;
		why?: string;
		where?: string;
		custom?: string[];
	};
	tagColors?: {
		what?: string;
		why?: string;
		where?: string;
		custom?: Record<string, string>;
	};
	isOverdue?: boolean;
	isFuture?: boolean;
	isPlanned?: boolean;
	splitCount?: number;
	confidenceLevel?: 'confirmed' | 'likely' | 'maybe';
	isRecurring?: boolean;
	isSplit?: boolean;
	splitName?: string;
	splitId?: string;
}

export interface ProcessedTransactionGroup {
	type: 'single' | 'split';
	id: string;
	transactions: ProcessedTransaction[];
	representative: ProcessedTransaction;
	totalAmount: number;
	commonFields: {
		accountId: string;
		clearedDate?: string;
		plannedDate?: string;
		splitName?: string;
		splitId?: string;
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
	} else if (tx.confidence === 'expected' || tx.amount > 0) {
		confidenceLevel = 'likely';
	}

	// Check if overdue (planned date is in the past)
	const isOverdue = tx.plannedDate ? new Date(tx.plannedDate) < new Date() : false;

	// Check if recurring (has description that suggests recurrence)
	const isRecurring = tx.description?.toLowerCase().includes('monthly') || 
					   tx.description?.toLowerCase().includes('rent') ||
					   tx.description?.toLowerCase().includes('subscription') || false;

	// Get tag information
	const tagNames: ProcessedTransaction['tagNames'] = {
		what: tx.whatTag,
		why: tx.whyTag,
		where: tx.payeeId,
		custom: []
	};

	const tagColors: ProcessedTransaction['tagColors'] = {
		what: undefined,
		why: undefined,
		where: undefined,
		custom: {}
	};

	// Get colors for system tags
	if (tx.whatTag) {
		try {
			const whatTag = await tagService.getTagByNameAndDimension(tx.whatTag, 'what');
			if (whatTag?.color) {
				tagColors.what = whatTag.color;
			}
		} catch (error) {
			console.warn('Failed to load what tag color:', error);
		}
	}

	if (tx.whyTag) {
		try {
			const whyTag = await tagService.getTagByNameAndDimension(tx.whyTag, 'why');
			if (whyTag?.color) {
				tagColors.why = whyTag.color;
			}
		} catch (error) {
			console.warn('Failed to load why tag color:', error);
		}
	}

	if (tx.payeeId) {
		try {
			const whereTag = await tagService.getTagByNameAndDimension(tx.payeeId, 'where');
			if (whereTag?.color) {
				tagColors.where = whereTag.color;
			}
		} catch (error) {
			console.warn('Failed to load where tag color:', error);
		}
	}

	// Get custom tags
	try {
				// For now, we'll skip custom tags since transaction-tag-service was removed
		// TODO: Implement custom tag retrieval through the new budget service
		tagNames.custom = [];
		
		// Get colors for custom tags
		// TODO: Implement custom tag color retrieval through the new budget service
		tagColors.custom = {};
	} catch (error) {
		console.warn('Failed to load custom tags for transaction:', tx.id, error);
	}

	return {
		...tx,
		tagNames,
		tagColors,
		confidenceLevel,
		isOverdue,
		isRecurring,
		isSplit: Boolean(tx.splitId),
		splitName: tx.splitName,
		splitId: tx.splitId
	};
}

/**
 * Process transaction groups and prepare them for display
 */
export async function processTransactionGroups(groups: TransactionOrGroup[]): Promise<ProcessedTransactionGroup[]> {
	const processedGroups: ProcessedTransactionGroup[] = [];

	for (const group of groups) {
		// Process all transactions in the group
		const processedTransactions = await Promise.all(
			group.transactions.map(tx => processTransaction(tx))
		);

		// Create the processed group
		const processedGroup: ProcessedTransactionGroup = {
			type: group.type,
			id: group.id,
			transactions: processedTransactions,
			representative: await processTransaction(group.representative),
			totalAmount: group.totalAmount,
			commonFields: group.commonFields
		};

		processedGroups.push(processedGroup);
	}

	return processedGroups;
}

/**
 * Flatten transaction groups into individual processed transactions
 * This is useful when you want to display all transactions individually
 */
export async function flattenProcessedTransactionGroups(groups: TransactionOrGroup[]): Promise<ProcessedTransaction[]> {
	const processedGroups = await processTransactionGroups(groups);
	const flattened: ProcessedTransaction[] = [];

	for (const group of processedGroups) {
		if (group.type === 'single') {
			flattened.push(group.representative);
		} else {
			// For splits, add all transactions in the group
			flattened.push(...group.transactions);
		}
	}

	return flattened;
}

/**
 * Get the primary tag for display (what > why > where > custom)
 */
export function getPrimaryTag(transaction: ProcessedTransaction): string {
	if (transaction.tagNames?.what) return transaction.tagNames.what;
	if (transaction.tagNames?.why) return transaction.tagNames.why;
	if (transaction.tagNames?.where) return transaction.tagNames.where;
	if (transaction.tagNames?.custom && transaction.tagNames.custom.length > 0) {
		return transaction.tagNames.custom[0];
	}
	return 'uncategorized';
}

/**
 * Get the primary tag color for display
 */
export function getPrimaryTagColor(transaction: ProcessedTransaction): string | undefined {
	if (transaction.tagColors?.what) return transaction.tagColors.what;
	if (transaction.tagColors?.why) return transaction.tagColors.why;
	if (transaction.tagColors?.where) return transaction.tagColors.where;
	if (transaction.tagNames?.custom && transaction.tagNames.custom.length > 0) {
		const firstCustomTag = transaction.tagNames.custom[0];
		return transaction.tagColors?.custom?.[firstCustomTag];
	}
	return undefined;
} 