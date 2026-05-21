import {
	db,
	generateUUID,
	calculateTransferImpact,
	accountCountsInNetWorth,
	accountSelectableInUi,
	isWalletLedgerAccount
} from '$lib/core/db';
import type { Account, AccountMetadata, AutomationTag, Transaction } from '$lib/core/db';

export { accountCountsInNetWorth, accountSelectableInUi, isWalletLedgerAccount };
import { loanAmortizationService } from './loan-amortization-service';

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
	private validateAccountTypeConfig(
		account: Pick<Account, 'type' | 'overdraftFacility' | 'repaymentConfig'>
	) {
		if (account.overdraftFacility && account.type !== 'checking') {
			throw new Error('overdraftFacility is only supported for checking accounts');
		}
		if (account.repaymentConfig && account.type !== 'credit') {
			throw new Error('repaymentConfig is only supported for credit accounts');
		}
	}
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
		this.validateAccountTypeConfig(account);

		await db.accounts.add(account);
		if (account.type === 'loan' && account.loanDetails) {
			await loanAmortizationService.generateSchedule(account);
		}
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
		return await db.getActiveAccounts();
	}

	/** Accounts usable in pickers (excludes archived person ledgers). */
	async getSelectableAccounts(): Promise<Account[]> {
		const accounts = await this.getAccounts();
		return accounts.filter(accountSelectableInUi);
	}

	/** Wallet accounts for reimbursement anchor defaults. */
	async getWalletAccounts(): Promise<Account[]> {
		const accounts = await this.getAccounts();
		return accounts.filter(isWalletLedgerAccount);
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
			Pick<
				Account,
				| 'name'
				| 'type'
				| 'currency'
				| 'isActive'
				| 'metadata'
				| 'currentBalance'
				| 'initialBalance'
				| 'rateProfile'
				| 'rateHistory'
				| 'lastConfirmedBalance'
				| 'lastConfirmedAt'
				| 'passiveRatePromptDismissed'
				| 'ledgerRole'
				| 'personId'
			>
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
		this.validateAccountTypeConfig(updatedAccount);

		await db.accounts.update(id, updatedAccount);
		if (updatedAccount.type === 'loan' && updatedAccount.loanDetails) {
			await loanAmortizationService.recalculateSchedule(updatedAccount);
		}
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
		const { passiveAccountService } = await import('./passive-account-service');
		const accounts = await this.getAccounts();
		const { userService, exchangeRateService } = await import('$lib/core/services');

		const preferences = await userService.getUserPreferences();
		const mainCurrency = preferences?.currency || 'USD';
		const includeAccrued = preferences?.includeAccruedInNetWorth ?? false;

		let total = 0;
		for (const account of accounts) {
			if (!accountCountsInNetWorth(account)) continue;
			const passiveType =
				account.type === 'savings' || account.type === 'credit' || account.type === 'loan';
			let balanceForTotal = account.currentBalance;
			if (passiveType && account.rateProfile) {
				if (includeAccrued) {
					balanceForTotal = passiveAccountService.projectBalance(account, new Date());
				} else {
					balanceForTotal =
						account.lastConfirmedBalance !== undefined && account.lastConfirmedBalance !== null
							? account.lastConfirmedBalance
							: account.currentBalance;
				}
			}

			if (account.currency === mainCurrency) {
				total += balanceForTotal;
			} else {
				const converted = await exchangeRateService.convertAmount(
					balanceForTotal,
					account.currency,
					mainCurrency
				);
				if (converted !== null) {
					total += converted;
				} else {
					console.warn(
						`Failed to convert ${account.currency} to ${mainCurrency} for account ${account.name}`
					);
					total += balanceForTotal;
				}
			}
		}

		return total;
	}

	/**
	 * Phase 10 — total in main currency plus accrued portion when projection is enabled.
	 */
	async getNetWorthDisplay(): Promise<{
		total: number;
		accruedDelta: number;
		mainCurrency: string;
	}> {
		const { passiveAccountService } = await import('./passive-account-service');
		const accounts = await this.getAccounts();
		const { userService, exchangeRateService } = await import('$lib/core/services');
		const preferences = await userService.getUserPreferences();
		const mainCurrency = preferences?.currency || 'USD';
		const includeAccrued = preferences?.includeAccruedInNetWorth ?? false;

		const convert = async (account: Account, amount: number) => {
			if (account.currency === mainCurrency) return amount;
			const c = await exchangeRateService.convertAmount(amount, account.currency, mainCurrency);
			return c ?? amount;
		};

		let conservative = 0;
		let total = 0;

		for (const account of accounts) {
			if (!accountCountsInNetWorth(account)) continue;
			const passiveType =
				account.type === 'savings' || account.type === 'credit' || account.type === 'loan';
			const projected =
				passiveType && account.rateProfile
					? passiveAccountService.projectBalance(account, new Date())
					: account.currentBalance;

			const conservativeAmt =
				passiveType && account.rateProfile
					? (account.lastConfirmedBalance ?? account.currentBalance)
					: account.currentBalance;
			conservative += await convert(account, conservativeAmt);

			const displayAmt =
				includeAccrued && passiveType && account.rateProfile
					? projected
					: passiveType && account.rateProfile
						? (account.lastConfirmedBalance ?? account.currentBalance)
						: account.currentBalance;
			total += await convert(account, displayAmt);
		}

		return {
			total,
			accruedDelta: includeAccrued ? total - conservative : 0,
			mainCurrency
		};
	}

	private async pickCategoryIdForAutomation(
		type: 'income' | 'expense',
		hints: string[]
	): Promise<string | undefined> {
		const categories = await db.getActiveCategories();
		const lower = hints.map((h) => h.toLowerCase());
		for (const c of categories) {
			if (c.type !== type) continue;
			const n = c.name.toLowerCase();
			if (lower.some((h) => n.includes(h))) return c.id;
		}
		return categories.find((c) => c.type === type)?.id;
	}

	/**
	 * Phase 10 — cleared tax-withholding automation for this account this calendar year.
	 */
	async getTaxWithheldYtdForAccount(accountId: string): Promise<number> {
		const year = new Date().getFullYear();
		const start = new Date(year, 0, 1).toISOString();
		const txs = await db.getTransactionsByAccount(accountId);
		let sum = 0;
		for (const tx of txs) {
			if (tx.deletedAt || tx.status !== 'cleared') continue;
			if (tx.automation !== 'tax-withholding') continue;
			const d = tx.clearedDate || tx.createdAt;
			if (!d || d < start) continue;
			sum += Math.abs(tx.amount ?? 0);
		}
		return sum;
	}

	/**
	 * Phase 10 — confirm "Update balance" after ledger drift and optional interest rows.
	 * @returns `reconciliation_required` when the gap is large and no classification was chosen.
	 */
	async confirmUpdateBalance(params: {
		accountId: string;
		enteredBalance: number;
		classification: AutomationTag | 'none' | 'unclassified';
		applyTaxWithholding: boolean;
	}): Promise<'ok' | 'reconciliation_required'> {
		const { reconciliationService } = await import('./reconciliation-service');
		const { transactionService } = await import('./transaction-service');

		const account = await this.getAccount(params.accountId);
		if (!account) {
			throw new Error(`Account ${params.accountId} not found`);
		}

		const tolerance = 0.01;
		const prefsRow = await db.userPreferences.toCollection().first();
		const autoResolveThreshold = prefsRow?.balanceUpdateAutoResolveThreshold ?? 5;

		const ledger = await reconciliationService.getLedgerBalance(params.accountId, {
			includePendingTransactions: false
		});
		const gap = params.enteredBalance - ledger;
		const netMovement = gap;

		const now = new Date().toISOString();

		if (Math.abs(gap) <= tolerance) {
			await this.updateAccount(params.accountId, {
				lastConfirmedBalance: params.enteredBalance,
				lastConfirmedAt: now
			});
			return 'ok';
		}

		if (Math.abs(gap) <= autoResolveThreshold) {
			await reconciliationService.performReconciliation(params.accountId, params.enteredBalance, {
				tolerance,
				autoResolveSmallDiscrepancies: true,
				autoResolveThreshold,
				includePendingTransactions: false
			});
			await this.updateAccount(params.accountId, {
				lastConfirmedBalance: params.enteredBalance,
				lastConfirmedAt: now
			});
			return 'ok';
		}

		if (params.classification === 'none') {
			return 'reconciliation_required';
		}

		if (params.classification === 'unclassified') {
			const isIncome = netMovement > 0;
			const cat = await this.pickCategoryIdForAutomation(isIncome ? 'income' : 'expense', []);
			await transactionService.createTransaction(
				{
					type: isIncome ? 'income' : 'expense',
					status: 'cleared',
					accountId: params.accountId,
					currency: account.currency,
					amount: Math.abs(netMovement),
					clearedDate: now,
					description: 'Balance update',
					categoryId: cat
				},
				false
			);
			await this.updateAccount(params.accountId, {
				lastConfirmedBalance: params.enteredBalance,
				lastConfirmedAt: now
			});
			return 'ok';
		}

		const taxRate = account.rateProfile?.taxRate;
		const useTax =
			params.applyTaxWithholding &&
			taxRate != null &&
			taxRate > 0 &&
			params.classification === 'interest-income' &&
			gap > 0;

		if (useTax) {
			const gross = netMovement / (1 - taxRate);
			const tax = gross * taxRate;
			const incomeCat = await this.pickCategoryIdForAutomation('income', [
				'interest',
				'investment',
				'income'
			]);
			const taxCat = await this.pickCategoryIdForAutomation('expense', ['tax', 'withhold']);
			await transactionService.createTransaction(
				{
					type: 'income',
					status: 'cleared',
					accountId: params.accountId,
					currency: account.currency,
					amount: gross,
					clearedDate: now,
					description: 'Interest income',
					automation: 'interest-income',
					categoryId: incomeCat
				},
				true
			);
			await transactionService.createTransaction(
				{
					type: 'expense',
					status: 'cleared',
					accountId: params.accountId,
					currency: account.currency,
					amount: tax,
					clearedDate: now,
					description: 'Tax withholding (НДФЛ)',
					automation: 'tax-withholding',
					categoryId: taxCat
				},
				false
			);
		} else if (params.classification === 'interest-income' && netMovement > 0) {
			const incomeCat = await this.pickCategoryIdForAutomation('income', [
				'interest',
				'investment',
				'income'
			]);
			await transactionService.createTransaction(
				{
					type: 'income',
					status: 'cleared',
					accountId: params.accountId,
					currency: account.currency,
					amount: netMovement,
					clearedDate: now,
					description: 'Interest income',
					automation: 'interest-income',
					categoryId: incomeCat
				},
				false
			);
		} else if (
			params.classification === 'interest-charge' ||
			(params.classification === 'transfer-fee' && netMovement < 0)
		) {
			const amt = Math.abs(netMovement);
			const expenseCat = await this.pickCategoryIdForAutomation('expense', [
				'bank',
				'fee',
				'finance',
				'interest'
			]);
			await transactionService.createTransaction(
				{
					type: 'expense',
					status: 'cleared',
					accountId: params.accountId,
					currency: account.currency,
					amount: amt,
					clearedDate: now,
					description: params.classification === 'interest-charge' ? 'Interest charge' : 'Bank fee',
					automation:
						params.classification === 'interest-charge' ? 'interest-charge' : 'transfer-fee',
					categoryId: expenseCat
				},
				false
			);
		} else {
			// Unclassified adjustment: no automation tag (per plan)
			const isIncome = netMovement > 0;
			const cat = await this.pickCategoryIdForAutomation(isIncome ? 'income' : 'expense', []);
			await transactionService.createTransaction(
				{
					type: isIncome ? 'income' : 'expense',
					status: 'cleared',
					accountId: params.accountId,
					currency: account.currency,
					amount: Math.abs(netMovement),
					clearedDate: now,
					description: 'Balance adjustment',
					categoryId: cat
				},
				false
			);
		}

		await this.updateAccount(params.accountId, {
			lastConfirmedBalance: params.enteredBalance,
			lastConfirmedAt: now
		});

		return 'ok';
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
			loan: 0,
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
