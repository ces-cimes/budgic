import { db, generateUUID, calculateTransferImpact } from '$lib/core/db';
import type { Account, AccountMetadata, Transaction } from '$lib/core/db';

/**
 * Account Service
 *
 * Handles all account-related operations including CRUD operations,
 * balance calculations, and account management. This service provides
 * a clean interface for managing financial accounts in the application.
 *
 * @example
 * ```typescript
 * import { accountService } from '$lib/core/services';
 *
 * // Create a new account
 * const account = await accountService.createAccount({
 *   name: 'Emergency Fund',
 *   type: 'savings',
 *   currency: 'USD'
 * });
 *
 * // Get all accounts
 * const accounts = await accountService.getAccounts();
 * ```
 */
class AccountService {
	// Public interface
	public get ready() {
		return Promise.resolve();
	}

	public isLoading() {
		return false;
	}

	async load() {
		// No-op with Dexie as data is loaded on-demand
	}

	// ============================================================================
	// ACCOUNT MANAGEMENT
	// ============================================================================

	/**
	 * Create a new account with validation and initial setup
	 *
	 * @param data - Account creation data
	 * @param data.name - Account name (required, 1-100 characters)
	 * @param data.type - Account type (checking, savings, credit, cash, investment)
	 * @param data.currency - Currency code (3-letter ISO code)
	 * @param data.initialBalance - Initial balance (defaults to 0)
	 * @returns Promise resolving to the created account
	 * @throws {Error} If account creation fails or validation errors occur
	 *
	 * @example
	 * ```typescript
	 * const account = await accountService.createAccount({
	 *   name: 'Emergency Fund',
	 *   type: 'savings',
	 *   currency: 'USD',
	 *   initialBalance: 5000
	 * });
	 * ```
	 */
	async createAccount(data: {
		name: string;
		type: Account['type'];
		currency: string;
		initialBalance?: number;
		metadata?: AccountMetadata;
	}): Promise<Account> {
		const account: Account = {
			id: generateUUID(),
			name: data.name,
			type: data.type,
			currency: data.currency,
			initialBalance: data.initialBalance || 0,
			currentBalance: data.initialBalance || 0,
			isActive: true,
			metadata: data.metadata || undefined,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			deletedAt: null
		};

		await db.accounts.add(account);
		return account;
	}

	/**
	 * Get all active accounts ordered by creation date
	 *
	 * @returns Promise resolving to array of active accounts
	 * @throws {Error} If database query fails
	 *
	 * @example
	 * ```typescript
	 * const accounts = await accountService.getAccounts();
	 * console.log(`Found ${accounts.length} active accounts`);
	 * ```
	 */
	async getAccounts(): Promise<Account[]> {
		console.log('[AccountService] getAccounts called');
		try {
			const accounts = await db.getActiveAccounts();
			console.log('[AccountService] Retrieved', accounts.length, 'accounts');
			console.log(
				'[AccountService] Account check:',
				accounts
					.map((acc) => ({
						id: acc?.id,
						isUndefined: acc === undefined,
						isNull: acc === null,
						hasDeletedAt: acc ? 'deletedAt' in acc : 'N/A'
					}))
					.slice(0, 5)
			);
			return accounts;
		} catch (error) {
			console.error('[AccountService] Error in getAccounts:', error);
			throw error;
		}
	}

	/**
	 * Get a specific account by its unique identifier
	 *
	 * @param id - Account unique identifier
	 * @returns Promise resolving to the account or null if not found
	 * @throws {Error} If database query fails
	 *
	 * @example
	 * ```typescript
	 * const account = await accountService.getAccount('account-123');
	 * if (account) {
	 *   console.log(`Account: ${account.name}`);
	 * }
	 * ```
	 */
	async getAccount(id: string): Promise<Account | null> {
		return (await db.accounts.get(id)) || null;
	}

	/**
	 * Update account properties with validation
	 *
	 * @param id - Account unique identifier
	 * @param updates - Partial account data to update
	 * @param updates.name - New account name (optional)
	 * @param updates.type - New account type (optional)
	 * @param updates.currency - New currency code (optional)
	 * @param updates.isActive - Active status (optional)
	 * @returns Promise resolving to the updated account
	 * @throws {Error} If account not found or update fails
	 *
	 * @example
	 * ```typescript
	 * const updated = await accountService.updateAccount('account-123', {
	 *   name: 'Updated Account Name',
	 *   isActive: false
	 * });
	 * ```
	 */
	async updateAccount(
		id: string,
		updates: Partial<
			Pick<Account, 'name' | 'type' | 'currency' | 'isActive' | 'metadata' | 'currentBalance' | 'initialBalance'>
		>
	): Promise<Account> {
		const account = await db.accounts.get(id);
		if (!account) {
			throw new Error(`Account ${id} not found`);
		}

		const updatedAccount = {
			...account,
			...updates,
			updatedAt: new Date().toISOString()
		};

		await db.accounts.update(id, updatedAccount);
		return updatedAccount;
	}

	/**
	 * Update account metadata with validation
	 *
	 * @param id - Account unique identifier
	 * @param metadata - Partial metadata to update (will be merged with existing)
	 * @returns Promise resolving to the updated account
	 * @throws {Error} If account not found or update fails
	 *
	 * @example
	 * ```typescript
	 * await accountService.updateAccountMetadata('account-123', {
	 *   minimumBalance: 1000,
	 *   overdraftLimit: 500
	 * });
	 * ```
	 */
	async updateAccountMetadata(id: string, metadata: Partial<AccountMetadata>): Promise<Account> {
		const account = await db.accounts.get(id);
		if (!account) {
			throw new Error(`Account ${id} not found`);
		}

		const updatedMetadata = {
			...account.metadata,
			...metadata
		};

		return await this.updateAccount(id, { metadata: updatedMetadata });
	}

	/**
	 * Get account metadata
	 *
	 * @param id - Account unique identifier
	 * @returns Promise resolving to account metadata or null if not found
	 * @throws {Error} If database query fails
	 *
	 * @example
	 * ```typescript
	 * const metadata = await accountService.getAccountMetadata('account-123');
	 * if (metadata?.creditLimit) {
	 *   console.log(`Credit limit: $${metadata.creditLimit}`);
	 * }
	 * ```
	 */
	async getAccountMetadata(id: string): Promise<AccountMetadata | null> {
		const account = await this.getAccount(id);
		return account?.metadata || null;
	}

	/**
	 * Soft delete an account (marks as deleted but preserves data)
	 *
	 * @param id - Account unique identifier
	 * @returns Promise that resolves when deletion is complete
	 * @throws {Error} If account not found or deletion fails
	 *
	 * @example
	 * ```typescript
	 * await accountService.deleteAccount('account-123');
	 * ```
	 */
	async deleteAccount(id: string): Promise<void> {
		await db.softDeleteAccount(id);
	}

	/**
	 * Get the current balance of an account
	 *
	 * @param accountId - Account unique identifier
	 * @returns Promise resolving to the current balance
	 * @throws {Error} If account not found or balance calculation fails
	 *
	 * @example
	 * ```typescript
	 * const balance = await accountService.getAccountBalance('account-123');
	 * console.log(`Current balance: $${balance}`);
	 * ```
	 */
	async getAccountBalance(accountId: string): Promise<number> {
		return await db.getAccountBalance(accountId);
	}

	/**
	 * Recalculate account balance from all associated transactions
	 *
	 * This method recalculates the account balance by starting from the account's
	 * initial balance and applying the impact of all cleared transactions.
	 * Expenses reduce the balance, income increases it, and transfers are handled
	 * according to their transfer details. Useful for ensuring data consistency.
	 *
	 * @param accountId - Account unique identifier
	 * @returns Promise resolving to the recalculated balance
	 * @throws {Error} If account not found or calculation fails
	 *
	 * @example
	 * ```typescript
	 * const newBalance = await accountService.recalculateAccountBalance('account-123');
	 * console.log(`Recalculated balance: $${newBalance}`);
	 * ```
	 */
	async recalculateAccountBalance(accountId: string): Promise<number> {
		return await db.recalculateAccountBalance(accountId);
	}

	/**
	 * Get accounts by type
	 */
	async getAccountsByType(type: Account['type']): Promise<Account[]> {
		return await db.getAccountsByType(type);
	}

	/**
	 * Get total balance across all accounts (converted to main currency)
	 */
	async getTotalBalance(): Promise<number> {
		const accounts = await this.getAccounts();
		const { userService, exchangeRateService } = await import('$lib/core/services');

		// Get user's main currency
		const preferences = await userService.getUserPreferences();
		const mainCurrency = preferences?.currency || 'USD';

		// Convert all balances to main currency and sum
		let total = 0;
		for (const account of accounts) {
			if (account.currency === mainCurrency) {
				total += account.currentBalance;
			} else {
				const converted = await exchangeRateService.convertAmount(
					account.currentBalance,
					account.currency,
					mainCurrency
				);
				if (converted !== null) {
					total += converted;
				} else {
					// If conversion fails, log warning but include original amount
					console.warn(
						`Failed to convert ${account.currency} to ${mainCurrency} for account ${account.name}`
					);
					total += account.currentBalance;
				}
			}
		}

		return total;
	}

	/**
	 * Get balance by account type (converted to main currency)
	 */
	async getBalanceByType(): Promise<Record<Account['type'], number>> {
		const accounts = await this.getAccounts();
		const { userService, exchangeRateService } = await import('$lib/core/services');

		// Get user's main currency
		const preferences = await userService.getUserPreferences();
		const mainCurrency = preferences?.currency || 'USD';

		const balances: Record<Account['type'], number> = {
			checking: 0,
			savings: 0,
			credit: 0,
			cash: 0,
			investment: 0,
			crypto: 0
		};

		// Convert each account balance to main currency before summing
		for (const account of accounts) {
			let balance = account.currentBalance;

			if (account.currency !== mainCurrency) {
				const converted = await exchangeRateService.convertAmount(
					account.currentBalance,
					account.currency,
					mainCurrency
				);
				if (converted !== null) {
					balance = converted;
				} else {
					console.warn(
						`Failed to convert ${account.currency} to ${mainCurrency} for account ${account.name}`
					);
				}
			}

			balances[account.type] += balance;
		}

		return balances;
	}

	/**
	 * Get account balance impact for a transaction
	 */
	getTransactionImpact(transaction: Transaction, accountId: string): number {
		if (transaction.type === 'transfer') {
			return calculateTransferImpact(transaction, accountId);
		}

		// For non-transfer transactions, check if this is the account
		if (transaction.accountId === accountId) {
			switch (transaction.type) {
				case 'income':
					return transaction.amount || 0;
				case 'expense':
					return -(transaction.amount || 0);
				case 'adjustment':
					return transaction.amount || 0;
				default:
					return 0;
			}
		}

		return 0;
	}

	/**
	 * Validate account balance consistency
	 */
	async validateAccountBalance(
		accountId: string
	): Promise<{ isValid: boolean; error?: string; calculatedBalance: number }> {
		const calculatedBalance = await this.recalculateAccountBalance(accountId);
		const account = await this.getAccount(accountId);

		if (!account) {
			return { isValid: false, error: 'Account not found', calculatedBalance: 0 };
		}

		const isValid = Math.abs(account.currentBalance - calculatedBalance) < 0.01;
		return {
			isValid,
			error: isValid ? undefined : 'Balance mismatch detected',
			calculatedBalance
		};
	}
}

/**
 * Singleton instance of AccountService
 *
 * This is the main export for the account service. Use this instance
 * throughout the application for all account-related operations.
 *
 * @example
 * ```typescript
 * import { accountService } from '$lib/core/services';
 *
 * const accounts = await accountService.getAccounts();
 * ```
 */
export const accountService = new AccountService();
