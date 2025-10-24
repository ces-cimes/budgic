import Dexie, { type Table } from 'dexie';
import { z } from 'zod';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate a UUID with fallback for older browsers
 */
export function generateUUID(): string {
	// Try to use crypto.randomUUID if available
	if (typeof crypto !== 'undefined' && crypto.randomUUID) {
		return crypto.randomUUID();
	}
	
	// Fallback implementation for older browsers
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
		const r = Math.random() * 16 | 0;
		const v = c === 'x' ? r : (r & 0x3 | 0x8);
		return v.toString(16);
	});
}

// ============================================================================
// ENHANCED VALIDATION FUNCTIONS
// ============================================================================

/**
 * Currency validation and formatting utilities
 */
export const CurrencyUtils = {
	/**
	 * Validate currency code format (ISO 4217)
	 */
	isValidCurrencyCode(code: string): boolean {
		return /^[A-Z]{3}$/.test(code);
	},

	/**
	 * Validate amount with currency-specific rules
	 */
	validateAmount(amount: number | undefined | null, currency: string): { isValid: boolean; error?: string } {
		if (amount === undefined || amount === null) {
			return { isValid: false, error: 'Amount is required' };
		}

		// Maximum amount validation (1M as specified in requirements)
		if (Math.abs(amount) > 1000000) {
			return { isValid: false, error: 'Amount cannot exceed 1,000,000' };
		}

		// Check for NaN or Infinity
		if (!Number.isFinite(amount)) {
			return { isValid: false, error: 'Amount must be a valid number' };
		}

		// Currency-specific validation
		const currencyInfo = CurrencyUtils.getCurrencyInfo(currency);
		if (currencyInfo) {
			// Check decimal places
			const decimalPlaces = CurrencyUtils.getDecimalPlaces(amount);
			if (decimalPlaces > currencyInfo.decimalPlaces) {
				return { 
					isValid: false, 
					error: `${currencyInfo.name} supports maximum ${currencyInfo.decimalPlaces} decimal places` 
				};
			}
		}

		return { isValid: true };
	},

	/**
	 * Get decimal places from a number
	 */
	getDecimalPlaces(num: number): number {
		if (Math.floor(num) === num) return 0;
		return num.toString().split('.')[1]?.length || 0;
	},

	/**
	 * Get currency information
	 */
	getCurrencyInfo(code: string): CurrencyInfo | null {
		return CURRENCY_REGISTRY.get(code) || null;
	},

	/**
	 * Format amount according to currency rules
	 */
	formatAmount(amount: number | undefined | null, currency: string): string {
		if (amount === undefined || amount === null || isNaN(amount)) {
			return '0.00';
		}

		const currencyInfo = CurrencyUtils.getCurrencyInfo(currency);
		if (!currencyInfo) return amount.toString();

		const formatter = new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: currency,
			minimumFractionDigits: currencyInfo.decimalPlaces,
			maximumFractionDigits: currencyInfo.decimalPlaces
		});

		return formatter.format(amount);
	}
};

/**
 * Date validation utilities
 */
export const DateUtils = {
	/**
	 * Get current date in ISO format
	 */
	getCurrentDate(): string {
		return new Date().toISOString();
	},

	/**
	 * Check if date is in the future
	 */
	isFutureDate(date: string): boolean {
		return new Date(date) > new Date();
	},

	/**
	 * Check if date is in the past
	 */
	isPastDate(date: string): boolean {
		return new Date(date) < new Date();
	}
};

/**
 * Account balance validation utilities
 */
export const BalanceUtils = {
	/**
	 * Validate account balance consistency
	 */
	async validateAccountBalance(accountId: string): Promise<{ isValid: boolean; error?: string; calculatedBalance: number }> {
		try {
			const calculatedBalance = await db.recalculateAccountBalance(accountId);
			const account = await db.accounts.get(accountId);
			
			if (!account) {
				return { isValid: false, error: 'Account not found', calculatedBalance };
			}

			// Allow for small floating point differences (within 0.01)
			const difference = Math.abs(account.currentBalance - calculatedBalance);
			if (difference > 0.01) {
				return { 
					isValid: false, 
					error: `Balance mismatch: stored ${account.currentBalance}, calculated ${calculatedBalance}`,
					calculatedBalance 
				};
			}

			return { isValid: true, calculatedBalance };
		} catch (error) {
			return { 
				isValid: false, 
				error: `Balance validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
				calculatedBalance: 0 
			};
		}
	},

	/**
	 * Validate split transaction sum consistency
	 */
	validateSplitSum(splitTransactions: Transaction[]): { isValid: boolean; errors: string[]; totalAmount: number } {
		if (splitTransactions.length === 0) {
			return { isValid: false, errors: ['At least one split transaction is required'], totalAmount: 0 };
		}

		const totalAmount = splitTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);
		const errors: string[] = [];
		
		const firstTransaction = splitTransactions[0];
		
		// For transfers, validate that the total is reasonable (not necessarily zero)
		// but should be consistent with transfer logic
		if (firstTransaction.type === 'transfer') {
			// For transfers, we should validate that the total makes sense
			// A transfer split should typically have a net zero or a clear transfer amount
			if (Math.abs(totalAmount) > 1000000) {
				errors.push('Transfer split total amount seems unreasonably large');
			}
		} else {
			// For non-transfer transactions, validate based on type and amount sign
			// This aligns with the transaction impact calculation system
			if (firstTransaction.type === 'expense' && totalAmount > 0) {
				// Allow positive expenses (they will be treated as negative in calculations)
				// This supports cases like cashback or refunds
			} else if (firstTransaction.type === 'income' && totalAmount < 0) {
				// Allow negative income (they will be treated as negative in calculations)
				// This supports cases like chargebacks or corrections
			}
		}

		return { isValid: errors.length === 0, errors, totalAmount };
	}
};

// ============================================================================
// CURRENCY SYSTEM
// ============================================================================

export interface CurrencyInfo {
	code: string;
	name: string;
	symbol: string;
	placement: 'before' | 'after';
	decimalPlaces: number;
	isSystem: boolean;
	isActive: boolean;
}

// Currency registry with system currencies
export const CURRENCY_REGISTRY = new Map<string, CurrencyInfo>([
	['USD', { code: 'USD', name: 'US Dollar', symbol: '$', placement: 'before', decimalPlaces: 2, isSystem: true, isActive: true }],
	['EUR', { code: 'EUR', name: 'Euro', symbol: '€', placement: 'before', decimalPlaces: 2, isSystem: true, isActive: true }],
	['GBP', { code: 'GBP', name: 'British Pound', symbol: '£', placement: 'before', decimalPlaces: 2, isSystem: true, isActive: true }],
	['JPY', { code: 'JPY', name: 'Japanese Yen', symbol: '¥', placement: 'before', decimalPlaces: 0, isSystem: true, isActive: true }],
	['CAD', { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', placement: 'before', decimalPlaces: 2, isSystem: true, isActive: true }],
	['AUD', { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', placement: 'before', decimalPlaces: 2, isSystem: true, isActive: true }],
	['CHF', { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', placement: 'before', decimalPlaces: 2, isSystem: true, isActive: true }],
	['CNY', { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', placement: 'before', decimalPlaces: 2, isSystem: true, isActive: true }],
	['BTC', { code: 'BTC', name: 'Bitcoin', symbol: '₿', placement: 'before', decimalPlaces: 8, isSystem: true, isActive: true }],
	['ETH', { code: 'ETH', name: 'Ethereum', symbol: 'Ξ', placement: 'before', decimalPlaces: 18, isSystem: true, isActive: true }],
]);

// ============================================================================
// TRANSACTION TYPE SYSTEM DOCUMENTATION
// ============================================================================

/**
 * Enhanced Transaction Type System:
 * 
 * The transaction type system now uses both type and amount to determine the actual impact:
 * 
 * - Income (positive amount): Normal income (adds to balance)
 * - Income (negative amount): Negative adjustment (reduces balance)
 * - Expense (positive amount): Normal expense (reduces balance) - treated as negative in calculations
 * - Expense (negative amount): Positive adjustment (adds to balance) - like cashback
 * - Transfer: Amount represents the net change between accounts
 * - Adjustment: Direct balance modification
 * 
 * This system allows for flexible handling of:
 * - Cashback and refunds (negative expenses)
 * - Chargebacks and corrections (negative income)
 * - Normal income and expenses (positive amounts)
 * - Meta-adjustments that don't affect budgeting
 */

/**
 * Helper function to calculate the actual balance impact of a transaction
 * For transfers, requires accountId to determine impact
 */
export function calculateTransactionImpact(transaction: Transaction, accountId?: string): number {
	switch (transaction.type) {
		case 'income':
			return transaction.amount || 0; // Positive adds, negative subtracts
		case 'expense':
			return -(transaction.amount || 0); // Positive subtracts, negative adds (like cashback)
		case 'transfer':
			// For transfers, use transferDetails instead of amount field
			if (transaction.transferDetails && accountId) {
				return calculateTransferImpact(transaction, accountId);
			}
			return transaction.amount || 0; // Fallback for legacy transfers
		case 'adjustment':
			return transaction.amount || 0; // Direct modification
		default:
			return 0;
	}
}

/**
 * Helper function to calculate transfer impact for a specific account
 * Transfers don't use the amount field - all amounts derived from transferDetails
 */
export function calculateTransferImpact(transaction: Transaction, accountId: string): number {
	if (transaction.type !== 'transfer' || !transaction.transferDetails) {
		return 0;
	}

	const { toAccountId, transferAmount, feeAmount, feeAccountId } = transaction.transferDetails;
	const sourceAccountId = transaction.accountId;
	const feeAccount = feeAccountId || sourceAccountId; // Default fee to source account
	
	if (accountId === sourceAccountId) {
		// Source account: money going out + fee (if fee is on this account)
		const feeOnThisAccount = feeAccount === sourceAccountId ? (feeAmount || 0) : 0;
		return -(transferAmount + feeOnThisAccount);
	} else if (accountId === toAccountId) {
		// Destination account: money coming in
		return transferAmount;
	} else if (accountId === feeAccount && feeAmount && feeAmount > 0) {
		// Fee account: fee expense (if fee is on different account)
		return -feeAmount;
	}
	
	return 0; // No impact on other accounts
}

/**
 * Helper function to determine if a transaction should be counted in spending calculations
 */
export function isSpendingTransaction(transaction: Transaction): boolean {
	return transaction.type === 'expense' && (transaction.amount || 0) > 0;
}

/**
 * Helper function to determine if a transaction should be counted in income calculations
 */
export function isIncomeTransaction(transaction: Transaction): boolean {
	return transaction.type === 'income' && (transaction.amount || 0) > 0;
}

/**
 * Helper function to validate split transaction consistency
 */
export function validateSplitTransaction(splitTransactions: Transaction[]): {
	isValid: boolean;
	errors: string[];
	totalAmount: number;
} {
	const errors: string[] = [];
	
	if (splitTransactions.length === 0) {
		return { isValid: false, errors: ['At least one split transaction is required'], totalAmount: 0 };
	}
	
	// All splits must have the same splitId
	const splitId = splitTransactions[0].splitId;
	if (!splitId) {
		errors.push('All split transactions must have a splitId');
	}
	
	// All splits must have the same type
	const type = splitTransactions[0].type;
	if (!splitTransactions.every(tx => tx.type === type)) {
		errors.push('All split transactions must have the same type');
	}
	
	// All splits must have the same status
	const status = splitTransactions[0].status;
	if (!splitTransactions.every(tx => tx.status === status)) {
		errors.push('All split transactions must have the same status');
	}
	
	// All splits must have the same currency
	const currency = splitTransactions[0].currency;
	if (!splitTransactions.every(tx => tx.currency === currency)) {
		errors.push('All split transactions must have the same currency');
	}
	
	// All splits must have the same accountId (for non-transfers)
	if (type !== 'transfer') {
		const accountId = splitTransactions[0].accountId;
		if (!splitTransactions.every(tx => tx.accountId === accountId)) {
			errors.push('All split transactions must have the same accountId (except for transfers)');
		}
	}
	
	// For transfers, validate transfer-specific rules instead of generic split rules
	if (type === 'transfer') {
		// Transfer validation is handled by validateTransferSplit function
		// Skip the generic toAccountId validation for transfers
	} else {
		// For non-transfer splits, validate toAccountId consistency
		const toAccountId = splitTransactions[0].toAccountId;
		if (!splitTransactions.every(tx => tx.toAccountId === toAccountId)) {
			errors.push('All non-transfer splits must have the same toAccountId');
		}
	}
	
	// All splits must have the same timing fields
	const clearedDate = splitTransactions[0].clearedDate;
	const plannedDate = splitTransactions[0].plannedDate;
	if (!splitTransactions.every(tx => tx.clearedDate === clearedDate)) {
		errors.push('All split transactions must have the same clearedDate');
	}
	if (!splitTransactions.every(tx => tx.plannedDate === plannedDate)) {
		errors.push('All split transactions must have the same plannedDate');
	}
	
	// All splits must have the same recurrence fields
	const recurrenceRule = splitTransactions[0].recurrenceRule;
	const parentRecurrenceId = splitTransactions[0].parentRecurrenceId;
	if (!splitTransactions.every(tx => tx.recurrenceRule === recurrenceRule)) {
		errors.push('All split transactions must have the same recurrenceRule');
	}
	if (!splitTransactions.every(tx => tx.parentRecurrenceId === parentRecurrenceId)) {
		errors.push('All split transactions must have the same parentRecurrenceId');
	}
	
	// All splits must have the same metadata fields
	const reference = splitTransactions[0].reference;
	const notes = splitTransactions[0].notes;
	const importSource = splitTransactions[0].importSource;
	if (!splitTransactions.every(tx => tx.reference === reference)) {
		errors.push('All split transactions must have the same reference');
	}
	if (!splitTransactions.every(tx => tx.notes === notes)) {
		errors.push('All split transactions must have the same notes');
	}
	if (!splitTransactions.every(tx => tx.importSource === importSource)) {
		errors.push('All split transactions must have the same importSource');
	}
	
		// All splits must have the same categorization tags
	const whatTag = splitTransactions[0].whatTag;
	const budgetCategoryId = splitTransactions[0].budgetCategoryId;
	const payeeId = splitTransactions[0].payeeId;
	if (!splitTransactions.every(tx => tx.whatTag === whatTag)) {
		errors.push('All split transactions must have the same whatTag');
	}
	if (!splitTransactions.every(tx => tx.budgetCategoryId === budgetCategoryId)) {
		errors.push('All split transactions must have the same budgetCategoryId');
	}
	if (!splitTransactions.every(tx => tx.payeeId === payeeId)) {
		errors.push('All split transactions must have the same payeeId');
	}
	
	// Validate split name consistency
	const splitName = splitTransactions[0].splitName;
	if (splitName && !splitTransactions.every(tx => tx.splitName === splitName)) {
		errors.push('All split transactions must have the same splitName');
	}
	
	// Calculate total amount
	const totalAmount = splitTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);
	
		return { isValid: errors.length === 0, errors, totalAmount };
}

/**
 * Validate transfer transaction
 */
export function validateTransfer(transaction: Transaction): {
	isValid: boolean;
	errors: string[];
} {
	const errors: string[] = [];
	
	if (transaction.type !== 'transfer') {
		return { isValid: true, errors: [] };
	}
	
	if (!transaction.transferDetails) {
		errors.push('Transfer must have transferDetails');
		return { isValid: false, errors };
	}
	
	const { toAccountId, transferAmount, feeAmount } = transaction.transferDetails;
	
	// Basic validations
	if (!toAccountId) {
		errors.push('Transfer must specify destination account');
	}
	
	if (transferAmount <= 0) {
		errors.push('Transfer amount must be positive');
	}
	
	if (feeAmount < 0) {
		errors.push('Fee amount cannot be negative');
	}
	
	if (transaction.accountId === toAccountId) {
		errors.push('Cannot transfer to the same account');
	}
	
	return { isValid: errors.length === 0, errors };
}

/**
 * Validate split transactions for creation (without requiring splitId)
 */
export function validateNewSplitTransaction(splitTransactions: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>[]): {
	isValid: boolean;
	errors: string[];
	totalAmount: number;
} {
	const errors: string[] = [];
	
	if (splitTransactions.length === 0) {
		return { isValid: false, errors: ['At least one split transaction is required'], totalAmount: 0 };
	}
	
	// All splits must have the same type
	const type = splitTransactions[0].type;
	if (!splitTransactions.every(tx => tx.type === type)) {
		errors.push('All split transactions must have the same type');
	}
	
	// All splits must have the same status
	const status = splitTransactions[0].status;
	if (!splitTransactions.every(tx => tx.status === status)) {
		errors.push('All split transactions must have the same status');
	}
	
	// All splits must have the same currency
	const currency = splitTransactions[0].currency;
	if (!splitTransactions.every(tx => tx.currency === currency)) {
		errors.push('All split transactions must have the same currency');
	}
	
	// All splits must have the same accountId (for non-transfers)
	if (type !== 'transfer') {
		const accountId = splitTransactions[0].accountId;
		if (!splitTransactions.every(tx => tx.accountId === accountId)) {
			errors.push('All split transactions must have the same accountId (except for transfers)');
		}
	}
	
	// For transfers, validate transfer-specific rules instead of generic split rules
	if (type === 'transfer') {
		// Transfer validation is handled by validateTransferSplit function
		// Skip the generic toAccountId validation for transfers
	} else {
		// For non-transfer splits, validate toAccountId consistency
		const toAccountId = splitTransactions[0].toAccountId;
		if (!splitTransactions.every(tx => tx.toAccountId === toAccountId)) {
			errors.push('All non-transfer splits must have the same toAccountId');
		}
	}
	
	// All splits must have the same timing fields
	const clearedDate = splitTransactions[0].clearedDate;
	const plannedDate = splitTransactions[0].plannedDate;
	if (!splitTransactions.every(tx => tx.clearedDate === clearedDate)) {
		errors.push('All split transactions must have the same clearedDate');
	}
	if (!splitTransactions.every(tx => tx.plannedDate === plannedDate)) {
		errors.push('All split transactions must have the same plannedDate');
	}
	
	// All splits must have the same recurrence fields
	const recurrenceRule = splitTransactions[0].recurrenceRule;
	const parentRecurrenceId = splitTransactions[0].parentRecurrenceId;
	if (!splitTransactions.every(tx => tx.recurrenceRule === recurrenceRule)) {
		errors.push('All split transactions must have the same recurrenceRule');
	}
	if (!splitTransactions.every(tx => tx.parentRecurrenceId === parentRecurrenceId)) {
		errors.push('All split transactions must have the same parentRecurrenceId');
	}
	
	// All splits must have the same metadata fields
	const reference = splitTransactions[0].reference;
	const notes = splitTransactions[0].notes;
	const importSource = splitTransactions[0].importSource;
	if (!splitTransactions.every(tx => tx.reference === reference)) {
		errors.push('All split transactions must have the same reference');
	}
	if (!splitTransactions.every(tx => tx.notes === notes)) {
		errors.push('All split transactions must have the same notes');
	}
	if (!splitTransactions.every(tx => tx.importSource === importSource)) {
		errors.push('All split transactions must have the same importSource');
	}
	
	// All splits must have the same categorization tags
	const whatTag = splitTransactions[0].whatTag;
	const budgetCategoryId = splitTransactions[0].budgetCategoryId;
	const payeeId = splitTransactions[0].payeeId;
	if (!splitTransactions.every(tx => tx.whatTag === whatTag)) {
		errors.push('All split transactions must have the same whatTag');
	}
	if (!splitTransactions.every(tx => tx.budgetCategoryId === budgetCategoryId)) {
		errors.push('All split transactions must have the same budgetCategoryId');
	}
	if (!splitTransactions.every(tx => tx.payeeId === payeeId)) {
		errors.push('All split transactions must have the same payeeId');
	}
	
	// Validate split name consistency (if provided)
	const splitName = splitTransactions[0].splitName;
	if (splitName && !splitTransactions.every(tx => tx.splitName === splitName)) {
		errors.push('All split transactions must have the same splitName');
	}
	
	// Calculate total amount
	const totalAmount = splitTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);
	
	return { isValid: errors.length === 0, errors, totalAmount };
}

// ============================================================================
// SCHEMAS (matching the SQL schema)
// ============================================================================

// Base schemas
const BaseSchema = z.object({
	id: z.string(),
	createdAt: z.string().datetime().default(() => new Date().toISOString()),
	updatedAt: z.string().datetime().default(() => new Date().toISOString()),
	deletedAt: z.string().datetime().nullable().default(null)
});

// Currency Schema
const CurrencySchema = BaseSchema.extend({
	code: z.string().min(3).max(3).refine(CurrencyUtils.isValidCurrencyCode, {
		message: 'Currency code must be 3 uppercase letters (ISO 4217 format)'
	}),
	name: z.string().min(1),
	symbol: z.string().min(1),
	placement: z.enum(['before', 'after']).default('before'),
	decimalPlaces: z.number().min(0).max(18).default(2),
	isSystem: z.boolean().default(false),
	isActive: z.boolean().default(true)
});

// Account Schema
const AccountSchema = BaseSchema.extend({
	name: z.string().min(1),
	type: z.enum(['checking', 'savings', 'credit', 'cash', 'investment', 'crypto']),
	currency: z.string().min(3).max(3).default('USD'),
	initialBalance: z.number().default(0),
	currentBalance: z.number().default(0),
	isActive: z.boolean().default(true)
});

// Payee Schema (replaces 'who' tags)
const PayeeSchema = BaseSchema.extend({
	name: z.string().min(1),
	number: z.string().optional(), // Phone number, account number, etc.
	location: z.string().optional(), // Address, coordinates, etc.
	priorityLevel: z.enum(['high', 'medium', 'low', 'blocked']).default('medium'),
	phoneBookId: z.string().optional(), // Integration with phone contacts
	notes: z.string().optional(),
	isActive: z.boolean().default(true)
});

// Priority Level Mapping Schema (for 'why' tags)
const PriorityLevelMappingSchema = BaseSchema.extend({
	whyTag: z.string(), // References WhyTag enum values
	priorityLevel: z.enum(['survival', 'security', 'growth', 'lifestyle']),
	description: z.string().optional(),
	isActive: z.boolean().default(true)
});

// Tag Dimension Schema (for custom dimensions beyond what/why)
const TagDimensionSchema = BaseSchema.extend({
	name: z.string().min(1),
	description: z.string().optional(),
	required: z.boolean().default(false),
	multiSelect: z.boolean().default(false),
	color: z.string().optional(),
	isSystem: z.boolean().default(false),
	isActive: z.boolean().default(true)
});

// Tag Schema
const TagSchema = BaseSchema.extend({
	name: z.string().min(1),
	dimension: z.string(), // References TagDimension.name or system dimensions ('what', 'why')
	color: z.string().optional(),
	isActive: z.boolean().default(true)
});

// Transaction Tag Assignment Schema (for custom dimensions)
const TransactionTagSchema = BaseSchema.extend({
	transactionId: z.string(),
	tagId: z.string(),
	dimension: z.string()
});

// Bank Transaction Schema (what actually happened in accounts)
const BankTransactionSchema = BaseSchema.extend({
	accountId: z.string(),
	externalId: z.string().optional(),
	amount: z.number(),
	description: z.string().optional(),
	transactionDate: z.string().datetime(),
	importSource: z.string().optional(),
	rawData: z.string().optional() // Original CSV row or import data
});

export const TransactionType = z.enum([
	'income',
	'expense',
	'transfer',
	'adjustment'
]);

// Unified Transaction Schema
export const TransactionStatus = z.enum([
	'planned',     // Future transaction
	'pending',     // Imported from bank but not categorized
	'cleared',     // Finalized and categorized
	'cancelled'    // Planned transaction that didn't happen
]);

export const ConfidenceLevel = z.enum([
	'confirmed',   // Definitely happening (recurring bills)
	'expected',    // Likely happening (planned grocery trip)
	'estimated'    // Rough projection
]);

// System dimension enums for performance
export const WhatTag = z.enum([
	'coffee', 'groceries', 'dining', 'gas', 'rent', 'utilities', 'entertainment',
	'clothing', 'electronics', 'medical', 'transportation', 'shopping', 'income',
	'freelance', 'investment', 'gift', 'salary', 'maintenance', 'insurance',
	'fitness', 'hobbies', 'streaming', 'parking', 'tolls', 'banking_fees', 'other'
]);

export const WhyTag = z.enum([
	'essential', 'discretionary', 'emergency', 'health', 'convenience', 'entertainment',
	'work', 'personal', 'family', 'social', 'education', 'investment', 'savings',
	'debt', 'income', 'other'
]);

// Removed WhereTag enum - location is now handled by Payee schema

const TransactionSchema = BaseSchema.extend({
	type: TransactionType,
	status: TransactionStatus,
	confidence: ConfidenceLevel.optional(), // Only for planned status
	
	// Core fields (always present)
	accountId: z.string(),
	amount: z.number().optional(), // Optional for transfers - they use transferDetails
	currency: z.string().min(3).max(3), // Shared across all splits
	description: z.string().optional(), // Can be customized per split transaction
	
	// Unified budget system - budget categories replace why tags
	whatTag: WhatTag.optional(), // What was purchased (still used)
	budgetCategoryId: z.string().optional(), // Direct reference to budget category (replaces whyTag)
	payeeId: z.string().optional(), // References Payee instead of whereTag
	
	// Planning fields (planned status) - shared across all splits
	plannedDate: z.string().datetime().optional(),
	plannedAmount: z.number().optional(), // If different from final amount
	
	// Cleared fields (cleared status) - shared across all splits
	clearedDate: z.string().datetime().optional(),
	bankTransactionId: z.string().optional(), // Link to imported transaction
	
	// Split Management Fields
	splitId: z.string().optional(), // Same for all parts of the split
	splitName: z.string().optional(), // Could be same or customized per part
	
	// Transfer fields - shared across all splits for transfers
	toAccountId: z.string().optional(),
	
	// Enhanced Transfer Schema - Single Transaction Approach
	transferDetails: z.object({
		toAccountId: z.string(), // Destination account
		transferAmount: z.number().positive(), // Positive amount being transferred
		feeAmount: z.number().min(0).default(0), // Fee amount (can be 0)
		feeAccountId: z.string().optional(), // Which account pays the fee (default: source)
		feeCategoryId: z.string().optional(), // Budget category for the fee
		feeWhatTag: z.string().optional(), // What tag for the fee (e.g., 'banking_fees')
	}).optional(),
	
	// Recurrence - shared across all splits
	recurrenceRule: z.string().optional(),
	parentRecurrenceId: z.string().optional(), // Links to the recurring template
	
	// Metadata - shared across all splits
	reference: z.string().optional(),
	notes: z.string().optional(),
	importSource: z.string().optional()
});



// Dynamic Settings Schema (for key-value settings that can't be predefined)
const DynamicSettingsSchema = BaseSchema.extend({
	key: z.string(),
	value: z.string(),
	dataType: z.enum(['string', 'number', 'boolean', 'json']).default('string')
});

// User Preferences Schema (structured settings with type safety)
const UserPreferencesSchema = BaseSchema.extend({
	// User Profile
	username: z.string().min(1).default('User'),
	
	// Income and Budget Preferences
	incomeMode: z.enum(['pessimistic', 'optimistic', 'adaptive']).default('adaptive'),
	incomeConfidenceThreshold: z.number().min(0).max(1).default(0.8),
	defaultBudgetType: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
	
	// Global Budget Settings
	allowGlobalBorrowing: z.boolean().default(true),
	maxGlobalBorrowPercentage: z.number().min(0).max(1).default(0.1),
	spendingMomentumCooldown: z.number().default(30),
	velocityAlertThreshold: z.number().default(2.0),
	
	// Alert Preferences
	dailyBudgetReminders: z.boolean().default(true),
	overspendingAlerts: z.boolean().default(true),
	goalMilestoneAlerts: z.boolean().default(true),
	
	// Life Stage and Context (for enhanced budget service)
	lifeStage: z.enum(['student', 'early_career', 'mid_career', 'late_career', 'pre_retirement', 'retired']).default('mid_career'),
	incomeVolatility: z.enum(['low', 'medium', 'high']).default('medium'),
	stressLevel: z.enum(['low', 'medium', 'high']).default('medium'),
	
	// UI Preferences
	theme: z.enum(['light', 'dark']).default('dark'),
	language: z.enum(['en', 'ru']).default('en'),
	currency: z.string().min(3).max(3).default('USD'),
	firstDayOfWeek: z.number().min(0).max(6).default(0), // 0 = Sunday, 1 = Monday, etc.
	
	// Date Display Preferences
	dateDisplayFormat: z.enum(['date', 'time', 'datetime']).default('time'),
	plannedDateDisplayFormat: z.enum(['date', 'time', 'datetime']).default('date'),
	clearedDateDisplayFormat: z.enum(['date', 'time', 'datetime']).default('time'),
	
	// Notification Preferences
	notificationsEnabled: z.boolean().default(true),
	
	// User Maturity and Onboarding
	userMaturityLevel: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).default('beginner'),
	onboardingCompleted: z.boolean().default(false),
	
	// Feature Flags
	enableAdvancedFeatures: z.boolean().default(false),
	enablePredictiveAnalytics: z.boolean().default(true),
	enableEmotionalIntelligence: z.boolean().default(true),
	enableContextualSuggestions: z.boolean().default(true),
	
	// Privacy and Data Preferences
	dataSharingEnabled: z.boolean().default(false),
	analyticsEnabled: z.boolean().default(true),
	backupEnabled: z.boolean().default(true),
	
	// User Actions Tracking Preferences
	userActionsTrackingEnabled: z.boolean().default(true),
	userActionsTrackingPreferences: z.object({
		transaction_timing: z.boolean().default(true),
		budget_adherence: z.boolean().default(true),
		spending_patterns: z.boolean().default(true),
		habit_formation: z.boolean().default(true)
	}).default({
		transaction_timing: true,
		budget_adherence: true,
		spending_patterns: true,
		habit_formation: true
	}),
	userActionsRetentionDays: z.number().min(30).max(1095).default(365), // 1 year default, max 3 years
	
	// Performance Preferences
	cacheEnabled: z.boolean().default(true),
	offlineModeEnabled: z.boolean().default(false),
	
	// Import/Export Preferences
	autoImportEnabled: z.boolean().default(false),
	exportFormat: z.enum(['json', 'csv', 'pdf']).default('json'),
	
	// Accessibility Preferences
	highContrastMode: z.boolean().default(false),
	reducedMotion: z.boolean().default(false),
	fontSize: z.enum(['small', 'medium', 'large']).default('medium')
});

// Enhanced Categorization Rule Schema (for Phase 2)
const CategorizationRuleSchema = BaseSchema.extend({
	name: z.string(),
	description: z.string().optional(),
	conditions: z.string(), // JSON string - enhanced to use any transaction field
	actions: z.string(), // JSON string - enhanced actions including priority adjustments
	priority: z.number().default(0),
	isActive: z.boolean().default(true),
	autoApply: z.boolean().default(false),
	timesApplied: z.number().default(0),
	lastAppliedAt: z.string().datetime().optional(),
	
	// Enhanced rule engine fields
	ruleType: z.enum(['categorization', 'priority', 'lifestyle', 'custom']).default('categorization'),
	triggerFields: z.array(z.string()).optional(), // Which fields trigger this rule
	conditionLogic: z.enum(['AND', 'OR', 'NOT']).default('AND'),
	actionType: z.enum(['set_tags', 'adjust_priority', 'boost_category', 'reduce_category', 'custom']).default('set_tags'),
	
	// Lifestyle mode integration
	lifestyleModeId: z.string().optional(), // Link to lifestyle mode
	effectiveDate: z.string().datetime().optional(),
	expiryDate: z.string().datetime().optional()
});



// Import Preset Schema
const ImportPresetSchema = BaseSchema.extend({
	name: z.string(),
	description: z.string().optional(),
	bankName: z.string().optional(),
	config: z.string(), // JSON string
	isPublic: z.boolean().default(false),
	usageCount: z.number().default(0)
});

// Import History Schema
const ImportHistorySchema = BaseSchema.extend({
	presetId: z.string().optional(),
	filename: z.string(),
	recordsImported: z.number().default(0),
	recordsFailed: z.number().default(0),
	errorLog: z.string().optional() // JSON string
});

// Spending Insights Schema
const SpendingInsightSchema = BaseSchema.extend({
	// Updated to work with tags
	targetType: z.enum(['what', 'why', 'where', 'custom']),
	targetTagId: z.string().optional(),
	targetSystemTag: z.string().optional(),
	
	insightType: z.string(), // 'daily_average', 'weekly_trend', 'monthly_comparison'
	timePeriod: z.string(), // '2024-01', '2024-W01', '2024-01-01'
	amount: z.number().optional(),
	transactionCount: z.number().optional(),
	metadata: z.string().optional() // JSON string
});

// User Actions Schema
const UserActionSchema = BaseSchema.extend({
	action: z.string(),
	metadata: z.string(), // JSON string
	context: z.string().optional(), // JSON string
	timestamp: z.string().datetime(),
	sessionId: z.string().optional()
});

// Budget Category Schema (unified why tag + budget)
const BudgetCategorySchema = BaseSchema.extend({
	name: z.string().min(1),
	waterfallCategory: z.enum(['survival', 'security', 'growth', 'lifestyle']),
	priority: z.number().min(1),
	
	// Budget settings
	allocatedAmount: z.number().min(0),
	recurringPeriod: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'yearly', 'custom']).default('monthly'),
	customPeriodDays: z.number().optional(),
	
	// Current period tracking
	spent: z.number().default(0),
	remaining: z.number().default(0),
	
	// Goal system
	isGoalBased: z.boolean().default(false),
	goalTarget: z.number().optional(),
	goalProgress: z.number().default(0),
	isComplete: z.boolean().default(false),
	
	// Automatic adjustments
	carryoverAmount: z.number().default(0),
	maxCarryoverPercent: z.number().min(0).max(1).default(0.2),
	autoAdjustmentsEnabled: z.boolean().default(true),
	
	// Metadata
	color: z.string().optional(),
	description: z.string().optional(),
	isActive: z.boolean().default(true)
});

// Fund Transfer Schema
const FundTransferSchema = BaseSchema.extend({
	fromCategoryId: z.string(),
	toCategoryId: z.string(),
	amount: z.number().positive(),
	reason: z.enum(['user_reallocation', 'automatic_borrowing', 'goal_completion']),
	respectsWaterfall: z.boolean().default(true),
	timestamp: z.string().datetime()
});

// Goals System Schemas
const GoalSchema = BaseSchema.extend({
	name: z.string().min(1),
	description: z.string().optional(),
	targetAmount: z.number().positive(),
	currentAmount: z.number().min(0).default(0),
	currency: z.string().length(3),
	category: z.enum(['emergency_fund', 'vacation', 'house_down_payment', 'car_purchase', 'education', 'retirement', 'debt_payoff', 'investment', 'wedding', 'home_improvement', 'other']),
	priority: z.enum(['low', 'medium', 'high', 'critical']),
	status: z.enum(['active', 'paused', 'completed', 'cancelled']).default('active'),
	targetDate: z.string().datetime().optional(),
	completedAt: z.string().datetime().optional(),
	monthlyContribution: z.number().min(0).optional(),
	isRecurring: z.boolean().default(false),
	parentGoalId: z.string().optional(),
	tags: z.array(z.string()).default([])
});

const GoalProgressSchema = BaseSchema.extend({
	goalId: z.string(),
	date: z.string().datetime(),
	amount: z.number(),
	note: z.string().optional(),
	source: z.enum(['manual', 'automatic', 'transfer']).default('manual')
});

const GoalInsightSchema = BaseSchema.extend({
	type: z.enum(['achievement', 'milestone', 'recommendation', 'warning', 'celebration', 'optimization']),
	title: z.string().min(1),
	description: z.string().min(1),
	priority: z.enum(['low', 'medium', 'high']),
	actionable: z.boolean().default(false),
	goalId: z.string().optional(),
	dismissedAt: z.string().datetime().optional(),
	metadata: z.record(z.any()).optional()
});

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type Account = z.infer<typeof AccountSchema>;
export type Currency = z.infer<typeof CurrencySchema>;
export type TagDimension = z.infer<typeof TagDimensionSchema>;
export type Tag = z.infer<typeof TagSchema>;
export type TransactionTag = z.infer<typeof TransactionTagSchema>;
export type BankTransaction = z.infer<typeof BankTransactionSchema>;
export type Transaction = z.infer<typeof TransactionSchema>;

// Add transaction-specific utility functions after Transaction type is defined
export const TransactionUtils = {
	/**
	 * Validate transaction dates based on status
	 */
	validateTransactionDate(date: string, status: Transaction['status']): { isValid: boolean; error?: string } {
		const transactionDate = new Date(date);
		const now = new Date();

		// Validate date format
		if (isNaN(transactionDate.getTime())) {
			return { isValid: false, error: 'Invalid date format' };
		}

		switch (status) {
			case 'cleared':
				// Cleared transactions cannot be in the future
				if (transactionDate > now) {
					return { isValid: false, error: 'Cleared transactions cannot have future dates' };
				}
				break;
			case 'planned':
				// Planned transactions cannot be in the past
				if (transactionDate < now) {
					return { isValid: false, error: 'Planned transactions cannot have past dates' };
				}
				break;
			case 'pending':
			case 'cancelled':
				// No date restrictions for pending or cancelled
				break;
		}

		return { isValid: true };
	}
};

export type Settings = z.infer<typeof DynamicSettingsSchema>;
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;
export type CategorizationRule = z.infer<typeof CategorizationRuleSchema>;
export type ImportPreset = z.infer<typeof ImportPresetSchema>;
export type ImportHistory = z.infer<typeof ImportHistorySchema>;
export type SpendingInsight = z.infer<typeof SpendingInsightSchema>;
export type UserAction = z.infer<typeof UserActionSchema>;

// System dimension types
export type WhatTagType = z.infer<typeof WhatTag>;
export type WhyTagType = z.infer<typeof WhyTag>;
export type TransactionType = z.infer<typeof TransactionType>;


// Additional type definitions
export type BalancesByType = {
		income: number;
		savings: number;
		expenses: number;
};

export type Payee = z.infer<typeof PayeeSchema>;
export type PriorityLevelMapping = z.infer<typeof PriorityLevelMappingSchema>;
export type BudgetCategory = z.infer<typeof BudgetCategorySchema>;
export type FundTransfer = z.infer<typeof FundTransferSchema>;
export type Goal = z.infer<typeof GoalSchema>;
export type GoalProgress = z.infer<typeof GoalProgressSchema>;
export type GoalInsight = z.infer<typeof GoalInsightSchema>;

// ============================================================================
// DATABASE CLASS
// ============================================================================

export class BudgicDB extends Dexie {
	// Core entities
	accounts!: Table<Account>;
	currencies!: Table<Currency>;
	tagDimensions!: Table<TagDimension>;
	tags!: Table<Tag>;
	transactionTags!: Table<TransactionTag>;
	
	// Transactions
	bankTransactions!: Table<BankTransaction>;
	transactions!: Table<Transaction>;
	
	// Planning System (renamed from Budget)

	
	// Settings & Preferences
	dynamicSettings!: Table<Settings>;
	userPreferences!: Table<UserPreferences>;
	
	// Rules & Automation
	categorizationRules!: Table<CategorizationRule>;
	
	// Import/Export
	importPresets!: Table<ImportPreset>;
	importHistory!: Table<ImportHistory>;
	
	// Analytics
	spendingInsights!: Table<SpendingInsight>;

	// Budget System
	budgetCategories!: Table<BudgetCategory>;
	fundTransfers!: Table<FundTransfer>;
	
	// Add Payee and PriorityLevelMapping types
	payees!: Table<Payee>;
	priorityLevelMappings!: Table<PriorityLevelMapping>;
	userActions!: Table<UserAction>;

	// Goals System
	goals!: Table<Goal>;
	goalProgress!: Table<GoalProgress>;
	goalInsights!: Table<GoalInsight>;

	constructor() {
		super('BudgicDB');
		
		this.version(4).stores({
			// Core entities
			accounts: 'id, type, currency, isActive, deletedAt, createdAt, updatedAt',
			currencies: 'id, code, name, isSystem, isActive, deletedAt, createdAt, updatedAt',
			tagDimensions: 'id, name, isSystem, isActive, deletedAt, createdAt',
			tags: 'id, name, dimension, isActive, deletedAt, createdAt',
			transactionTags: 'id, transactionId, tagId, dimension, createdAt',
			
			// Transactions
			bankTransactions: 'id, accountId, externalId, transactionDate, importSource, deletedAt, createdAt, updatedAt',
			transactions: 'id, type, status, accountId, whatTag, budgetCategoryId, payeeId, plannedDate, clearedDate, splitId, deletedAt, createdAt, updatedAt',
			
			// Planning System (renamed from Budget)
			plans: 'id, targetType, targetTagId, targetSystemTag, planType, startDate, endDate, createdAt, updatedAt',
			lifestyleModes: 'id, name, isActive, triggerType, startDate, endDate, createdAt, updatedAt',
			
			// Settings & Preferences
			dynamicSettings: 'id, key, dataType, deletedAt, createdAt, updatedAt',
			userPreferences: 'id, createdAt, updatedAt',
			
			// Rules & Automation
			categorizationRules: 'id, name, priority, isActive, autoApply, deletedAt, createdAt, updatedAt',
			
			// Import/Export
			importPresets: 'id, name, bankName, isPublic, createdAt, updatedAt',
			importHistory: 'id, presetId, filename, importedAt',
			
			// Analytics
			spendingInsights: 'id, targetType, targetTagId, targetSystemTag, insightType, timePeriod, computedAt',
			
			// Composite indexes for complex queries
			'[accountId+status]': 'accountId, status',
			'[accountId+clearedDate]': 'accountId, clearedDate',
			'[whatTag+status]': 'whatTag, status',
			'[budgetCategoryId+status]': 'budgetCategoryId, status',
			'[transactionId+dimension]': 'transactionId, dimension',
			'[targetType+targetTagId]': 'targetType, targetTagId',
			'[targetType+targetSystemTag]': 'targetType, targetSystemTag',

			// Performance optimization indexes (Phase 1 requirements)
			'[date+accountId]': 'clearedDate, accountId',
			'[accountId+categoryId]': 'accountId, whatTag',
			'[amount+status]': 'amount, status',
			'[currency+amount]': 'currency, amount',
			'[splitId+status]': 'splitId, status',
			'[payeeId+status]': 'payeeId, status',
			'[plannedDate+status]': 'plannedDate, status',
			'[clearedDate+type]': 'clearedDate, type',

			// Budget System
			budgetCategories: 'id, name, waterfallCategory, priority, allocatedAmount, spent, remaining, isActive, deletedAt, createdAt, updatedAt',
			fundTransfers: 'id, fromCategoryId, toCategoryId, amount, reason, timestamp, createdAt, updatedAt',
			
			// Add Payee and PriorityLevelMapping types
			payees: 'id, name, isActive, deletedAt, createdAt',
			priorityLevelMappings: 'id, whyTag, priorityLevel, isActive, deletedAt, createdAt',
			
			// User Actions & Behavior Tracking
			userActions: 'id, action, timestamp, userId, sessionId, createdAt, updatedAt, deletedAt',

			// Goals System
			goals: 'id, name, description, targetAmount, currentAmount, currency, category, priority, status, targetDate, createdAt, updatedAt, completedAt, monthlyContribution, isRecurring, parentGoalId, tags',
			goalProgress: 'id, goalId, date, amount, note, source',
			goalInsights: 'id, type, title, description, priority, actionable, goalId, createdAt, dismissedAt, metadata'
		});

		// Add validation hooks
		this.setupValidationHooks();
		
		// Add soft delete hooks
		this.setupSoftDeleteHooks();

		// Initialize system currencies
		this.initializeSystemCurrencies();
	}

	private async initializeSystemCurrencies(): Promise<void> {
		try {
			// Check if system currencies already exist
			const existingCurrencies = await this.getSystemCurrencies();
			if (existingCurrencies.length > 0) {
				return; // Already initialized
			}

			// Add system currencies from registry
			for (const [code, currencyInfo] of CURRENCY_REGISTRY) {
				if (currencyInfo.isSystem) {
					await this.currencies.add({
						id: generateUUID(),
						code: currencyInfo.code,
						name: currencyInfo.name,
						symbol: currencyInfo.symbol,
						placement: currencyInfo.placement,
						decimalPlaces: currencyInfo.decimalPlaces,
						isSystem: currencyInfo.isSystem,
						isActive: currencyInfo.isActive,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						deletedAt: null
					});
				}
			}
		} catch (error) {
			console.error('Failed to initialize system currencies:', error);
		}
	}

	private setupValidationHooks() {
		// Account validation
		this.accounts.hook('creating', (primKey, obj, trans) => {
			try {
				const validated = AccountSchema.parse(obj);
				Object.assign(obj, validated);
			} catch (error) {
				console.error('Account validation failed:', error);
				console.error('Account data:', obj);
				throw error;
			}
		});

		// Currency validation
		this.currencies.hook('creating', (primKey, obj, trans) => {
			try {
				const validated = CurrencySchema.parse(obj);
				Object.assign(obj, validated);
			} catch (error) {
				console.error('Currency validation failed:', error);
				console.error('Currency data:', obj);
				throw error;
			}
		});

		this.currencies.hook('updating', (modifications: Partial<Currency>, primKey, obj, trans) => {
			try {
				if (modifications.updatedAt === undefined) {
					modifications.updatedAt = new Date().toISOString();
				}
				const updated = { ...obj, ...modifications };
				CurrencySchema.parse(updated);
			} catch (error) {
				console.error('Currency update validation failed:', error);
				console.error('Currency data:', obj);
				console.error('Modifications:', modifications);
				throw error;
			}
		});

		this.accounts.hook('updating', (modifications: Partial<Account>, primKey, obj, trans) => {
			try {
				if (modifications.updatedAt === undefined) {
					modifications.updatedAt = new Date().toISOString();
				}
				const updated = { ...obj, ...modifications };
				AccountSchema.parse(updated);
			} catch (error) {
				console.error('Account update validation failed:', error);
				console.error('Account data:', obj);
				console.error('Modifications:', modifications);
				throw error;
			}
		});

		// Tag Dimension validation
		this.tagDimensions.hook('creating', (primKey, obj, trans) => {
			try {
				const validated = TagDimensionSchema.parse(obj);
				Object.assign(obj, validated);
			} catch (error) {
				console.error('Tag dimension validation failed:', error);
				console.error('Tag dimension data:', obj);
				throw error;
			}
		});

		this.tagDimensions.hook('updating', (modifications: Partial<TagDimension>, primKey, obj, trans) => {
			try {
				if (modifications.updatedAt === undefined) {
					modifications.updatedAt = new Date().toISOString();
				}
				const updated = { ...obj, ...modifications };
				TagDimensionSchema.parse(updated);
			} catch (error) {
				console.error('Tag dimension update validation failed:', error);
				console.error('Tag dimension data:', obj);
				console.error('Modifications:', modifications);
				throw error;
			}
		});

		// Tag validation
		this.tags.hook('creating', (primKey, obj, trans) => {
			try {
				const validated = TagSchema.parse(obj);
				Object.assign(obj, validated);
			} catch (error) {
				console.error('Tag validation failed:', error);
				console.error('Tag data:', obj);
				throw error;
			}
		});

		this.tags.hook('updating', (modifications: Partial<Tag>, primKey, obj, trans) => {
			try {
				if (modifications.updatedAt === undefined) {
					modifications.updatedAt = new Date().toISOString();
				}
				const updated = { ...obj, ...modifications };
				TagSchema.parse(updated);
			} catch (error) {
				console.error('Tag update validation failed:', error);
				console.error('Tag data:', obj);
				console.error('Modifications:', modifications);
				throw error;
			}
		});

		// Transaction validation
		this.transactions.hook('creating', (primKey, obj, trans) => {
			try {
				// Enhanced validation - skip amount validation for transfers
				if (obj.type !== 'transfer') {
					const amountValidation = CurrencyUtils.validateAmount(obj.amount, obj.currency);
					if (!amountValidation.isValid) {
						throw new Error(`Amount validation failed: ${amountValidation.error}`);
					}
				}

				// Date validation for cleared transactions
				if (obj.status === 'cleared' && obj.clearedDate) {
					const dateValidation = TransactionUtils.validateTransactionDate(obj.clearedDate, obj.status);
					if (!dateValidation.isValid) {
						throw new Error(`Date validation failed: ${dateValidation.error}`);
					}
				}

				// Date validation for planned transactions
				if (obj.status === 'planned' && obj.plannedDate) {
					const dateValidation = TransactionUtils.validateTransactionDate(obj.plannedDate, obj.status);
					if (!dateValidation.isValid) {
						throw new Error(`Date validation failed: ${dateValidation.error}`);
					}
				}

				const validated = TransactionSchema.parse(obj);
				Object.assign(obj, validated);
			} catch (error) {
				console.error('Transaction validation failed:', error);
				console.error('Transaction data:', obj);
				throw error;
			}
		});

		this.transactions.hook('updating', (modifications: Partial<Transaction>, primKey, obj, trans) => {
			try {
				if (modifications.updatedAt === undefined) {
					modifications.updatedAt = new Date().toISOString();
				}
				const updated = { ...obj, ...modifications };
				TransactionSchema.parse(updated);
			} catch (error) {
				console.error('Transaction update validation failed:', error);
				console.error('Transaction data:', obj);
				console.error('Modifications:', modifications);
				throw error;
			}
		});

		// Bank Transaction validation
		this.bankTransactions.hook('creating', (primKey, obj, trans) => {
			try {
				const validated = BankTransactionSchema.parse(obj);
				Object.assign(obj, validated);
			} catch (error) {
				console.error('Bank transaction validation failed:', error);
				console.error('Bank transaction data:', obj);
				throw error;
			}
		});

		this.bankTransactions.hook('updating', (modifications: Partial<BankTransaction>, primKey, obj, trans) => {
			try {
				if (modifications.updatedAt === undefined) {
					modifications.updatedAt = new Date().toISOString();
				}
				const updated = { ...obj, ...modifications };
				BankTransactionSchema.parse(updated);
			} catch (error) {
				console.error('Bank transaction update validation failed:', error);
				console.error('Bank transaction data:', obj);
				console.error('Modifications:', modifications);
				throw error;
			}
		});


	}

	private setupSoftDeleteHooks() {
		// Soft delete handling - exclude deleted items by default
		this.accounts.hook('reading', (obj) => {
			return obj.deletedAt ? undefined : obj;
		});

		this.currencies.hook('reading', (obj) => {
			return obj.deletedAt ? undefined : obj;
		});

		this.tagDimensions.hook('reading', (obj) => {
			return obj.deletedAt ? undefined : obj;
		});

		this.tags.hook('reading', (obj) => {
			return obj.deletedAt ? undefined : obj;
		});

		this.transactions.hook('reading', (obj) => {
			return obj.deletedAt ? undefined : obj;
		});

		this.bankTransactions.hook('reading', (obj) => {
			return obj.deletedAt ? undefined : obj;
		});



		this.dynamicSettings.hook('reading', (obj) => {
			return obj.deletedAt ? undefined : obj;
		});

		this.categorizationRules.hook('reading', (obj) => {
			return obj.deletedAt ? undefined : obj;
		});
	}

	// ============================================================================
	// HELPER METHODS FOR COMMON QUERIES
	// ============================================================================

	// ============================================================================
	// SPLIT TRANSACTION MANAGEMENT
	// ============================================================================

	/**
	 * Get all transactions in a split group
	 */
	async getSplitTransactions(splitId: string): Promise<Transaction[]> {
		return await this.transactions
			.where('splitId').equals(splitId)
			.filter(transaction => !transaction.deletedAt)
			.toArray();
	}

	/**
	 * Get the master transaction for a split
	 * Prioritizes transactions with descriptions, then largest amount
	 */
	async getSplitMasterTransaction(splitId: string): Promise<Transaction | null> {
		const splitTransactions = await this.getSplitTransactions(splitId);
		if (splitTransactions.length === 0) return null;
		
		// First, try to find a transaction with a description
		const withDescription = splitTransactions.find(tx => tx.description && tx.description.trim() !== '');
		if (withDescription) {
			// Among transactions with descriptions, pick the one with largest absolute amount
			const withDescriptions = splitTransactions.filter(tx => tx.description && tx.description.trim() !== '');
			return withDescriptions.reduce((master, current) => 
				Math.abs(current.amount || 0) > Math.abs(master.amount || 0) ? current : master
			);
		}
		
		// If no descriptions, return the transaction with the largest absolute amount
		return splitTransactions.reduce((master, current) => 
			Math.abs(current.amount || 0) > Math.abs(master.amount || 0) ? current : master
		);
	}

	/**
	 * Create a new split transaction group
	 */
	async createSplitTransactionGroup(
		splitTransactions: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>[],
		splitName?: string
	): Promise<string> {
		const splitId = generateUUID();
		const finalSplitName = splitName || 'Split Transaction';
		
		// Validate the split transactions for creation (without splitId requirement)
		const validation = validateNewSplitTransaction(splitTransactions);
		if (!validation.isValid) {
			throw new Error(`Invalid split transaction group: ${validation.errors.join(', ')}`);
		}
		
		// Enhanced split sum validation
		const splitSumValidation = BalanceUtils.validateSplitSum(splitTransactions as Transaction[]);
		if (!splitSumValidation.isValid) {
			throw new Error(`Split sum validation failed: ${splitSumValidation.errors.join(', ')}`);
		}
		
		// Create all transactions in the split
		await this.transaction('rw', [this.transactions], async () => {
			for (const transactionData of splitTransactions) {
				const transaction: Transaction = {
					...transactionData,
					id: generateUUID(),
					splitId,
					splitName: finalSplitName, // Ensure consistent split name
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					deletedAt: null
				};
				
				await this.transactions.add(transaction);
			}
		});
		
		return splitId;
	}

	/**
	 * Update a split transaction group
	 */
	async updateSplitTransactionGroup(
		splitId: string,
		updates: {
			sharedFields?: Partial<Pick<Transaction, 
				'type' | 'status' | 'currency' | 'whatTag' | 'budgetCategoryId' | 'payeeId' |
				'plannedDate' | 'clearedDate' | 'recurrenceRule' | 'parentRecurrenceId' |
				'reference' | 'notes' | 'importSource' | 'toAccountId' | 'splitName'
			>>;
			individualUpdates?: Array<{
				id: string;
				amount?: number;
				description?: string;
				accountId?: string;
			}>;
		}
	): Promise<void> {
		const splitTransactions = await this.getSplitTransactions(splitId);
		if (splitTransactions.length === 0) {
			throw new Error(`Split group ${splitId} not found`);
		}
		
		await this.transaction('rw', [this.transactions], async () => {
			// Update shared fields for all transactions in the split
			if (updates.sharedFields) {
				for (const transaction of splitTransactions) {
					await this.transactions.update(transaction.id, {
						...updates.sharedFields,
						updatedAt: new Date().toISOString()
					});
				}
			}
			
			// Update individual fields for specific transactions
			if (updates.individualUpdates) {
				for (const update of updates.individualUpdates) {
					const updateData: Partial<Transaction> = {
						updatedAt: new Date().toISOString()
					};
					
					if (update.amount !== undefined) updateData.amount = update.amount;
					if (update.description !== undefined) updateData.description = update.description;
					if (update.accountId !== undefined) updateData.accountId = update.accountId;
					
					await this.transactions.update(update.id, updateData);
				}
			}
		});
	}

	/**
	 * Delete an entire split transaction group
	 */
	async deleteSplitTransactionGroup(splitId: string): Promise<void> {
		const splitTransactions = await this.getSplitTransactions(splitId);
		
		await this.transaction('rw', [this.transactions], async () => {
			for (const transaction of splitTransactions) {
				await this.softDeleteTransaction(transaction.id);
			}
		});
	}

	/**
	 * Remove a transaction from a split (ungroup it)
	 */
	async removeTransactionFromSplit(transactionId: string): Promise<void> {
		await this.transactions.update(transactionId, {
			splitId: undefined,
			splitName: undefined,
			updatedAt: new Date().toISOString()
		});
	}

	/**
	 * Add a transaction to an existing split
	 */
	async addTransactionToSplit(
		transactionId: string,
		splitId: string,
		splitName?: string
	): Promise<void> {
		const splitTransactions = await this.getSplitTransactions(splitId);
		if (splitTransactions.length === 0) {
			throw new Error(`Split group ${splitId} not found`);
		}
		
		const transaction = await this.transactions.get(transactionId);
		if (!transaction) {
			throw new Error(`Transaction ${transactionId} not found`);
		}
		
		// Validate that the transaction can be added to this split
		// Check against all existing split transactions, not just the first one
		const allTransactions = [...splitTransactions, transaction];
		const validation = validateSplitTransaction(allTransactions);
		if (!validation.isValid) {
			throw new Error(`Transaction cannot be added to split: ${validation.errors.join(', ')}`);
		}
		
		// Ensure consistent split name across all transactions
		const finalSplitName = splitName || splitTransactions[0].splitName || 'Split Transaction';
		
		await this.transactions.update(transactionId, {
			splitId,
			splitName: finalSplitName,
			updatedAt: new Date().toISOString()
		});
	}

	/**
	 * Get split statistics for a given split
	 */
	async getSplitStatistics(splitId: string): Promise<{
		totalAmount: number;
		transactionCount: number;
		sharedFields: Partial<Transaction>;
		amounts: Array<{ id: string; amount: number; description?: string }>;
	}> {
		const splitTransactions = await this.getSplitTransactions(splitId);
		if (splitTransactions.length === 0) {
			throw new Error(`Split group ${splitId} not found`);
		}
		
		const totalAmount = splitTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);
		const masterTransaction = splitTransactions[0];
		
		return {
			totalAmount,
			transactionCount: splitTransactions.length,
			sharedFields: {
				type: masterTransaction.type,
				status: masterTransaction.status,
				currency: masterTransaction.currency,
				whatTag: masterTransaction.whatTag,
				budgetCategoryId: masterTransaction.budgetCategoryId,
				payeeId: masterTransaction.payeeId,
				plannedDate: masterTransaction.plannedDate,
				clearedDate: masterTransaction.clearedDate,
				recurrenceRule: masterTransaction.recurrenceRule,
				parentRecurrenceId: masterTransaction.parentRecurrenceId,
				reference: masterTransaction.reference,
				notes: masterTransaction.notes,
				importSource: masterTransaction.importSource,
				toAccountId: masterTransaction.toAccountId,
				splitName: masterTransaction.splitName
			},
			amounts: splitTransactions.map(tx => ({
				id: tx.id,
				amount: tx.amount || 0,
				description: tx.description
			}))
		};
	}

	// Account queries
	async getActiveAccounts(): Promise<Account[]> {
		return await this.accounts.filter(account => !account.deletedAt).toArray();
	}

	async getAccountsByType(type: Account['type']): Promise<Account[]> {
		return await this.accounts
			.where('type').equals(type)
			.filter(account => !account.deletedAt)
			.toArray();
	}

	async getAccountBalance(accountId: string): Promise<number> {
		const account = await this.accounts.get(accountId);
		return account?.currentBalance || 0;
	}

	// Currency queries
	async getActiveCurrencies(): Promise<Currency[]> {
		return await this.currencies.filter(currency => !currency.deletedAt).toArray();
	}

	async getCurrencyByCode(code: string): Promise<Currency | null> {
		const currency = await this.currencies
			.filter(currency => currency.code === code && !currency.deletedAt)
			.first();
		return currency || null;
	}

	async getSystemCurrencies(): Promise<Currency[]> {
		return await this.currencies
			.filter(currency => currency.isSystem && !currency.deletedAt)
			.toArray();
	}

	// Tag queries
	async getActiveTagDimensions(): Promise<TagDimension[]> {
		return await this.tagDimensions.filter(dimension => !dimension.deletedAt).toArray();
	}

	async getActiveTags(): Promise<Tag[]> {
		return await this.tags.filter(tag => !tag.deletedAt).toArray();
	}

	async getTagsByDimension(dimension: string): Promise<Tag[]> {
		return await this.tags
			.where('dimension').equals(dimension)
			.filter(tag => !tag.deletedAt)
			.toArray();
	}

	async getTransactionTags(transactionId: string): Promise<TransactionTag[]> {
		return await this.transactionTags
			.where('transactionId').equals(transactionId)
			.toArray();
	}

	// Transaction queries
	async getActiveTransactions(): Promise<Transaction[]> {
		return await this.transactions.filter(transaction => !transaction.deletedAt).toArray();
	}

	async getTransactionsByStatus(status: Transaction['status']): Promise<Transaction[]> {
		return await this.transactions
			.where('status').equals(status)
			.filter(transaction => !transaction.deletedAt)
			.toArray();
	}

	async getTransactionsByAccount(accountId: string): Promise<Transaction[]> {
		return await this.transactions
			.where('accountId').equals(accountId)
			.filter(transaction => !transaction.deletedAt)
			.toArray();
	}

	async getTransactionsRelatedToAccount(accountId: string): Promise<Transaction[]> {
		// Get transactions where account is either source (accountId) or destination (toAccountId)
		const sourceTransactions = await this.transactions
			.where('accountId').equals(accountId)
			.filter(transaction => !transaction.deletedAt)
			.toArray();
		
		const destinationTransactions = await this.transactions
			.where('toAccountId').equals(accountId)
			.filter(transaction => !transaction.deletedAt)
			.toArray();
		
		// Combine and sort by date (most recent first)
		const allTransactions = [...sourceTransactions, ...destinationTransactions];
		return allTransactions.sort((a, b) => {
			const dateA = a.clearedDate || a.plannedDate || a.createdAt;
			const dateB = b.clearedDate || b.plannedDate || b.createdAt;
			return new Date(dateB).getTime() - new Date(dateA).getTime();
		});
	}

	// New tag-based transaction queries
	async getTransactionsByWhatTag(whatTag: WhatTagType): Promise<Transaction[]> {
		return await this.transactions
			.where('whatTag').equals(whatTag)
			.filter(transaction => !transaction.deletedAt)
			.toArray();
	}

	async getTransactionsByBudgetCategory(budgetCategoryId: string): Promise<Transaction[]> {
		return await this.transactions
			.where('budgetCategoryId').equals(budgetCategoryId)
			.filter(transaction => !transaction.deletedAt)
			.toArray();
	}

	async getTransactionsByPayee(payeeId: string): Promise<Transaction[]> {
		return await this.transactions
			.where('payeeId').equals(payeeId)
			.filter(transaction => !transaction.deletedAt)
			.toArray();
	}

	async getTransactionsByDateRange(startDate: string, endDate: string): Promise<Transaction[]> {
		return await this.transactions
			.where('clearedDate')
			.between(startDate, endDate, true, true)
			.filter(transaction => !transaction.deletedAt)
			.toArray();
	}

	async getPlannedTransactions(): Promise<Transaction[]> {
		return await this.transactions
			.where('status').equals('planned')
			.filter(transaction => !transaction.deletedAt)
			.toArray();
	}

	async getPendingTransactions(): Promise<Transaction[]> {
		return await this.transactions
			.where('status').equals('pending')
			.filter(transaction => !transaction.deletedAt)
			.toArray();
	}

	async getClearedTransactions(): Promise<Transaction[]> {
		return await this.transactions
			.where('status').equals('cleared')
			.filter(transaction => !transaction.deletedAt)
			.toArray();
	}



	// Bank transaction queries
	async getBankTransactionsByAccount(accountId: string): Promise<BankTransaction[]> {
		return await this.bankTransactions
			.where('accountId').equals(accountId)
			.filter(transaction => !transaction.deletedAt)
			.toArray();
	}

	async getUncategorizedBankTransactions(): Promise<BankTransaction[]> {
		const bankTransactionIds = await this.bankTransactions
			.filter(transaction => !transaction.deletedAt)
			.primaryKeys();
		
		const categorizedBankTransactionIds = await this.transactions
			.filter(transaction => transaction.bankTransactionId !== null)
			.toArray()
			.then(transactions => transactions.map(t => t.bankTransactionId!));
		
		const uncategorizedIds = bankTransactionIds.filter(id => 
			!categorizedBankTransactionIds.includes(id)
		);
		
		return await this.bankTransactions
			.where('id')
			.anyOf(uncategorizedIds)
			.toArray();
	}

	// ============================================================================
	// SOFT DELETE METHODS
	// ============================================================================

	async softDeleteAccount(id: string): Promise<void> {
		await this.accounts.update(id, { 
			deletedAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		});
	}

	async softDeleteTagDimension(id: string): Promise<void> {
		await this.tagDimensions.update(id, { 
			deletedAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		});
	}

	async softDeleteTag(id: string): Promise<void> {
		await this.tags.update(id, { 
			deletedAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		});
	}

	async softDeleteTransactionTag(id: string): Promise<void> {
		await this.transactionTags.update(id, { 
			deletedAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		});
	}

	async softDeleteTransaction(id: string): Promise<void> {
		await this.transactions.update(id, { 
			deletedAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		});
	}

	async softDeleteBankTransaction(id: string): Promise<void> {
		await this.bankTransactions.update(id, { 
			deletedAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		});
	}



	// ============================================================================
	// INCLUDE DELETED ITEMS QUERIES (for admin/recovery purposes)
	// ============================================================================

	async getAllAccountsIncludingDeleted(): Promise<Account[]> {
		return await this.accounts.toArray();
	}

	async getAllTagDimensionsIncludingDeleted(): Promise<TagDimension[]> {
		return await this.tagDimensions.toArray();
	}

	async getAllTagsIncludingDeleted(): Promise<Tag[]> {
		return await this.tags.toArray();
	}

	async getAllTransactionsIncludingDeleted(): Promise<Transaction[]> {
		return await this.transactions.toArray();
	}

	async getAllBankTransactionsIncludingDeleted(): Promise<BankTransaction[]> {
		return await this.bankTransactions.toArray();
	}



	async getAllCategoryMappingsIncludingDeleted(): Promise<any[]> {
		// This method is for migration purposes only
		// Since we're removing category mappings, we'll return an empty array
		return [];
	}

	async getAllAtomicCategoriesIncludingDeleted(): Promise<any[]> {
		// This method is for migration purposes only
		// Since we're removing atomic categories, we'll return an empty array
		return [];
	}

	async getAllUserCategoriesIncludingDeleted(): Promise<any[]> {
		// This method is for migration purposes only
		// Since we're removing user categories, we'll return an empty array
		return [];
	}

	// ============================================================================
	// ACCOUNT BALANCE MANAGEMENT
	// ============================================================================

	async updateAccountBalance(accountId: string, amount: number): Promise<void> {
		await this.accounts.update(accountId, {
			currentBalance: amount,
			updatedAt: new Date().toISOString()
		});
	}

	async recalculateAccountBalance(accountId: string): Promise<number> {
		const transactions = await this.getTransactionsByAccount(accountId);
		const balance = transactions
			.filter(t => t.status === 'cleared')
			.reduce((sum, transaction) => sum + (transaction.amount || 0), 0);
		
		await this.updateAccountBalance(accountId, balance);
		return balance;
	}
}

// Export the database instance
// Create database instance only in browser environment
let dbInstance: BudgicDB | null = null;

export function getDB(): BudgicDB {
  if (typeof window === 'undefined') {
    throw new Error('Database is only available in browser environment');
  }
  
  if (!dbInstance) {
    dbInstance = new BudgicDB();
  }
  
  return dbInstance;
}

// For backward compatibility - lazy getter
export const db = new Proxy({} as BudgicDB, {
  get(target, prop) {
    return getDB()[prop as keyof BudgicDB];
  }
});

// ============================================================================
// MIGRATION HELPERS
// ============================================================================

export class MigrationHelper {
	static async migrateFromOldSchema(
		oldData: {
			accounts?: any[];
			categories?: any[];
			transactions?: any[];
			plannedTransactions?: any[];
			settings?: any[];
		}
	): Promise<void> {
		try {
			// Clear existing data
			await db.transaction('rw', 
				[db.accounts, db.tagDimensions, db.tags, db.transactions, db.dynamicSettings], 
				async () => {
					await db.accounts.clear();
					await db.tagDimensions.clear();
					await db.tags.clear();
					await db.transactions.clear();
					await db.dynamicSettings.clear();

					// Migrate accounts
					if (oldData.accounts?.length) {
						const migratedAccounts = oldData.accounts.map(account => ({
							...account,
							initialBalance: account.currentBalance || 0,
							currentBalance: account.currentBalance || 0,
							isActive: !account.isDeleted
						}));
						await db.accounts.bulkAdd(migratedAccounts);
						console.log(`Migrated ${migratedAccounts.length} accounts`);
					}

					// Create system tag dimensions
					const systemDimensions = [
						{ name: 'what', description: 'What was purchased', required: true, multiSelect: true, isSystem: true },
						{ name: 'why', description: 'Why was it purchased', required: false, multiSelect: false, isSystem: true },
						{ name: 'where', description: 'Where was it purchased', required: false, multiSelect: false, isSystem: true }
					];

					for (const dim of systemDimensions) {
						await db.tagDimensions.add({
							id: generateUUID(),
							...dim,
							isActive: true,
							createdAt: new Date().toISOString(),
							updatedAt: new Date().toISOString(),
							deletedAt: null
						});
					}

					// Migrate categories to what tags
					if (oldData.categories?.length) {
						const whatTags = oldData.categories.map(category => ({
							id: generateUUID(),
							name: category.name.toLowerCase().replace(/\s+/g, '_'),
							dimension: 'what',
							color: '#3B82F6',
							isActive: !category.isDeleted,
							createdAt: category.createdAt,
							updatedAt: category.updatedAt,
							deletedAt: category.isDeleted ? new Date().toISOString() : null
						}));
						await db.tags.bulkAdd(whatTags);
						console.log(`Migrated ${whatTags.length} what tags`);
					}

					// Migrate transactions
					if (oldData.transactions?.length) {
						const migratedTransactions = oldData.transactions.map(transaction => ({
							id: transaction.id,
							type: (transaction.amount >= 0 ? 'income' : 'expense') as 'income' | 'expense',
							status: (transaction.isPlanned ? 'planned' : 'cleared') as 'planned' | 'cleared',
							confidence: transaction.confidenceLevel || 'confirmed',
							accountId: transaction.accountId,
							amount: transaction.amount || 0,
							currency: 'USD',
							description: transaction.description || '',
							whatTag: transaction.atomicCategoryId ? transaction.atomicCategoryId.toLowerCase().replace(/\s+/g, '_') as any : undefined,
							whyTag: undefined,
							payeeId: undefined,
							plannedDate: transaction.isPlanned ? transaction.transactionDate : undefined,
							clearedDate: !transaction.isPlanned ? transaction.transactionDate : undefined,
							bankTransactionId: transaction.bankTransactionId || undefined,
							splitId: transaction.groupId || undefined,
							splitName: transaction.groupName || undefined,
							toAccountId: undefined,
							recurrenceRule: transaction.isRecurring ? '{}' : undefined,
							parentRecurrenceId: undefined,
							reference: transaction.notes || undefined,
							notes: transaction.notes || undefined,
							importSource: undefined,
							createdAt: transaction.createdAt,
							updatedAt: transaction.updatedAt,
							deletedAt: transaction.isDeleted ? new Date().toISOString() : null
						}));
						await db.transactions.bulkAdd(migratedTransactions);
						console.log(`Migrated ${migratedTransactions.length} transactions`);
					}

					// Migrate planned transactions
					if (oldData.plannedTransactions?.length) {
						const migratedPlannedTransactions = oldData.plannedTransactions.map(planned => ({
							id: `planned_${planned.id}`,
							type: (planned.amount >= 0 ? 'income' : 'expense') as 'income' | 'expense',
							status: 'planned' as const,
							confidence: planned.confidenceLevel || 'expected',
							accountId: planned.accountId,
							amount: planned.amount || 0,
							currency: 'USD',
							description: planned.description || '',
							whatTag: planned.atomicCategoryId ? planned.atomicCategoryId.toLowerCase().replace(/\s+/g, '_') as any : undefined,
							whyTag: undefined,
							payeeId: undefined,
							plannedDate: planned.plannedDate,
							plannedAmount: planned.amount || undefined,
							clearedDate: undefined,
							bankTransactionId: undefined,
							splitId: undefined,
							splitName: undefined,
							toAccountId: undefined,
							recurrenceRule: planned.recurrencePattern || undefined,
							parentRecurrenceId: undefined,
							reference: planned.notes || undefined,
							notes: planned.notes || undefined,
							importSource: undefined,
							createdAt: planned.createdAt,
							updatedAt: planned.updatedAt,
							deletedAt: planned.isDeleted ? new Date().toISOString() : null
						}));
						await db.transactions.bulkAdd(migratedPlannedTransactions);
						console.log(`Migrated ${migratedPlannedTransactions.length} planned transactions`);
					}

					// Migrate settings
					if (oldData.settings?.length) {
						const migratedSettings = oldData.settings.map(setting => ({
							id: setting.id,
							key: setting.key || setting.id,
							value: JSON.stringify(setting),
							dataType: 'json' as const,
							createdAt: setting.createdAt,
							updatedAt: setting.updatedAt,
							deletedAt: setting.isDeleted ? new Date().toISOString() : null
						}));
						await db.dynamicSettings.bulkAdd(migratedSettings);
						console.log(`Migrated ${migratedSettings.length} settings`);
					}
				}
			);

			console.log('Migration completed successfully');
		} catch (error) {
			console.error('Migration failed:', error);
			throw error;
		}
	}

	static async validateMigration(): Promise<{
		accounts: number;
		tagDimensions: number;
		tags: number;
		transactions: number;
		bankTransactions: number;
		settings: number;
	}> {
		return {
			accounts: await db.accounts.count(),
			tagDimensions: await db.tagDimensions.count(),
			tags: await db.tags.count(),
			transactions: await db.transactions.count(),
			bankTransactions: await db.bankTransactions.count(),
			settings: await db.dynamicSettings.count()
		};
	}
}