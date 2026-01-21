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
	private existingMMTransactions: Map<string, Transaction> = new Map(); // MM uid -> Transaction (for fast duplicate detection)

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

			// Step 4.5: Preload existing MM transactions for fast duplicate detection
			if (this.options.importTransactions) {
				await this.preloadExistingMMTransactions();
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
						const imported = await this.importTransferTransaction(pair);
						if (imported) {
							processedTransferUids.add(txUidTrans);
							this.statistics.transactionsImported++;
						} else {
							this.statistics.transactionsSkipped++;
						}
						continue;
					}
				}

				// Handle regular transactions (income, expense, adjustment)
				const imported = await this.importRegularTransaction(row);
				if (imported) {
					this.statistics.transactionsImported++;
				} else {
					this.statistics.transactionsSkipped++;
				}

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
				const mmUid = row.uid || row.ID || 'unknown';
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				this.addError({
					type: 'database',
					entityType: 'transaction',
					message: `Failed to import transaction (mmUid: ${mmUid}): ${errorMessage}`,
					originalData: row,
					lineNumber: i + 2 // +2 for header and 1-based indexing
				});
				this.statistics.transactionsSkipped++;
				console.error(`[MM Import Error] Transaction ${mmUid} at line ${i + 2}:`, error);
			}
		}
	}

	/**
	 * Import a regular transaction (income, expense, or adjustment)
	 * @returns true if transaction was imported, false if skipped
	 */
	private async importRegularTransaction(row: Record<string, string>): Promise<boolean> {
		const assetUid = row.assetUid;
		const ctgUid = row.ctgUid;
		const doType = parseInt(row.DO_TYPE || '0', 10);
		const mmUid = row.uid || row.ID; // MM transaction UID

		// Get account
		const accountId = assetUid ? this.accountMappings.get(assetUid) : undefined;
		if (!accountId && doType !== 7 && doType !== 8) {
			// Adjustments might not have accounts
			// Log more details for debugging
			this.addWarning(`Account not found for transaction (assetUid: ${assetUid}, mmUid: ${mmUid}), skipping`);
			return false;
		}

		// Get category (optional for adjustments)
		const categoryId = ctgUid && ctgUid !== '-4' && ctgUid !== 'null' 
			? this.categoryMappings.get(ctgUid) 
			: undefined;

		// Get currency - IMPORTANT: Preserve original currency from MM, never convert
		const currencyUid = row.currencyUid || 'RUB_RUB';
		const currencyId = this.currencyMappings.get(currencyUid);
		let currency = currencyId 
			? await db.currencies.get(currencyId)
			: await db.getCurrencyByCode(extractCurrencyCode(currencyUid, this.csvFiles.get('CURRENCY')));

		// If currency still not found, try to extract from currencyUid directly
		if (!currency) {
			const extractedCode = extractCurrencyCode(currencyUid, this.csvFiles.get('CURRENCY'));
			currency = await db.getCurrencyByCode(extractedCode);
			if (!currency) {
				this.addWarning(`Currency not found for transaction (uid: ${currencyUid}, extracted: ${extractedCode}), using USD`);
			}
		}

		// Get amounts from MM CSV:
		// - IN_ZMONEY: Original amount in transaction currency (what user entered)
		// - ZMONEY: Cached conversion to account currency (for balance calculations)
		const inZmoney = parseFloat(row.IN_ZMONEY || '0');
		const zmoney = parseFloat(row.ZMONEY || '0');
		
		// Original amount in transaction currency
		const amount = mapAmount(inZmoney, doType);
		
		// Get account to check currency
		const account = accountId ? await db.accounts.get(accountId) : null;
		const accountCurrency = account?.currency;
		const finalCurrency = currency?.code || extractCurrencyCode(currencyUid, this.csvFiles.get('CURRENCY')) || 'USD';
		
		// Cached conversion to account currency
		// If currencies match, accountAmount = amount (1:1)
		// Otherwise, use ZMONEY (cached conversion from MM)
		const accountAmount = accountCurrency && finalCurrency === accountCurrency
			? amount // Currencies match - use original amount
			: mapAmount(zmoney, doType); // Currencies differ - use cached conversion
		
		// Use ZDATE (transaction time) as primary source, UTIME as fallback, WDATE as last resort
		const clearedDate = mapDate(row.ZDATE, row.UTIME, row.WDATE);
		const description = row.ZCONTENT || '';

		// Check for duplicate by MM UID only (using preloaded map - O(1) lookup)
		// This ensures 1-to-1 import - we only skip if the exact same transaction was already imported
		// IMPORTANT: Only check against transactions that were imported in PREVIOUS import runs,
		// not transactions being imported in the current run. The preload happens before import starts.
		if (mmUid && mmUid !== 'null' && mmUid !== '') {
			const existingByUid = this.findTransactionByMMUid(mmUid);
			if (existingByUid) {
				// This transaction was already imported in a previous import run
				return false; // Skip exact duplicate (same MM UID)
			}
		}
		
		// Calculate exchange rate if currencies differ (for metadata)
		let exchangeRate: number | undefined;
		if (accountCurrency && finalCurrency !== accountCurrency && amount !== 0 && accountAmount !== 0) {
			exchangeRate = accountAmount / amount;
		}

		// Create import metadata with MM UID and original values for debugging
		const importMetadata = mmUid && mmUid !== 'null' && mmUid !== ''
			? JSON.stringify({ 
				mmUid, 
				source: 'money-manager',
				originalAmount: inZmoney,
				originalCurrencyUid: currencyUid,
				doType: doType,
				zmoney: row.ZMONEY,
				inZmoney: row.IN_ZMONEY
			})
			: undefined;

		// Currency conversion metadata
		const currencyConversion = accountCurrency && finalCurrency !== accountCurrency && exchangeRate
			? {
				exchangeRate: exchangeRate,
				conversionDate: clearedDate,
				sourceCurrency: finalCurrency,
				targetCurrency: accountCurrency
			}
			: undefined;
		
		// Debug logging for multi-currency transactions
		if (accountCurrency && finalCurrency !== accountCurrency) {
			console.log('[MM Import Multi-Currency]', {
				mmUid,
				originalAmount: inZmoney,
				originalCurrency: finalCurrency,
				accountAmount: accountAmount,
				accountCurrency: accountCurrency,
				accountId: accountId,
				doType,
				description: description.substring(0, 50)
			});
		}
		
		// Validate accountAmount is set correctly
		if (!accountAmount && accountId) {
			console.warn(`[MM Import Warning] Transaction ${mmUid} has no accountAmount but has accountId ${accountId}`);
		}
		
		const transaction: Transaction = {
			id: generateUUID(),
			type: mapTransactionType(doType),
			status: 'cleared', // All imported transactions are historical
			accountId: accountId,
			amount: amount, // Original amount in transaction currency (IN_ZMONEY)
			currency: finalCurrency, // Original currency from MM
			accountAmount: accountAmount, // Cached conversion to account currency (ZMONEY or AMOUNT_ACCOUNT)
			description: description,
			categoryId: categoryId,
			clearedDate: clearedDate,
			notes: row.ZCONTENT || '',
			importSource: 'money-manager',
			importMetadata: importMetadata,
			currencyConversion: currencyConversion,
			createdAt: parseTimestamp(row.UTIME),
			updatedAt: parseTimestamp(row.UTIME),
			deletedAt: null
		};

		// Skip balance recalculation during import - will be done at the end
		// accountAmount is already set from MM data, so transaction service will preserve it
		await transactionService.createTransaction(transaction, true);
		
		// Add to existing transactions map to prevent duplicates within the same import run
		// This prevents issues with out-of-order transactions in the CSV
		if (mmUid && mmUid !== 'null' && mmUid !== '') {
			this.existingMMTransactions.set(mmUid, transaction);
		}
		
		return true; // Successfully imported
	}

	/**
	 * Import a transfer transaction from a transfer pair
	 * @returns true if transaction was imported, false if skipped
	 */
	private async importTransferTransaction(pair: TransferPair): Promise<boolean> {
		if (!pair.transferOut || !pair.transferIn) {
			return false;
		}

		const outRow = pair.transferOut;
		const inRow = pair.transferIn;
		const mmUid = pair.txUidTrans; // Use transfer pair UID as identifier

		// Get accounts
		// For transfers:
		// - DO_TYPE 3 (transfer out): assetUid = source account, toAssetUid = destination account
		// - DO_TYPE 4 (transfer in): assetUid = destination account, toAssetUid = source account
		// We use the transfer out row (DO_TYPE 3) as the source of truth for the transfer direction
		const fromAccountId = outRow.assetUid ? this.accountMappings.get(outRow.assetUid) : undefined;
		
		// Use toAssetUid from the transfer out row (DO_TYPE 3) to get the destination account
		// This is more reliable than using inRow.assetUid, as toAssetUid explicitly indicates the destination
		const toAccountId = outRow.toAssetUid && outRow.toAssetUid !== 'null' && outRow.toAssetUid !== ''
			? this.accountMappings.get(outRow.toAssetUid)
			: (inRow.assetUid ? this.accountMappings.get(inRow.assetUid) : undefined);

		if (!fromAccountId || !toAccountId) {
			this.addWarning(`Transfer accounts not found (from: ${outRow.assetUid}, to: ${outRow.toAssetUid || inRow.assetUid}), skipping transfer`);
			return false;
		}

		// Get currency
		const currencyUid = outRow.currencyUid || 'RUB_RUB';
		const currencyId = this.currencyMappings.get(currencyUid);
		const currency = currencyId 
			? await db.currencies.get(currencyId)
			: await db.getCurrencyByCode(extractCurrencyCode(currencyUid, this.csvFiles.get('CURRENCY')));

		// Transfer amounts from MM CSV:
		// - outRow.IN_ZMONEY: Original transfer amount in transaction currency (for source account perspective)
		// - outRow.ZMONEY: Cached conversion to source account currency
		// - inRow.IN_ZMONEY: Original transfer amount in transaction currency (for destination account perspective)
		// - inRow.ZMONEY: Cached conversion to destination account currency
		const outInZmoney = parseFloat(outRow.IN_ZMONEY || '0');
		const outZmoney = parseFloat(outRow.ZMONEY || '0');
		const inInZmoney = parseFloat(inRow.IN_ZMONEY || '0');
		const inZmoney = parseFloat(inRow.ZMONEY || '0');
		
		// Original transfer amount in transaction currency
		const transferAmount = Math.abs(inInZmoney || outInZmoney || 0);
		
		// Cached conversions for source and destination accounts
		const sourceAccountAmount = Math.abs(outZmoney || 0); // Converted to source account currency
		const toAccountAmount = Math.abs(inZmoney || 0); // Converted to destination account currency
		
		// Use ZDATE (transaction time) as primary source, UTIME as fallback, WDATE as last resort
		// Prefer outRow values, fallback to inRow
		const transferZdate = outRow.ZDATE || inRow.ZDATE;
		const transferUtime = outRow.UTIME || inRow.UTIME;
		const transferWdate = outRow.WDATE || inRow.WDATE;
		const clearedDate = mapDate(transferZdate, transferUtime, transferWdate);
		const description = outRow.ZCONTENT || inRow.ZCONTENT || 'Transfer';
		
		// Get account currencies for conversion metadata
		const fromAccount = fromAccountId ? await db.accounts.get(fromAccountId) : null;
		const toAccount = toAccountId ? await db.accounts.get(toAccountId) : null;
		const fromAccountCurrency = fromAccount?.currency;
		const toAccountCurrency = toAccount?.currency;

		// Check for duplicate by MM transfer UID only (using preloaded map - O(1) lookup)
		// This ensures 1-to-1 import - we only skip if the exact same transfer was already imported
		if (mmUid && mmUid !== 'null' && mmUid !== '') {
			const existingByUid = this.findTransactionByMMUid(mmUid);
			if (existingByUid) {
				return false; // Skip exact duplicate (same MM UID)
			}
		}

		// Create import metadata with MM transfer UID
		const importMetadata = mmUid && mmUid !== 'null' && mmUid !== ''
			? JSON.stringify({ mmUid, source: 'money-manager', type: 'transfer' })
			: undefined;

		// Calculate exchange rates for conversion metadata
		const finalCurrency = currency?.code || 'USD';
		let sourceExchangeRate: number | undefined;
		let destExchangeRate: number | undefined;
		
		if (fromAccountCurrency && finalCurrency !== fromAccountCurrency && transferAmount !== 0 && sourceAccountAmount !== 0) {
			sourceExchangeRate = sourceAccountAmount / transferAmount;
		}
		if (toAccountCurrency && finalCurrency !== toAccountCurrency && transferAmount !== 0 && toAccountAmount !== 0) {
			destExchangeRate = toAccountAmount / transferAmount;
		}
		
		// Currency conversion metadata (for source account)
		const currencyConversion = fromAccountCurrency && finalCurrency !== fromAccountCurrency && sourceExchangeRate
			? {
				exchangeRate: sourceExchangeRate,
				conversionDate: clearedDate,
				sourceCurrency: finalCurrency,
				targetCurrency: fromAccountCurrency
			}
			: undefined;

		const transaction: Transaction = {
			id: generateUUID(),
			type: 'transfer',
			status: 'cleared',
			accountId: fromAccountId,
			currency: finalCurrency, // Transaction currency
			accountAmount: sourceAccountAmount, // Cached: converted to source account currency (outRow.ZMONEY)
			description: description,
			transferDetails: {
				toAccountId: toAccountId,
				transferAmount: transferAmount, // Original in transaction currency
				toAccountAmount: toAccountAmount, // Cached: converted to destination account currency (inRow.ZMONEY)
				feeAmount: 0, // TODO: Handle fees if txUidFee exists
				feeAccountId: undefined,
				feeAccountAmount: undefined,
				feeCategoryId: undefined
			},
			clearedDate: clearedDate,
			notes: outRow.ZCONTENT || inRow.ZCONTENT || '',
			importSource: 'money-manager',
			importMetadata: importMetadata,
			currencyConversion: currencyConversion,
			createdAt: parseTimestamp(outRow.UTIME || inRow.UTIME),
			updatedAt: parseTimestamp(outRow.UTIME || inRow.UTIME),
			deletedAt: null
		};

		// Skip balance recalculation during import - will be done at the end
		await transactionService.createTransaction(transaction, true);
		
		// Add to existing transactions map to prevent duplicates within the same import run
		if (mmUid && mmUid !== 'null' && mmUid !== '') {
			this.existingMMTransactions.set(mmUid, transaction);
		}
		
		return true; // Successfully imported
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
	 * Preload all existing MM transactions into a map for fast duplicate detection
	 * This is called once before importing to avoid querying the database for each transaction
	 */
	private async preloadExistingMMTransactions(): Promise<void> {
		try {
			// Try to use indexed query first (requires version 11+)
			const transactions = await db.transactions
				.where('importSource')
				.equals('money-manager')
				.filter(tx => !tx.deletedAt)
				.toArray();

			// Build map of MM UID -> Transaction
			for (const tx of transactions) {
				if (tx.importMetadata) {
					try {
						const metadata = JSON.parse(tx.importMetadata);
						if (metadata.mmUid && metadata.mmUid !== 'null' && metadata.mmUid !== '') {
							this.existingMMTransactions.set(metadata.mmUid, tx);
						}
					} catch (e) {
						// Invalid JSON, skip
					}
				}
			}
		} catch (error) {
			// Fallback: if index doesn't exist yet, search all transactions
			const allTransactions = await db.transactions
				.filter(tx => !tx.deletedAt && tx.importSource === 'money-manager')
				.toArray();

			for (const tx of allTransactions) {
				if (tx.importMetadata) {
					try {
						const metadata = JSON.parse(tx.importMetadata);
						if (metadata.mmUid && metadata.mmUid !== 'null' && metadata.mmUid !== '') {
							this.existingMMTransactions.set(metadata.mmUid, tx);
						}
					} catch (e) {
						// Invalid JSON, skip
					}
				}
			}
		}
	}

	/**
	 * Find existing transaction by Money Manager UID (uses preloaded map for O(1) lookup)
	 */
	private findTransactionByMMUid(mmUid: string): Transaction | null {
		if (!mmUid || mmUid === 'null' || mmUid === '') {
			return null;
		}

		return this.existingMMTransactions.get(mmUid) || null;
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

