/**
 * Money Manager Importer
 * 
 * Imports data from Money Manager (Realbyte) CSV exports into Budgic.
 * Handles accounts, categories, transactions, currencies, and budgets.
 */

import { db, generateUUID } from '$lib/core/db';
import type { Account, Category, Transaction, Currency } from '$lib/core/db';
import { accountService } from '../core/account-service';
import { transactionService } from '../core/transaction-service';
import { BaseImporter } from './base-importer';
import type { ImportOptions, ImportResult, CSVFile, IdMapping, TransferPair } from './types';
import {
	mapAccountType,
	mapCategoryType,
	mapTransactionType,
	mapDate,
	mapAmount,
	extractCurrencyCode,
	flattenCategoryName,
	parseTimestamp,
	isDeleted,
	getCategoryPriority
} from './money-manager-mapper';

/**
 * Money Manager Importer
 * 
 * Imports data from Money Manager CSV files into Budgic database.
 * 
 * @example
 * ```typescript
 * const importer = new MoneyManagerImporter({
 *   importAccounts: true,
 *   importCategories: true,
 *   importTransactions: true,
 *   onProgress: (progress) => console.log(progress)
 * });
 * 
 * const result = await importer.import(csvFiles);
 * console.log(`Imported ${result.statistics.accountsImported} accounts`);
 * ```
 */
export class MoneyManagerImporter extends BaseImporter {
	private csvFiles: Map<string, CSVFile> = new Map();
	private accountMappings: Map<string, string> = new Map(); // MM uid -> Budgic ID
	private categoryMappings: Map<string, string> = new Map(); // MM uid -> Budgic ID
	private currencyMappings: Map<string, string> = new Map(); // MM uid -> Budgic ID
	private categoryNameMap: Map<string, string> = new Map(); // MM uid -> category name (for hierarchy)
	private transferPairs: Map<string, TransferPair> = new Map(); // txUidTrans -> TransferPair

	/**
	 * Execute the import process
	 * 
	 * @param csvFiles - Map of CSV file names to parsed data
	 * @returns Import result with statistics and errors
	 */
	async import(csvFiles: Map<string, CSVFile>): Promise<ImportResult> {
		this.csvFiles = csvFiles;
		this.startTiming();

		// Validate options
		const validation = this.validateOptions();
		if (!validation.isValid) {
			validation.errors.forEach(error => this.addError({
				type: 'validation',
				message: error
			}));
			return this.createResult(false);
		}

		try {
			const totalSteps = this.calculateTotalSteps();
			let currentStep = 0;

			// Step 1: Import currencies (needed for accounts)
			if (this.options.importCurrencies) {
				currentStep++;
				this.reportProgress('Importing currencies', currentStep, totalSteps);
				await this.importCurrencies();
			}

			// Step 2: Import accounts
			if (this.options.importAccounts) {
				currentStep++;
				this.reportProgress('Importing accounts', currentStep, totalSteps);
				await this.importAccounts();
			}

			// Step 3: Import categories
			if (this.options.importCategories) {
				currentStep++;
				this.reportProgress('Importing categories', currentStep, totalSteps);
				await this.importCategories();
			}

			// Step 4: Process transfer pairs (before importing transactions)
			if (this.options.importTransactions) {
				currentStep++;
				this.reportProgress('Processing transfers', currentStep, totalSteps);
				await this.processTransferPairs();
			}

			// Step 5: Import transactions
			if (this.options.importTransactions) {
				currentStep++;
				this.reportProgress('Importing transactions', currentStep, totalSteps);
				await this.importTransactions();
			}

			// Step 6: Recalculate account balances
			if (this.options.importTransactions && this.options.importAccounts) {
				currentStep++;
				this.reportProgress('Recalculating balances', currentStep, totalSteps);
				await this.recalculateBalances();
			}

			return this.createResult(true);
		} catch (error) {
			this.addError({
				type: 'unknown',
				message: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
				stack: error instanceof Error ? error.stack : undefined
			});
			return this.createResult(false);
		}
	}

	/**
	 * Calculate total number of steps for progress tracking
	 */
	private calculateTotalSteps(): number {
		let steps = 0;
		if (this.options.importCurrencies) steps++;
		if (this.options.importAccounts) steps++;
		if (this.options.importCategories) steps++;
		if (this.options.importTransactions) steps += 2; // Process transfers + import
		if (this.options.importTransactions && this.options.importAccounts) steps++;
		return steps;
	}

	/**
	 * Import currencies from CURRENCY.csv
	 */
	private async importCurrencies(): Promise<void> {
		const currencyFile = this.csvFiles.get('CURRENCY');
		if (!currencyFile) {
			this.addWarning('CURRENCY.csv not found, skipping currency import');
			return;
		}

		for (const row of currencyFile.rows) {
			try {
				// Skip deleted currencies
				if (isDeleted(row.IS_DEL)) {
					this.statistics.currenciesSkipped++;
					continue;
				}

				const currencyUid = row.uid || row.ID;
				if (!currencyUid || currencyUid === 'null') {
					this.statistics.currenciesSkipped++;
					continue;
				}

				// Check if currency already exists (by ISO code)
				const isoCode = row.ISO || extractCurrencyCode(currencyUid, currencyFile);
				const existingCurrency = await db.getCurrencyByCode(isoCode);
				
				if (existingCurrency) {
					this.currencyMappings.set(currencyUid, existingCurrency.id);
					this.statistics.currenciesSkipped++;
					continue;
				}

				// Create new currency
				const currency: Currency = {
					id: generateUUID(),
					code: isoCode,
					name: row.NAME || isoCode,
					symbol: row.SYMBOL || isoCode,
					placement: row.SYMBOL_POSITION === 'S' ? 'after' : 'before',
					decimalPlaces: row.DECIMAL_POINT ? parseInt(row.DECIMAL_POINT, 10) : 2,
					isSystem: false,
					isActive: row.IS_SHOW !== '0',
					createdAt: parseTimestamp(row.MODIFY_DATE),
					updatedAt: parseTimestamp(row.MODIFY_DATE),
					deletedAt: null
				};

				await db.currencies.add(currency);
				this.currencyMappings.set(currencyUid, currency.id);
				this.statistics.currenciesImported++;
			} catch (error) {
				this.addError({
					type: 'database',
					entityType: 'currency',
					message: `Failed to import currency: ${error instanceof Error ? error.message : 'Unknown error'}`,
					originalData: row
				});
				this.statistics.currenciesSkipped++;
			}
		}
	}

	/**
	 * Import accounts from ASSETS.csv
	 */
	private async importAccounts(): Promise<void> {
		const assetsFile = this.csvFiles.get('ASSETS');
		if (!assetsFile) {
			this.addWarning('ASSETS.csv not found, skipping account import');
			return;
		}

		for (const row of assetsFile.rows) {
			try {
				const accountUid = row.uid || row.ID;
				if (!accountUid || accountUid === 'null') {
					this.statistics.accountsSkipped++;
					continue;
				}

				// Check for duplicate by name
				let accountName = row.NIC_NAME || '';
				if (!accountName) {
					this.statistics.accountsSkipped++;
					continue;
				}

				const existingAccounts = await db.getActiveAccounts();
				const duplicate = existingAccounts.find(acc => acc.name === accountName);
				
				if (duplicate) {
					if (this.options.conflictResolution === 'skip') {
						this.accountMappings.set(accountUid, duplicate.id);
						this.statistics.accountsSkipped++;
						continue;
					} else if (this.options.conflictResolution === 'rename') {
						// Rename with suffix
						accountName = `${accountName} (Imported)`;
					}
					// 'replace' and 'merge' would require more complex logic
				}

				// Get currency
				const currencyUid = row.currencyUid || 'RUB_RUB';
				const currencyId = this.currencyMappings.get(currencyUid);
				if (!currencyId) {
					const currencyCode = extractCurrencyCode(currencyUid, this.csvFiles.get('CURRENCY'));
					const currency = await db.getCurrencyByCode(currencyCode);
					if (currency) {
						this.currencyMappings.set(currencyUid, currency.id);
					} else {
						this.addWarning(`Currency ${currencyUid} not found for account ${accountName}, using USD`);
					}
				}

				const finalCurrencyId = this.currencyMappings.get(currencyUid);
				const currency = finalCurrencyId 
					? await db.currencies.get(finalCurrencyId)
					: await db.getCurrencyByCode('USD');

				if (!currency) {
					this.addError({
						type: 'mapping',
						entityType: 'account',
						message: `Currency not found for account ${accountName}`,
						originalData: row
					});
					this.statistics.accountsSkipped++;
					continue;
				}

				// Create account
				const account: Account = {
					id: generateUUID(),
					name: accountName,
					type: mapAccountType(row.ZDATA || '1'),
					currency: currency.code,
					initialBalance: 0, // Will be calculated from transactions
					currentBalance: 0, // Will be calculated from transactions
					isActive: true,
					metadata: undefined,
					createdAt: parseTimestamp(row.A_UTIME),
					updatedAt: parseTimestamp(row.A_UTIME),
					deletedAt: null
				};

				await db.accounts.add(account);
				this.accountMappings.set(accountUid, account.id);
				this.statistics.accountsImported++;
			} catch (error) {
				this.addError({
					type: 'database',
					entityType: 'account',
					message: `Failed to import account: ${error instanceof Error ? error.message : 'Unknown error'}`,
					originalData: row
				});
				this.statistics.accountsSkipped++;
			}
		}
	}

	/**
	 * Import categories from ZCATEGORY.csv
	 */
	private async importCategories(): Promise<void> {
		const categoryFile = this.csvFiles.get('ZCATEGORY');
		if (!categoryFile) {
			this.addWarning('ZCATEGORY.csv not found, skipping category import');
			return;
		}

		// First pass: build category name map and import top-level categories
		const categoryRows = categoryFile.rows;
		const parentCategories = new Map<string, Record<string, string>>(); // uid -> row

		for (const row of categoryRows) {
			try {
				if (isDeleted(row.C_IS_DEL)) {
					this.statistics.categoriesSkipped++;
					continue;
				}

				const categoryUid = row.uid || row.ID;
				if (!categoryUid || categoryUid === 'null') {
					this.statistics.categoriesSkipped++;
					continue;
				}

				const categoryName = row.NAME || '';
				if (!categoryName) {
					this.statistics.categoriesSkipped++;
					continue;
				}

				this.categoryNameMap.set(categoryUid, categoryName);

				// Store parent categories for second pass
				const status = parseInt(row.STATUS || '0', 10);
				if (status === 0) {
					// Top-level category
					parentCategories.set(categoryUid, row);
				}
			} catch (error) {
				this.statistics.categoriesSkipped++;
			}
		}

		// Import top-level categories first
		for (const [uid, row] of parentCategories.entries()) {
			await this.importCategory(row, undefined);
		}

		// Second pass: import subcategories
		for (const row of categoryRows) {
			try {
				if (isDeleted(row.C_IS_DEL)) {
					continue;
				}

				const status = parseInt(row.STATUS || '0', 10);
				if (status === 2 && row.pUid) {
					// Subcategory
					const parentName = this.categoryNameMap.get(row.pUid);
					await this.importCategory(row, parentName);
				}
			} catch (error) {
				this.statistics.categoriesSkipped++;
			}
		}
	}

	/**
	 * Import a single category
	 */
	private async importCategory(row: Record<string, string>, parentName?: string): Promise<void> {
		try {
			const categoryUid = row.uid || row.ID;
			if (!categoryUid) {
				this.statistics.categoriesSkipped++;
				return;
			}

			// Check for duplicate
			const categoryName = row.NAME || '';
			const finalName = parentName ? flattenCategoryName(categoryName, parentName) : categoryName;

			const existingCategories = await db.getActiveCategories();
			const duplicate = existingCategories.find(cat => cat.name === finalName && cat.type === mapCategoryType(row.TYPE));
			
			if (duplicate) {
				if (this.options.conflictResolution === 'skip') {
					this.categoryMappings.set(categoryUid, duplicate.id);
					this.statistics.categoriesSkipped++;
					return;
				}
			}

			// Create category
			const category: Category = {
				id: generateUUID(),
				name: finalName,
				type: mapCategoryType(row.TYPE || '1'),
				waterfallTier: 'lifestyle', // Default, user can reorganize
				priority: getCategoryPriority(row.ORDERSEQ),
				budgetAmount: undefined,
				color: undefined,
				description: parentName ? `Imported from MM: ${parentName} > ${categoryName}` : undefined,
				isActive: true,
				createdAt: parseTimestamp(row.C_UTIME),
				updatedAt: parseTimestamp(row.C_UTIME),
				deletedAt: null
			};

			await db.categories.add(category);
			this.categoryMappings.set(categoryUid, category.id);
			this.statistics.categoriesImported++;
		} catch (error) {
			this.addError({
				type: 'database',
				entityType: 'category',
				message: `Failed to import category: ${error instanceof Error ? error.message : 'Unknown error'}`,
				originalData: row
			});
			this.statistics.categoriesSkipped++;
		}
	}

	/**
	 * Process transfer pairs from INOUTCOME.csv
	 */
	private async processTransferPairs(): Promise<void> {
		const incomeFile = this.csvFiles.get('INOUTCOME');
		if (!incomeFile) {
			return;
		}

		// Group transactions by txUidTrans
		const transferGroups = new Map<string, TransferPair>();

		for (const row of incomeFile.rows) {
			const doType = parseInt(row.DO_TYPE || '0', 10);
			const txUidTrans = row.txUidTrans;

			// Only process transfer transactions (DO_TYPE 3 or 4)
			if ((doType === 3 || doType === 4) && txUidTrans && txUidTrans !== 'null' && txUidTrans !== '') {
				if (!transferGroups.has(txUidTrans)) {
					transferGroups.set(txUidTrans, {
						txUidTrans,
						transferOut: undefined,
						transferIn: undefined,
						feeTransaction: undefined
					});
				}

				const pair = transferGroups.get(txUidTrans)!;
				if (doType === 3) {
					pair.transferOut = row;
				} else if (doType === 4) {
					pair.transferIn = row;
				}
			}
		}

		this.transferPairs = transferGroups;
	}

	/**
	 * Import transactions from INOUTCOME.csv
	 */
	private async importTransactions(): Promise<void> {
		const incomeFile = this.csvFiles.get('INOUTCOME');
		if (!incomeFile) {
			this.addWarning('INOUTCOME.csv not found, skipping transaction import');
			return;
		}

		const processedTransferUids = new Set<string>(); // Track processed transfers

		for (let i = 0; i < incomeFile.rows.length; i++) {
			const row = incomeFile.rows[i];
			
			try {
				// Skip deleted transactions
				if (isDeleted(row.IS_DEL)) {
					this.statistics.transactionsSkipped++;
					continue;
				}

				const doType = parseInt(row.DO_TYPE || '0', 10);
				const txUidTrans = row.txUidTrans;

				// Handle transfers separately
				if ((doType === 3 || doType === 4) && txUidTrans && txUidTrans !== 'null' && txUidTrans !== '') {
					if (processedTransferUids.has(txUidTrans)) {
						// Already processed as part of transfer pair
						continue;
					}

					const pair = this.transferPairs.get(txUidTrans);
					if (pair && pair.transferOut && pair.transferIn) {
						await this.importTransferTransaction(pair);
						processedTransferUids.add(txUidTrans);
						this.statistics.transactionsImported++;
						continue;
					}
				}

				// Handle regular transactions (income, expense, adjustment)
				await this.importRegularTransaction(row);
				this.statistics.transactionsImported++;

				// Report progress periodically
				if (i % 100 === 0) {
					this.reportProgress(
						'Importing transactions',
						4,
						6,
						`Transaction ${i + 1}`,
						i,
						incomeFile.rows.length
					);
				}
			} catch (error) {
				this.addError({
					type: 'database',
					entityType: 'transaction',
					message: `Failed to import transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
					originalData: row,
					lineNumber: i + 2 // +2 for header and 1-based indexing
				});
				this.statistics.transactionsSkipped++;
			}
		}
	}

	/**
	 * Import a regular transaction (income, expense, or adjustment)
	 */
	private async importRegularTransaction(row: Record<string, string>): Promise<void> {
		const assetUid = row.assetUid;
		const ctgUid = row.ctgUid;
		const doType = parseInt(row.DO_TYPE || '0', 10);
		const mmUid = row.uid || row.ID; // MM transaction UID

		// Get account
		const accountId = assetUid ? this.accountMappings.get(assetUid) : undefined;
		if (!accountId && doType !== 7 && doType !== 8) {
			// Adjustments might not have accounts
			this.addWarning(`Account not found for transaction, skipping`);
			return;
		}

		// Get category (optional for adjustments)
		const categoryId = ctgUid && ctgUid !== '-4' && ctgUid !== 'null' 
			? this.categoryMappings.get(ctgUid) 
			: undefined;

		// Get currency
		const currencyUid = row.currencyUid || 'RUB_RUB';
		const currencyId = this.currencyMappings.get(currencyUid);
		const currency = currencyId 
			? await db.currencies.get(currencyId)
			: await db.getCurrencyByCode(extractCurrencyCode(currencyUid, this.csvFiles.get('CURRENCY')));

		if (!currency) {
			this.addWarning(`Currency not found for transaction, using USD`);
		}

		const amount = mapAmount(row.ZMONEY || '0', doType);
		const clearedDate = mapDate(row.WDATE || '', row.UTIME);
		const description = row.ZCONTENT || '';

		// Check for duplicate by MM UID only
		// This ensures 1-to-1 import - we only skip if the exact same transaction was already imported
		if (mmUid && mmUid !== 'null' && mmUid !== '') {
			const existingByUid = await this.findTransactionByMMUid(mmUid);
			if (existingByUid) {
				this.statistics.transactionsSkipped++;
				return; // Skip exact duplicate (same MM UID)
			}
		}

		// Create import metadata with MM UID
		const importMetadata = mmUid && mmUid !== 'null' && mmUid !== ''
			? JSON.stringify({ mmUid, source: 'money-manager' })
			: undefined;

		const transaction: Transaction = {
			id: generateUUID(),
			type: mapTransactionType(doType),
			status: 'cleared', // All imported transactions are historical
			accountId: accountId,
			amount: amount,
			currency: currency?.code || 'USD',
			description: description,
			categoryId: categoryId,
			clearedDate: clearedDate,
			notes: row.ZCONTENT || '',
			importSource: 'money-manager',
			importMetadata: importMetadata,
			createdAt: parseTimestamp(row.UTIME),
			updatedAt: parseTimestamp(row.UTIME),
			deletedAt: null
		};

		await transactionService.createTransaction(transaction);
	}

	/**
	 * Import a transfer transaction from a transfer pair
	 */
	private async importTransferTransaction(pair: TransferPair): Promise<void> {
		if (!pair.transferOut || !pair.transferIn) {
			return;
		}

		const outRow = pair.transferOut;
		const inRow = pair.transferIn;
		const mmUid = pair.txUidTrans; // Use transfer pair UID as identifier

		// Get accounts
		const fromAccountId = outRow.assetUid ? this.accountMappings.get(outRow.assetUid) : undefined;
		const toAccountId = inRow.assetUid ? this.accountMappings.get(inRow.assetUid) : undefined;

		if (!fromAccountId || !toAccountId) {
			this.addWarning(`Transfer accounts not found, skipping transfer`);
			return;
		}

		// Get currency
		const currencyUid = outRow.currencyUid || 'RUB_RUB';
		const currencyId = this.currencyMappings.get(currencyUid);
		const currency = currencyId 
			? await db.currencies.get(currencyId)
			: await db.getCurrencyByCode(extractCurrencyCode(currencyUid, this.csvFiles.get('CURRENCY')));

		// Transfer amount (from the "in" transaction, which is positive)
		const transferAmount = Math.abs(parseFloat(inRow.ZMONEY || '0'));
		// Use the earlier timestamp for better ordering
		const transferUtime = outRow.UTIME || inRow.UTIME;
		const clearedDate = mapDate(outRow.WDATE || inRow.WDATE || '', transferUtime);
		const description = outRow.ZCONTENT || inRow.ZCONTENT || 'Transfer';

		// Check for duplicate by MM transfer UID only
		// This ensures 1-to-1 import - we only skip if the exact same transfer was already imported
		if (mmUid && mmUid !== 'null' && mmUid !== '') {
			const existingByUid = await this.findTransactionByMMUid(mmUid);
			if (existingByUid) {
				this.statistics.transactionsSkipped++;
				return; // Skip exact duplicate (same MM UID)
			}
		}

		// Create import metadata with MM transfer UID
		const importMetadata = mmUid && mmUid !== 'null' && mmUid !== ''
			? JSON.stringify({ mmUid, source: 'money-manager', type: 'transfer' })
			: undefined;

		const transaction: Transaction = {
			id: generateUUID(),
			type: 'transfer',
			status: 'cleared',
			accountId: fromAccountId,
			currency: currency?.code || 'USD',
			description: description,
			transferDetails: {
				toAccountId: toAccountId,
				transferAmount: transferAmount,
				feeAmount: 0, // TODO: Handle fees if txUidFee exists
				feeAccountId: undefined,
				feeCategoryId: undefined
			},
			clearedDate: clearedDate,
			notes: outRow.ZCONTENT || inRow.ZCONTENT || '',
			importSource: 'money-manager',
			importMetadata: importMetadata,
			createdAt: parseTimestamp(outRow.UTIME || inRow.UTIME),
			updatedAt: parseTimestamp(outRow.UTIME || inRow.UTIME),
			deletedAt: null
		};

		await transactionService.createTransaction(transaction);
	}

	/**
	 * Recalculate account balances after import
	 */
	private async recalculateBalances(): Promise<void> {
		const accountIds = Array.from(this.accountMappings.values());
		
		for (const accountId of accountIds) {
			try {
				await accountService.recalculateAccountBalance(accountId);
			} catch (error) {
				this.addWarning(`Failed to recalculate balance for account ${accountId}`);
			}
		}
	}

	/**
	 * Find existing transaction by Money Manager UID
	 */
	private async findTransactionByMMUid(mmUid: string): Promise<Transaction | null> {
		if (!mmUid || mmUid === 'null' || mmUid === '') {
			return null;
		}

		try {
			// Try to use indexed query first (requires version 11+)
			const transactions = await db.transactions
				.where('importSource')
				.equals('money-manager')
				.filter(tx => !tx.deletedAt)
				.toArray();

			// Check importMetadata for MM UID
			for (const tx of transactions) {
				if (tx.importMetadata) {
					try {
						const metadata = JSON.parse(tx.importMetadata);
						if (metadata.mmUid === mmUid) {
							return tx;
						}
					} catch (e) {
						// Invalid JSON, skip
					}
				}
			}
		} catch (error) {
			// Fallback: if index doesn't exist yet, search all transactions
			// This is slower but works until database is upgraded
			const allTransactions = await db.transactions
				.filter(tx => !tx.deletedAt && tx.importSource === 'money-manager')
				.toArray();

			for (const tx of allTransactions) {
				if (tx.importMetadata) {
					try {
						const metadata = JSON.parse(tx.importMetadata);
						if (metadata.mmUid === mmUid) {
							return tx;
						}
					} catch (e) {
						// Invalid JSON, skip
					}
				}
			}
		}

		return null;
	}

	/**
	 * Find similar transaction (for detecting user-modified transactions)
	 * Checks for transactions with same account, amount, date, and description
	 */
	private async findSimilarTransaction(criteria: {
		accountId: string;
		amount: number;
		clearedDate: string;
		description: string;
	}): Promise<Transaction | null> {
		const { accountId, amount, clearedDate, description } = criteria;

		// Get all transactions for this account
		const transactions = await db.transactions
			.where('accountId')
			.equals(accountId)
			.filter(tx => !tx.deletedAt && tx.status === 'cleared')
			.toArray();

		// Normalize date for comparison (compare only date part, ignore time)
		const targetDate = clearedDate.substring(0, 10); // YYYY-MM-DD
		const targetAmount = Math.abs(amount);
		const targetDesc = (description || '').trim().toLowerCase();

		// Check for similar transactions
		for (const tx of transactions) {
			if (!tx.clearedDate) continue;

			const txDate = tx.clearedDate.substring(0, 10);
			const txAmount = tx.amount ? Math.abs(tx.amount) : 0;
			const txDesc = (tx.description || '').trim().toLowerCase();

			// Match if same date, same amount (within 0.01 tolerance), and similar description
			if (
				txDate === targetDate &&
				Math.abs(txAmount - targetAmount) < 0.01 &&
				(txDesc === targetDesc || 
				 (targetDesc.length > 0 && txDesc.length > 0 && 
				  (txDesc.includes(targetDesc) || targetDesc.includes(txDesc))))
			) {
				return tx;
			}
		}

		return null;
	}

	/**
	 * Find similar transfer transaction
	 */
	private async findSimilarTransferTransaction(criteria: {
		fromAccountId: string;
		toAccountId: string;
		transferAmount: number;
		clearedDate: string;
		description: string;
	}): Promise<Transaction | null> {
		const { fromAccountId, toAccountId, transferAmount, clearedDate, description } = criteria;

		// Get all transfer transactions from this account
		const transactions = await db.transactions
			.where('accountId')
			.equals(fromAccountId)
			.filter(tx => 
				!tx.deletedAt && 
				tx.status === 'cleared' && 
				tx.type === 'transfer' &&
				tx.transferDetails?.toAccountId === toAccountId
			)
			.toArray();

		// Normalize date for comparison
		const targetDate = clearedDate.substring(0, 10); // YYYY-MM-DD
		const targetAmount = Math.abs(transferAmount);
		const targetDesc = (description || '').trim().toLowerCase();

		// Check for similar transfers
		for (const tx of transactions) {
			if (!tx.clearedDate || !tx.transferDetails) continue;

			const txDate = tx.clearedDate.substring(0, 10);
			const txAmount = Math.abs(tx.transferDetails.transferAmount);
			const txDesc = (tx.description || '').trim().toLowerCase();

			// Match if same date, same amount (within 0.01 tolerance), and similar description
			if (
				txDate === targetDate &&
				Math.abs(txAmount - targetAmount) < 0.01 &&
				(txDesc === targetDesc || 
				 (targetDesc.length > 0 && txDesc.length > 0 && 
				  (txDesc.includes(targetDesc) || targetDesc.includes(txDesc))))
			) {
				return tx;
			}
		}

		return null;
	}
}

