/**
 * Money Manager Importer
 *
 * Imports data from Money Manager (Realbyte) CSV exports into Budgic.
 * Handles accounts, categories, transactions, currencies, and budgets.
 */

import { db, generateUUID } from '$lib/core/db';
import type {
	Account,
	Category,
	Currency,
	ImportQuality,
	Person,
	PersonExternalKey,
	ReimbursementEntry,
	Transaction
} from '$lib/core/db';
import { personService } from '../person-ledger/person-service';
import { resolveImportedPersonLedgerTarget } from '../person-ledger/import-routing';
import { accountService } from '../core/account-service';
import { transactionService } from '../core/transaction-service';
import { automationDetector } from '../intelligence/automation-detector';
import { detectEssentials, type ClassificationCandidate } from '../intelligence/essential-detector';
import { expandEssentialCandidatesWithSimilarity } from '../intelligence/essential-candidate-similarity';
import { buildUnclassifiedPatternHints } from '../intelligence/import-pattern-hints';
import { detectImportSplitCandidates } from './import-split-detect';
import {
	mergeDailyMicroInterestTransactions,
	recalculateBalancesForAccounts
} from '../intelligence/interest-daily-merge';
import { normalizeMmCsvFileKeys } from './csv-parser';
import { BaseImporter, detectPassiveBalanceImportHints } from './base-importer';
import {
	buildMmMergeUpdates,
	buildMmReplaceUpdates,
	diffMmMergeImportOwned,
	diffMmReplace,
	simulateMmMerge,
	simulateMmReplace
} from './mm-transaction-uid-merge';
import type {
	ImportOptions,
	ImportResult,
	CSVFile,
	IdMapping,
	TransferPair,
	MmUidConflictReportEntry,
	PersonLedgerDirectRouteEntry,
	PersonLedgerCloseQueueEntry
} from './types';
import { inferMmAccountType } from './mm-account-type-inference';
import {
	mapAccountType,
	mapCategoryType,
	mapTransactionType,
	mapDate,
	mapAmount,
	mapDateWithQuality,
	mapAmountWithQuality,
	extractCurrencyCode,
	extractCurrencyCodeWithQuality,
	flattenCategoryName,
	parseTimestamp,
	parseTimestampWithQuality,
	isDeleted,
	getCategoryPriority
} from './money-manager-mapper';
import {
	getOrCreateUncategorizedCategory,
	getOrCreateUncategorizedIncomeCategory
} from '$lib/utils/category-utils';

function mergeImportQuality(
	...parts: (Partial<ImportQuality> | undefined)[]
): ImportQuality | undefined {
	const out: ImportQuality = {};
	for (const p of parts) {
		if (!p) continue;
		if (p.amountInferred) out.amountInferred = true;
		if (p.dateInferred) out.dateInferred = true;
		if (p.currencyFallback) out.currencyFallback = true;
	}
	if (out.amountInferred === true || out.dateInferred === true || out.currencyFallback === true) {
		return out;
	}
	return undefined;
}

interface PersonLedgerDirectRouteTarget {
	name: string;
	person: Person;
	anchorAccountId: string;
	externalKeys: PersonExternalKey[];
}

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
	private importedTransactionIds: string[] = [];
	private importedAccountIds = new Set<string>();
	private essentialCandidates: ClassificationCandidate[] = [];
	private mmUidConflictReport: MmUidConflictReportEntry[] = [];
	private personAccountPreFlaggedNames: string[] = [];
	private personLedgerDirectRouteTargets: Map<string, PersonLedgerDirectRouteTarget> = new Map();
	private personLedgerDirectRoute: PersonLedgerDirectRouteEntry[] = [];
	private personLedgerCloseQueue: PersonLedgerCloseQueueEntry[] = [];

	/**
	 * Execute the import process
	 *
	 * @param csvFiles - Map of CSV file names to parsed data
	 * @returns Import result with statistics and errors
	 */
	async import(csvFiles: Map<string, CSVFile>): Promise<ImportResult> {
		this.csvFiles = normalizeMmCsvFileKeys(csvFiles);
		this.startTiming();
		this.importedTransactionIds = [];
		this.importedAccountIds = new Set<string>();
		this.essentialCandidates = [];
		this.mmUidConflictReport = [];
		this.personAccountPreFlaggedNames = [];
		this.personLedgerDirectRouteTargets = new Map();
		this.personLedgerDirectRoute = [];
		this.personLedgerCloseQueue = [];

		// Validate options
		const validation = this.validateOptions();
		if (!validation.isValid) {
			validation.errors.forEach((error) =>
				this.addError({
					type: 'validation',
					message: error
				})
			);
			return this.createResult(false);
		}

		try {
			for (const [mmUid, budgicCurrencyId] of Object.entries(
				this.options.mmCurrencyUidToBudgicCurrencyId ?? {}
			)) {
				if (mmUid && budgicCurrencyId) {
					this.currencyMappings.set(mmUid, budgicCurrencyId);
				}
			}

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

			await this.bootstrapImportedAccountReconciliation();

			const importBatch = await this.buildImportBatchMetadata();
			return this.createResult(true, importBatch);
		} catch (error) {
			this.addError({
				type: 'unknown',
				message: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
				stack: error instanceof Error ? error.stack : undefined
			});
			const importBatch = await this.buildImportBatchMetadata();
			return this.createResult(false, importBatch);
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

	private buildMmAccountExternalKeys(accountUid: string): PersonExternalKey[] {
		return [{ source: 'money-manager', entity: 'account', key: accountUid }];
	}

	private buildDirectRouteReimbursement(
		person: Person,
		amount: number,
		currency: string
	): ReimbursementEntry {
		const now = new Date().toISOString();
		return personService.linkReimbursementPerson(
			{
				id: generateUUID(),
				direction: 'lending',
				amount,
				currency,
				person: person.displayName,
				personId: person.id,
				status: 'expecting',
				createdAt: now,
				updatedAt: now
			},
			person
		);
	}

	private async findDirectRouteSettlement(
		target: PersonLedgerDirectRouteTarget,
		amount: number,
		currency: string
	): Promise<{ transactionId: string; reimbursementId: string } | null> {
		const anchorTransactions = await db.transactions
			.where('accountId')
			.equals(target.anchorAccountId)
			.filter(
				(tx) =>
					tx.deletedAt == null &&
					(tx.reimbursements?.length ?? 0) > 0 &&
					tx.reimbursements!.some(
						(reimbursement) =>
							(reimbursement.personId === target.person.id ||
								reimbursement.person === target.person.displayName) &&
							reimbursement.currency === currency &&
							(reimbursement.status === 'expecting' ||
								reimbursement.status === 'owed') &&
							Math.abs(reimbursement.amount - amount) < 0.01
					)
			)
			.toArray();

		anchorTransactions.sort((a, b) =>
			String(a.clearedDate || a.createdAt).localeCompare(String(b.clearedDate || b.createdAt))
		);

		for (const tx of anchorTransactions) {
			for (const reimbursement of tx.reimbursements ?? []) {
				if (
					(reimbursement.personId === target.person.id ||
						reimbursement.person === target.person.displayName) &&
					reimbursement.currency === currency &&
					(reimbursement.status === 'expecting' || reimbursement.status === 'owed') &&
					Math.abs(reimbursement.amount - amount) < 0.01
				) {
					return { transactionId: tx.id, reimbursementId: reimbursement.id };
				}
			}
		}

		return null;
	}

	private async applyDirectRouteSettlement(
		settlement: { transactionId: string; reimbursementId: string },
		person: Person,
		settledTransactionId: string
	): Promise<void> {
		const anchorTx = await db.transactions.get(settlement.transactionId);
		if (!anchorTx?.reimbursements?.length) return;
		const updatedAt = new Date().toISOString();
		const reimbursements = anchorTx.reimbursements.map((reimbursement) =>
			reimbursement.id !== settlement.reimbursementId
				? reimbursement
				: personService.linkReimbursementPerson(
						{
							...reimbursement,
							status: 'settled',
							settledTransactionId,
							updatedAt
						},
						person
					)
		);
		await transactionService.updateTransaction(settlement.transactionId, { reimbursements });
	}

	private async finalizeDirectRouteTransaction(params: {
		fresh: Transaction;
		mmUid?: string;
		existingByMmUid: Transaction | null;
		settlement?: { transactionId: string; reimbursementId: string } | null;
		person: Person;
	}): Promise<boolean> {
		const { fresh, mmUid, existingByMmUid, settlement, person } = params;
		const uidMode = this.options.mmTransactionUidConflict ?? 'skip';
		let savedId: string | null = null;

		if (existingByMmUid && uidMode === 'skip') {
			return false;
		}

		if (existingByMmUid && uidMode === 'merge') {
			const merged = await this.finishMmUidReimportMerge(
				existingByMmUid,
				fresh,
				mmUid as string
			);
			if (!merged) return false;
			savedId = existingByMmUid.id;
		} else if (existingByMmUid && uidMode === 'replace') {
			const replaced = await this.finishMmUidReimportReplace(
				existingByMmUid,
				fresh,
				mmUid as string
			);
			if (!replaced) return false;
			savedId = existingByMmUid.id;
		} else {
			const created = await transactionService.createTransaction(fresh, true);
			savedId = created.id;
			this.importedTransactionIds.push(created.id);
			if (created.accountId) this.importedAccountIds.add(created.accountId);
			if (mmUid && mmUid !== 'null' && mmUid !== '') {
				this.existingMMTransactions.set(mmUid, created);
			}
		}

		if (savedId && settlement) {
			await this.applyDirectRouteSettlement(settlement, person, savedId);
		}

		return savedId != null;
	}

	private async importDirectRoutedRegularTransaction(
		row: Record<string, string>,
		target: PersonLedgerDirectRouteTarget
	): Promise<boolean> {
		const ctgUid = row.ctgUid;
		const doType = parseInt(row.DO_TYPE || '0', 10);
		const mmUid = row.uid || row.ID;
		const existingByMmUid =
			mmUid && mmUid !== 'null' && mmUid !== '' ? this.findTransactionByMMUid(mmUid) : null;

		let categoryId =
			ctgUid && ctgUid !== '-4' && ctgUid !== 'null'
				? this.categoryMappings.get(ctgUid)
				: undefined;
		const txType = mapTransactionType(doType);
		if (txType === 'expense' && categoryId === undefined) {
			const uncategorized = await getOrCreateUncategorizedCategory();
			categoryId = uncategorized.id;
		} else if (txType === 'income' && categoryId === undefined) {
			const uncategorizedIncome = await getOrCreateUncategorizedIncomeCategory();
			categoryId = uncategorizedIncome.id;
		}

		const currencyUid = row.currencyUid || 'RUB_RUB';
		const currencyFile = this.csvFiles.get('CURRENCY');
		const extractedCurrency = extractCurrencyCodeWithQuality(currencyUid, currencyFile);
		const finalCurrency = extractedCurrency.code || 'USD';
		const inAmountQ = mapAmountWithQuality(parseFloat(row.IN_ZMONEY || '0'), doType);
		const amount = inAmountQ.amount;
		const clearedDateQ = mapDateWithQuality(row.ZDATE, row.UTIME, row.WDATE);
		const createdQ = parseTimestampWithQuality(row.UTIME);
		const updatedQ = parseTimestampWithQuality(row.UTIME);
		const importQuality = mergeImportQuality(
			inAmountQ.importQuality,
			clearedDateQ.importQuality,
			createdQ.importQuality,
			updatedQ.importQuality,
			extractedCurrency.importQuality
		);
		const absAmount = Math.abs(amount);
		const reimbursements =
			(txType === 'expense' || (txType === 'adjustment' && amount < 0)) && absAmount > 0
				? [this.buildDirectRouteReimbursement(target.person, absAmount, finalCurrency)]
				: undefined;
		const settlement =
			(txType === 'income' || (txType === 'adjustment' && amount > 0)) && absAmount > 0
				? await this.findDirectRouteSettlement(target, absAmount, finalCurrency)
				: null;

		const transaction: Transaction = {
			id: generateUUID(),
			type: txType,
			status: 'cleared',
			accountId: target.anchorAccountId,
			amount,
			currency: finalCurrency,
			description: row.ZCONTENT || '',
			categoryId,
			clearedDate: clearedDateQ.iso,
			notes: row.ZCONTENT || '',
			importSource: 'money-manager',
			importMetadata:
				mmUid && mmUid !== 'null' && mmUid !== ''
					? JSON.stringify({
							mmUid,
							source: 'money-manager',
							originalAmount: parseFloat(row.IN_ZMONEY || '0'),
							originalCurrencyUid: currencyUid,
							doType,
							personLedgerDirectRoute: true,
							personId: target.person.id,
							anchorAccountId: target.anchorAccountId
						})
					: undefined,
			importQuality,
			reimbursements,
			createdAt: createdQ.iso,
			updatedAt: updatedQ.iso,
			deletedAt: null
		};

		return await this.finalizeDirectRouteTransaction({
			fresh: transaction,
			mmUid: mmUid ?? undefined,
			existingByMmUid,
			settlement,
			person: target.person
		});
	}

	private async importDirectRoutedTransferTransaction(pair: TransferPair): Promise<boolean> {
		if (!pair.transferOut || !pair.transferIn) {
			return false;
		}

		const outRow = pair.transferOut;
		const inRow = pair.transferIn;
		const outTarget = outRow.assetUid
			? this.personLedgerDirectRouteTargets.get(outRow.assetUid)
			: undefined;
		const inTarget =
			(outRow.toAssetUid && this.personLedgerDirectRouteTargets.get(outRow.toAssetUid)) ||
			(inRow.assetUid ? this.personLedgerDirectRouteTargets.get(inRow.assetUid) : undefined);

		if (outTarget && inTarget) {
			this.addWarning(
				`Transfer ${pair.txUidTrans} touches two direct-routed person ledgers; skipping for now`
			);
			return false;
		}

		const target = outTarget ?? inTarget;
		if (!target) {
			return false;
		}

		const transferAmount = Math.abs(
			parseFloat(inRow.IN_ZMONEY || '0') || parseFloat(outRow.IN_ZMONEY || '0') || 0
		);
		const mmUid = pair.txUidTrans;
		const existingByMmUid =
			mmUid && mmUid !== 'null' && mmUid !== '' ? this.findTransactionByMMUid(mmUid) : null;
		const currencyUid = outRow.currencyUid || 'RUB_RUB';
		const extractedCurrency = extractCurrencyCodeWithQuality(
			currencyUid,
			this.csvFiles.get('CURRENCY')
		);
		const rawDescription = (outRow.ZCONTENT || inRow.ZCONTENT || '').trim();
		const description =
			rawDescription === '' || rawDescription.toLowerCase() === 'transfer'
				? undefined
				: rawDescription;
		const clearedDateQ = mapDateWithQuality(
			outRow.ZDATE || inRow.ZDATE,
			outRow.UTIME || inRow.UTIME,
			outRow.WDATE || inRow.WDATE
		);
		const createdQ = parseTimestampWithQuality(outRow.UTIME || inRow.UTIME || '');
		const updatedQ = parseTimestampWithQuality(outRow.UTIME || inRow.UTIME || '');
		const importQuality = mergeImportQuality(
			clearedDateQ.importQuality,
			createdQ.importQuality,
			updatedQ.importQuality,
			extractedCurrency.importQuality
		);
		const finalCurrency = extractedCurrency.code || 'USD';
		const settlement = outTarget
			? await this.findDirectRouteSettlement(target, transferAmount, finalCurrency)
			: null;
		const reimbursements =
			inTarget && transferAmount > 0
				? [this.buildDirectRouteReimbursement(target.person, transferAmount, finalCurrency)]
				: undefined;

		const transaction: Transaction = {
			id: generateUUID(),
			type: outTarget ? 'income' : 'expense',
			status: 'cleared',
			accountId: target.anchorAccountId,
			amount: outTarget ? transferAmount : -transferAmount,
			currency: finalCurrency,
			description,
			clearedDate: clearedDateQ.iso,
			notes: outRow.ZCONTENT || inRow.ZCONTENT || '',
			importSource: 'money-manager',
			importMetadata:
				mmUid && mmUid !== 'null' && mmUid !== ''
					? JSON.stringify({
							mmUid,
							source: 'money-manager',
							type: 'transfer',
							personLedgerDirectRoute: true,
							personId: target.person.id,
							anchorAccountId: target.anchorAccountId
						})
					: undefined,
			importQuality,
			reimbursements,
			createdAt: createdQ.iso,
			updatedAt: updatedQ.iso,
			deletedAt: null
		};

		return await this.finalizeDirectRouteTransaction({
			fresh: transaction,
			mmUid: mmUid ?? undefined,
			existingByMmUid,
			settlement,
			person: target.person
		});
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

				if (this.currencyMappings.has(currencyUid)) {
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

				const markedPersonLedger =
					this.options.externalAccountMarkedAsPersonLedger?.[accountUid] === true;
				const directRouteRequested =
					this.options.externalAccountMarkedAsPersonLedgerDirectRoute?.[accountUid] ===
					true;
				const externalKeys = this.buildMmAccountExternalKeys(accountUid);
				const personLedgerTarget =
					markedPersonLedger || directRouteRequested
						? await resolveImportedPersonLedgerTarget({
								accountName,
								externalKeys,
								ensurePerson: true
							})
						: await resolveImportedPersonLedgerTarget({
								accountName,
								externalKeys,
								ensurePerson: false
							});

				const existingAccounts = await db.getActiveAccounts();
				const duplicate = existingAccounts.find((acc) => acc.name === accountName);

				if (duplicate && personLedgerTarget == null) {
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
					const currencyCode = extractCurrencyCode(
						currencyUid,
						this.csvFiles.get('CURRENCY')
					);
					const currency = await db.getCurrencyByCode(currencyCode);
					if (currency) {
						this.currencyMappings.set(currencyUid, currency.id);
					} else {
						this.addWarning(
							`Currency ${currencyUid} not found for account ${accountName}, using USD`
						);
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

				const accountTypeOverride = this.options.mmAccountUidToBudgicType?.[accountUid];
				const resolvedType = accountTypeOverride ?? inferMmAccountType(row).type;

				const shouldAutoDirectRoute =
					personLedgerTarget != null &&
					personLedgerTarget.activeLedgerAccount == null &&
					(personLedgerTarget.archivedLedgerAccount != null ||
						personLedgerTarget.person.preferredAnchorAccountId != null);
				const shouldDirectRoute =
					personLedgerTarget != null &&
					personLedgerTarget.activeLedgerAccount == null &&
					(directRouteRequested || shouldAutoDirectRoute);
				if (markedPersonLedger) {
					this.personAccountPreFlaggedNames.push(accountName);
				}

				if (shouldDirectRoute && personLedgerTarget?.anchorAccountId) {
					this.personLedgerDirectRouteTargets.set(accountUid, {
						name: accountName,
						person: personLedgerTarget.person,
						anchorAccountId: personLedgerTarget.anchorAccountId,
						externalKeys
					});
					this.personLedgerDirectRoute.push({
						name: accountName,
						personId: personLedgerTarget.person.id,
						anchorAccountId: personLedgerTarget.anchorAccountId,
						externalKeys
					});
					if (
						personLedgerTarget.person.preferredAnchorAccountId !==
						personLedgerTarget.anchorAccountId
					) {
						await personService.updatePerson(personLedgerTarget.person.id, {
							preferredAnchorAccountId: personLedgerTarget.anchorAccountId
						});
					}
					this.statistics.accountsSkipped++;
					continue;
				}

				if (personLedgerTarget?.activeLedgerAccount) {
					this.accountMappings.set(accountUid, personLedgerTarget.activeLedgerAccount.id);
					this.importedAccountIds.add(personLedgerTarget.activeLedgerAccount.id);
					this.statistics.accountsSkipped++;
					continue;
				}

				// Phase E interim path: person ledger wallet until close wizard (Phase F supersedes for opt-in).
				const account: Account = {
					id: generateUUID(),
					name: accountName,
					type: resolvedType,
					currency: currency.code,
					initialBalance: 0, // Will be calculated from transactions
					currentBalance: 0, // Will be calculated from transactions
					isActive: true,
					metadata: undefined,
					ledgerRole: markedPersonLedger ? 'person' : undefined,
					personId: undefined,
					createdAt: parseTimestamp(row.A_UTIME),
					updatedAt: parseTimestamp(row.A_UTIME),
					deletedAt: null
				};

				await db.accounts.add(account);

				if (markedPersonLedger) {
					const person =
						personLedgerTarget?.person ??
						(await personService.resolvePersonForLedgerAccount(account, externalKeys));
					await db.accounts.update(account.id, {
						personId: person.id,
						updatedAt: new Date().toISOString()
					});
					account.personId = person.id;
					this.personLedgerCloseQueue.push({
						accountId: account.id,
						name: accountName,
						externalKeys
					});
				}

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
			const finalName = parentName
				? flattenCategoryName(categoryName, parentName)
				: categoryName;

			const existingCategories = await db.getActiveCategories();
			const duplicate = existingCategories.find(
				(cat) => cat.name === finalName && cat.type === mapCategoryType(row.TYPE)
			);

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
				waterfallTier: 'unclassified', // Default until user assigns a tier
				priority: getCategoryPriority(row.ORDERSEQ),
				budgetAmount: undefined,
				color: undefined,
				description: parentName
					? `Imported from MM: ${parentName} > ${categoryName}`
					: undefined,
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
			if (
				(doType === 3 || doType === 4) &&
				txUidTrans &&
				txUidTrans !== 'null' &&
				txUidTrans !== ''
			) {
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
				if (
					(doType === 3 || doType === 4) &&
					txUidTrans &&
					txUidTrans !== 'null' &&
					txUidTrans !== ''
				) {
					if (processedTransferUids.has(txUidTrans)) {
						// Already processed as part of transfer pair
						continue;
					}

					const pair = this.transferPairs.get(txUidTrans);
					if (pair && pair.transferOut && pair.transferIn) {
						const imported =
							(pair.transferOut.assetUid &&
								this.personLedgerDirectRouteTargets.has(
									pair.transferOut.assetUid
								)) ||
							(pair.transferOut.toAssetUid &&
								this.personLedgerDirectRouteTargets.has(
									pair.transferOut.toAssetUid
								)) ||
							(pair.transferIn.assetUid &&
								this.personLedgerDirectRouteTargets.has(pair.transferIn.assetUid))
								? await this.importDirectRoutedTransferTransaction(pair)
								: await this.importTransferTransaction(pair);
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
				const directRouteTarget = row.assetUid
					? this.personLedgerDirectRouteTargets.get(row.assetUid)
					: undefined;
				if (directRouteTarget) {
					const imported = await this.importDirectRoutedRegularTransaction(
						row,
						directRouteTarget
					);
					if (imported) {
						this.statistics.transactionsImported++;
					} else {
						this.statistics.transactionsSkipped++;
					}
					continue;
				}

				if (doType === 7 || doType === 8) {
					const imported = await this.importReconciliationAdjustment(row);
					if (imported) {
						this.statistics.transactionsImported++;
					} else {
						this.statistics.transactionsSkipped++;
					}
					continue;
				}

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
		const uidMode = this.options.mmTransactionUidConflict ?? 'skip';
		const existingByMmUid =
			mmUid && mmUid !== 'null' && mmUid !== '' ? this.findTransactionByMMUid(mmUid) : null;
		if (existingByMmUid && uidMode === 'skip') {
			return false;
		}

		// Get account
		const accountId = assetUid ? this.accountMappings.get(assetUid) : undefined;
		if (!accountId && doType !== 7 && doType !== 8) {
			// Adjustments might not have accounts
			// Log more details for debugging
			this.addWarning(
				`Account not found for transaction (assetUid: ${assetUid}, mmUid: ${mmUid}), skipping`
			);
			return false;
		}

		// Get category (optional for adjustments)
		let categoryId =
			ctgUid && ctgUid !== '-4' && ctgUid !== 'null'
				? this.categoryMappings.get(ctgUid)
				: undefined;

		if (mapTransactionType(doType) === 'expense' && categoryId === undefined) {
			const uncategorized = await getOrCreateUncategorizedCategory();
			categoryId = uncategorized.id;
		} else if (mapTransactionType(doType) === 'income' && categoryId === undefined) {
			const uncategorizedIncome = await getOrCreateUncategorizedIncomeCategory();
			categoryId = uncategorizedIncome.id;
		}

		// Get currency - IMPORTANT: Preserve original currency from MM, never convert
		const currencyUid = row.currencyUid || 'RUB_RUB';
		const currencyFile = this.csvFiles.get('CURRENCY');
		const extractedCurrency = extractCurrencyCodeWithQuality(currencyUid, currencyFile);
		const currencyId = this.currencyMappings.get(currencyUid);
		let currency = currencyId
			? await db.currencies.get(currencyId)
			: await db.getCurrencyByCode(extractedCurrency.code);

		// If currency still not found, try to extract from currencyUid directly
		if (!currency) {
			currency = await db.getCurrencyByCode(extractedCurrency.code);
			if (!currency) {
				this.addWarning(
					`Currency not found for transaction (uid: ${currencyUid}, extracted: ${extractedCurrency.code}), using USD`
				);
			}
		}

		// Get amounts from MM CSV:
		// - IN_ZMONEY: Original amount in transaction currency (what user entered)
		// - ZMONEY: Cached conversion to account currency (for balance calculations)
		const inZmoney = parseFloat(row.IN_ZMONEY || '0');
		const zmoney = parseFloat(row.ZMONEY || '0');

		const inAmountQ = mapAmountWithQuality(inZmoney, doType);
		const amount = inAmountQ.amount;

		// Get account to check currency
		const account = accountId ? await db.accounts.get(accountId) : null;
		const accountCurrency = account?.currency;
		const finalCurrency = currency?.code || extractedCurrency.code || 'USD';

		const zmAmountQ = mapAmountWithQuality(zmoney, doType);
		// Cached conversion to account currency
		// If currencies match, accountAmount = amount (1:1)
		// Otherwise, use ZMONEY (cached conversion from MM)
		const accountAmount =
			accountCurrency && finalCurrency === accountCurrency
				? amount // Currencies match - use original amount
				: zmAmountQ.amount; // Currencies differ - use cached conversion

		const clearedDateQ = mapDateWithQuality(row.ZDATE, row.UTIME, row.WDATE);
		const clearedDate = clearedDateQ.iso;
		const description = row.ZCONTENT || '';

		// Calculate exchange rate if currencies differ (for metadata)
		let exchangeRate: number | undefined;
		if (
			accountCurrency &&
			finalCurrency !== accountCurrency &&
			amount !== 0 &&
			accountAmount !== 0
		) {
			exchangeRate = accountAmount / amount;
		}

		// Create import metadata with MM UID and original values for debugging
		const importMetadata =
			mmUid && mmUid !== 'null' && mmUid !== ''
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
		const currencyConversion =
			accountCurrency && finalCurrency !== accountCurrency && exchangeRate
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
			console.warn(
				`[MM Import Warning] Transaction ${mmUid} has no accountAmount but has accountId ${accountId}`
			);
		}

		const createdQ = parseTimestampWithQuality(row.UTIME);
		const updatedQ = parseTimestampWithQuality(row.UTIME);
		const importQuality = mergeImportQuality(
			inAmountQ.importQuality,
			zmAmountQ.importQuality,
			clearedDateQ.importQuality,
			createdQ.importQuality,
			updatedQ.importQuality,
			extractedCurrency.importQuality
		);

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
			importQuality,
			createdAt: createdQ.iso,
			updatedAt: updatedQ.iso,
			deletedAt: null
		};

		if (existingByMmUid && uidMode === 'merge') {
			return await this.finishMmUidReimportMerge(
				existingByMmUid,
				transaction,
				mmUid as string
			);
		}
		if (existingByMmUid && uidMode === 'replace') {
			return await this.finishMmUidReimportReplace(
				existingByMmUid,
				transaction,
				mmUid as string
			);
		}

		// Skip balance recalculation during import - will be done at the end
		// accountAmount is already set from MM data, so transaction service will preserve it
		await transactionService.createTransaction(transaction, true);
		this.importedTransactionIds.push(transaction.id);
		if (transaction.accountId) this.importedAccountIds.add(transaction.accountId);

		// Add to existing transactions map to prevent duplicates within the same import run
		// This prevents issues with out-of-order transactions in the CSV
		if (mmUid && mmUid !== 'null' && mmUid !== '') {
			this.existingMMTransactions.set(mmUid, transaction);
		}

		return true; // Successfully imported
	}

	/**
	 * Import MM reconciliation-like adjustment entries (DO_TYPE 7/8) into reconciliationRecords.
	 * If an older import already stored this MM UID as a transaction, tag it as reconciliation-adjustment.
	 */
	private async importReconciliationAdjustment(row: Record<string, string>): Promise<boolean> {
		const mmUid = row.uid || row.ID;
		const assetUid = row.assetUid;
		const accountId = assetUid ? this.accountMappings.get(assetUid) : undefined;
		if (!accountId) {
			this.addWarning(`Reconciliation entry missing account (mmUid: ${mmUid}), skipping`);
			return false;
		}

		// If a previous import wrote this as a normal transaction, keep it but tag automation.
		if (mmUid && mmUid !== 'null' && mmUid !== '') {
			const existing = this.findTransactionByMMUid(mmUid);
			if (existing) {
				await db.transactions.update(existing.id, {
					automation: 'reconciliation-adjustment',
					updatedAt: new Date().toISOString()
				});
				return true;
			}
		}

		const doType = parseInt(row.DO_TYPE || '0', 10);
		const amount = mapAmount(parseFloat(row.IN_ZMONEY || '0'), doType);
		const reconciledDate = mapDate(row.ZDATE, row.UTIME, row.WDATE);
		const account = await db.accounts.get(accountId);
		const calculatedBalance = account?.currentBalance ?? 0;
		const statementBalance = calculatedBalance + amount;

		await db.reconciliationRecords.add({
			id: generateUUID(),
			accountId,
			reconciledDate,
			statementBalance,
			calculatedBalance,
			discrepancy: amount,
			reconciliationType: 'automatic',
			transactionCount: 0,
			reconciledTransactionIds: [],
			unreconciledTransactionIds: [],
			notes: `Imported reconciliation adjustment (MM DO_TYPE=${doType}${mmUid ? `, mmUid=${mmUid}` : ''})`,
			balanceAdjustmentApplied: amount,
			resolvedAt: new Date().toISOString(),
			createdAt: parseTimestamp(row.UTIME),
			updatedAt: parseTimestamp(row.UTIME),
			deletedAt: null
		});

		this.importedAccountIds.add(accountId);
		return true;
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
		const uidMode = this.options.mmTransactionUidConflict ?? 'skip';
		const existingByMmUid =
			mmUid && mmUid !== 'null' && mmUid !== '' ? this.findTransactionByMMUid(mmUid) : null;
		if (existingByMmUid && uidMode === 'skip') {
			return false;
		}

		// Get accounts
		// For transfers:
		// - DO_TYPE 3 (transfer out): assetUid = source account, toAssetUid = destination account
		// - DO_TYPE 4 (transfer in): assetUid = destination account, toAssetUid = source account
		// We use the transfer out row (DO_TYPE 3) as the source of truth for the transfer direction
		const fromAccountId = outRow.assetUid
			? this.accountMappings.get(outRow.assetUid)
			: undefined;

		// Use toAssetUid from the transfer out row (DO_TYPE 3) to get the destination account
		// This is more reliable than using inRow.assetUid, as toAssetUid explicitly indicates the destination
		const toAccountId =
			outRow.toAssetUid && outRow.toAssetUid !== 'null' && outRow.toAssetUid !== ''
				? this.accountMappings.get(outRow.toAssetUid)
				: inRow.assetUid
					? this.accountMappings.get(inRow.assetUid)
					: undefined;

		if (!fromAccountId || !toAccountId) {
			this.addWarning(
				`Transfer accounts not found (from: ${outRow.assetUid}, to: ${outRow.toAssetUid || inRow.assetUid}), skipping transfer`
			);
			return false;
		}

		// Get currency
		const currencyUid = outRow.currencyUid || 'RUB_RUB';
		const currencyFile = this.csvFiles.get('CURRENCY');
		const extractedCurrency = extractCurrencyCodeWithQuality(currencyUid, currencyFile);
		const currencyId = this.currencyMappings.get(currencyUid);
		let currency = currencyId
			? await db.currencies.get(currencyId)
			: await db.getCurrencyByCode(extractedCurrency.code);
		if (!currency) {
			currency = await db.getCurrencyByCode(extractedCurrency.code);
		}

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
		const clearedDateQ = mapDateWithQuality(transferZdate, transferUtime, transferWdate);
		const clearedDate = clearedDateQ.iso;
		const rawDescription = (outRow.ZCONTENT || inRow.ZCONTENT || '').trim();
		const description =
			rawDescription === '' || rawDescription.toLowerCase() === 'transfer'
				? undefined
				: rawDescription;

		// Get account currencies for conversion metadata
		const fromAccount = fromAccountId ? await db.accounts.get(fromAccountId) : null;
		const toAccount = toAccountId ? await db.accounts.get(toAccountId) : null;
		const fromAccountCurrency = fromAccount?.currency;
		const toAccountCurrency = toAccount?.currency;

		// Create import metadata with MM transfer UID
		const importMetadata =
			mmUid && mmUid !== 'null' && mmUid !== ''
				? JSON.stringify({ mmUid, source: 'money-manager', type: 'transfer' })
				: undefined;

		// Calculate exchange rates for conversion metadata
		const finalCurrency = currency?.code || extractedCurrency.code || 'USD';
		let sourceExchangeRate: number | undefined;
		let destExchangeRate: number | undefined;

		if (
			fromAccountCurrency &&
			finalCurrency !== fromAccountCurrency &&
			transferAmount !== 0 &&
			sourceAccountAmount !== 0
		) {
			sourceExchangeRate = sourceAccountAmount / transferAmount;
		}
		if (
			toAccountCurrency &&
			finalCurrency !== toAccountCurrency &&
			transferAmount !== 0 &&
			toAccountAmount !== 0
		) {
			destExchangeRate = toAccountAmount / transferAmount;
		}

		// Currency conversion metadata (for source account)
		const currencyConversion =
			fromAccountCurrency && finalCurrency !== fromAccountCurrency && sourceExchangeRate
				? {
						exchangeRate: sourceExchangeRate,
						conversionDate: clearedDate,
						sourceCurrency: finalCurrency,
						targetCurrency: fromAccountCurrency
					}
				: undefined;

		const transferUtimeRaw = outRow.UTIME || inRow.UTIME;
		const createdQ = parseTimestampWithQuality(transferUtimeRaw);
		const updatedQ = parseTimestampWithQuality(transferUtimeRaw);
		const transferImportQuality = mergeImportQuality(
			clearedDateQ.importQuality,
			createdQ.importQuality,
			updatedQ.importQuality,
			extractedCurrency.importQuality
		);

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
				feeCategoryId: undefined,
				feeDeductionMethod: 'from-transfer-amount'
			},
			clearedDate: clearedDate,
			notes: outRow.ZCONTENT || inRow.ZCONTENT || '',
			importSource: 'money-manager',
			importMetadata: importMetadata,
			currencyConversion: currencyConversion,
			importQuality: transferImportQuality,
			createdAt: createdQ.iso,
			updatedAt: updatedQ.iso,
			deletedAt: null
		};

		if (existingByMmUid && uidMode === 'merge') {
			return await this.finishMmUidReimportMerge(
				existingByMmUid,
				transaction,
				mmUid as string
			);
		}
		if (existingByMmUid && uidMode === 'replace') {
			return await this.finishMmUidReimportReplace(
				existingByMmUid,
				transaction,
				mmUid as string
			);
		}

		// Skip balance recalculation during import - will be done at the end
		await transactionService.createTransaction(transaction, true);
		this.importedTransactionIds.push(transaction.id);
		if (transaction.accountId) this.importedAccountIds.add(transaction.accountId);
		if (transaction.transferDetails?.toAccountId) {
			this.importedAccountIds.add(transaction.transferDetails.toAccountId);
		}

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

	private async bootstrapImportedAccountReconciliation(): Promise<void> {
		for (const accountId of this.importedAccountIds) {
			try {
				const account = await db.accounts.get(accountId);
				if (!account || account.deletedAt || account.metadata?.lastReconciledDate) {
					continue;
				}
				const { reconciliationService } = await import('../core/reconciliation-service');
				await reconciliationService.bootstrapReconciliationForAccount(accountId, 'import');
			} catch {
				this.addWarning(`Failed to bootstrap reconciliation for account ${accountId}`);
			}
		}
	}

	private async buildImportBatchMetadata(): Promise<ImportResult['importBatch'] | undefined> {
		if (!this.importedTransactionIds.length) {
			if (
				this.personLedgerCloseQueue.length > 0 ||
				this.personLedgerDirectRoute.length > 0 ||
				this.personAccountPreFlaggedNames.length > 0
			) {
				return {
					transactionIds: [],
					unclassifiedTransactionIds: [],
					accountIdsAffected: Array.from(this.importedAccountIds),
					...(this.personAccountPreFlaggedNames.length > 0
						? {
								personAccountPreFlaggedNames: [
									...new Set(this.personAccountPreFlaggedNames)
								]
							}
						: {}),
					...(this.personLedgerDirectRoute.length > 0
						? { personLedgerDirectRoute: [...this.personLedgerDirectRoute] }
						: {}),
					...(this.personLedgerCloseQueue.length > 0
						? { personLedgerCloseQueue: [...this.personLedgerCloseQueue] }
						: {})
				};
			}
			return undefined;
		}

		const importedTransactions = (
			await Promise.all(this.importedTransactionIds.map((id) => db.transactions.get(id)))
		).filter((tx): tx is Transaction => !!tx);
		if (!importedTransactions.length) {
			return undefined;
		}

		const detected = await automationDetector.detect(importedTransactions);
		for (const tx of detected) {
			const original = importedTransactions.find((t) => t.id === tx.id);
			if (!original) continue;
			if (original.automation !== tx.automation) {
				await db.transactions.update(tx.id, {
					automation: tx.automation,
					updatedAt: new Date().toISOString()
				});
			}
		}

		const { removedIds, touchedAccountIds } = await mergeDailyMicroInterestTransactions(
			this.importedTransactionIds
		);
		if (removedIds.length > 0) {
			this.importedTransactionIds = this.importedTransactionIds.filter(
				(id) => !removedIds.includes(id)
			);
			await recalculateBalancesForAccounts(touchedAccountIds);
			this.addWarning(
				`Merged ${removedIds.length} micro-interest row(s) into daily summaries`
			);
		}

		const finalTransactions = (
			await Promise.all(this.importedTransactionIds.map((id) => db.transactions.get(id)))
		).filter((tx): tx is Transaction => !!tx && !tx.deletedAt);
		if (!finalTransactions.length) {
			return undefined;
		}

		const splitCandidateMap = detectImportSplitCandidates(finalTransactions);
		const splitCandidateGroups: Array<{ groupId: string; transactionIds: string[] }> = [];
		for (const [groupId, memberIds] of splitCandidateMap) {
			splitCandidateGroups.push({ groupId, transactionIds: memberIds });
			for (const id of memberIds) {
				const existing = await db.transactions.get(id);
				if (!existing) continue;
				const importQuality: ImportQuality = {
					...existing.importQuality,
					splitCandidateGroupId: groupId
				};
				await db.transactions.update(id, {
					importQuality,
					updatedAt: new Date().toISOString()
				});
			}
		}
		const splitCandidateSummary =
			splitCandidateGroups.length > 0
				? {
						groupCount: splitCandidateGroups.length,
						transactionCount: splitCandidateGroups.reduce(
							(n, g) => n + g.transactionIds.length,
							0
						)
					}
				: undefined;

		const taggedFinalTransactions = (
			await Promise.all(this.importedTransactionIds.map((id) => db.transactions.get(id)))
		).filter((tx): tx is Transaction => !!tx && !tx.deletedAt);

		const unclassifiedTransactionIds = taggedFinalTransactions
			.filter((tx) => tx.type === 'expense' && !tx.categoryId)
			.map((tx) => tx.id);

		const expenseForWizard = taggedFinalTransactions.filter(
			(tx) => tx.type === 'expense' && tx.status === 'cleared' && !tx.deletedAt
		);
		const wizardExpenseTransactionIds = expenseForWizard.map((tx) => tx.id);
		const wizardExpenseAbsByTransactionId = Object.fromEntries(
			expenseForWizard.map((tx) => [tx.id, Math.abs(tx.amount || 0)])
		);

		const dateValues = taggedFinalTransactions
			.map((tx) => tx.clearedDate || tx.plannedDate || tx.createdAt)
			.filter((d): d is string => !!d)
			.sort();

		const incomeTotal = taggedFinalTransactions
			.filter((tx) => tx.type === 'income')
			.reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);
		this.essentialCandidates = detectEssentials(taggedFinalTransactions, incomeTotal || 1);
		const expandedEssentials = expandEssentialCandidatesWithSimilarity(
			this.essentialCandidates,
			taggedFinalTransactions
		).sort((a, b) => b.allowanceImpact - a.allowanceImpact);

		const unclassifiedForHints = taggedFinalTransactions.filter(
			(tx) =>
				tx.type === 'expense' && tx.status === 'cleared' && !tx.categoryId && !tx.deletedAt
		);
		const patternHints = buildUnclassifiedPatternHints(unclassifiedForHints);

		const accountRows = (
			await Promise.all(Array.from(this.importedAccountIds).map((id) => db.accounts.get(id)))
		).filter((a): a is Account => !!a);
		const passiveHints = detectPassiveBalanceImportHints(
			accountRows.map((a) => ({ id: a.id, name: a.name, type: a.type })),
			taggedFinalTransactions.map((t) => ({
				accountId: t.accountId,
				amount: t.amount,
				description: t.description
			}))
		);

		let clean = 0;
		let dateInferred = 0;
		let amountInferred = 0;
		let currencyFallback = 0;
		for (const tx of taggedFinalTransactions) {
			const q = tx.importQuality;
			if (q?.dateInferred) dateInferred++;
			if (q?.amountInferred) amountInferred++;
			if (q?.currencyFallback) currencyFallback++;
			if (!q?.dateInferred && !q?.amountInferred && !q?.currencyFallback) clean++;
		}
		const qualitySummary = {
			total: taggedFinalTransactions.length,
			clean,
			dateInferred,
			amountInferred,
			currencyFallback
		};

		return {
			transactionIds: taggedFinalTransactions.map((tx) => tx.id),
			unclassifiedTransactionIds,
			accountIdsAffected: Array.from(this.importedAccountIds),
			dateRange:
				dateValues.length > 0
					? { start: dateValues[0], end: dateValues[dateValues.length - 1] }
					: undefined,
			automationSummary: automationDetector.summarize(taggedFinalTransactions),
			essentialCandidates: expandedEssentials.map((candidate) => ({
				patternKey: candidate.patternKey,
				suggestedTier: candidate.suggestedTier ?? 'unclassified',
				matchedTransactionIds: candidate.matchedTransactionIds,
				allowanceImpact: candidate.allowanceImpact,
				cadence: candidate.cadence,
				confidence: candidate.confidence,
				reason: candidate.reason
			})),
			passiveBalanceTrackingHints: passiveHints,
			qualitySummary,
			patternHints,
			wizardExpenseTransactionIds,
			wizardExpenseAbsByTransactionId,
			...(splitCandidateSummary ? { splitCandidateSummary, splitCandidateGroups } : {}),
			...(this.mmUidConflictReport.length > 0
				? { mmUidConflicts: this.mmUidConflictReport }
				: {}),
			...(this.personAccountPreFlaggedNames.length > 0
				? {
						personAccountPreFlaggedNames: [
							...new Set(this.personAccountPreFlaggedNames)
						]
					}
				: {}),
			...(this.personLedgerDirectRoute.length > 0
				? { personLedgerDirectRoute: [...this.personLedgerDirectRoute] }
				: {}),
			...(this.personLedgerCloseQueue.length > 0
				? { personLedgerCloseQueue: [...this.personLedgerCloseQueue] }
				: {})
		};
	}

	private maybeRecordMmUidConflict(
		mmUid: string,
		transactionId: string,
		action: 'merged' | 'replaced',
		diffs: Array<{ field: string; before: unknown; after: unknown }>
	): void {
		if (!this.options.includeMmUidConflictReport) return;
		this.mmUidConflictReport.push({
			mmUid,
			transactionId,
			action,
			diffs: diffs.length > 0 ? diffs : undefined
		});
	}

	private async finishMmUidReimportMerge(
		existing: Transaction,
		fresh: Transaction,
		mmUid: string
	): Promise<boolean> {
		const preview = simulateMmMerge(existing, fresh);
		const diffs = diffMmMergeImportOwned(existing, preview);
		const updates = buildMmMergeUpdates(fresh);
		await transactionService.updateTransaction(existing.id, updates);
		const updated = await db.transactions.get(existing.id);
		if (!updated) return false;
		this.existingMMTransactions.set(mmUid, updated);
		this.importedTransactionIds.push(existing.id);
		if (updated.accountId) this.importedAccountIds.add(updated.accountId);
		if (updated.type === 'transfer' && updated.transferDetails?.toAccountId) {
			this.importedAccountIds.add(updated.transferDetails.toAccountId);
		}
		this.statistics.transactionsMerged++;
		this.maybeRecordMmUidConflict(mmUid, existing.id, 'merged', diffs);
		return true;
	}

	private async finishMmUidReimportReplace(
		existing: Transaction,
		fresh: Transaction,
		mmUid: string
	): Promise<boolean> {
		const preview = simulateMmReplace(existing, fresh);
		const diffs = diffMmReplace(existing, preview);
		const updates = buildMmReplaceUpdates(fresh);
		await transactionService.updateTransaction(existing.id, updates, {
			importReplaceTimestamps: { createdAt: fresh.createdAt, updatedAt: fresh.updatedAt }
		});
		const updated = await db.transactions.get(existing.id);
		if (!updated) return false;
		this.existingMMTransactions.set(mmUid, updated);
		this.importedTransactionIds.push(existing.id);
		if (updated.accountId) this.importedAccountIds.add(updated.accountId);
		if (updated.type === 'transfer' && updated.transferDetails?.toAccountId) {
			this.importedAccountIds.add(updated.transferDetails.toAccountId);
		}
		this.statistics.transactionsReplaced++;
		this.maybeRecordMmUidConflict(mmUid, existing.id, 'replaced', diffs);
		return true;
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
				.filter((tx) => !tx.deletedAt)
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
				.filter((tx) => !tx.deletedAt && tx.importSource === 'money-manager')
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
			.filter((tx) => !tx.deletedAt && tx.status === 'cleared')
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
					(targetDesc.length > 0 &&
						txDesc.length > 0 &&
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
			.filter(
				(tx) =>
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
					(targetDesc.length > 0 &&
						txDesc.length > 0 &&
						(txDesc.includes(targetDesc) || targetDesc.includes(txDesc))))
			) {
				return tx;
			}
		}

		return null;
	}
}
