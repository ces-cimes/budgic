/**
 * Account metadata utilities
 * Helper functions for working with account metadata fields
 */

import type { Account, AccountMetadata } from '$lib/core/db';
import { currencyConfigService } from '$lib/core/services/core/currency-config-service';

/**
 * Get metadata fields relevant to a specific account type
 */
export function getRelevantMetadataFields(accountType: Account['type']): Array<keyof AccountMetadata> {
	switch (accountType) {
		case 'checking':
			return ['minimumBalance', 'overdraftLimit', 'overdraftFee', 'bufferAmount'] as Array<keyof AccountMetadata>;
		case 'savings':
			return ['interestRate', 'transferLimit', 'transferDelayDays', 'bufferAmount', 'isEmergencyFund'] as Array<keyof AccountMetadata>;
		case 'credit':
			return [
				'creditLimit',
				'apr',
				'statementCloseDate',
				'paymentDueDate',
				'minimumPayment',
				'gracePeriodDays',
				'creditBureauReportingDate'
			] as Array<keyof AccountMetadata>;
		case 'investment':
			return ['accountType', 'bufferAmount'] as Array<keyof AccountMetadata>;
		case 'cash':
		case 'crypto':
		default:
			return ['bufferAmount'] as Array<keyof AccountMetadata>;
	}
}

/**
 * Get default metadata suggestions based on account type
 */
export function getDefaultMetadata(accountType: Account['type']): Partial<AccountMetadata> {
	switch (accountType) {
		case 'checking':
			return {
				minimumBalance: 0,
				overdraftLimit: 0,
				overdraftFee: 0
			};
		case 'savings':
			return {
				interestRate: 0,
				transferLimit: 0,
				transferDelayDays: 0
			};
		case 'credit':
			return {
				creditLimit: 0,
				apr: 0,
				statementCloseDate: undefined,
				paymentDueDate: undefined,
				minimumPayment: 0,
				gracePeriodDays: 21
			};
		default:
			return {};
	}
}

/**
 * Calculate available credit (for credit accounts)
 */
export function getAvailableCredit(account: Account): number | null {
	if (account.type !== 'credit' || !account.metadata?.creditLimit) {
		return null;
	}

	// For credit cards, balance is typically negative (debt)
	// Available credit = credit limit - current debt
	const currentDebt = Math.abs(Math.min(0, account.currentBalance));
	return Math.max(0, account.metadata.creditLimit - currentDebt);
}

/**
 * Calculate credit utilization percentage (for credit accounts)
 */
export function getCreditUtilization(account: Account): number | null {
	if (account.type !== 'credit' || !account.metadata?.creditLimit || account.metadata.creditLimit === 0) {
		return null;
	}

	const currentDebt = Math.abs(Math.min(0, account.currentBalance));
	return (currentDebt / account.metadata.creditLimit) * 100;
}

/**
 * Credit utilization status levels
 */
export type CreditUtilizationStatus = 'excellent' | 'good' | 'fair' | 'poor' | 'critical';

/**
 * Get credit utilization status based on percentage
 * Based on credit score impact:
 * - Excellent: 0-10% (best for credit score)
 * - Good: 10-30% (good for credit score)
 * - Fair: 30-50% (moderate impact)
 * - Poor: 50-80% (negative impact)
 * - Critical: 80-100% (significant negative impact)
 */
export function getCreditUtilizationStatus(utilization: number | null): CreditUtilizationStatus | null {
	if (utilization === null) return null;
	
	if (utilization <= 10) return 'excellent';
	if (utilization <= 30) return 'good';
	if (utilization <= 50) return 'fair';
	if (utilization <= 80) return 'poor';
	return 'critical';
}

/**
 * Calculate aggregate credit utilization across all credit accounts
 * Returns total utilization percentage (total debt / total credit limit)
 */
export function getAggregateCreditUtilization(accounts: Account[]): {
	utilization: number;
	totalDebt: number;
	totalCreditLimit: number;
	accountCount: number;
} | null {
	const creditAccounts = accounts.filter(acc => acc.type === 'credit' && acc.metadata?.creditLimit);
	
	if (creditAccounts.length === 0) {
		return null;
	}
	
	let totalDebt = 0;
	let totalCreditLimit = 0;
	
	for (const account of creditAccounts) {
		const creditLimit = account.metadata?.creditLimit || 0;
		if (creditLimit > 0) {
			const currentDebt = Math.abs(Math.min(0, account.currentBalance));
			totalDebt += currentDebt;
			totalCreditLimit += creditLimit;
		}
	}
	
	if (totalCreditLimit === 0) {
		return null;
	}
	
	const utilization = (totalDebt / totalCreditLimit) * 100;
	
	return {
		utilization,
		totalDebt,
		totalCreditLimit,
		accountCount: creditAccounts.length
	};
}

/**
 * Get recommended payment amount to reach target utilization
 */
export function getRecommendedPaymentForTargetUtilization(
	account: Account,
	targetUtilization: number
): number | null {
	const utilization = getCreditUtilization(account);
	if (utilization === null || account.metadata?.creditLimit === undefined) {
		return null;
	}
	
	if (utilization <= targetUtilization) {
		return 0; // Already at or below target
	}
	
	const currentDebt = Math.abs(Math.min(0, account.currentBalance));
	const targetDebt = (account.metadata.creditLimit * targetUtilization) / 100;
	const paymentNeeded = currentDebt - targetDebt;
	
	return Math.max(0, paymentNeeded);
}

/**
 * Check if account is below minimum balance
 */
export function isBelowMinimumBalance(account: Account): boolean {
	if (!account.metadata?.minimumBalance) {
		return false;
	}
	return account.currentBalance < account.metadata.minimumBalance;
}

/**
 * Check if account would trigger overdraft
 */
export function wouldTriggerOverdraft(account: Account, amount: number): boolean {
	if (account.type !== 'checking' || !account.metadata?.overdraftLimit) {
		return false;
	}

	const projectedBalance = account.currentBalance - amount;
	const minimumWithOverdraft = (account.metadata.minimumBalance || 0) - account.metadata.overdraftLimit;
	return projectedBalance < minimumWithOverdraft;
}

/**
 * Calculate recommended buffer based on spending patterns and account type
 * This provides smart defaults when user hasn't set a custom buffer
 */
export async function calculateRecommendedBuffer(
	account: Account,
	transactions?: Array<{ amount: number; clearedDate?: string; type: string }>
): Promise<number> {
	// If user has set a custom buffer, use it
	if (account.metadata?.bufferAmount !== undefined) {
		return account.metadata.bufferAmount;
	}

	// Calculate based on account type and historical data
	switch (account.type) {
		case 'checking': {
			// Get currency-specific default buffer
			const currencyDefaultBuffer = await currencyConfigService.getDefaultBuffer('checking', account.currency);
			
			// For checking accounts, calculate based on average monthly expenses
			let monthlyExpenses = 0;
			
			if (transactions && transactions.length > 0) {
				// Get expenses from last 3 months
				const now = new Date();
				const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
				
				const recentExpenses = transactions
					.filter(t => {
						if (t.type !== 'expense') return false;
						if (!t.clearedDate) return false;
						const date = new Date(t.clearedDate);
						return date >= threeMonthsAgo;
					})
					.map(t => Math.abs(t.amount || 0));
				
				if (recentExpenses.length > 0) {
					const totalExpenses = recentExpenses.reduce((sum, amt) => sum + amt, 0);
					// Average over the number of months we have data for
					const monthsOfData = Math.max(1, Math.ceil((now.getTime() - threeMonthsAgo.getTime()) / (1000 * 60 * 60 * 24 * 30)));
					monthlyExpenses = totalExpenses / monthsOfData;
				}
			}
			
			// Default buffer: 1 month of expenses, minimum currency-specific default, or minimum balance requirement
			const calculatedBuffer = monthlyExpenses > 0 
				? Math.max(monthlyExpenses, currencyDefaultBuffer)
				: Math.max(currencyDefaultBuffer, account.metadata?.minimumBalance || 0);
			
			return Math.max(calculatedBuffer, account.metadata?.minimumBalance || 0);
		}
		
		case 'savings': {
			// Get currency-specific default buffer
			const currencyDefaultBuffer = await currencyConfigService.getDefaultBuffer('savings', account.currency);
			// Savings accounts: 10% of balance or currency-specific default, whichever is higher
			return Math.max(currencyDefaultBuffer, account.currentBalance * 0.1);
		}
		
		case 'credit': {
			// Credit cards: typically don't need buffers (they have credit limits)
			return 0;
		}
		
		default:
			return 0;
	}
}

/**
 * Get buffer amount (user-defined or calculated default)
 * For async calculation with transaction data, use calculateRecommendedBuffer
 * 
 * Note: This is a synchronous fallback. For accurate currency-specific defaults,
 * use calculateRecommendedBuffer which is async and uses currency config service.
 */
export function getBufferAmount(account: Account): number {
	if (account.metadata?.bufferAmount !== undefined) {
		return account.metadata.bufferAmount;
	}

	// Default buffer calculation based on account type (synchronous fallback)
	// This uses hardcoded values as a last resort - prefer calculateRecommendedBuffer for accuracy
	switch (account.type) {
		case 'checking':
			// Default to minimum balance or 0 (will be calculated properly in async version)
			return Math.max(0, account.metadata?.minimumBalance || 0);
		case 'savings':
			// Savings accounts: 10% of balance or 0 (will be calculated properly in async version)
			return Math.max(0, account.currentBalance * 0.1);
		default:
			return 0;
	}
}

/**
 * Buffer status levels
 */
export type BufferStatus = 'optimal' | 'comfort' | 'warning' | 'critical';

/**
 * Get buffer status based on current balance vs buffer amount
 */
export function getBufferStatus(account: Account): BufferStatus {
	const buffer = getBufferAmount(account);
	const balance = account.currentBalance;
	
	if (buffer === 0) {
		return 'optimal'; // No buffer requirement
	}
	
	const ratio = balance / buffer;
	
	if (ratio >= 1.5) {
		return 'optimal'; // 150%+ of buffer
	} else if (ratio >= 1.0) {
		return 'comfort'; // 100-150% of buffer
	} else if (ratio >= 0.5) {
		return 'warning'; // 50-100% of buffer
	} else {
		return 'critical'; // Below 50% of buffer
	}
}

/**
 * Get buffer thresholds for visualization
 */
export function getBufferThresholds(account: Account): {
	critical: number;
	warning: number;
	comfort: number;
	optimal: number;
} {
	const buffer = getBufferAmount(account);
	
	return {
		critical: buffer * 0.5,  // Below 50% of buffer
		warning: buffer * 1.0,    // At buffer level
		comfort: buffer * 1.25,   // 25% above buffer
		optimal: buffer * 1.5     // 50% above buffer
	};
}

/**
 * Check if account balance is within buffer range
 */
export function isWithinBuffer(account: Account): boolean {
	const buffer = getBufferAmount(account);
	return account.currentBalance >= buffer;
}

/**
 * Get buffer deficit (how much below buffer the account is)
 * Returns 0 if account is above buffer
 */
export function getBufferDeficit(account: Account): number {
	const buffer = getBufferAmount(account);
	const deficit = buffer - account.currentBalance;
	return Math.max(0, deficit);
}

/**
 * Get buffer surplus (how much above buffer the account is)
 * Returns 0 if account is below buffer
 */
export function getBufferSurplus(account: Account): number {
	const buffer = getBufferAmount(account);
	const surplus = account.currentBalance - buffer;
	return Math.max(0, surplus);
}

/**
 * Get days until next statement close (for credit accounts)
 */
export function getDaysUntilStatementClose(account: Account): number | null {
	if (account.type !== 'credit' || !account.metadata?.statementCloseDate) {
		return null;
	}

	const today = new Date();
	const currentDay = today.getDate();
	const statementDay = parseInt(account.metadata.statementCloseDate) || 1;

	// Calculate next statement close date
	let nextClose = new Date(today.getFullYear(), today.getMonth(), statementDay);
	if (currentDay >= statementDay) {
		nextClose = new Date(today.getFullYear(), today.getMonth() + 1, statementDay);
	}

	const diffTime = nextClose.getTime() - today.getTime();
	return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Get days until payment due (for credit accounts)
 */
export function getDaysUntilPaymentDue(account: Account): number | null {
	if (account.type !== 'credit' || !account.metadata?.paymentDueDate) {
		return null;
	}

	const today = new Date();
	const currentDay = today.getDate();
	const dueDay = parseInt(account.metadata.paymentDueDate) || 1;

	// Calculate next payment due date
	let nextDue = new Date(today.getFullYear(), today.getMonth(), dueDay);
	if (currentDay >= dueDay) {
		nextDue = new Date(today.getFullYear(), today.getMonth() + 1, dueDay);
	}

	const diffTime = nextDue.getTime() - today.getTime();
	return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Format metadata field label for display
 */
export function formatMetadataFieldLabel(field: keyof AccountMetadata): string {
	const labels: Record<keyof AccountMetadata, string> = {
		minimumBalance: 'Minimum Balance',
		overdraftLimit: 'Overdraft Limit',
		overdraftFee: 'Overdraft Fee',
		interestRate: 'Interest Rate',
		transferLimit: 'Transfer Limit',
		transferDelayDays: 'Transfer Delay (Days)',
		creditLimit: 'Credit Limit',
		apr: 'APR (%)',
		statementCloseDate: 'Statement Close Date',
		paymentDueDate: 'Payment Due Date',
		minimumPayment: 'Minimum Payment',
		gracePeriodDays: 'Grace Period (Days)',
		creditBureauReportingDate: 'Credit Bureau Reporting Date',
		loanBalance: 'Loan Balance',
		loanDueDate: 'Loan Due Date',
		accountType: 'Account Type',
		linkedAccounts: 'Linked Accounts',
		lastReconciledDate: 'Last Reconciled Date',
		bufferAmount: 'Buffer Amount',
		isEmergencyFund: 'Emergency Fund Account'
	};

	return labels[field] || field;
}

/**
 * Format metadata field value for display
 */
export function formatMetadataFieldValue(
	field: keyof AccountMetadata,
	value: AccountMetadata[keyof AccountMetadata],
	currency: string = 'USD'
): string {
	if (value === undefined || value === null) {
		return 'Not set';
	}

	// Format currency values
	if (
		field === 'minimumBalance' ||
		field === 'overdraftLimit' ||
		field === 'overdraftFee' ||
		field === 'creditLimit' ||
		field === 'minimumPayment' ||
		field === 'loanBalance' ||
		field === 'transferLimit' ||
		field === 'bufferAmount'
	) {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: currency
		}).format(value as number);
	}

	// Format percentage values
	if (field === 'interestRate' || field === 'apr') {
		return `${(value as number).toFixed(2)}%`;
	}

	// Format date fields (day of month)
	if (field === 'statementCloseDate' || field === 'paymentDueDate' || field === 'loanDueDate' || field === 'creditBureauReportingDate') {
		const day = parseInt(value as string) || 1;
		return `Day ${day} of month`;
	}

	// Format array fields
	if (field === 'linkedAccounts') {
		const accounts = value as string[] | undefined;
		return accounts && accounts.length > 0 ? `${accounts.length} linked` : 'None';
	}

	// Format date strings
	if (field === 'lastReconciledDate') {
		return new Date(value as string).toLocaleDateString();
	}

	// Default: return as string
	return String(value);
}

