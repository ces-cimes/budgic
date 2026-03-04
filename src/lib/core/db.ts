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
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
		const r = (Math.random() * 16) | 0;
		const v = c === 'x' ? r : (r & 0x3) | 0x8;
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
	 *
	 * NOTE: No maximum amount limit - different currencies have vastly different scales
	 * (e.g., IDR can be in billions, while USD is typically in thousands)
	 * Only validates data integrity (NaN/Infinity) and decimal places.
	 */
	validateAmount(
		amount: number | undefined | null,
		currency: string
	): { isValid: boolean; error?: string } {
		if (amount === undefined || amount === null) {
			return { isValid: false, error: 'Amount is required' };
		}

		// Check for NaN or Infinity (data integrity only)
		if (!Number.isFinite(amount)) {
			return { isValid: false, error: 'Amount must be a valid number' };
		}

		// Currency-specific validation
		const currencyInfo = CurrencyUtils.getCurrencyInfo(currency);
		if (currencyInfo) {
			// Check decimal places (formatting constraint, not amount limit)
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
	 * Format amount for DB-layer use. For user-facing copy (Design Bible §10), prefer
	 * formatAmount/formatCurrencyAmount from currency-utils.ts (locale grouping, minus for negatives).
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
	async validateAccountBalance(
		accountId: string
	): Promise<{ isValid: boolean; error?: string; calculatedBalance: number }> {
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
	 * Validate transaction group sum consistency
	 */
	validateGroupSum(groupTransactions: Transaction[]): {
		isValid: boolean;
		errors: string[];
		totalAmount: number;
	} {
		if (groupTransactions.length === 0) {
			return { isValid: false, errors: ['At least one transaction is required'], totalAmount: 0 };
		}

		const totalAmount = groupTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);
		const errors: string[] = [];

		const firstTransaction = groupTransactions[0];

		// For transfers, validate that the total is reasonable (not necessarily zero)
		// but should be consistent with transfer logic
		if (firstTransaction.type === 'transfer') {
			// For transfers, we validate consistency but not amount magnitude
			// Different currencies have vastly different scales (IDR can be billions)
			// No hard limit - only validate data integrity
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
	[
		'USD',
		{
			code: 'USD',
			name: 'US Dollar',
			symbol: '$',
			placement: 'before',
			decimalPlaces: 2,
			isSystem: true,
			isActive: true
		}
	],
	[
		'EUR',
		{
			code: 'EUR',
			name: 'Euro',
			symbol: '€',
			placement: 'before',
			decimalPlaces: 2,
			isSystem: true,
			isActive: true
		}
	],
	[
		'GBP',
		{
			code: 'GBP',
			name: 'British Pound',
			symbol: '£',
			placement: 'before',
			decimalPlaces: 2,
			isSystem: true,
			isActive: true
		}
	],
	[
		'JPY',
		{
			code: 'JPY',
			name: 'Japanese Yen',
			symbol: '¥',
			placement: 'before',
			decimalPlaces: 0,
			isSystem: true,
			isActive: true
		}
	],
	[
		'CAD',
		{
			code: 'CAD',
			name: 'Canadian Dollar',
			symbol: 'C$',
			placement: 'before',
			decimalPlaces: 2,
			isSystem: true,
			isActive: true
		}
	],
	[
		'AUD',
		{
			code: 'AUD',
			name: 'Australian Dollar',
			symbol: 'A$',
			placement: 'before',
			decimalPlaces: 2,
			isSystem: true,
			isActive: true
		}
	],
	[
		'CHF',
		{
			code: 'CHF',
			name: 'Swiss Franc',
			symbol: 'CHF',
			placement: 'before',
			decimalPlaces: 2,
			isSystem: true,
			isActive: true
		}
	],
	[
		'CNY',
		{
			code: 'CNY',
			name: 'Chinese Yuan',
			symbol: '¥',
			placement: 'before',
			decimalPlaces: 2,
			isSystem: true,
			isActive: true
		}
	],
	[
		'RUB',
		{
			code: 'RUB',
			name: 'Russian Ruble',
			symbol: '₽',
			placement: 'after',
			decimalPlaces: 2,
			isSystem: true,
			isActive: true
		}
	],
	[
		'BTC',
		{
			code: 'BTC',
			name: 'Bitcoin',
			symbol: '₿',
			placement: 'before',
			decimalPlaces: 8,
			isSystem: true,
			isActive: true
		}
	],
	[
		'ETH',
		{
			code: 'ETH',
			name: 'Ethereum',
			symbol: 'Ξ',
			placement: 'before',
			decimalPlaces: 18,
			isSystem: true,
			isActive: true
		}
	]
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
 * Uses cached accountAmount for multi-currency transactions
 */
export function calculateTransactionImpact(transaction: Transaction, accountId?: string): number {
	switch (transaction.type) {
		case 'income':
			// Use cached accountAmount if available (converted to account currency), otherwise use original amount
			const incomeAmount = transaction.accountAmount !== undefined 
				? transaction.accountAmount 
				: transaction.amount || 0;
			return incomeAmount; // Positive adds, negative subtracts
		case 'expense':
			// Use cached accountAmount if available (converted to account currency), otherwise use original amount
			const expenseAmount = transaction.accountAmount !== undefined 
				? transaction.accountAmount 
				: transaction.amount || 0;
			return -expenseAmount; // Positive subtracts, negative adds (like cashback)
		case 'transfer':
			// For transfers, use transferDetails instead of amount field
			if (transaction.transferDetails && accountId) {
				return calculateTransferImpact(transaction, accountId);
			}
			// Fallback for legacy transfers
			return transaction.accountAmount !== undefined 
				? transaction.accountAmount 
				: transaction.amount || 0;
		case 'adjustment':
			// Use cached accountAmount if available (converted to account currency), otherwise use original amount
			const adjustmentAmount = transaction.accountAmount !== undefined 
				? transaction.accountAmount 
				: transaction.amount || 0;
			return adjustmentAmount; // Direct modification
		default:
			return 0;
	}
}

/**
 * Helper function to calculate transfer impact for a specific account
 * Transfers don't use the amount field - all amounts derived from transferDetails
 * Uses cached accountAmount, toAccountAmount, and feeAccountAmount for multi-currency support
 */
export function calculateTransferImpact(transaction: Transaction, accountId: string): number {
	if (transaction.type !== 'transfer' || !transaction.transferDetails) {
		return 0;
	}

	const { toAccountId, transferAmount, toAccountAmount, feeAmount, feeAccountId, feeAccountAmount } = transaction.transferDetails;
	const sourceAccountId = transaction.accountId;
	const feeAccount = feeAccountId || sourceAccountId; // Default fee to source account

	if (accountId === sourceAccountId) {
		// Source account: money going out + fee (if fee is on this account)
		// Use cached accountAmount for transfer amount (converted to source account currency)
		const sourceTransferAmount = transaction.accountAmount !== undefined 
			? transaction.accountAmount 
			: transferAmount || 0;
		
		// Use cached feeAccountAmount if fee is on this account, otherwise use original feeAmount
		const feeOnThisAccount = feeAccount === sourceAccountId 
			? (feeAccountAmount !== undefined ? feeAccountAmount : feeAmount || 0)
			: 0;
		
		return -(sourceTransferAmount + feeOnThisAccount);
	} else if (accountId === toAccountId) {
		// Destination account: money coming in
		// Use cached toAccountAmount (converted to destination account currency)
		return toAccountAmount !== undefined ? toAccountAmount : transferAmount || 0;
	} else if (accountId === feeAccount && feeAmount && feeAmount > 0) {
		// Fee account: fee expense (if fee is on different account)
		// Use cached feeAccountAmount (converted to fee account currency)
		return -(feeAccountAmount !== undefined ? feeAccountAmount : feeAmount);
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
 * Helper function to validate transaction group consistency
 */
export function validateTransactionGroup(groupTransactions: Transaction[]): {
	isValid: boolean;
	errors: string[];
	totalAmount: number;
} {
	const errors: string[] = [];

	if (groupTransactions.length === 0) {
		return { isValid: false, errors: ['At least one transaction is required'], totalAmount: 0 };
	}

	// All transactions must have the same groupId
	const groupId = groupTransactions[0].groupId;
	if (!groupId) {
		errors.push('All transactions must have a groupId');
	}

	// All transactions must have the same type
	const type = groupTransactions[0].type;
	if (!groupTransactions.every((tx) => tx.type === type)) {
		errors.push('All transactions must have the same type');
	}

	// All transactions must have the same status
	const status = groupTransactions[0].status;
	if (!groupTransactions.every((tx) => tx.status === status)) {
		errors.push('All transactions must have the same status');
	}

	// All transactions must have the same currency
	const currency = groupTransactions[0].currency;
	if (!groupTransactions.every((tx) => tx.currency === currency)) {
		errors.push('All transactions must have the same currency');
	}

	// All transactions must have the same accountId (for non-transfers)
	// Allow all to be null, or all to have the same accountId
	if (type !== 'transfer') {
		const accountId = groupTransactions[0].accountId;
		if (!groupTransactions.every((tx) => tx.accountId === accountId)) {
			errors.push(
				'All transactions must have the same accountId (except for transfers). All can be null for planned transactions.'
			);
		}
	}

	// For transfers, validate transfer-specific rules
	if (type === 'transfer') {
		// Transfer validation is handled by validateTransfer function
		// Skip the generic toAccountId validation for transfers
	} else {
		// For non-transfer groups, validate toAccountId consistency
		const toAccountId = groupTransactions[0].toAccountId;
		if (!groupTransactions.every((tx) => tx.toAccountId === toAccountId)) {
			errors.push('All non-transfer transactions must have the same toAccountId');
		}
	}

	// All transactions must have the same timing fields
	const clearedDate = groupTransactions[0].clearedDate;
	const plannedDate = groupTransactions[0].plannedDate;
	if (!groupTransactions.every((tx) => tx.clearedDate === clearedDate)) {
		errors.push('All transactions must have the same clearedDate');
	}
	if (!groupTransactions.every((tx) => tx.plannedDate === plannedDate)) {
		errors.push('All transactions must have the same plannedDate');
	}

	// All transactions must have the same recurrence fields
	const recurrenceRule = groupTransactions[0].recurrenceRule;
	const parentRecurrenceId = groupTransactions[0].parentRecurrenceId;
	if (!groupTransactions.every((tx) => tx.recurrenceRule === recurrenceRule)) {
		errors.push('All transactions must have the same recurrenceRule');
	}
	if (!groupTransactions.every((tx) => tx.parentRecurrenceId === parentRecurrenceId)) {
		errors.push('All transactions must have the same parentRecurrenceId');
	}

	// All transactions must have the same metadata fields
	const reference = groupTransactions[0].reference;
	const notes = groupTransactions[0].notes;
	const importSource = groupTransactions[0].importSource;
	if (!groupTransactions.every((tx) => tx.reference === reference)) {
		errors.push('All transactions must have the same reference');
	}
	if (!groupTransactions.every((tx) => tx.notes === notes)) {
		errors.push('All transactions must have the same notes');
	}
	if (!groupTransactions.every((tx) => tx.importSource === importSource)) {
		errors.push('All transactions must have the same importSource');
	}

	// All transactions must have the same categorization
	const categoryId = groupTransactions[0].categoryId;
	if (!groupTransactions.every((tx) => tx.categoryId === categoryId)) {
		errors.push('All transactions must have the same categoryId');
	}

	// Validate group name consistency
	const groupName = groupTransactions[0].groupName;
	if (groupName && !groupTransactions.every((tx) => tx.groupName === groupName)) {
		errors.push('All transactions must have the same groupName');
	}

	// Calculate total amount
	const totalAmount = groupTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);

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
	if (!transaction.accountId) {
		errors.push('Transfer must specify source account');
	}

	if (!toAccountId) {
		errors.push('Transfer must specify destination account');
	}

	if (transferAmount <= 0) {
		errors.push('Transfer amount must be positive');
	}

	if (feeAmount < 0) {
		errors.push('Fee amount cannot be negative');
	}

	if (transaction.accountId && transaction.accountId === toAccountId) {
		errors.push('Cannot transfer to the same account');
	}

	return { isValid: errors.length === 0, errors };
}

/**
 * Validate transaction group for creation (without requiring groupId)
 */
export function validateNewGroupTransaction(
	groupTransactions: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>[]
): {
	isValid: boolean;
	errors: string[];
	totalAmount: number;
} {
	const errors: string[] = [];

	if (groupTransactions.length === 0) {
		return { isValid: false, errors: ['At least one transaction is required'], totalAmount: 0 };
	}

	// All transactions must have the same type
	const type = groupTransactions[0].type;
	if (!groupTransactions.every((tx) => tx.type === type)) {
		errors.push('All transactions must have the same type');
	}

	// All transactions must have the same status
	const status = groupTransactions[0].status;
	if (!groupTransactions.every((tx) => tx.status === status)) {
		errors.push('All transactions must have the same status');
	}

	// All transactions must have the same currency
	const currency = groupTransactions[0].currency;
	if (!groupTransactions.every((tx) => tx.currency === currency)) {
		errors.push('All transactions must have the same currency');
	}

	// All transactions must have the same accountId (for non-transfers)
	// Allow all to be null, or all to have the same accountId
	if (type !== 'transfer') {
		const accountId = groupTransactions[0].accountId;
		if (!groupTransactions.every((tx) => tx.accountId === accountId)) {
			errors.push(
				'All transactions must have the same accountId (except for transfers). All can be null for planned transactions.'
			);
		}
	}

	// For transfers, validate transfer-specific rules
	if (type === 'transfer') {
		// Transfer validation is handled by validateTransfer function
		// Skip the generic toAccountId validation for transfers
	} else {
		// For non-transfer groups, validate toAccountId consistency
		const toAccountId = groupTransactions[0].toAccountId;
		if (!groupTransactions.every((tx) => tx.toAccountId === toAccountId)) {
			errors.push('All non-transfer transactions must have the same toAccountId');
		}
	}

	// All transactions must have the same timing fields
	const clearedDate = groupTransactions[0].clearedDate;
	const plannedDate = groupTransactions[0].plannedDate;
	if (!groupTransactions.every((tx) => tx.clearedDate === clearedDate)) {
		errors.push('All transactions must have the same clearedDate');
	}
	if (!groupTransactions.every((tx) => tx.plannedDate === plannedDate)) {
		errors.push('All transactions must have the same plannedDate');
	}

	// All transactions must have the same recurrence fields
	const recurrenceRule = groupTransactions[0].recurrenceRule;
	const parentRecurrenceId = groupTransactions[0].parentRecurrenceId;
	if (!groupTransactions.every((tx) => tx.recurrenceRule === recurrenceRule)) {
		errors.push('All transactions must have the same recurrenceRule');
	}
	if (!groupTransactions.every((tx) => tx.parentRecurrenceId === parentRecurrenceId)) {
		errors.push('All transactions must have the same parentRecurrenceId');
	}

	// All transactions must have the same metadata fields
	const reference = groupTransactions[0].reference;
	const notes = groupTransactions[0].notes;
	const importSource = groupTransactions[0].importSource;
	if (!groupTransactions.every((tx) => tx.reference === reference)) {
		errors.push('All transactions must have the same reference');
	}
	if (!groupTransactions.every((tx) => tx.notes === notes)) {
		errors.push('All transactions must have the same notes');
	}
	if (!groupTransactions.every((tx) => tx.importSource === importSource)) {
		errors.push('All transactions must have the same importSource');
	}

	// All transactions must have the same categorization
	const categoryId = groupTransactions[0].categoryId;
	if (!groupTransactions.every((tx) => tx.categoryId === categoryId)) {
		errors.push('All transactions must have the same categoryId');
	}

	// Validate group name consistency (if provided)
	const groupName = groupTransactions[0].groupName;
	if (groupName && !groupTransactions.every((tx) => tx.groupName === groupName)) {
		errors.push('All transactions must have the same groupName');
	}

	// Calculate total amount
	const totalAmount = groupTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);

	return { isValid: errors.length === 0, errors, totalAmount };
}

// ============================================================================
// SCHEMAS (matching the SQL schema)
// ============================================================================

// Base schemas
const BaseSchema = z.object({
	id: z.string(),
	createdAt: z
		.string()
		.datetime()
		.default(() => new Date().toISOString()),
	updatedAt: z
		.string()
		.datetime()
		.default(() => new Date().toISOString()),
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

// Account Metadata Schema - Comprehensive metadata for optimization features
const AccountMetadataSchema = z.object({
	// Checking account metadata
	minimumBalance: z.number().min(0).optional(), // Minimum balance requirement
	overdraftLimit: z.number().min(0).optional(), // Overdraft limit
	overdraftFee: z.number().min(0).optional(), // Overdraft fee amount

	// Savings account metadata
	interestRate: z.number().min(0).max(100).optional(), // Annual interest rate (percentage)
	transferLimit: z.number().min(0).optional(), // Monthly transfer limit
	transferDelayDays: z.number().min(0).optional(), // Days for transfers to clear

	// Credit card metadata
	creditLimit: z.number().min(0).optional(), // Credit limit
	apr: z.number().min(0).max(100).optional(), // Annual percentage rate (percentage)
	statementCloseDate: z.string().optional(), // Day of month statement closes (1-31)
	paymentDueDate: z.string().optional(), // Day of month payment is due (1-31)
	minimumPayment: z.number().min(0).optional(), // Minimum payment amount
	gracePeriodDays: z.number().min(0).optional(), // Grace period in days
	creditBureauReportingDate: z.string().optional(), // Day of month reported to credit bureau

	// Loan metadata
	loanBalance: z.number().min(0).optional(), // Current loan balance
	loanDueDate: z.string().optional(), // Day of month loan payment is due

	// Investment account metadata
	accountType: z.enum(['IRA', '401k', 'brokerage', 'other']).optional(),

	// Account relationships
	linkedAccounts: z.array(z.string()).optional(), // Array of linked account IDs
	lastReconciledDate: z.string().datetime().optional(), // Last reconciliation date

	// Buffer management (will be calculated, but can be overridden)
	bufferAmount: z.number().min(0).optional(), // User-defined buffer amount
	
	// Emergency fund designation
	isEmergencyFund: z.boolean().optional() // Designate this account as part of emergency fund
});

// Account Schema
const AccountSchema = BaseSchema.extend({
	name: z.string().min(1),
	type: z.enum(['checking', 'savings', 'credit', 'cash', 'investment', 'crypto']),
	currency: z.string().min(3).max(3), // No default - must be explicitly provided
	initialBalance: z.number().default(0),
	currentBalance: z.number().default(0),
	isActive: z.boolean().default(true),
	metadata: AccountMetadataSchema.optional()
});

// Unified Category Schema (replaces what/why tags, payees, and budget categories)
const CategorySchema = BaseSchema.extend({
	name: z.string().min(1), // "groceries", "rent", "Netflix"
	type: z.enum(['expense', 'income']),
	waterfallTier: z.enum(['survival', 'security', 'growth', 'lifestyle']),
	priority: z.number().min(1), // Within tier
	budgetAmount: z.number().min(0).optional(), // Optional budget allocation
	color: z.string().optional(),
	description: z.string().optional(),
	isActive: z.boolean().default(true)
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

export const TransactionType = z.enum(['income', 'expense', 'transfer', 'adjustment']);

// Unified Transaction Schema
export const TransactionStatus = z.enum([
	'planned', // Future transaction
	'pending', // Imported from bank but not categorized
	'cleared', // Finalized and categorized
	'cancelled' // Planned transaction that didn't happen
]);

export const ConfidenceLevel = z.enum([
	'confirmed', // Definitely happening (recurring bills)
	'expected', // Likely happening (planned grocery trip)
	'estimated' // Rough projection
]);

// System dimension enums for performance
export const WhatTag = z.enum([
	'coffee',
	'groceries',
	'dining',
	'gas',
	'rent',
	'utilities',
	'entertainment',
	'clothing',
	'electronics',
	'medical',
	'transportation',
	'shopping',
	'income',
	'freelance',
	'investment',
	'gift',
	'salary',
	'maintenance',
	'insurance',
	'fitness',
	'hobbies',
	'streaming',
	'parking',
	'tolls',
	'banking_fees',
	'other'
]);

export const WhyTag = z.enum([
	'essential',
	'discretionary',
	'emergency',
	'health',
	'convenience',
	'entertainment',
	'work',
	'personal',
	'family',
	'social',
	'education',
	'investment',
	'savings',
	'debt',
	'income',
	'other'
]);

// Removed WhereTag enum - location is now handled by Payee schema

// Directional Constraint enum for transaction optimization
const DirectionalConstraintEnum = z.enum([
	'none', // No constraint - can move forward or backward
	'forward-only', // Can only move forward (e.g., subscription renewals)
	'backward-only', // Can only move backward (e.g., bill payments)
	'fixed' // Cannot be moved (e.g., fixed date commitments)
]);

export const DirectionalConstraint = DirectionalConstraintEnum;
export type DirectionalConstraint = z.infer<typeof DirectionalConstraintEnum>;

// Flexibility Tier enum for transaction optimization
export const FlexibilityTier = z.enum([
	'fixed', // 0 days - Cannot be moved
	'semi-fixed', // ±1-2 days - Limited flexibility
	'flexible-constrained', // ±3-7 days - Moderate flexibility
	'flexible', // ±14-30 days - High flexibility
	'deferrable' // 30+ days - Can postpone to next period
]);

// Dependency Type enum for transaction dependency tracking
export const DependencyType = z.enum([
	'required', // Transaction must occur after dependency completes
	'suggested', // Transaction should ideally occur after dependency
	'blocking', // Transaction blocks the dependent transaction
	'sequential', // Transactions must occur in strict sequence
	'conditional' // Transaction depends on outcome/status of dependency
]);

const TransactionSchema = BaseSchema.extend({
	type: TransactionType,
	status: TransactionStatus,
	confidence: ConfidenceLevel.optional(), // Only for planned status

	// Core fields (always present)
	accountId: z.string().optional(), // Optional for planned transactions, required for cleared/pending
	amount: z.number().optional(), // Original amount in transaction currency (what user entered)
	currency: z.string().min(3).max(3), // Transaction currency
	// Multi-currency support: cached conversion to account currency
	accountAmount: z.number().optional(), // Cached: amount converted to account currency (for balance calculations)
	description: z.string().optional(), // Can be customized per split transaction

	// Simplified categorization - single category reference
	categoryId: z.string().optional(), // References unified Category

	// Planning fields (planned status) - shared across all splits
	plannedDate: z.string().datetime().optional(),
	plannedAmount: z.number().optional(), // If different from final amount

	// Cleared fields (cleared status) - shared across all splits
	clearedDate: z.string().datetime().optional(),
	importMetadata: z.string().optional(), // JSON string for import tracking

	// Split Management Fields
	groupId: z.string().optional(), // Same for all parts of the split (renamed from splitId)
	groupName: z.string().optional(), // Could be same or customized per part (renamed from splitName)

	// Transfer fields - shared across all splits for transfers
	toAccountId: z.string().optional(),

	// Simplified Transfer Schema
	transferDetails: z
		.object({
			toAccountId: z.string(), // Destination account
			transferAmount: z.number().positive(), // Original transfer amount in transaction currency
			toAccountAmount: z.number().positive().optional(), // Cached: transferAmount converted to destination account currency
			feeAmount: z.number().min(0).default(0), // Original fee amount in transaction currency
			feeAccountId: z.string().optional(), // Which account pays the fee (default: source)
			feeAccountAmount: z.number().min(0).optional(), // Cached: feeAmount converted to fee account currency
			feeCategoryId: z.string().optional() // Category for the fee
		})
		.optional(),
	
	// Currency conversion metadata (for multi-currency transactions)
	currencyConversion: z
		.object({
			exchangeRate: z.number().optional(), // Exchange rate used for conversion (for reference)
			conversionDate: z.string().datetime().optional(), // When conversion was performed
			sourceCurrency: z.string().min(3).max(3).optional(), // Original transaction currency
			targetCurrency: z.string().min(3).max(3).optional() // Account currency
		})
		.optional(),

	// Recurrence - shared across all splits
	recurrenceRule: z.string().optional(),
	parentRecurrenceId: z.string().optional(), // Links to the recurring template

	// Metadata - shared across all splits
	reference: z.string().optional(),
	notes: z.string().optional(),
	importSource: z.string().optional(),

	// Optimization fields
	priority: z.number().min(1).max(10).optional(), // Priority score 1-10 (higher = more important)
	directionalConstraint: DirectionalConstraintEnum.optional(), // Constraint on date movement
	flexibilityTier: FlexibilityTier.optional(), // Flexibility tier for date movement range

	// Dependency Tracking
	dependencies: z.array(z.string()).optional(), // Array of transaction IDs this transaction depends on
	dependencyType: DependencyType.optional(), // Type of dependency relationship
	dependencyMetadata: z.record(z.any()).optional() // Additional metadata about dependencies
});

// Simplified User Preferences Schema
const UserPreferencesSchema = BaseSchema.extend({
	// User Profile
	username: z.string().min(1).default('User'),

	// Budget Preferences
	defaultBudgetType: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
	allowGlobalBorrowing: z.boolean().default(true),
	maxGlobalBorrowPercentage: z.number().min(0).max(1).default(0.1),

	// UI Preferences
	theme: z.enum(['light', 'dark']).default('dark'),
	language: z.enum(['en', 'ru']).default('en'),
	currency: z.string().min(3).max(3), // No default - will be detected from locale or user selection

	// User Maturity and Onboarding
	userMaturityLevel: z.enum(['beginner', 'intermediate', 'advanced', 'expert']).default('beginner'),
	onboardingCompleted: z.boolean().default(false),

	// Feature Flags
	enableAdvancedFeatures: z.boolean().default(false),
	enablePredictiveAnalytics: z.boolean().default(true),

	// Privacy and Data Preferences
	analyticsEnabled: z.boolean().default(true),
	backupEnabled: z.boolean().default(true),
	
	// Emergency Fund Preferences
	emergencyFundTargetMonths: z.number().min(3).max(12).default(6), // Target months of expenses (3-12)
	emergencyFundIncomeStability: z.enum(['stable', 'irregular']).default('stable'), // Income stability
	emergencyFundJobType: z.enum(['regular', 'contractor', 'seasonal']).default('regular'), // Job type
	emergencyFundDependents: z.number().min(0).default(0), // Number of dependents
	emergencyFundHealthNeeds: z.enum(['none', 'low', 'medium', 'high']).default('none'), // Health needs level
	emergencyFundInsuranceGaps: z.number().min(0).default(0), // Insurance gap amount (deductibles, etc.)

	// Negative Allowance Handling (when spending exceeds allowance)
	negativeAllowanceHandling: z
		.enum(['block_with_warning', 'allow_with_strong_warning', 'borrow_from_future', 'borrow_from_other_categories'])
		.default('allow_with_strong_warning'),

	// Envelope Borrowing limits (when using borrow_from_other_categories)
	envelopeBorrowMaxPerCategoryPercent: z.number().min(0).max(1).default(0.5), // Max 50% of next period's allowance per category
	envelopeBorrowRepaymentPeriods: z.number().min(1).max(6).default(2), // Must repay within 2 periods
	envelopeBorrowTotalLimit: z.number().min(0).optional(), // Optional total borrowing cap (null = no cap)
	envelopeBorrowRequireConfirmationRepeated: z.boolean().default(true), // Require explicit confirm for repeated borrowing

	// Rollover logic (period-end surplus/deficit)
	rolloverSurplusBehavior: z
		.enum(['rollover_next', 'to_savings_goals', 'hybrid'])
		.default('rollover_next'), // What to do with category surplus at period end
	rolloverSurplusHybridRatio: z.number().min(0).max(1).default(0.5), // For hybrid: share to next period (rest to goals)
	rolloverDeficitBehavior: z
		.enum(['reduce_next_period', 'borrow_from_other', 'one_time_exception'])
		.default('reduce_next_period'), // What to do with category deficit at period end

	// Savings opportunity detection (Phase 2.2) – min surplus to suggest contributing to goals
	savingsOpportunityMinSurplus: z.number().min(0).optional(),

	// Sidebar footer info cards (desktop): which cards to show and in what order
	sidebarFooterCards: z.array(z.string()).default(['total_balance', 'today_allowance'])
});

// User Actions Schema
const UserActionSchema = BaseSchema.extend({
	action: z.string(),
	metadata: z.string(), // JSON string
	context: z.string().optional(), // JSON string
	timestamp: z.string().datetime(),
	sessionId: z.string().optional()
});

// Simplified Budget Category Schema (now integrated into Category)
// Budget functionality is now handled through the Category schema's budgetAmount field

// Simplified Goals System
const GoalSchema = BaseSchema.extend({
	name: z.string().min(1),
	description: z.string().optional(),
	targetAmount: z.number().positive(),
	currentAmount: z.number().min(0).default(0),
	currency: z.string().min(3).max(3), // No default - must be explicitly provided
	category: z.enum([
		'emergency_fund',
		'vacation',
		'house_down_payment',
		'car_purchase',
		'education',
		'retirement',
		'debt_payoff',
		'investment',
		'wedding',
		'home_improvement',
		'other'
	]),
	priority: z.enum(['low', 'medium', 'high', 'critical']),
	status: z.enum(['active', 'paused', 'completed', 'cancelled']).default('active'),
	targetDate: z
		.string()
		.optional()
		.transform((s) => {
			if (!s) return undefined;
			// Accept date-only (YYYY-MM-DD) from date inputs; normalize to full ISO for storage
			if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00.000Z`;
			return s;
		})
		.pipe(z.string().datetime().optional()),
	completedAt: z.string().datetime().optional(),
	monthlyContribution: z.number().min(0).optional(),
	isRecurring: z.boolean().default(false),
	tags: z.array(z.string()).default([])
});

// Simplified Insights Schema (consolidated analytics)
const InsightSchema = BaseSchema.extend({
	type: z.enum([
		'budget_approaching',
		'budget_exceeded',
		'budget_surplus',
		'goal_milestone',
		'spending_velocity',
		'anomaly',
		'trend',
		'achievement',
		'savings_opportunity',
		'behavioral',
		'prediction',
		'credit_utilization',
		'emergency_fund'
	]),
	severity: z.enum(['info', 'warning', 'alert', 'success']),
	title: z.string().min(1),
	message: z.string().min(1),
	categoryId: z.string().optional(),
	goalId: z.string().optional(),
	percentage: z.number().optional(),
	amount: z.number().optional(),
	remaining: z.number().optional(),
	threshold: z.number().optional(),
	confidence: z.number().optional(),
	actionable: z.boolean().default(false),
	actionText: z.string().optional(),
	actionUrl: z.string().optional(),
	dismissedAt: z.string().datetime().optional(),
	readAt: z.string().datetime().optional(),
	expiresAt: z.string().datetime().optional(),
	isActive: z.boolean().default(true),
	metadata: z.string().optional() // JSON string
});

// Currency Configuration Schema - Currency-specific defaults and thresholds
const CurrencyConfigurationSchema = BaseSchema.extend({
	currencyCode: z.string().min(3).max(3), // ISO 4217 code
	// Buffer defaults
	defaultCheckingBuffer: z.number().min(0).optional(),
	defaultSavingsBuffer: z.number().min(0).optional(),
	// Account type defaults
	// Note: defaultMinimumBalance can be negative for credit accounts (credit limit)
	defaultMinimumBalance: z.number().optional(), // Removed min(0) constraint to allow negative values
	defaultOverdraftLimit: z.number().min(0).optional(),
	defaultOverdraftFee: z.number().min(0).optional(),
	// Validation limits
	// Note: maxAmountLimit is optional and can be set to very large values or undefined to disable
	maxAmountLimit: z.number().positive().optional(), // Positive if set, but optional to allow unlimited
	// Budget defaults (if needed)
	defaultBudgetAllocation: z.number().min(0).optional(),
	// User customization flag
	isCustom: z.boolean().default(false), // true if user customized, false if system default
	// Metadata
	notes: z.string().optional()
});

// Exchange Rate Schema - Stores currency conversion rates
const ExchangeRateSchema = BaseSchema.extend({
	fromCurrency: z.string().min(3).max(3), // ISO 4217 code (source currency)
	toCurrency: z.string().min(3).max(3), // ISO 4217 code (target currency)
	rate: z.number().positive(), // 1 fromCurrency = rate toCurrency
	date: z.string().datetime(), // Date for which this rate is valid (ISO date)
	source: z.string().default('api'), // API source identifier (e.g., 'exchangerate-api', 'fixer')
	// Metadata
	lastFetched: z.string().datetime().optional(), // When this rate was last fetched from API
	notes: z.string().optional() // Optional notes about the rate
});

// Badge Schema - Achievement tracking system
const BadgeSchema = BaseSchema.extend({
	badgeId: z.string(), // Unique identifier for the badge type (e.g., 'budget_streak_30')
	type: z.enum([
		'budget_badge',
		'goal_milestone',
		'behavioral_badge',
		'financial_milestone',
		'app_usage_badge'
	]),
	title: z.string().min(1),
	description: z.string().min(1),
	badgeType: z.enum(['achievement', 'milestone', 'streak', 'milestone_reached']),
	rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']),
	category: z.enum(['survival', 'security', 'growth', 'lifestyle', 'system']),
	unlockedAt: z.string().datetime().optional(), // When the badge was unlocked
	progress: z.string().optional(), // JSON string: { current: number, target: number, percentage: number }
	metadata: z.string().optional(), // JSON string: { streakDays?, amount?, timeframe?, category? }
	notifiedAt: z.string().datetime().optional() // When notification was shown
});

// Reconciliation Record Schema - Balance reconciliation tracking
const ReconciliationRecordSchema = BaseSchema.extend({
	accountId: z.string(),
	reconciledDate: z.string().datetime(),
	statementBalance: z.number().finite(),
	calculatedBalance: z.number().finite(),
	discrepancy: z.number().finite(),
	reconciliationType: z.enum(['manual', 'automatic']),
	transactionCount: z.number().int().min(0),
	reconciledTransactionIds: z.array(z.string()),
	unreconciledTransactionIds: z.array(z.string()),
	notes: z.string().optional(),
	resolvedAt: z.string().datetime().optional()
});

// Reconciliation Discrepancy Schema - Issue tracking during reconciliation
const ReconciliationDiscrepancySchema = BaseSchema.extend({
	accountId: z.string(),
	discrepancyType: z.enum([
		'missing_transaction',
		'duplicate_transaction',
		'amount_mismatch',
		'timing_difference',
		'unknown'
	]),
	amount: z.number().finite(),
	description: z.string().min(1),
	suspectedTransactionId: z.string().optional(),
	suggestedAction: z.enum(['create_transaction', 'modify_transaction', 'ignore', 'investigate']),
	severity: z.enum(['low', 'medium', 'high']),
	resolvedAt: z.string().datetime().optional()
});

// Learning Pattern Schema - Stores detected spending and income patterns
const LearningPatternSchema = BaseSchema.extend({
	patternType: z.enum([
		'day_of_week',
		'weekly',
		'monthly',
		'seasonal',
		'life_event',
		'income_frequency',
		'income_amount',
		'paycheck_shift'
	]),
	categoryId: z.string().optional(), // Category this pattern applies to (if applicable)
	title: z.string().min(1),
	description: z.string().min(1),
	confidence: z.number().min(0).max(100), // 0-100 confidence score
	frequency: z.enum(['daily', 'weekly', 'monthly', 'irregular']),
	pattern: z.string(), // JSON string containing pattern details
	metadata: z.string(), // JSON string: { occurrences, minimumOccurrences, variance, coefficientOfVariation, timeframe, lastObserved, firstObserved }
	isActive: z.boolean().default(true),
	appliedToProjections: z.boolean().default(false), // Whether this pattern is used in projections
	lastValidated: z.string().datetime().optional() // Last time pattern was validated against new data
});

// User Feedback Schema - Tracks user responses to suggestions and recommendations
const UserFeedbackSchema = BaseSchema.extend({
	feedbackType: z.enum([
		'optimization_suggestion',
		'allowance_warning',
		'budget_adjustment',
		'category_flexibility',
		'pattern_confirmation',
		'recommendation'
	]),
	suggestionId: z.string().optional(), // ID of the suggestion/optimization that triggered this feedback
	action: z.enum(['accepted', 'rejected', 'modified', 'dismissed']),
	details: z.string().optional(), // JSON string with additional context
	metadata: z.string().optional() // JSON string with feedback metadata
});

// Optimization Preference Schema - Stores user preferences learned from feedback
const OptimizationPreferenceSchema = BaseSchema.extend({
	preferenceType: z.enum([
		'category_flexibility',
		'allowance_tuning',
		'buffer_tuning',
		'suggestion_weight',
		'transaction_movement'
	]),
	categoryId: z.string().optional(), // Category this preference applies to (if applicable)
	key: z.string().min(1), // Preference key (e.g., "entertainment_flexibility")
	value: z.number(), // Preference value (e.g., flexibility score 0-1)
	confidence: z.number().min(0).max(100), // Confidence in this preference (based on feedback count)
	feedbackCount: z.number().min(0).default(0), // Number of feedback instances supporting this preference
	metadata: z.string().optional() // JSON string with additional preference data
});

// Negative Allowance Event Schema - Tracks when spending exceeds allowance (accountability)
const NegativeAllowanceEventSchema = BaseSchema.extend({
	periodStart: z.string().datetime(), // Start of allowance period
	periodEnd: z.string().datetime(), // End of allowance period
	accountId: z.string().optional(), // Account (if per-account); empty = global
	category: z.enum(['total', 'essential', 'discretionary', 'buffer']), // Which allowance category went negative
	allowanceAmount: z.number(), // Budgeted allowance for the period
	spentAmount: z.number(), // Actual spent
	overBy: z.number(), // spentAmount - allowanceAmount (positive when negative allowance)
	currency: z.string().min(3).max(3),
	handlingApplied: z.enum(['block_with_warning', 'allow_with_strong_warning', 'borrow_from_future', 'borrow_from_other_categories']), // User's setting when event occurred
	recoveredAt: z.string().datetime().optional(), // When user resolved (e.g. moved transaction, next period started)
	metadata: z.string().optional() // JSON: recoverySuggestionsAccepted, transactionIds, etc.
});

// Envelope Borrowing - Temporary borrowing between allowance categories
const EnvelopeBorrowingSchema = BaseSchema.extend({
	accountId: z.string().optional(), // Account (if per-account); empty = global
	fromCategory: z.enum(['essential', 'discretionary', 'buffer']), // Lender category
	toCategory: z.enum(['essential', 'discretionary', 'buffer']), // Borrower category (the one that was over)
	amount: z.number().positive(),
	currency: z.string().min(3).max(3),
	periodStart: z.string().datetime(), // Period this borrow covers
	periodEnd: z.string().datetime(),
	dueRepayBy: z.string().datetime(), // Must repay by this date (e.g. period end + N periods)
	repaidAmount: z.number().min(0).default(0),
	repaidAt: z.string().datetime().optional(), // When fully repaid (or last partial repayment)
	negativeAllowanceEventId: z.string().optional(), // Link to event that triggered this borrow
	metadata: z.string().optional() // JSON: e.g. userConfirmedRepeated
});

// Rollover adjustment – applied to a future period's allowance (from previous period's surplus/deficit)
const RolloverAdjustmentSchema = BaseSchema.extend({
	accountId: z.string().optional(), // Account (if per-account); empty = global
	forPeriodStart: z.string().datetime(), // Start of the period this adjustment applies to
	category: z.enum(['essential', 'discretionary', 'buffer']),
	amountDelta: z.number(), // Positive = add to allowance, negative = reduce
	currency: z.string().min(3).max(3),
	source: z.enum(['surplus_rollover', 'deficit_reduction', 'to_goals', 'one_time_exception']),
	fromPeriodStart: z.string().datetime().optional(), // Period that generated this adjustment (for display)
	metadata: z.string().optional()
});

// Occasion – recurring spending event (detected from history or user-defined) for allowance adjustments
const OccasionSchema = BaseSchema.extend({
	accountId: z.string().optional(), // Account (if per-account); empty = global
	title: z.string().min(1),
	occasionType: z.enum(['weekly', 'monthly', 'annual']),
	pattern: z.string(), // JSON: weekly { dayOfWeek: 0-6 }, monthly { weekOfMonth?: 1-5, dayOfWeek?: 0-6 } or { dayOfMonth: 1-31 }, annual { month: 1-12, dayOfMonth?: 1-31 }
	expectedAmountDelta: z.number(), // Positive = expect to spend more (add to allowance), negative = e.g. tax refund
	currency: z.string().min(3).max(3),
	source: z.enum(['detected', 'user_defined']).default('detected'),
	confidence: z.number().min(0).max(100).default(80), // 0-100 for detected occasions
	learningPatternId: z.string().optional(), // Link to LearningPattern if derived from it
	isActive: z.boolean().default(true),
	lastDetectedAt: z.string().datetime().optional(),
	metadata: z.string().optional()
});

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type AccountMetadata = z.infer<typeof AccountMetadataSchema>;
export type Account = z.infer<typeof AccountSchema>;
export type Currency = z.infer<typeof CurrencySchema>;
export type Category = z.infer<typeof CategorySchema>;
export type Transaction = z.infer<typeof TransactionSchema>;
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;
export type UserAction = z.infer<typeof UserActionSchema>;
export type Goal = z.infer<typeof GoalSchema>;
export type Insight = z.infer<typeof InsightSchema>;
export type CurrencyConfiguration = z.infer<typeof CurrencyConfigurationSchema>;
export type ExchangeRate = z.infer<typeof ExchangeRateSchema>;
export type Badge = z.infer<typeof BadgeSchema>;
export type ReconciliationRecord = z.infer<typeof ReconciliationRecordSchema>;
export type ReconciliationDiscrepancy = z.infer<typeof ReconciliationDiscrepancySchema>;
export type FlexibilityTier = z.infer<typeof FlexibilityTier>;
export type LearningPattern = z.infer<typeof LearningPatternSchema>;
export type UserFeedback = z.infer<typeof UserFeedbackSchema>;
export type OptimizationPreference = z.infer<typeof OptimizationPreferenceSchema>;
export type NegativeAllowanceEvent = z.infer<typeof NegativeAllowanceEventSchema>;
export type EnvelopeBorrowing = z.infer<typeof EnvelopeBorrowingSchema>;
export type RolloverAdjustment = z.infer<typeof RolloverAdjustmentSchema>;
export type Occasion = z.infer<typeof OccasionSchema>;

// Transaction-specific utility functions after Transaction type is defined
export const TransactionUtils = {
	/**
	 * Validate transaction dates based on status
	 */
	validateTransactionDate(
		date: string,
		status: Transaction['status']
	): { isValid: boolean; error?: string } {
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

// System dimension types
type TransactionType = z.infer<typeof TransactionType>;
type DependencyType = z.infer<typeof DependencyType>;

// ============================================================================
// DATABASE CLASS
// ============================================================================

export class BudgicDB extends Dexie {
	accounts!: Table<Account>;
	currencies!: Table<Currency>;
	categories!: Table<Category>;
	transactions!: Table<Transaction>;
	goals!: Table<Goal>;
	userPreferences!: Table<UserPreferences>;
	userActions!: Table<UserAction>;
	insights!: Table<Insight>;
	currencyConfigurations!: Table<CurrencyConfiguration>;
	exchangeRates!: Table<ExchangeRate>;
	badges!: Table<Badge>;
	reconciliationRecords!: Table<ReconciliationRecord>;
	reconciliationDiscrepancies!: Table<ReconciliationDiscrepancy>;
	learningPatterns!: Table<LearningPattern>;
	userFeedback!: Table<UserFeedback>;
	optimizationPreferences!: Table<OptimizationPreference>;
	negativeAllowanceEvents!: Table<NegativeAllowanceEvent>;
	envelopeBorrowings!: Table<EnvelopeBorrowing>;
	rolloverAdjustments!: Table<RolloverAdjustment>;
	occasions!: Table<Occasion>;

	constructor() {
		super('BudgicDB');

		// Database schema versions
		this.version(9).stores({
			// Core entities - simplified to 9 tables
			accounts: 'id, type, currency, isActive, deletedAt, createdAt, updatedAt',
			currencies: 'id, code, name, isSystem, isActive, deletedAt, createdAt, updatedAt',
			categories:
				'id, name, type, waterfallTier, priority, isActive, deletedAt, createdAt, updatedAt, [type+waterfallTier]',
			transactions:
				'id, type, status, accountId, categoryId, plannedDate, clearedDate, groupId, deletedAt, createdAt, updatedAt, [accountId+status], [accountId+clearedDate], [categoryId+status], [groupId+status], [plannedDate+status], [clearedDate+type]',
			goals:
				'id, name, category, priority, status, targetDate, createdAt, updatedAt, completedAt, [category+status]',
			userPreferences: 'id, createdAt, updatedAt',
			userActions:
				'id, action, timestamp, sessionId, createdAt, updatedAt, deletedAt, [action+timestamp]',
			insights:
				'id, type, severity, categoryId, goalId, actionable, dismissedAt, expiresAt, isActive, createdAt, updatedAt, [type+goalId], [type+severity]',
			currencyConfigurations: 'id, currencyCode, isCustom, deletedAt, createdAt, updatedAt'
		});

		// Version 10: Add exchange rates table
		this.version(10).stores({
			// Core entities - 10 tables
			accounts: 'id, type, currency, isActive, deletedAt, createdAt, updatedAt',
			currencies: 'id, code, name, isSystem, isActive, deletedAt, createdAt, updatedAt',
			categories:
				'id, name, type, waterfallTier, priority, isActive, deletedAt, createdAt, updatedAt, [type+waterfallTier]',
			transactions:
				'id, type, status, accountId, categoryId, plannedDate, clearedDate, groupId, deletedAt, createdAt, updatedAt, [accountId+status], [accountId+clearedDate], [categoryId+status], [groupId+status], [plannedDate+status], [clearedDate+type]',
			goals:
				'id, name, category, priority, status, targetDate, createdAt, updatedAt, completedAt, [category+status]',
			userPreferences: 'id, createdAt, updatedAt',
			userActions:
				'id, action, timestamp, sessionId, createdAt, updatedAt, deletedAt, [action+timestamp]',
			insights:
				'id, type, severity, categoryId, goalId, actionable, dismissedAt, expiresAt, isActive, createdAt, updatedAt, [type+goalId], [type+severity]',
			currencyConfigurations: 'id, currencyCode, isCustom, deletedAt, createdAt, updatedAt',
			exchangeRates:
				'id, fromCurrency, toCurrency, date, source, deletedAt, createdAt, updatedAt, [fromCurrency+toCurrency+date]'
		});

		// Version 11: Add importSource index to transactions for duplicate detection
		this.version(11).stores({
			// Core entities - 10 tables
			accounts: 'id, type, currency, isActive, deletedAt, createdAt, updatedAt',
			currencies: 'id, code, name, isSystem, isActive, deletedAt, createdAt, updatedAt',
			categories:
				'id, name, type, waterfallTier, priority, isActive, deletedAt, createdAt, updatedAt, [type+waterfallTier]',
			transactions:
				'id, type, status, accountId, categoryId, plannedDate, clearedDate, groupId, importSource, deletedAt, createdAt, updatedAt, [accountId+status], [accountId+clearedDate], [categoryId+status], [groupId+status], [plannedDate+status], [clearedDate+type]',
			goals:
				'id, name, category, priority, status, targetDate, createdAt, updatedAt, completedAt, [category+status]',
			userPreferences: 'id, createdAt, updatedAt',
			userActions:
				'id, action, timestamp, sessionId, createdAt, updatedAt, deletedAt, [action+timestamp]',
			insights:
				'id, type, severity, categoryId, goalId, actionable, dismissedAt, expiresAt, isActive, createdAt, updatedAt, [type+goalId], [type+severity]',
			currencyConfigurations: 'id, currencyCode, isCustom, deletedAt, createdAt, updatedAt',
			exchangeRates:
				'id, fromCurrency, toCurrency, date, source, deletedAt, createdAt, updatedAt, [fromCurrency+toCurrency+date]'
		});

		// Version 12: Add badges table for achievement tracking
		this.version(12).stores({
			// Core entities - 11 tables
			accounts: 'id, type, currency, isActive, deletedAt, createdAt, updatedAt',
			currencies: 'id, code, name, isSystem, isActive, deletedAt, createdAt, updatedAt',
			categories:
				'id, name, type, waterfallTier, priority, isActive, deletedAt, createdAt, updatedAt, [type+waterfallTier]',
			transactions:
				'id, type, status, accountId, categoryId, plannedDate, clearedDate, groupId, importSource, deletedAt, createdAt, updatedAt, [accountId+status], [accountId+clearedDate], [categoryId+status], [groupId+status], [plannedDate+status], [clearedDate+type]',
			goals:
				'id, name, category, priority, status, targetDate, createdAt, updatedAt, completedAt, [category+status]',
			userPreferences: 'id, createdAt, updatedAt',
			userActions:
				'id, action, timestamp, sessionId, createdAt, updatedAt, deletedAt, [action+timestamp]',
			insights:
				'id, type, severity, categoryId, goalId, actionable, dismissedAt, expiresAt, isActive, createdAt, updatedAt, [type+goalId], [type+severity]',
			currencyConfigurations: 'id, currencyCode, isCustom, deletedAt, createdAt, updatedAt',
			exchangeRates:
				'id, fromCurrency, toCurrency, date, source, deletedAt, createdAt, updatedAt, [fromCurrency+toCurrency+date]',
			badges:
				'id, badgeId, type, unlockedAt, notifiedAt, deletedAt, createdAt, updatedAt, [badgeId+unlockedAt], [type+unlockedAt]'
		});

		// Version 13: Add reconciliation tables for balance reconciliation tracking
		this.version(13).stores({
			// Core entities - 13 tables
			accounts: 'id, type, currency, isActive, deletedAt, createdAt, updatedAt',
			currencies: 'id, code, name, isSystem, isActive, deletedAt, createdAt, updatedAt',
			categories:
				'id, name, type, waterfallTier, priority, isActive, deletedAt, createdAt, updatedAt, [type+waterfallTier]',
			transactions:
				'id, type, status, accountId, categoryId, plannedDate, clearedDate, groupId, importSource, deletedAt, createdAt, updatedAt, [accountId+status], [accountId+clearedDate], [categoryId+status], [groupId+status], [plannedDate+status], [clearedDate+type]',
			goals:
				'id, name, category, priority, status, targetDate, createdAt, updatedAt, completedAt, [category+status]',
			userPreferences: 'id, createdAt, updatedAt',
			userActions:
				'id, action, timestamp, sessionId, createdAt, updatedAt, deletedAt, [action+timestamp]',
			insights:
				'id, type, severity, categoryId, goalId, actionable, dismissedAt, expiresAt, isActive, createdAt, updatedAt, [type+goalId], [type+severity]',
			currencyConfigurations: 'id, currencyCode, isCustom, deletedAt, createdAt, updatedAt',
			exchangeRates:
				'id, fromCurrency, toCurrency, date, source, deletedAt, createdAt, updatedAt, [fromCurrency+toCurrency+date]',
			badges:
				'id, badgeId, type, unlockedAt, notifiedAt, deletedAt, createdAt, updatedAt, [badgeId+unlockedAt], [type+unlockedAt]',
			reconciliationRecords:
				'id, accountId, reconciledDate, reconciliationType, resolvedAt, deletedAt, createdAt, updatedAt, [accountId+reconciledDate], [accountId+reconciliationType]',
			reconciliationDiscrepancies:
				'id, accountId, discrepancyType, severity, resolvedAt, deletedAt, createdAt, updatedAt, [accountId+discrepancyType], [accountId+severity], [accountId+resolvedAt]'
		});

		// Version 14: Add learning and adaptation tables
		this.version(14).stores({
			// Core entities - 16 tables
			accounts: 'id, type, currency, isActive, deletedAt, createdAt, updatedAt',
			currencies: 'id, code, name, isSystem, isActive, deletedAt, createdAt, updatedAt',
			categories:
				'id, name, type, waterfallTier, priority, isActive, deletedAt, createdAt, updatedAt, [type+waterfallTier]',
			transactions:
				'id, type, status, accountId, categoryId, plannedDate, clearedDate, groupId, importSource, deletedAt, createdAt, updatedAt, [accountId+status], [accountId+clearedDate], [categoryId+status], [groupId+status], [plannedDate+status], [clearedDate+type]',
			goals:
				'id, name, category, priority, status, targetDate, createdAt, updatedAt, completedAt, [category+status]',
			userPreferences: 'id, createdAt, updatedAt',
			userActions:
				'id, action, timestamp, sessionId, createdAt, updatedAt, deletedAt, [action+timestamp]',
			insights:
				'id, type, severity, categoryId, goalId, actionable, dismissedAt, expiresAt, isActive, createdAt, updatedAt, [type+goalId], [type+severity]',
			currencyConfigurations: 'id, currencyCode, isCustom, deletedAt, createdAt, updatedAt',
			exchangeRates:
				'id, fromCurrency, toCurrency, date, source, deletedAt, createdAt, updatedAt, [fromCurrency+toCurrency+date]',
			badges:
				'id, badgeId, type, unlockedAt, notifiedAt, deletedAt, createdAt, updatedAt, [badgeId+unlockedAt], [type+unlockedAt]',
			reconciliationRecords:
				'id, accountId, reconciledDate, reconciliationType, resolvedAt, deletedAt, createdAt, updatedAt, [accountId+reconciledDate], [accountId+reconciliationType]',
			reconciliationDiscrepancies:
				'id, accountId, discrepancyType, severity, resolvedAt, deletedAt, createdAt, updatedAt, [accountId+discrepancyType], [accountId+severity], [accountId+resolvedAt]',
			learningPatterns:
				'id, patternType, categoryId, isActive, appliedToProjections, lastValidated, deletedAt, createdAt, updatedAt, [patternType+isActive], [categoryId+patternType]',
			userFeedback:
				'id, feedbackType, suggestionId, action, deletedAt, createdAt, updatedAt, [feedbackType+action], [suggestionId+action]',
			optimizationPreferences:
				'id, preferenceType, categoryId, key, deletedAt, createdAt, updatedAt, [preferenceType+categoryId], [key+preferenceType]'
		});

		// Version 15: Add negative allowance events table (accountability tracking)
		this.version(15).stores({
			accounts: 'id, type, currency, isActive, deletedAt, createdAt, updatedAt',
			currencies: 'id, code, name, isSystem, isActive, deletedAt, createdAt, updatedAt',
			categories:
				'id, name, type, waterfallTier, priority, isActive, deletedAt, createdAt, updatedAt, [type+waterfallTier]',
			transactions:
				'id, type, status, accountId, categoryId, plannedDate, clearedDate, groupId, importSource, deletedAt, createdAt, updatedAt, [accountId+status], [accountId+clearedDate], [categoryId+status], [groupId+status], [plannedDate+status], [clearedDate+type]',
			goals:
				'id, name, category, priority, status, targetDate, createdAt, updatedAt, completedAt, [category+status]',
			userPreferences: 'id, createdAt, updatedAt',
			userActions:
				'id, action, timestamp, sessionId, createdAt, updatedAt, deletedAt, [action+timestamp]',
			insights:
				'id, type, severity, categoryId, goalId, actionable, dismissedAt, expiresAt, isActive, createdAt, updatedAt, [type+goalId], [type+severity]',
			currencyConfigurations: 'id, currencyCode, isCustom, deletedAt, createdAt, updatedAt',
			exchangeRates:
				'id, fromCurrency, toCurrency, date, source, deletedAt, createdAt, updatedAt, [fromCurrency+toCurrency+date]',
			badges:
				'id, badgeId, type, unlockedAt, notifiedAt, deletedAt, createdAt, updatedAt, [badgeId+unlockedAt], [type+unlockedAt]',
			reconciliationRecords:
				'id, accountId, reconciledDate, reconciliationType, resolvedAt, deletedAt, createdAt, updatedAt, [accountId+reconciledDate], [accountId+reconciliationType]',
			reconciliationDiscrepancies:
				'id, accountId, discrepancyType, severity, resolvedAt, deletedAt, createdAt, updatedAt, [accountId+discrepancyType], [accountId+severity], [accountId+resolvedAt]',
			learningPatterns:
				'id, patternType, categoryId, isActive, appliedToProjections, lastValidated, deletedAt, createdAt, updatedAt, [patternType+isActive], [categoryId+patternType]',
			userFeedback:
				'id, feedbackType, suggestionId, action, deletedAt, createdAt, updatedAt, [feedbackType+action], [suggestionId+action]',
			optimizationPreferences:
				'id, preferenceType, categoryId, key, deletedAt, createdAt, updatedAt, [preferenceType+categoryId], [key+preferenceType]',
			negativeAllowanceEvents:
				'id, periodStart, periodEnd, accountId, category, deletedAt, createdAt, updatedAt, [accountId+periodStart], [category+periodStart]'
		});

		// Version 16: Envelope borrowing (temporary borrowing between categories)
		this.version(16).stores({
			accounts: 'id, type, currency, isActive, deletedAt, createdAt, updatedAt',
			currencies: 'id, code, name, isSystem, isActive, deletedAt, createdAt, updatedAt',
			categories:
				'id, name, type, waterfallTier, priority, isActive, deletedAt, createdAt, updatedAt, [type+waterfallTier]',
			transactions:
				'id, type, status, accountId, categoryId, plannedDate, clearedDate, groupId, importSource, deletedAt, createdAt, updatedAt, [accountId+status], [accountId+clearedDate], [categoryId+status], [groupId+status], [plannedDate+status], [clearedDate+type]',
			goals:
				'id, name, category, priority, status, targetDate, createdAt, updatedAt, completedAt, [category+status]',
			userPreferences: 'id, createdAt, updatedAt',
			userActions:
				'id, action, timestamp, sessionId, createdAt, updatedAt, deletedAt, [action+timestamp]',
			insights:
				'id, type, severity, categoryId, goalId, actionable, dismissedAt, expiresAt, isActive, createdAt, updatedAt, [type+goalId], [type+severity]',
			currencyConfigurations: 'id, currencyCode, isCustom, deletedAt, createdAt, updatedAt',
			exchangeRates:
				'id, fromCurrency, toCurrency, date, source, deletedAt, createdAt, updatedAt, [fromCurrency+toCurrency+date]',
			badges:
				'id, badgeId, type, unlockedAt, notifiedAt, deletedAt, createdAt, updatedAt, [badgeId+unlockedAt], [type+unlockedAt]',
			reconciliationRecords:
				'id, accountId, reconciledDate, reconciliationType, resolvedAt, deletedAt, createdAt, updatedAt, [accountId+reconciledDate], [accountId+reconciliationType]',
			reconciliationDiscrepancies:
				'id, accountId, discrepancyType, severity, resolvedAt, deletedAt, createdAt, updatedAt, [accountId+discrepancyType], [accountId+severity], [accountId+resolvedAt]',
			learningPatterns:
				'id, patternType, categoryId, isActive, appliedToProjections, lastValidated, deletedAt, createdAt, updatedAt, [patternType+isActive], [categoryId+patternType]',
			userFeedback:
				'id, feedbackType, suggestionId, action, deletedAt, createdAt, updatedAt, [feedbackType+action], [suggestionId+action]',
			optimizationPreferences:
				'id, preferenceType, categoryId, key, deletedAt, createdAt, updatedAt, [preferenceType+categoryId], [key+preferenceType]',
			negativeAllowanceEvents:
				'id, periodStart, periodEnd, accountId, category, deletedAt, createdAt, updatedAt, [accountId+periodStart], [category+periodStart]',
			envelopeBorrowings:
				'id, accountId, periodStart, fromCategory, toCategory, dueRepayBy, deletedAt, createdAt, updatedAt, [accountId+periodStart], [accountId+dueRepayBy]'
		});

		// Version 17: Rollover adjustments (period-end surplus/deficit → next period)
		this.version(17).stores({
			accounts: 'id, type, currency, isActive, deletedAt, createdAt, updatedAt',
			currencies: 'id, code, name, isSystem, isActive, deletedAt, createdAt, updatedAt',
			categories:
				'id, name, type, waterfallTier, priority, isActive, deletedAt, createdAt, updatedAt, [type+waterfallTier]',
			transactions:
				'id, type, status, accountId, categoryId, plannedDate, clearedDate, groupId, importSource, deletedAt, createdAt, updatedAt, [accountId+status], [accountId+clearedDate], [categoryId+status], [groupId+status], [plannedDate+status], [clearedDate+type]',
			goals:
				'id, name, category, priority, status, targetDate, createdAt, updatedAt, completedAt, [category+status]',
			userPreferences: 'id, createdAt, updatedAt',
			userActions:
				'id, action, timestamp, sessionId, createdAt, updatedAt, deletedAt, [action+timestamp]',
			insights:
				'id, type, severity, categoryId, goalId, actionable, dismissedAt, expiresAt, isActive, createdAt, updatedAt, [type+goalId], [type+severity]',
			currencyConfigurations: 'id, currencyCode, isCustom, deletedAt, createdAt, updatedAt',
			exchangeRates:
				'id, fromCurrency, toCurrency, date, source, deletedAt, createdAt, updatedAt, [fromCurrency+toCurrency+date]',
			badges:
				'id, badgeId, type, unlockedAt, notifiedAt, deletedAt, createdAt, updatedAt, [badgeId+unlockedAt], [type+unlockedAt]',
			reconciliationRecords:
				'id, accountId, reconciledDate, reconciliationType, resolvedAt, deletedAt, createdAt, updatedAt, [accountId+reconciledDate], [accountId+reconciliationType]',
			reconciliationDiscrepancies:
				'id, accountId, discrepancyType, severity, resolvedAt, deletedAt, createdAt, updatedAt, [accountId+discrepancyType], [accountId+severity], [accountId+resolvedAt]',
			learningPatterns:
				'id, patternType, categoryId, isActive, appliedToProjections, lastValidated, deletedAt, createdAt, updatedAt, [patternType+isActive], [categoryId+patternType]',
			userFeedback:
				'id, feedbackType, suggestionId, action, deletedAt, createdAt, updatedAt, [feedbackType+action], [suggestionId+action]',
			optimizationPreferences:
				'id, preferenceType, categoryId, key, deletedAt, createdAt, updatedAt, [preferenceType+categoryId], [key+preferenceType]',
			negativeAllowanceEvents:
				'id, periodStart, periodEnd, accountId, category, deletedAt, createdAt, updatedAt, [accountId+periodStart], [category+periodStart]',
			envelopeBorrowings:
				'id, accountId, periodStart, fromCategory, toCategory, dueRepayBy, deletedAt, createdAt, updatedAt, [accountId+periodStart], [accountId+dueRepayBy]',
			rolloverAdjustments:
				'id, accountId, forPeriodStart, category, deletedAt, createdAt, updatedAt, [accountId+forPeriodStart]'
		});

		// Version 18: Occasions (recurring spending events for allowance adjustments)
		this.version(18).stores({
			accounts: 'id, type, currency, isActive, deletedAt, createdAt, updatedAt',
			currencies: 'id, code, name, isSystem, isActive, deletedAt, createdAt, updatedAt',
			categories:
				'id, name, type, waterfallTier, priority, isActive, deletedAt, createdAt, updatedAt, [type+waterfallTier]',
			transactions:
				'id, type, status, accountId, categoryId, plannedDate, clearedDate, groupId, importSource, deletedAt, createdAt, updatedAt, [accountId+status], [accountId+clearedDate], [categoryId+status], [groupId+status], [plannedDate+status], [clearedDate+type]',
			goals:
				'id, name, category, priority, status, targetDate, createdAt, updatedAt, completedAt, [category+status]',
			userPreferences: 'id, createdAt, updatedAt',
			userActions:
				'id, action, timestamp, sessionId, createdAt, updatedAt, deletedAt, [action+timestamp]',
			insights:
				'id, type, severity, categoryId, goalId, actionable, dismissedAt, expiresAt, isActive, createdAt, updatedAt, [type+goalId], [type+severity]',
			currencyConfigurations: 'id, currencyCode, isCustom, deletedAt, createdAt, updatedAt',
			exchangeRates:
				'id, fromCurrency, toCurrency, date, source, deletedAt, createdAt, updatedAt, [fromCurrency+toCurrency+date]',
			badges:
				'id, badgeId, type, unlockedAt, notifiedAt, deletedAt, createdAt, updatedAt, [badgeId+unlockedAt], [type+unlockedAt]',
			reconciliationRecords:
				'id, accountId, reconciledDate, reconciliationType, resolvedAt, deletedAt, createdAt, updatedAt, [accountId+reconciledDate], [accountId+reconciliationType]',
			reconciliationDiscrepancies:
				'id, accountId, discrepancyType, severity, resolvedAt, deletedAt, createdAt, updatedAt, [accountId+discrepancyType], [accountId+severity], [accountId+resolvedAt]',
			learningPatterns:
				'id, patternType, categoryId, isActive, appliedToProjections, lastValidated, deletedAt, createdAt, updatedAt, [patternType+isActive], [categoryId+patternType]',
			userFeedback:
				'id, feedbackType, suggestionId, action, deletedAt, createdAt, updatedAt, [feedbackType+action], [suggestionId+action]',
			optimizationPreferences:
				'id, preferenceType, categoryId, key, deletedAt, createdAt, updatedAt, [preferenceType+categoryId], [key+preferenceType]',
			negativeAllowanceEvents:
				'id, periodStart, periodEnd, accountId, category, deletedAt, createdAt, updatedAt, [accountId+periodStart], [category+periodStart]',
			envelopeBorrowings:
				'id, accountId, periodStart, fromCategory, toCategory, dueRepayBy, deletedAt, createdAt, updatedAt, [accountId+periodStart], [accountId+dueRepayBy]',
			rolloverAdjustments:
				'id, accountId, forPeriodStart, category, deletedAt, createdAt, updatedAt, [accountId+forPeriodStart]',
			occasions: 'id, accountId, occasionType, isActive, deletedAt, createdAt, updatedAt, [accountId+occasionType]'
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
			// Wait for database to be open
			await this.open();

			// Get existing system currencies
			const existingCurrencies = await this.getSystemCurrencies();
			const existingCodes = new Set(existingCurrencies.map((c) => c.code));

			// Check which system currencies are missing
			const missingCurrencies: Array<{ code: string; info: CurrencyInfo }> = [];
			for (const [code, currencyInfo] of CURRENCY_REGISTRY) {
				if (currencyInfo.isSystem && !existingCodes.has(code)) {
					missingCurrencies.push({ code, info: currencyInfo });
				}
			}

			// Add any missing system currencies
			if (missingCurrencies.length > 0) {
				console.log(
					`Adding ${missingCurrencies.length} missing system currencies:`,
					missingCurrencies.map((c) => c.code)
				);
				for (const { code, info } of missingCurrencies) {
					try {
						// Check if currency exists but is soft-deleted
						const deletedCurrency = await this.currencies
							.where('code')
							.equals(code)
							.filter((c) => c.deletedAt !== null)
							.first();

						if (deletedCurrency) {
							// Restore soft-deleted currency
							await this.currencies.update(deletedCurrency.id, {
								name: info.name,
								symbol: info.symbol,
								placement: info.placement,
								decimalPlaces: info.decimalPlaces,
								isSystem: info.isSystem,
								isActive: info.isActive,
								deletedAt: null,
								updatedAt: new Date().toISOString()
							});
						} else {
							// Add new currency
							await this.currencies.add({
								id: generateUUID(),
								code: info.code,
								name: info.name,
								symbol: info.symbol,
								placement: info.placement,
								decimalPlaces: info.decimalPlaces,
								isSystem: info.isSystem,
								isActive: info.isActive,
								createdAt: new Date().toISOString(),
								updatedAt: new Date().toISOString(),
								deletedAt: null
							});
						}
					} catch (err) {
						console.error(`Failed to add currency ${code}:`, err);
					}
				}
			}

			// Verify all system currencies are now present
			const finalCurrencies = await this.getSystemCurrencies();
			const finalCodes = new Set(finalCurrencies.map((c) => c.code));
			const systemCodes = Array.from(CURRENCY_REGISTRY.entries())
				.filter(([_, info]) => info.isSystem)
				.map(([code]) => code);

			const stillMissing = systemCodes.filter((code) => !finalCodes.has(code));
			if (stillMissing.length > 0) {
				console.warn(
					'Some system currencies are still missing after initialization:',
					stillMissing
				);
			}

			// Initialize currency configurations after currencies are created/verified
			await this.initializeCurrencyConfigurations();
		} catch (error) {
			console.error('Failed to initialize system currencies:', error);
			// Don't throw - allow app to continue even if currency initialization fails
		}
	}

	private async initializeCurrencyConfigurations(): Promise<void> {
		try {
			// Import currency config service dynamically to avoid circular dependencies
			const { currencyConfigService } = await import('./services/core/currency-config-service');
			await currencyConfigService.initializeSystemDefaults();
		} catch (error) {
			console.error('Failed to initialize currency configurations:', error);
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

		// Currency Configuration validation
		this.currencyConfigurations.hook('creating', (primKey, obj, trans) => {
			try {
				const validated = CurrencyConfigurationSchema.parse(obj);
				Object.assign(obj, validated);
			} catch (error) {
				console.error('Currency configuration validation failed:', error);
				console.error('Currency configuration data:', obj);
				throw error;
			}
		});

		this.currencyConfigurations.hook(
			'updating',
			(modifications: Partial<CurrencyConfiguration>, primKey, obj, trans) => {
				try {
					if (modifications.updatedAt === undefined) {
						modifications.updatedAt = new Date().toISOString();
					}
					const updated = { ...obj, ...modifications };
					CurrencyConfigurationSchema.parse(updated);
				} catch (error) {
					console.error('Currency configuration update validation failed:', error);
					console.error('Currency configuration data:', obj);
					console.error('Modifications:', modifications);
					throw error;
				}
			}
		);

		// Category validation
		this.categories.hook('creating', (primKey, obj, trans) => {
			try {
				const validated = CategorySchema.parse(obj);
				Object.assign(obj, validated);
			} catch (error) {
				console.error('Category validation failed:', error);
				console.error('Category data:', obj);
				throw error;
			}
		});

		this.categories.hook('updating', (modifications: Partial<Category>, primKey, obj, trans) => {
			try {
				if (modifications.updatedAt === undefined) {
					modifications.updatedAt = new Date().toISOString();
				}
				const updated = { ...obj, ...modifications };
				CategorySchema.parse(updated);
			} catch (error) {
				console.error('Category update validation failed:', error);
				console.error('Category data:', obj);
				console.error('Modifications:', modifications);
				throw error;
			}
		});

		// Transaction validation
		this.transactions.hook('creating', (primKey, obj, trans) => {
			try {
				// Status-based accountId validation
				// Transfers always require accountId (source account)
				if (obj.type === 'transfer') {
					if (!obj.accountId) {
						throw new Error('Account is required for transfer transactions');
					}
				} else {
					// For non-transfer transactions, require accountId for cleared and pending
					if ((obj.status === 'cleared' || obj.status === 'pending') && !obj.accountId) {
						throw new Error('Account is required for cleared and pending transactions');
					}
					// accountId is optional for planned transactions
				}

				// Enhanced validation - skip amount validation for transfers
				if (obj.type !== 'transfer') {
					const amountValidation = CurrencyUtils.validateAmount(obj.amount, obj.currency);
					if (!amountValidation.isValid) {
						throw new Error(`Amount validation failed: ${amountValidation.error}`);
					}
				}

				// Date validation for cleared transactions
				if (obj.status === 'cleared' && obj.clearedDate) {
					const dateValidation = TransactionUtils.validateTransactionDate(
						obj.clearedDate,
						obj.status
					);
					if (!dateValidation.isValid) {
						throw new Error(`Date validation failed: ${dateValidation.error}`);
					}
				}

				// Date validation for planned transactions
				if (obj.status === 'planned' && obj.plannedDate) {
					const dateValidation = TransactionUtils.validateTransactionDate(
						obj.plannedDate,
						obj.status
					);
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

		this.transactions.hook(
			'updating',
			(modifications: Partial<Transaction>, primKey, obj, trans) => {
				try {
					if (modifications.updatedAt === undefined) {
						modifications.updatedAt = new Date().toISOString();
					}
					const updated = { ...obj, ...modifications };

					// Status-based accountId validation on update
					// Check if status is being changed to cleared or pending
					const newStatus = modifications.status !== undefined ? modifications.status : obj.status;

					// Transfers always require accountId
					if (obj.type === 'transfer' || updated.type === 'transfer') {
						const accountId =
							modifications.accountId !== undefined ? modifications.accountId : obj.accountId;
						if (!accountId) {
							throw new Error('Account is required for transfer transactions');
						}
					} else {
						// For non-transfer transactions, require accountId when status is cleared or pending
						if (newStatus === 'cleared' || newStatus === 'pending') {
							const accountId =
								modifications.accountId !== undefined ? modifications.accountId : obj.accountId;
							if (!accountId) {
								throw new Error('Account is required when changing status to cleared or pending');
							}
						}
					}

					TransactionSchema.parse(updated);
				} catch (error) {
					console.error('Transaction update validation failed:', error);
					console.error('Transaction data:', obj);
					console.error('Modifications:', modifications);
					throw error;
				}
			}
		);

		// Goal validation
		this.goals.hook('creating', (primKey, obj, trans) => {
			try {
				const validated = GoalSchema.parse(obj);
				Object.assign(obj, validated);
			} catch (error) {
				console.error('Goal validation failed:', error);
				console.error('Goal data:', obj);
				throw error;
			}
		});

		this.goals.hook('updating', (modifications: Partial<Goal>, primKey, obj, trans) => {
			try {
				if (modifications.updatedAt === undefined) {
					modifications.updatedAt = new Date().toISOString();
				}
				const updated = { ...obj, ...modifications };
				GoalSchema.parse(updated);
			} catch (error) {
				console.error('Goal update validation failed:', error);
				console.error('Goal data:', obj);
				console.error('Modifications:', modifications);
				throw error;
			}
		});

		// User Preferences validation
		this.userPreferences.hook('creating', (primKey, obj, trans) => {
			try {
				const validated = UserPreferencesSchema.parse(obj);
				Object.assign(obj, validated);
			} catch (error) {
				console.error('User preferences validation failed:', error);
				console.error('User preferences data:', obj);
				throw error;
			}
		});

		this.userPreferences.hook(
			'updating',
			(modifications: Partial<UserPreferences>, primKey, obj, trans) => {
				try {
					if (modifications.updatedAt === undefined) {
						modifications.updatedAt = new Date().toISOString();
					}
					const updated = { ...obj, ...modifications };
					UserPreferencesSchema.parse(updated);
				} catch (error) {
					console.error('User preferences update validation failed:', error);
					console.error('User preferences data:', obj);
					console.error('Modifications:', modifications);
					throw error;
				}
			}
		);

		// User Action validation
		this.userActions.hook('creating', (primKey, obj, trans) => {
			try {
				const validated = UserActionSchema.parse(obj);
				Object.assign(obj, validated);
			} catch (error) {
				console.error('User action validation failed:', error);
				console.error('User action data:', obj);
				throw error;
			}
		});

		// Insight validation
		this.insights.hook('creating', (primKey, obj, trans) => {
			try {
				const validated = InsightSchema.parse(obj);
				Object.assign(obj, validated);
			} catch (error) {
				console.error('Insight validation failed:', error);
				console.error('Insight data:', obj);
				throw error;
			}
		});

		this.insights.hook('updating', (modifications: Partial<Insight>, primKey, obj, trans) => {
			try {
				if (modifications.updatedAt === undefined) {
					modifications.updatedAt = new Date().toISOString();
				}
				const updated = { ...obj, ...modifications };
				InsightSchema.parse(updated);
			} catch (error) {
				console.error('Insight update validation failed:', error);
				console.error('Insight data:', obj);
				console.error('Modifications:', modifications);
				throw error;
			}
		});

		// Negative Allowance Event validation
		this.negativeAllowanceEvents.hook('creating', (primKey, obj, trans) => {
			try {
				const validated = NegativeAllowanceEventSchema.parse(obj);
				Object.assign(obj, validated);
			} catch (error) {
				console.error('Negative allowance event validation failed:', error);
				console.error('Negative allowance event data:', obj);
				throw error;
			}
		});

		this.negativeAllowanceEvents.hook('updating', (modifications: Partial<NegativeAllowanceEvent>, primKey, obj, trans) => {
			try {
				if (modifications.updatedAt === undefined) {
					modifications.updatedAt = new Date().toISOString();
				}
				const updated = { ...obj, ...modifications };
				NegativeAllowanceEventSchema.parse(updated);
			} catch (error) {
				console.error('Negative allowance event update validation failed:', error);
				console.error('Modifications:', modifications);
				throw error;
			}
		});

		// Envelope Borrowing validation
		this.envelopeBorrowings.hook('creating', (primKey, obj, trans) => {
			try {
				const validated = EnvelopeBorrowingSchema.parse(obj);
				Object.assign(obj, validated);
			} catch (error) {
				console.error('Envelope borrowing validation failed:', error);
				console.error('Envelope borrowing data:', obj);
				throw error;
			}
		});

		this.envelopeBorrowings.hook('updating', (modifications: Partial<EnvelopeBorrowing>, primKey, obj, trans) => {
			try {
				if (modifications.updatedAt === undefined) {
					modifications.updatedAt = new Date().toISOString();
				}
				const updated = { ...obj, ...modifications };
				EnvelopeBorrowingSchema.parse(updated);
			} catch (error) {
				console.error('Envelope borrowing update validation failed:', error);
				console.error('Modifications:', modifications);
				throw error;
			}
		});

		// Rollover adjustment validation
		this.rolloverAdjustments.hook('creating', (primKey, obj, trans) => {
			try {
				const validated = RolloverAdjustmentSchema.parse(obj);
				Object.assign(obj, validated);
			} catch (error) {
				console.error('Rollover adjustment validation failed:', error);
				throw error;
			}
		});
		this.rolloverAdjustments.hook('updating', (modifications: Partial<RolloverAdjustment>, primKey, obj, trans) => {
			try {
				if (modifications.updatedAt === undefined) {
					modifications.updatedAt = new Date().toISOString();
				}
				const updated = { ...obj, ...modifications };
				RolloverAdjustmentSchema.parse(updated);
			} catch (error) {
				console.error('Rollover adjustment update validation failed:', error);
				throw error;
			}
		});

		// Occasion validation
		this.occasions.hook('creating', (primKey, obj, trans) => {
			try {
				const validated = OccasionSchema.parse(obj);
				Object.assign(obj, validated);
			} catch (error) {
				console.error('Occasion validation failed:', error);
				throw error;
			}
		});
		this.occasions.hook('updating', (modifications: Partial<Occasion>, primKey, obj, trans) => {
			try {
				if (modifications.updatedAt === undefined) {
					modifications.updatedAt = new Date().toISOString();
				}
				const updated = { ...obj, ...modifications };
				OccasionSchema.parse(updated);
			} catch (error) {
				console.error('Occasion update validation failed:', error);
				throw error;
			}
		});
	}

	private setupSoftDeleteHooks() {
		// Soft delete handling - exclude deleted items by default
		// Note: obj can be undefined, so we need to check for it first
		this.accounts.hook('reading', (obj) => {
			if (!obj) {
				console.warn('[DB Hook] accounts: obj is undefined', new Error().stack);
				return undefined;
			}
			return obj.deletedAt ? undefined : obj;
		});

		this.currencies.hook('reading', (obj) => {
			if (!obj) {
				console.warn('[DB Hook] currencies: obj is undefined', new Error().stack);
				return undefined;
			}
			return obj.deletedAt ? undefined : obj;
		});

		this.currencyConfigurations.hook('reading', (obj) => {
			if (!obj) {
				console.warn('[DB Hook] currencyConfigurations: obj is undefined', new Error().stack);
				return undefined;
			}
			return obj.deletedAt ? undefined : obj;
		});

		this.categories.hook('reading', (obj) => {
			if (!obj) {
				console.warn('[DB Hook] categories: obj is undefined', new Error().stack);
				return undefined;
			}
			return obj.deletedAt ? undefined : obj;
		});

		this.transactions.hook('reading', (obj) => {
			if (!obj) {
				console.warn('[DB Hook] transactions: obj is undefined', new Error().stack);
				return undefined;
			}
			return obj.deletedAt ? undefined : obj;
		});

		this.userActions.hook('reading', (obj) => {
			if (!obj) {
				console.warn('[DB Hook] userActions: obj is undefined', new Error().stack);
				return undefined;
			}
			return obj.deletedAt ? undefined : obj;
		});

		this.negativeAllowanceEvents.hook('reading', (obj) => {
			if (!obj) {
				console.warn('[DB Hook] negativeAllowanceEvents: obj is undefined', new Error().stack);
				return undefined;
			}
			return obj.deletedAt ? undefined : obj;
		});

		this.envelopeBorrowings.hook('reading', (obj) => {
			if (!obj) {
				console.warn('[DB Hook] envelopeBorrowings: obj is undefined', new Error().stack);
				return undefined;
			}
			return obj.deletedAt ? undefined : obj;
		});

		this.rolloverAdjustments.hook('reading', (obj) => {
			if (!obj) {
				console.warn('[DB Hook] rolloverAdjustments: obj is undefined', new Error().stack);
				return undefined;
			}
			return obj.deletedAt ? undefined : obj;
		});

		this.occasions.hook('reading', (obj) => {
			if (!obj) {
				console.warn('[DB Hook] occasions: obj is undefined', new Error().stack);
				return undefined;
			}
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
	 * Get all transactions in a group
	 */
	async getGroupTransactions(groupId: string): Promise<Transaction[]> {
		return await this.transactions
			.where('groupId')
			.equals(groupId)
			.filter((transaction) => !transaction.deletedAt)
			.toArray();
	}

	/**
	 * Get the master transaction for a group
	 * Prioritizes transactions with descriptions, then largest amount
	 */
	async getGroupMasterTransaction(groupId: string): Promise<Transaction | null> {
		const groupTransactions = await this.getGroupTransactions(groupId);
		if (groupTransactions.length === 0) return null;

		// First, try to find a transaction with a description
		const withDescription = groupTransactions.find(
			(tx) => tx.description && tx.description.trim() !== ''
		);
		if (withDescription) {
			// Among transactions with descriptions, pick the one with largest absolute amount
			const withDescriptions = groupTransactions.filter(
				(tx) => tx.description && tx.description.trim() !== ''
			);
			return withDescriptions.reduce((master, current) =>
				Math.abs(current.amount || 0) > Math.abs(master.amount || 0) ? current : master
			);
		}

		// If no descriptions, return the transaction with the largest absolute amount
		return groupTransactions.reduce((master, current) =>
			Math.abs(current.amount || 0) > Math.abs(master.amount || 0) ? current : master
		);
	}

	/**
	 * Create a new transaction group
	 */
	async createTransactionGroup(
		groupTransactions: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>[],
		groupName?: string
	): Promise<string> {
		const groupId = generateUUID();
		const finalGroupName = groupName || 'Transaction Group';

		// Validate the group transactions for creation
		const validation = validateNewGroupTransaction(groupTransactions);
		if (!validation.isValid) {
			throw new Error(`Invalid transaction group: ${validation.errors.join(', ')}`);
		}

		// Enhanced group sum validation
		const groupSumValidation = BalanceUtils.validateGroupSum(groupTransactions as Transaction[]);
		if (!groupSumValidation.isValid) {
			throw new Error(`Group sum validation failed: ${groupSumValidation.errors.join(', ')}`);
		}

		// Create all transactions in the group
		await this.transaction('rw', [this.transactions], async () => {
			for (const transactionData of groupTransactions) {
				const transaction: Transaction = {
					...transactionData,
					id: generateUUID(),
					groupId,
					groupName: finalGroupName, // Ensure consistent group name
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					deletedAt: null
				};

				await this.transactions.add(transaction);
			}
		});

		return groupId;
	}

	/**
	 * Update a transaction group
	 */
	async updateTransactionGroup(
		groupId: string,
		updates: {
			sharedFields?: Partial<
				Pick<
					Transaction,
					| 'type'
					| 'status'
					| 'currency'
					| 'categoryId'
					| 'plannedDate'
					| 'clearedDate'
					| 'recurrenceRule'
					| 'parentRecurrenceId'
					| 'reference'
					| 'notes'
					| 'importSource'
					| 'toAccountId'
					| 'groupName'
				>
			>;
			individualUpdates?: Array<{
				id: string;
				amount?: number;
				description?: string;
				accountId?: string;
			}>;
		}
	): Promise<void> {
		const groupTransactions = await this.getGroupTransactions(groupId);
		if (groupTransactions.length === 0) {
			throw new Error(`Transaction group ${groupId} not found`);
		}

		await this.transaction('rw', [this.transactions], async () => {
			// Update shared fields for all transactions in the group
			if (updates.sharedFields) {
				for (const transaction of groupTransactions) {
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
	 * Delete an entire transaction group
	 */
	async deleteTransactionGroup(groupId: string): Promise<void> {
		const groupTransactions = await this.getGroupTransactions(groupId);

		await this.transaction('rw', [this.transactions], async () => {
			for (const transaction of groupTransactions) {
				await this.softDeleteTransaction(transaction.id);
			}
		});
	}

	/**
	 * Remove a transaction from a group (ungroup it)
	 */
	async removeTransactionFromGroup(transactionId: string): Promise<void> {
		await this.transactions.update(transactionId, {
			groupId: undefined,
			groupName: undefined,
			updatedAt: new Date().toISOString()
		});
	}

	/**
	 * Add a transaction to an existing group
	 */
	async addTransactionToGroup(
		transactionId: string,
		groupId: string,
		groupName?: string
	): Promise<void> {
		const groupTransactions = await this.getGroupTransactions(groupId);
		if (groupTransactions.length === 0) {
			throw new Error(`Transaction group ${groupId} not found`);
		}

		const transaction = await this.transactions.get(transactionId);
		if (!transaction) {
			throw new Error(`Transaction ${transactionId} not found`);
		}

		// Validate that the transaction can be added to this group
		// Check against all existing group transactions, not just the first one
		const allTransactions = [...groupTransactions, transaction];
		const validation = validateTransactionGroup(allTransactions);
		if (!validation.isValid) {
			throw new Error(`Transaction cannot be added to group: ${validation.errors.join(', ')}`);
		}

		// Ensure consistent group name across all transactions
		const finalGroupName = groupName || groupTransactions[0].groupName || 'Transaction Group';

		await this.transactions.update(transactionId, {
			groupId,
			groupName: finalGroupName,
			updatedAt: new Date().toISOString()
		});
	}

	/**
	 * Get group statistics for a given group
	 */
	async getGroupStatistics(groupId: string): Promise<{
		totalAmount: number;
		transactionCount: number;
		sharedFields: Partial<Transaction>;
		amounts: Array<{ id: string; amount: number; description?: string }>;
	}> {
		const groupTransactions = await this.getGroupTransactions(groupId);
		if (groupTransactions.length === 0) {
			throw new Error(`Transaction group ${groupId} not found`);
		}

		const totalAmount = groupTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);
		const masterTransaction = groupTransactions[0];

		return {
			totalAmount,
			transactionCount: groupTransactions.length,
			sharedFields: {
				type: masterTransaction.type,
				status: masterTransaction.status,
				currency: masterTransaction.currency,
				categoryId: masterTransaction.categoryId,
				plannedDate: masterTransaction.plannedDate,
				clearedDate: masterTransaction.clearedDate,
				recurrenceRule: masterTransaction.recurrenceRule,
				parentRecurrenceId: masterTransaction.parentRecurrenceId,
				reference: masterTransaction.reference,
				notes: masterTransaction.notes,
				importSource: masterTransaction.importSource,
				toAccountId: masterTransaction.toAccountId,
				groupName: masterTransaction.groupName
			},
			amounts: groupTransactions.map((tx) => ({
				id: tx.id,
				amount: tx.amount || 0,
				description: tx.description
			}))
		};
	}

	// Account queries
	async getActiveAccounts(): Promise<Account[]> {
		console.log('[DB] getActiveAccounts called');
		try {
			const accounts = await this.accounts.toArray();
			console.log('[DB] Raw accounts from DB:', accounts.length);
			const filtered = accounts.filter((account) => {
				if (!account) {
					console.warn('[DB] Found undefined account in getActiveAccounts');
					return false;
				}
				return !account.deletedAt;
			});
			console.log('[DB] Filtered active accounts:', filtered.length);
			return filtered;
		} catch (error) {
			console.error('[DB] Error in getActiveAccounts:', error);
			throw error;
		}
	}

	async getAccountsByType(type: Account['type']): Promise<Account[]> {
		return await this.accounts
			.where('type')
			.equals(type)
			.filter((account) => !account.deletedAt)
			.toArray();
	}

	async getAccountBalance(accountId: string): Promise<number> {
		const account = await this.accounts.get(accountId);
		return account?.currentBalance || 0;
	}

	// Currency queries
	async getActiveCurrencies(): Promise<Currency[]> {
		return await this.currencies.filter((currency) => !currency.deletedAt).toArray();
	}

	async getCurrencyByCode(code: string): Promise<Currency | null> {
		const currency = await this.currencies
			.filter((currency) => currency.code === code && !currency.deletedAt)
			.first();
		return currency || null;
	}

	async getSystemCurrencies(): Promise<Currency[]> {
		return await this.currencies
			.filter((currency) => currency.isSystem && !currency.deletedAt)
			.toArray();
	}

	// Category queries
	async getActiveCategories(): Promise<Category[]> {
		return await this.categories.filter((category) => !category.deletedAt).toArray();
	}

	async getCategoriesByType(type: Category['type']): Promise<Category[]> {
		return await this.categories
			.where('type')
			.equals(type)
			.filter((category) => !category.deletedAt)
			.toArray();
	}

	async getCategoriesByWaterfallTier(tier: Category['waterfallTier']): Promise<Category[]> {
		return await this.categories
			.where('waterfallTier')
			.equals(tier)
			.filter((category) => !category.deletedAt)
			.toArray();
	}

	// Transaction queries
	async getActiveTransactions(): Promise<Transaction[]> {
		return await this.transactions.filter((transaction) => !transaction.deletedAt).toArray();
	}

	async getTransactionsByStatus(status: Transaction['status']): Promise<Transaction[]> {
		return await this.transactions
			.where('status')
			.equals(status)
			.filter((transaction) => !transaction.deletedAt)
			.toArray();
	}

	async getTransactionsByAccount(accountId: string): Promise<Transaction[]> {
		const transactions = await this.transactions
			.where('accountId')
			.equals(accountId)
			.filter((transaction) => !transaction.deletedAt)
			.toArray();
		
		// Sort by date (oldest first) for consistent ordering
		// This ensures balance calculations and other operations process transactions chronologically
		return transactions.sort((a, b) => {
			const dateA = a.clearedDate || a.plannedDate || a.createdAt;
			const dateB = b.clearedDate || b.plannedDate || b.createdAt;
			const timeA = new Date(dateA).getTime();
			const timeB = new Date(dateB).getTime();
			
			// If dates are equal, use creation time as tiebreaker
			if (timeA === timeB) {
				return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
			}
			
			return timeA - timeB; // Oldest first
		});
	}

	async getTransactionsRelatedToAccount(accountId: string): Promise<Transaction[]> {
		// Get transactions where account is either source (accountId) or destination (toAccountId)
		const sourceTransactions = await this.transactions
			.where('accountId')
			.equals(accountId)
			.filter((transaction) => !transaction.deletedAt)
			.toArray();

		const destinationTransactions = await this.transactions
			.where('toAccountId')
			.equals(accountId)
			.filter((transaction) => !transaction.deletedAt)
			.toArray();

		// Combine and sort by date (most recent first)
		const allTransactions = [...sourceTransactions, ...destinationTransactions];
		return allTransactions.sort((a, b) => {
			const dateA = a.clearedDate || a.plannedDate || a.createdAt;
			const dateB = b.clearedDate || b.plannedDate || b.createdAt;
			return new Date(dateB).getTime() - new Date(dateA).getTime();
		});
	}

	// New category-based transaction queries
	async getTransactionsByCategory(categoryId: string): Promise<Transaction[]> {
		return await this.transactions
			.where('categoryId')
			.equals(categoryId)
			.filter((transaction) => !transaction.deletedAt)
			.toArray();
	}

	async getTransactionsByDateRange(startDate: string, endDate: string): Promise<Transaction[]> {
		return await this.transactions
			.where('clearedDate')
			.between(startDate, endDate, true, true)
			.filter((transaction) => !transaction.deletedAt)
			.toArray();
	}

	async getPlannedTransactions(): Promise<Transaction[]> {
		return await this.transactions
			.where('status')
			.equals('planned')
			.filter((transaction) => !transaction.deletedAt)
			.toArray();
	}

	async getPendingTransactions(): Promise<Transaction[]> {
		return await this.transactions
			.where('status')
			.equals('pending')
			.filter((transaction) => !transaction.deletedAt)
			.toArray();
	}

	async getClearedTransactions(): Promise<Transaction[]> {
		return await this.transactions
			.where('status')
			.equals('cleared')
			.filter((transaction) => !transaction.deletedAt)
			.toArray();
	}

	// Goal queries
	async getActiveGoals(): Promise<Goal[]> {
		return await this.goals.filter((goal) => goal.status === 'active').toArray();
	}

	async getGoalsByStatus(status: Goal['status']): Promise<Goal[]> {
		return await this.goals.where('status').equals(status).toArray();
	}

	async getGoalsByCategory(category: Goal['category']): Promise<Goal[]> {
		return await this.goals.where('category').equals(category).toArray();
	}

	// Insight queries
	async getActiveInsights(): Promise<Insight[]> {
		return await this.insights
			.filter((insight) => insight.isActive && !insight.dismissedAt)
			.toArray();
	}

	async getInsightsByType(type: Insight['type']): Promise<Insight[]> {
		return await this.insights
			.where('type')
			.equals(type)
			.filter((insight) => insight.isActive && !insight.dismissedAt)
			.toArray();
	}

	async getInsightsBySeverity(severity: Insight['severity']): Promise<Insight[]> {
		return await this.insights
			.where('severity')
			.equals(severity)
			.filter((insight) => insight.isActive && !insight.dismissedAt)
			.toArray();
	}

	async getUnreadInsights(): Promise<Insight[]> {
		return await this.insights
			.filter(
				(insight) =>
					insight.isActive &&
					!insight.dismissedAt &&
					!insight.readAt &&
					// Exclude prediction insights from notifications - they're available on insights page
					insight.type !== 'prediction'
			)
			.toArray();
	}

	async getUnreadCount(): Promise<number> {
		const unread = await this.getUnreadInsights();
		return unread.length;
	}

	async getUnreadBySeverity(severity?: Insight['severity']): Promise<Insight[]> {
		if (severity) {
			return await this.insights
				.where('severity')
				.equals(severity)
				.filter(
					(insight) =>
						insight.isActive &&
						!insight.dismissedAt &&
						!insight.readAt &&
						// Exclude prediction insights from notifications
						insight.type !== 'prediction'
				)
				.toArray();
		}
		return await this.getUnreadInsights();
	}

	async markInsightAsRead(id: string): Promise<void> {
		await this.insights.update(id, {
			readAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		});
	}

	async markAllInsightsAsRead(): Promise<void> {
		const unread = await this.getUnreadInsights();
		const updates = unread.map((insight) =>
			this.insights.update(insight.id, {
				readAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			})
		);
		await Promise.all(updates);
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

	async softDeleteTransaction(id: string): Promise<void> {
		await this.transactions.update(id, {
			deletedAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		});
	}

	async softDeleteCategory(id: string): Promise<void> {
		await this.categories.update(id, {
			deletedAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		});
	}

	async softDeleteGoal(id: string): Promise<void> {
		await this.goals.update(id, {
			status: 'cancelled',
			updatedAt: new Date().toISOString()
		});
	}

	async softDeleteInsight(id: string): Promise<void> {
		await this.insights.update(id, {
			dismissedAt: new Date().toISOString(),
			isActive: false,
			updatedAt: new Date().toISOString()
		});
	}

	// ============================================================================
	// BADGE MANAGEMENT
	// ============================================================================

	async getBadges(): Promise<Badge[]> {
		return await this.badges.filter((badge) => !badge.deletedAt).toArray();
	}

	async getUnlockedBadges(): Promise<Badge[]> {
		return await this.badges
			.filter((badge) => !badge.deletedAt && badge.unlockedAt !== undefined)
			.toArray();
	}

	async getBadgeByBadgeId(badgeId: string): Promise<Badge | undefined> {
		return await this.badges
			.where('badgeId')
			.equals(badgeId)
			.filter((badge) => !badge.deletedAt)
			.first();
	}

	async getBadgesByType(type: Badge['type']): Promise<Badge[]> {
		return await this.badges
			.where('type')
			.equals(type)
			.filter((badge) => !badge.deletedAt)
			.toArray();
	}

	async unlockBadge(
		badge: Omit<Badge, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>
	): Promise<Badge> {
		const existing = await this.getBadgeByBadgeId(badge.badgeId);

		if (existing) {
			// Update existing badge
			await this.badges.update(existing.id, {
				...badge,
				unlockedAt: badge.unlockedAt || new Date().toISOString(),
				updatedAt: new Date().toISOString()
			});
			return (await this.getBadgeByBadgeId(badge.badgeId))!;
		} else {
			// Create new badge
			const newBadge: Badge = {
				...badge,
				id: generateUUID(),
				unlockedAt: badge.unlockedAt || new Date().toISOString(),
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				deletedAt: null
			};
			await this.badges.add(newBadge);
			return newBadge;
		}
	}

	async updateBadgeProgress(
		badgeId: string,
		progress: { current: number; target: number; percentage: number }
	): Promise<void> {
		const badge = await this.getBadgeByBadgeId(badgeId);
		if (badge) {
			await this.badges.update(badge.id, {
				progress: JSON.stringify(progress),
				updatedAt: new Date().toISOString()
			});
		}
	}

	async markBadgeNotified(badgeId: string): Promise<void> {
		const badge = await this.getBadgeByBadgeId(badgeId);
		if (badge) {
			await this.badges.update(badge.id, {
				notifiedAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			});
		}
	}

	async getUnnotifiedBadges(): Promise<Badge[]> {
		return await this.badges
			.filter(
				(badge) =>
					!badge.deletedAt &&
					badge.unlockedAt !== undefined &&
					(badge.notifiedAt === undefined || badge.notifiedAt === null)
			)
			.toArray();
	}

	// ============================================================================
	// INCLUDE DELETED ITEMS QUERIES (for admin/recovery purposes)
	// ============================================================================

	async getAllAccountsIncludingDeleted(): Promise<Account[]> {
		return await this.accounts.toArray();
	}

	async getAllCategoriesIncludingDeleted(): Promise<Category[]> {
		return await this.categories.toArray();
	}

	async getAllTransactionsIncludingDeleted(): Promise<Transaction[]> {
		return await this.transactions.toArray();
	}

	async getAllGoalsIncludingDeleted(): Promise<Goal[]> {
		return await this.goals.toArray();
	}

	async getAllInsightsIncludingDeleted(): Promise<Insight[]> {
		return await this.insights.toArray();
	}

	async getAllUserActionsIncludingDeleted(): Promise<UserAction[]> {
		return await this.userActions.toArray();
	}

	async getAllCurrencyConfigurationsIncludingDeleted(): Promise<CurrencyConfiguration[]> {
		return await this.currencyConfigurations.toArray();
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
		// Get the account to access initialBalance
		const account = await this.accounts.get(accountId);
		if (!account) {
			throw new Error(`Account ${accountId} not found`);
		}

		// Start with the initial balance
		let balance = account.initialBalance || 0;
		
		// Debug logging for balance calculation (only in development)
		const isDebugMode = typeof window !== 'undefined' && (window as any).__BUDGIC_DEBUG__;
		if (isDebugMode) {
			console.log(`[Balance Calc] Account: ${account.name} (${accountId}), Starting balance: ${balance}`);
		}

		// Get all cleared transactions where this account is the source (accountId)
		const sourceTransactions = await this.getTransactionsByAccount(accountId);
		const clearedSourceTransactions = sourceTransactions.filter(
			(t) => t.status === 'cleared' && !t.deletedAt
		);
		
		// Debug: Log transaction count and check for multi-currency transactions
		if (isDebugMode) {
			console.log(`[Balance Calc] Found ${clearedSourceTransactions.length} cleared source transactions`);
			const multiCurrencyCount = clearedSourceTransactions.filter(t => 
				t.currency && t.accountAmount !== undefined && t.currency !== account.currency
			).length;
			if (multiCurrencyCount > 0) {
				console.log(`[Balance Calc] Found ${multiCurrencyCount} multi-currency transactions`);
			}
		}

		// Get all cleared transfer transactions that affect this account
		// Since IndexedDB doesn't support querying nested fields, we need to get all transfers and filter
		const allTransfers = await this.transactions
			.where('type')
			.equals('transfer')
			.filter((t) => !t.deletedAt && t.status === 'cleared')
			.toArray();

		// Filter transfers where this account is:
		// 1. The destination (transferDetails.toAccountId)
		// 2. The fee account (transferDetails.feeAccountId, if different from source)
		const affectingTransfers = allTransfers.filter((t) => {
			if (!t.transferDetails || !t.accountId) return false;
			const { toAccountId, feeAccountId } = t.transferDetails;
			const sourceAccountId = t.accountId;
			const feeAccount = feeAccountId || sourceAccountId; // Default fee to source account

			// Include if this account is the destination
			if (toAccountId === accountId) {
				return true;
			}

			// Include if this account is the fee account (when different from source)
			if (feeAccount === accountId && feeAccount !== sourceAccountId) {
				return true;
			}

			return false;
		});

		// Combine all transactions that affect this account
		// Deduplicate by transaction ID to avoid processing the same transaction twice
		const transactionMap = new Map<string, Transaction>();
		for (const tx of clearedSourceTransactions) {
			transactionMap.set(tx.id, tx);
		}
		for (const tx of affectingTransfers) {
			// Only add if not already present (avoid duplicates)
			// This can happen if a transfer has the same account as both source and destination (shouldn't happen, but be safe)
			if (!transactionMap.has(tx.id)) {
				transactionMap.set(tx.id, tx);
			}
		}
		const allAffectingTransactions = Array.from(transactionMap.values());

		// CRITICAL: Sort transactions chronologically (oldest first) before applying impacts
		// Balance calculation must process transactions in chronological order
		allAffectingTransactions.sort((a, b) => {
			// Use clearedDate for cleared transactions, fallback to plannedDate or createdAt
			const dateA = a.clearedDate || a.plannedDate || a.createdAt;
			const dateB = b.clearedDate || b.plannedDate || b.createdAt;
			const timeA = new Date(dateA).getTime();
			const timeB = new Date(dateB).getTime();
			
			// If dates are equal, use creation time as tiebreaker for consistent ordering
			if (timeA === timeB) {
				return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
			}
			
			return timeA - timeB; // Oldest first
		});

		// Apply impact of all transactions in chronological order
		let transactionCount = 0;
		
		for (const transaction of allAffectingTransactions) {
			const impact = calculateTransactionImpact(transaction, accountId);
			const previousBalance = balance;
			balance += impact;
			transactionCount++;
			
			if (isDebugMode) {
				const date = transaction.clearedDate || transaction.plannedDate || transaction.createdAt;
				const amountUsed = transaction.accountAmount !== undefined 
					? transaction.accountAmount 
					: transaction.amount;
				const currencyInfo = transaction.currency && transaction.currency !== account.currency 
					? ` (${transaction.currency}→${account.currency}, using accountAmount: ${transaction.accountAmount?.toFixed(2) || 'N/A'})`
					: '';
				const impactStr = impact > 0 ? `+${impact.toFixed(2)}` : impact.toFixed(2);
				console.log(`[Balance Calc] ${date.substring(0, 10)}: ${transaction.type} ${impactStr} (original: ${transaction.amount?.toFixed(2) || 'N/A'}${currencyInfo}) (${previousBalance.toFixed(2)} → ${balance.toFixed(2)})`);
			}
		}
		
		if (isDebugMode) {
			console.log(`[Balance Calc] Account: ${account.name}, Processed ${transactionCount} transactions, Final balance: ${balance}`);
		}

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
