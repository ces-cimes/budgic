/**
 * Account metadata utilities
 * Helper functions for working with account metadata fields
 */

import type { Account, AccountMetadata } from '$lib/core/db';

/**
 * Get metadata fields relevant to a specific account type
 */
export function getRelevantMetadataFields(accountType: Account['type']): Array<keyof AccountMetadata> {
	switch (accountType) {
		case 'checking':
			return ['minimumBalance', 'overdraftLimit', 'overdraftFee', 'bufferAmount'] as Array<keyof AccountMetadata>;
		case 'savings':
			return ['interestRate', 'transferLimit', 'transferDelayDays', 'bufferAmount'] as Array<keyof AccountMetadata>;
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
 * Get buffer amount (user-defined or calculated default)
 */
export function getBufferAmount(account: Account): number {
	if (account.metadata?.bufferAmount !== undefined) {
		return account.metadata.bufferAmount;
	}

	// Default buffer calculation based on account type
	switch (account.type) {
		case 'checking':
			// Default to 1 month of average expenses or $500, whichever is higher
			return Math.max(500, account.metadata?.minimumBalance || 0);
		case 'savings':
			// Savings accounts typically have larger buffers
			return Math.max(1000, account.currentBalance * 0.1);
		default:
			return 0;
	}
}

/**
 * Check if account balance is within buffer range
 */
export function isWithinBuffer(account: Account): boolean {
	const buffer = getBufferAmount(account);
	return account.currentBalance >= buffer;
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
		bufferAmount: 'Buffer Amount'
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

