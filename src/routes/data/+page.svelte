<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { userService, transactionService, accountService } from '$lib/core/services';
	import { PageLayout } from '$lib/components/layouts';
	import Header from '$lib/components/Header.svelte';
	import * as Select from '$lib/components/ui/select/index.ts';
	import { Checkbox } from '$lib/components/ui/checkbox/index.ts';
	import { db } from '$lib/core/db';
	import {
		clearTransactionDataPreset,
		clearFullDatabaseReset,
		TRANSACTION_DATA_PRESET_REMOVES_BULLETS,
		TRANSACTION_DATA_PRESET_KEEPS_BULLETS,
		FULL_DATABASE_RESET_REMOVES_BULLETS
	} from '$lib/core/data-reset-presets';
	import {
		MoneyManagerImporter,
		detectMmCurrencyReviewNeeded,
		buildMmAccountReviewRows,
		normalizeMmCsvFileKeys,
		detectImportSource,
		releaseImportSourceDetection,
		extractMoneyManagerCsvFiles,
		getLargeImportWarnings,
		closeSqlite,
		type ImportResult,
		type ImportProgress,
		type DetectedSchema,
		type MmTransactionUidConflict,
		type CSVFile,
		type MmCurrencyReviewRow,
		type MmAccountReviewRow,
		type PersonLedgerCloseQueueEntry,
		type ImportSourceDetection,
		exportFullBackup,
		importFullBackup,
		pushBackupToServer,
		getLastServerBackupAt,
		resetAutoRestorePromptState
	} from '$lib/core/services/import-export';
	import ImportWizard from '$lib/components/import/ImportWizard.svelte';
	import ImportCurrencyReviewDialog from '$lib/components/import/ImportCurrencyReviewDialog.svelte';
	import ImportAccountsReviewDialog from '$lib/components/import/ImportAccountsReviewDialog.svelte';
	import { isPersonLedgerNameCandidate } from '$lib/utils/person-ledger-heuristics';
	import {
		createBudgicCurrencyFromMmReview,
		isMmCurrencyCreateSelection
	} from '$lib/core/services/import-export/mm-currency-create';
	import { pickFiles } from '$lib/utils/file-picker-utils';
	import { formatPercentage } from '$lib/utils/currency-utils';
	import {
		getOrCreateUncategorizedCategory,
		getOrCreateGiftsCategory
	} from '$lib/utils/category-utils';
	import {
		computeBatchExpenseSpendBreakdown,
		countUnclassifiedExpenseTransactions,
		shouldOpenImportWizard,
		classifiedExpenseShare
	} from '$lib/utils/import-wizard-batch-metrics';
	import type { Transaction, Account, DataCorrection, Currency } from '$lib/core/db';
	import { devLog } from '$lib/utils/dev-log';
	import { page } from '$app/stores';
	import { dataQualityService, dataCorrectionService } from '$lib/core/services';
	import type { ImportSplitReviewGroup } from '$lib/core/services/core/data-quality-service';
	import {
		linkTransactionsAsSplitGroup,
		dismissSplitCandidateGroup
	} from '$lib/core/services/import-export';
	import DataReconciliationTab from '$lib/components/data/DataReconciliationTab.svelte';
	import ImportSplitReviewCard from '$lib/components/import/ImportSplitReviewCard.svelte';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { navigationStore } from '$lib/stores/navigation-store.svelte';

	const DATA_TABS = new Set(['import', 'export', 'review', 'reconcile', 'corrections']);
	const dataTab = $derived.by(() => {
		const raw = $page.url.searchParams.get('tab') ?? 'import';
		return DATA_TABS.has(raw) ? raw : 'import';
	});

	let reviewQueue = $state<Transaction[]>([]);
	let splitReviewGroups = $state<ImportSplitReviewGroup[]>([]);
	let accountNameById = $state<Record<string, string>>({});
	let correctionsLog = $state<DataCorrection[]>([]);
	let reviewLoading = $state(false);
	let splitReviewBusyGroupId = $state<string | null>(null);
	let reviewRefreshSeq = 0;

	async function refreshReviewQueue() {
		const seq = ++reviewRefreshSeq;
		reviewLoading = true;
		try {
			const snapshot = await dataQualityService.getImportReviewSnapshot();
			if (seq !== reviewRefreshSeq) return;

			reviewQueue = snapshot.qualityQueue;
			splitReviewGroups = snapshot.splitGroups;

			if (snapshot.splitGroups.length > 0) {
				const accounts = await accountService.getAccounts();
				if (seq !== reviewRefreshSeq) return;
				accountNameById = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
			} else {
				accountNameById = {};
			}
		} finally {
			if (seq === reviewRefreshSeq) reviewLoading = false;
		}
	}

	function removeSplitGroup(candidateGroupId: string) {
		splitReviewGroups = splitReviewGroups.filter((g) => g.groupId !== candidateGroupId);
		if (splitReviewGroups.length === 0) {
			accountNameById = {};
		}
	}

	function removeQualityItem(transactionId: string) {
		reviewQueue = reviewQueue.filter((t) => t.id !== transactionId);
	}

	async function confirmSplitGroup(candidateGroupId: string, selectedIds: string[]) {
		splitReviewBusyGroupId = candidateGroupId;
		try {
			await linkTransactionsAsSplitGroup(selectedIds);
			removeSplitGroup(candidateGroupId);
			void navigationStore.updateBadges();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not create split';
			await refreshReviewQueue();
		} finally {
			splitReviewBusyGroupId = null;
		}
	}

	async function dismissSplitGroup(groupId: string) {
		splitReviewBusyGroupId = groupId;
		try {
			await dismissSplitCandidateGroup(groupId);
			removeSplitGroup(groupId);
			void navigationStore.updateBadges();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not dismiss split suggestion';
			await refreshReviewQueue();
		} finally {
			splitReviewBusyGroupId = null;
		}
	}

	async function refreshCorrections() {
		correctionsLog = await dataCorrectionService.listRecent(400);
	}

	$effect(() => {
		const t = dataTab;
		if (t === 'review') void refreshReviewQueue();
		if (t === 'corrections') void refreshCorrections();
	});

	async function confirmReviewItem(id: string) {
		try {
			await transactionService.updateTransaction(
				id,
				{ importQuality: undefined },
				{ dataCorrectionSource: 'user' }
			);
			removeQualityItem(id);
			void navigationStore.updateBadges();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not confirm review item';
			await refreshReviewQueue();
		}
	}

	async function dismissReviewItem(id: string, q: NonNullable<Transaction['importQuality']>) {
		try {
			await transactionService.updateTransaction(
				id,
				{ importQuality: { ...q, reviewDismissed: true } },
				{ dataCorrectionSource: 'user' }
			);
			removeQualityItem(id);
			void navigationStore.updateBadges();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Could not dismiss review item';
			await refreshReviewQueue();
		}
	}

	// State
	let isLoading = $state(true);
	let isExporting = $state(false);
	let isImporting = $state(false);
	let isImportingMM = $state(false);
	let error = $state<string | null>(null);
	let success = $state<string | null>(null);
	let dangerBusy = $state<null | 'transactions' | 'full'>(null);

	// Data settings - simplified for current schema
	let exportFormat = $state<'json' | 'csv' | 'pdf'>('json');

	// Unified import state
	let importSelectedFiles = $state<File[]>([]);
	let importDetection = $state<ImportSourceDetection | null>(null);
	let mmCsvFilesReady = $state<Map<string, CSVFile> | null>(null);
	let importWarnings = $state<string[]>([]);
	let mmSchema = $state<DetectedSchema | null>(null);
	const isMmImportSource = $derived(
		importDetection?.kind === 'money-manager-csv' ||
			importDetection?.kind === 'money-manager-sqlite' ||
			(mmCsvFilesReady !== null && mmSchema?.isValid === true)
	);
	const importFormatLabel = $derived.by(() => {
		if (!importDetection) return null;
		switch (importDetection.kind) {
			case 'budgic-json':
				return 'Budgic backup';
			case 'money-manager-csv':
				return 'Money Manager (CSV export)';
			case 'money-manager-sqlite':
				return 'Money Manager (database file)';
			case 'unknown-sqlite':
				return 'Unrecognized SQLite database';
			default:
				return null;
		}
	});
	const mmImportOptions = $state({
		importAccounts: true,
		importCategories: true,
		importTransactions: true,
		importCurrencies: true,
		importBudgets: false,
		conflictResolution: 'skip' as 'skip' | 'rename' | 'merge' | 'replace',
		mmTransactionUidConflict: 'skip' as MmTransactionUidConflict,
		includeMmUidConflictReport: false,
		transactionDateStart: '',
		transactionDateEnd: ''
	});
	let mmProgress = $state<ImportProgress | null>(null);
	let mmResult = $state<ImportResult | null>(null);
	let showMMImport = $state(false);
	let importWizardOpen = $state(false);
	let mmCurrencyReviewOpen = $state(false);
	let pendingMmCsvFiles = $state<Map<string, CSVFile> | null>(null);
	let mmCurrencyReviewRows = $state<MmCurrencyReviewRow[]>([]);
	let mmCurrencyReviewCurrencies = $state<Currency[]>([]);
	let mmCurrencyUidMap = $state<Record<string, string>>({});
	let mmAccountReviewOpen = $state(false);
	let mmAccountReviewRows = $state<MmAccountReviewRow[]>([]);
	let mmAccountTypeMap = $state<Record<string, Account['type']>>({});
	let mmAccountPersonMap = $state<Record<string, boolean>>({});
	let wizardPersonAccountPreFlagged = $state<string[]>([]);
	let wizardBeforeClassifiedExpenseShare = $state(0);
	let wizardExpenseTxIds = $state<string[]>([]);
	let wizardExpenseAbsByTxId = $state<Record<string, number>>({});
	let wizardCategoryTierByTxId = $state<Record<string, string | undefined>>({});
	let wizardPersonAccountCandidates = $state<string[]>([]);
	let wizardPersonAccountPanels = $state<
		Array<{ accountId: string; name: string; txs: Transaction[] }>
	>([]);
	let wizardPersonLedgerCloseQueue = $state<PersonLedgerCloseQueueEntry[]>([]);
	let importWizardStartStep = $state(1);

	// Export format options
	const exportFormatOptions = [
		{ value: 'json', label: 'JSON', description: 'Complete data backup (recommended)' },
		{ value: 'csv', label: 'CSV', description: 'Spreadsheet format' },
		{ value: 'pdf', label: 'PDF', description: 'Printable report' }
	];

	onDestroy(() => {
		releaseImportSourceDetection(importDetection);
	});

	// Load user preferences on mount
	onMount(async () => {
		try {
			const preferences = await userService.getUserPreferences();
			if (preferences) {
				exportFormat = 'json'; // Default format
			}
		} catch (err) {
			error = 'Failed to load data settings';
			console.error('Error loading preferences:', err);
		} finally {
			isLoading = false;
		}
	});

	// Export data
	async function exportData() {
		if (isExporting) return;

		isExporting = true;
		error = null;
		success = null;

		try {
			const data = await exportFullBackup();
			const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `budgic-export-${new Date().toISOString().split('T')[0]}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);

			try {
				await pushBackupToServer();
			} catch (backupErr) {
				devLog('Server backup after export failed:', backupErr);
			}

			success = 'Saved';
		} catch (err) {
			error = 'Failed to export data';
			console.error('Error exporting data:', err);
		} finally {
			isExporting = false;
		}
	}

	let lastServerBackupAt = $state<string | null>(null);
	$effect(() => {
		lastServerBackupAt = getLastServerBackupAt();
	});

	function resetImportSelection() {
		releaseImportSourceDetection(importDetection);
		importDetection = null;
		importSelectedFiles = [];
		mmCsvFilesReady = null;
		mmSchema = null;
		importWarnings = [];
	}

	async function applyImportDetection(detection: ImportSourceDetection) {
		releaseImportSourceDetection(importDetection);
		importDetection = detection;
		mmCsvFilesReady = null;
		mmSchema = null;
		importWarnings = [];
		error = null;
		success = null;

		switch (detection.kind) {
			case 'budgic-json':
				break;
			case 'money-manager-csv':
				mmCsvFilesReady = normalizeMmCsvFileKeys(detection.csvFiles);
				mmSchema = detection.schema;
				break;
			case 'money-manager-sqlite': {
				importWarnings = getLargeImportWarnings(detection.file, detection.db);
				mmCsvFilesReady = extractMoneyManagerCsvFiles(detection.db);
				mmSchema = detection.schema;
				closeSqlite(detection.db);
				break;
			}
			case 'unknown-sqlite':
				error = detection.message;
				closeSqlite(detection.db);
				break;
			case 'unsupported':
				error = detection.message;
				break;
		}
	}

	async function pickAndDetectImportFiles() {
		try {
			const result = await pickFiles({
				multiple: true,
				types: [
					'application/json',
					'text/csv',
					'application/x-sqlite3',
					'application/vnd.sqlite3',
					'application/octet-stream'
				],
				extensions: ['.json', '.csv', '.sqlite', '.db', '.sqlite3']
			});

			if (result.cancelled || result.files.length === 0) {
				return;
			}

			importSelectedFiles = result.files;
			devLog(
				'Import files picked:',
				result.files.map((f) => ({ name: f.name, size: f.size }))
			);

			const detection = await detectImportSource(result.files);
			await applyImportDetection(detection);
		} catch (err) {
			error = `Failed to analyze files: ${err instanceof Error ? err.message : 'Unknown error'}`;
			console.error('Import file detection error:', err);
		}
	}

	async function importBudgicJson(file: File) {
		isImporting = true;
		error = null;
		success = null;

		try {
			const text = await file.text();
			const data = JSON.parse(text);

			if (!data || typeof data !== 'object' || !('version' in data) || !('exportDate' in data)) {
				throw new Error('Invalid export file format');
			}

			await importFullBackup(data);

			success = 'Saved';
			resetImportSelection();
			window.location.reload();
		} catch (err) {
			error = 'Failed to import data: ' + (err instanceof Error ? err.message : 'Unknown error');
			console.error('Error importing Budgic JSON:', err);
		} finally {
			isImporting = false;
		}
	}

	async function runUnifiedImport() {
		if (importDetection?.kind === 'budgic-json') {
			await importBudgicJson(importDetection.file);
			return;
		}
		await handleMMImport();
	}

	// Handle Money Manager import (CSV read → optional currency review → importer)
	async function finishMmImportAfterRead(
		csvFiles: Map<string, CSVFile>,
		currencyOverride?: Record<string, string>,
		accountTypeOverride?: Record<string, Account['type']>,
		accountPersonOverride?: Record<string, boolean>
	): Promise<void> {
		const trimmedOverride =
			currencyOverride && Object.keys(currencyOverride).length > 0
				? Object.fromEntries(
						Object.entries(currencyOverride).filter(([uid, id]) => uid && id && id.trim() !== '')
					)
				: undefined;

		const trimmedTypeOverride =
			accountTypeOverride && Object.keys(accountTypeOverride).length > 0
				? accountTypeOverride
				: undefined;

		const trimmedPersonOverride =
			accountPersonOverride && Object.keys(accountPersonOverride).length > 0
				? Object.fromEntries(Object.entries(accountPersonOverride).filter(([, flagged]) => flagged))
				: undefined;

		const importer = new MoneyManagerImporter({
			...mmImportOptions,
			...(trimmedOverride && Object.keys(trimmedOverride).length > 0
				? { mmCurrencyUidToBudgicCurrencyId: trimmedOverride }
				: {}),
			...(trimmedTypeOverride ? { mmAccountUidToBudgicType: trimmedTypeOverride } : {}),
			...(trimmedPersonOverride && Object.keys(trimmedPersonOverride).length > 0
				? { externalAccountMarkedAsPersonLedger: trimmedPersonOverride }
				: {}),
			onProgress: (progress) => {
				mmProgress = progress;
			}
		});

		const result = await importer.import(csvFiles);
		mmResult = result;

		if (result.success) {
			const s = result.statistics;
			const tm = s.transactionsMerged ?? 0;
			const tr = s.transactionsReplaced ?? 0;
			const txBits = [
				s.transactionsImported > 0 ? `${s.transactionsImported} new` : null,
				tm > 0 ? `${tm} merged (same MM UID)` : null,
				tr > 0 ? `${tr} replaced` : null
			].filter(Boolean);
			const txLabel = txBits.length > 0 ? txBits.join(', ') : '0 transactions';
			success = `Successfully imported ${s.accountsImported} accounts, ${s.categoriesImported} categories (${txLabel})`;

			resetImportSelection();

			await prepareImportWizardState(result);
			void navigationStore.updateBadges();
		} else {
			error = `Import completed with ${result.errors.length} error(s). Check details below.`;
		}
	}

	async function handleMMImport() {
		if (!mmCsvFilesReady || mmCsvFilesReady.size === 0) {
			error = 'Please select a valid Money Manager export to import';
			return;
		}

		if (mmSchema && !mmSchema.isValid) {
			error = 'Cannot import: missing required tables';
			return;
		}

		isImportingMM = true;
		error = null;
		success = null;
		mmResult = null;
		mmProgress = null;

		try {
			const csvFiles = mmCsvFilesReady;
			const currencies = await db.getActiveCurrencies();
			const detection = detectMmCurrencyReviewNeeded(csvFiles, {
				activeCurrencyCodes: currencies.map((c) => c.code)
			});

			if (detection.needsReview) {
				const selection: Record<string, string> = {};
				for (const r of detection.rows) {
					const match = currencies.find((c) => c.code === r.suggestedCode);
					if (match) selection[r.mmUid] = match.id;
				}
				mmCurrencyReviewRows = detection.rows;
				mmCurrencyReviewCurrencies = currencies;
				mmCurrencyUidMap = selection;
				pendingMmCsvFiles = csvFiles;
				mmCurrencyReviewOpen = true;
				return;
			}

			const deferred = await openAccountsReviewIfNeeded(csvFiles);
			if (deferred) return;
		} catch (err) {
			error = `Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
			console.error('Money Manager import error:', err);
		} finally {
			isImportingMM = false;
			mmProgress = null;
		}
	}

	function seedAccountReviewMaps(rows: MmAccountReviewRow[]) {
		const types: Record<string, Account['type']> = {};
		const persons: Record<string, boolean> = {};
		for (const r of rows) {
			types[r.mmUid] = r.suggestedType;
			persons[r.mmUid] = r.personLedgerCandidate;
		}
		mmAccountTypeMap = types;
		mmAccountPersonMap = persons;
	}

	function clearAccountReviewState() {
		mmAccountReviewOpen = false;
		mmAccountReviewRows = [];
		mmAccountTypeMap = {};
		mmAccountPersonMap = {};
	}

	/** @returns true when account review dialog is shown (import deferred) */
	async function openAccountsReviewIfNeeded(
		csvFiles: Map<string, CSVFile>,
		currencyOverride?: Record<string, string>
	): Promise<boolean> {
		const normalized = normalizeMmCsvFileKeys(csvFiles);
		pendingMmCsvFiles = normalized;

		if (!mmImportOptions.importAccounts) {
			pendingMmCsvFiles = null;
			await finishMmImportAfterRead(normalized, currencyOverride);
			return false;
		}

		const existing = await accountService.getAccounts();
		const rows = buildMmAccountReviewRows(normalized, {
			existingAccountNames: existing.map((a) => a.name),
			conflictResolution: mmImportOptions.conflictResolution
		});

		if (rows.length === 0) {
			pendingMmCsvFiles = null;
			await finishMmImportAfterRead(normalized, currencyOverride);
			return false;
		}

		mmAccountReviewRows = rows;
		seedAccountReviewMaps(rows);
		mmAccountReviewOpen = true;
		return true;
	}

	async function resolveMmCurrencyUidMap(
		files: Map<string, CSVFile>,
		uidMap: Record<string, string>
	): Promise<Record<string, string>> {
		const resolved: Record<string, string> = {};
		for (const [mmUid, value] of Object.entries(uidMap)) {
			if (!value?.trim()) continue;
			if (isMmCurrencyCreateSelection(value)) {
				const row = mmCurrencyReviewRows.find((r) => r.mmUid === mmUid);
				if (!row) continue;
				const created = await createBudgicCurrencyFromMmReview({
					mmUid,
					suggestedCode: row.suggestedCode,
					csvFiles: files
				});
				resolved[mmUid] = created.id;
			} else {
				resolved[mmUid] = value;
			}
		}
		return resolved;
	}

	async function confirmMmCurrencyReview() {
		const files = pendingMmCsvFiles;
		if (!files) return;

		mmCurrencyReviewOpen = false;
		isImportingMM = true;
		error = null;
		mmProgress = null;

		try {
			const resolvedMap = await resolveMmCurrencyUidMap(files, mmCurrencyUidMap);
			mmCurrencyReviewCurrencies = await db.getActiveCurrencies();
			const deferred = await openAccountsReviewIfNeeded(files, resolvedMap);
			if (!deferred) {
				mmCurrencyReviewRows = [];
				mmCurrencyReviewCurrencies = [];
				mmCurrencyUidMap = {};
			}
		} catch (err) {
			error = `Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
			console.error('Money Manager import error:', err);
		} finally {
			isImportingMM = false;
			mmProgress = null;
		}
	}

	async function confirmMmAccountReview() {
		const files = pendingMmCsvFiles;
		if (!files) return;

		const currencyMap = { ...mmCurrencyUidMap };
		const typeMap = { ...mmAccountTypeMap };
		const personMap = { ...mmAccountPersonMap };

		clearAccountReviewState();
		pendingMmCsvFiles = null;
		isImportingMM = true;
		error = null;
		mmProgress = null;

		try {
			await finishMmImportAfterRead(
				files,
				Object.keys(currencyMap).length > 0 ? currencyMap : undefined,
				typeMap,
				personMap
			);
			mmCurrencyReviewRows = [];
			mmCurrencyReviewCurrencies = [];
			mmCurrencyUidMap = {};
		} catch (err) {
			error = `Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
			console.error('Money Manager import error:', err);
		} finally {
			isImportingMM = false;
			mmProgress = null;
		}
	}

	function cancelMmCurrencyReview() {
		mmCurrencyReviewOpen = false;
		pendingMmCsvFiles = null;
		mmCurrencyReviewRows = [];
		mmCurrencyReviewCurrencies = [];
		mmCurrencyUidMap = {};
		clearAccountReviewState();
	}

	function cancelMmAccountReview() {
		clearAccountReviewState();
		pendingMmCsvFiles = null;
	}

	function updateMmAccountType(mmUid: string, type: Account['type']) {
		mmAccountTypeMap = { ...mmAccountTypeMap, [mmUid]: type };
	}

	function updateMmAccountPerson(mmUid: string, checked: boolean) {
		mmAccountPersonMap = { ...mmAccountPersonMap, [mmUid]: checked };
	}

	function updateMmCurrencySelection(mmUid: string, budgicCurrencyId: string) {
		mmCurrencyUidMap = { ...mmCurrencyUidMap, [mmUid]: budgicCurrencyId };
	}

	async function prepareImportWizardState(result: ImportResult): Promise<void> {
		const batch = result.importBatch;
		if (!batch) {
			importWizardOpen = false;
			return;
		}

		const categories = await db.getActiveCategories();
		const categoryTierById = Object.fromEntries(categories.map((c) => [c.id, c.waterfallTier]));
		const txs = (
			await Promise.all((batch.transactionIds ?? []).map((id) => db.transactions.get(id)))
		).filter((tx): tx is Transaction => !!tx && !tx.deletedAt);

		const breakdown = computeBatchExpenseSpendBreakdown(txs, categoryTierById);
		const ucCount = countUnclassifiedExpenseTransactions(txs, categoryTierById);
		const openClassification =
			txs.length > 0 && shouldOpenImportWizard(breakdown, ucCount);

		wizardExpenseTxIds = batch.wizardExpenseTransactionIds ?? [];
		wizardExpenseAbsByTxId = batch.wizardExpenseAbsByTransactionId ?? {};
		wizardBeforeClassifiedExpenseShare = classifiedExpenseShare(breakdown);

		wizardCategoryTierByTxId = Object.fromEntries(
			txs.map((tx) => [
				tx.id,
				(tx.categoryId ? categoryTierById[tx.categoryId] : undefined) as string | undefined
			])
		);

		const preFlagged = batch.personAccountPreFlaggedNames ?? [];
		wizardPersonAccountPreFlagged = preFlagged;
		const detected = await detectPersonAccountCandidates(batch.accountIdsAffected, preFlagged);
		wizardPersonAccountCandidates = [...new Set([...preFlagged, ...detected])];
		wizardPersonAccountPanels = await loadPersonAccountTransactionPanels(
			batch.accountIdsAffected,
			wizardPersonAccountCandidates
		);
		wizardPersonLedgerCloseQueue = await buildPersonLedgerCloseQueue(
			batch,
			batch.accountIdsAffected,
			preFlagged
		);

		if (!openClassification && wizardPersonLedgerCloseQueue.length === 0) {
			importWizardOpen = false;
			return;
		}
		importWizardStartStep = openClassification ? 1 : 5;
		importWizardOpen = true;
	}

	async function buildPersonLedgerCloseQueue(
		batch: NonNullable<ImportResult['importBatch']>,
		accountIdsAffected: string[],
		preFlaggedNames: string[]
	): Promise<PersonLedgerCloseQueueEntry[]> {
		const queue: PersonLedgerCloseQueueEntry[] = [...(batch.personLedgerCloseQueue ?? [])];
		const seen = new Set(queue.map((e) => e.accountId));
		const preFlaggedSet = new Set(preFlaggedNames);

		const accounts = (
			await Promise.all(accountIdsAffected.map((id) => accountService.getAccount(id)))
		).filter((a): a is Account => !!a);

		for (const account of accounts) {
			if (seen.has(account.id)) continue;
			if (account.ledgerRole === 'archived_person') continue;
			const fromImport = account.ledgerRole === 'person';
			const heuristic =
				!preFlaggedSet.has(account.name) && isPersonLedgerNameCandidate(account.name);
			if (!fromImport && !heuristic) continue;

			if (heuristic) {
				const txs = await transactionService.getTransactionsByAccount(account.id);
				const recentCutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
				const recent = txs.filter((tx) => {
					const ts = Date.parse(tx.clearedDate || tx.plannedDate || tx.createdAt);
					return !Number.isNaN(ts) && ts >= recentCutoff;
				});
				const net = recent.reduce((sum, tx) => sum + (tx.amount || 0), 0);
				if (Math.abs(net) >= Math.max(50, Math.abs(account.currentBalance) * 0.5)) continue;
			}

			queue.push({
				accountId: account.id,
				name: account.name,
				externalKeys: []
			});
			seen.add(account.id);
		}
		return queue;
	}

	async function loadPersonAccountTransactionPanels(
		accountIdsAffected: string[],
		personNames: string[]
	): Promise<Array<{ accountId: string; name: string; txs: Transaction[] }>> {
		if (!personNames.length) return [];
		const accounts = (
			await Promise.all(accountIdsAffected.map((id) => accountService.getAccount(id)))
		).filter((a): a is Account => !!a && personNames.includes(a.name));
		const out: Array<{ accountId: string; name: string; txs: Transaction[] }> = [];
		for (const account of accounts) {
			const txs = await transactionService.getTransactionsByAccount(account.id);
			const sorted = txs
				.filter((tx) => !tx.deletedAt)
				.sort(
					(a, b) =>
						Date.parse(b.clearedDate || b.plannedDate || b.createdAt) -
						Date.parse(a.clearedDate || a.plannedDate || a.createdAt)
				)
				.slice(0, 20);
			out.push({ accountId: account.id, name: account.name, txs: sorted });
		}
		return out;
	}

	async function refreshWizardTierForTx(txId: string): Promise<void> {
		const tx = await db.transactions.get(txId);
		if (!tx) return;
		const categories = await db.getActiveCategories();
		const categoryTierById = Object.fromEntries(categories.map((c) => [c.id, c.waterfallTier]));
		const tier = tx.categoryId ? categoryTierById[tx.categoryId] : undefined;
		wizardCategoryTierByTxId = {
			...wizardCategoryTierByTxId,
			[txId]: tier as string | undefined
		};
	}

	async function tagPersonTxAsGift(txId: string): Promise<void> {
		const gifts = await getOrCreateGiftsCategory();
		await transactionService.updateTransaction(
			txId,
			{ categoryId: gifts.id },
			{ dataCorrectionSource: 'user' }
		);
		await refreshWizardTierForTx(txId);
		void navigationStore.updateBadges();
	}

	async function tagPersonTxAsReimbursement(txId: string, personName: string): Promise<void> {
		const tx = await db.transactions.get(txId);
		if (!tx?.currency) return;
		const amount = Math.abs(tx.amount || 0);
		if (amount <= 0) return;
		const now = new Date().toISOString();
		const next = [...(tx.reimbursements ?? [])];
		next.push({
			id: crypto.randomUUID(),
			direction: 'lending',
			amount,
			currency: tx.currency,
			person: personName,
			status: 'expecting',
			createdAt: now,
			updatedAt: now
		});
		await transactionService.updateTransaction(
			txId,
			{ reimbursements: next },
			{ dataCorrectionSource: 'user' }
		);
		await refreshWizardTierForTx(txId);
		void navigationStore.updateBadges();
	}

	async function detectPersonAccountCandidates(
		accountIds: string[],
		preFlaggedNames: string[] = []
	): Promise<string[]> {
		const preFlaggedSet = new Set(preFlaggedNames);
		const accounts = (
			await Promise.all(accountIds.map((id) => accountService.getAccount(id)))
		).filter((a): a is Account => !!a);
		const recentCutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
		const candidates: string[] = [];

		for (const account of accounts) {
			if (preFlaggedSet.has(account.name)) continue;
			if (!isPersonLedgerNameCandidate(account.name)) continue;
			const txs = await transactionService.getTransactionsByAccount(account.id);
			const recent = txs.filter((tx) => {
				const ts = Date.parse(tx.clearedDate || tx.plannedDate || tx.createdAt);
				return !Number.isNaN(ts) && ts >= recentCutoff;
			});
			const net = recent.reduce((sum, tx) => sum + (tx.amount || 0), 0);
			if (Math.abs(net) < Math.max(50, Math.abs(account.currentBalance) * 0.5)) {
				candidates.push(account.name);
			}
		}
		return candidates;
	}

	async function applyCandidateTier(
		transactionIds: string[],
		tier: 'survival' | 'security' | 'growth' | 'lifestyle' | 'unclassified'
	): Promise<void> {
		const categoryIds = new Set<string>();
		for (const id of transactionIds) {
			const tx = await db.transactions.get(id);
			if (tx?.categoryId) categoryIds.add(tx.categoryId);
		}
		for (const categoryId of categoryIds) {
			await db.categories.update(categoryId, {
				waterfallTier: tier,
				updatedAt: new Date().toISOString()
			});
		}
		const categories = await db.getActiveCategories();
		const categoryTierById = Object.fromEntries(categories.map((c) => [c.id, c.waterfallTier]));
		const batchIds = mmResult?.importBatch?.transactionIds;
		const nextTiers = { ...wizardCategoryTierByTxId };
		if (batchIds?.length) {
			for (const bid of batchIds) {
				const tx = await db.transactions.get(bid);
				if (!tx?.categoryId || !categoryIds.has(tx.categoryId)) continue;
				nextTiers[bid] = categoryTierById[tx.categoryId] as string | undefined;
			}
		} else {
			for (const id of transactionIds) {
				const tx = await db.transactions.get(id);
				nextTiers[id] = tx?.categoryId
					? (categoryTierById[tx.categoryId] as string | undefined)
					: undefined;
			}
		}
		wizardCategoryTierByTxId = nextTiers;
		await userService.trackUserAction({
			action: 'create_import_classification_rule',
			details: JSON.stringify({ transactionIds, tier })
		});
	}

	async function handleClearTransactionData() {
		if (dangerBusy) return;
		if (
			!confirm(
				'Permanently delete all transactions and related data listed below? Accounts, categories, and preferences stay. This cannot be undone.'
			)
		) {
			return;
		}
		dangerBusy = 'transactions';
		error = null;
		success = null;
		try {
			await clearTransactionDataPreset();
			success =
				'Transaction data cleared. Account balances were recalculated from opening balances.';
			void navigationStore.updateBadges();
			if (dataTab === 'review') void refreshReviewQueue();
			if (dataTab === 'corrections') void refreshCorrections();
		} catch (err) {
			error = 'Failed to clear transaction data';
			console.error('Error clearing transaction data:', err);
		} finally {
			dangerBusy = null;
		}
	}

	async function handleFullDatabaseReset() {
		if (dangerBusy) return;
		if (
			!confirm(
				'Permanently delete ALL locally stored Budgic data (every table: accounts, categories, settings, currencies, everything). Export first if you need a backup. This cannot be undone. Continue?'
			)
		) {
			return;
		}
		dangerBusy = 'full';
		error = null;
		success = null;
		try {
			await clearFullDatabaseReset();
			resetAutoRestorePromptState();
			success = 'All data cleared. Reloading…';
			setTimeout(() => {
				window.location.reload();
			}, 600);
		} catch (err) {
			error = 'Failed to clear all data';
			console.error('Error clearing all data:', err);
			dangerBusy = null;
		}
	}
</script>

<svelte:head>
	<title>Data | Budgic</title>
</svelte:head>

<PageLayout>
	{#snippet topBar()}
		<Header title="Data" backButtonLabel="Home" backButtonLink="/" />
	{/snippet}

	<div class="mx-auto max-w-2xl space-y-6 px-4 py-6">
		{#if isLoading}
			<div class="h-36 animate-pulse rounded-2xl bg-[var(--color-bg-tertiary)]"></div>
		{:else}
			{#if error}
				<div
					class="rounded-xl border border-[var(--color-warm-coral)]/30 bg-[var(--color-warm-coral)]/8 px-5 py-3"
				>
					<p class="text-sm text-[var(--color-warm-coral)]">{error}</p>
				</div>
			{/if}
			{#if success}
				<div
					class="rounded-xl border border-[var(--color-sage-green)]/30 bg-[var(--color-sage-green)]/8 px-5 py-3"
				>
					<p class="text-sm text-[var(--color-sage-green)]">{success}</p>
				</div>
			{/if}

			<nav
				class="border-border flex flex-wrap gap-2 border-b border-[var(--color-border)] pb-3"
				aria-label="Data sections"
			>
				{#each [{ id: 'import', label: 'Import' }, { id: 'export', label: 'Export' }, { id: 'review', label: 'Review queue' }, { id: 'reconcile', label: 'Reconcile' }, { id: 'corrections', label: 'Corrections log' }] as tab}
					<a
						href="/data?tab={tab.id}"
						class="rounded-full px-3 py-1.5 text-xs font-medium transition-colors {dataTab ===
						tab.id
							? 'bg-[var(--color-amber)] text-[var(--color-bg-primary)]'
							: 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]'}"
					>
						{tab.label}
					</a>
				{/each}
			</nav>

			{#if dataTab === 'export'}
				<!-- Export -->
				<div class="border-border overflow-hidden rounded-2xl border bg-[var(--color-bg-tertiary)]">
					<div class="border-border border-b px-5 py-3">
						<h2
							class="text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
						>
							Export
						</h2>
						<p class="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
							Download a backup of all your financial data
						</p>
						{#if lastServerBackupAt}
							<p class="mt-1 text-xs text-[var(--color-text-tertiary)]">
								Last server backup: {new Date(lastServerBackupAt).toLocaleString()}
							</p>
						{/if}
					</div>
					<div class="space-y-3 px-5 py-4">
						<div class="space-y-1.5">
							<label
								for="export-format"
								class="text-sm font-medium text-[var(--color-text-primary)]">Format</label
							>
							<select
								id="export-format"
								bind:value={exportFormat}
								class="border-border w-full max-w-xs rounded-xl border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
							>
								{#each exportFormatOptions as option}
									<option value={option.value}>{option.label} — {option.description}</option>
								{/each}
							</select>
						</div>
						<button
							onclick={exportData}
							disabled={isExporting}
							class="rounded-xl bg-[var(--color-amber)] px-5 py-2.5 text-sm font-semibold text-[var(--color-bg-primary)] transition-opacity disabled:opacity-60"
						>
							{isExporting ? 'Exporting…' : `Export ${exportFormat.toUpperCase()}`}
						</button>
					</div>
				</div>
			{:else if dataTab === 'import'}
				<!-- Unified import -->
				<div class="border-border overflow-hidden rounded-2xl border bg-[var(--color-bg-tertiary)]">
					<div class="border-border flex items-center justify-between border-b px-5 py-3">
						<div>
							<h2
								class="text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
							>
								Import data
							</h2>
							<p class="mt-1 text-xs leading-relaxed text-[var(--color-text-tertiary)]">
								Supported: Budgic JSON backup · Money Manager CSV export (ASSETS, ZCATEGORY,
								INOUTCOME, CURRENCY) · Money Manager database (.sqlite, .db). Other SQLite formats
								are not supported yet.
							</p>
						</div>
						{#if isMmImportSource}
							<button
								type="button"
								onclick={() => (showMMImport = !showMMImport)}
								class="shrink-0 text-xs font-medium text-[var(--color-amber)]"
							>
								{showMMImport ? 'Hide' : 'Options'}
							</button>
						{/if}
					</div>
					<div class="space-y-4 px-5 py-4">
						<button
							type="button"
							onclick={pickAndDetectImportFiles}
							disabled={isImporting || isImportingMM}
							class="border-border rounded-xl border px-5 py-2.5 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-surface)] disabled:opacity-50"
						>
							Select file(s)
						</button>

						{#if importSelectedFiles.length > 0}
							<div class="space-y-1 rounded-xl bg-[var(--color-bg-surface)] p-3">
								{#if importFormatLabel}
									<p class="text-xs font-medium text-[var(--color-text-secondary)]">
										Detected: {importFormatLabel}
									</p>
								{/if}
								<p class="text-xs text-[var(--color-text-tertiary)]">
									{importSelectedFiles.length} file{importSelectedFiles.length > 1 ? 's' : ''}
									selected
								</p>
								{#each importSelectedFiles as file}
									<p class="text-xs text-[var(--color-text-tertiary)]">• {file.name}</p>
								{/each}
							</div>
						{/if}

						{#if importWarnings.length > 0}
							<div
								class="space-y-1 rounded-xl border border-[var(--color-amber)]/30 bg-[var(--color-amber-subtle)] p-3"
							>
								{#each importWarnings as warning}
									<p class="text-xs text-[var(--color-amber)]">{warning}</p>
								{/each}
							</div>
						{/if}

						{#if mmSchema}
							<div
								class="rounded-xl p-3 {mmSchema.isValid
									? 'border border-[var(--color-sage-green)]/30 bg-[var(--color-sage-green)]/8'
									: 'border border-[var(--color-amber)]/30 bg-[var(--color-amber-subtle)]'}"
							>
								{#if mmSchema.isValid}
									<p class="text-xs text-[var(--color-sage-green)]">
										All required tables found ({mmSchema.tables.length})
									</p>
								{:else}
									<p class="text-xs text-[var(--color-amber)]">
										Missing: {mmSchema.missingTables.join(', ')}
									</p>
								{/if}
							</div>
						{/if}

						{#if showMMImport}
							<div
								class="border-border space-y-4 rounded-xl border bg-[var(--color-bg-surface)] p-4"
							>
								<p
									class="text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
								>
									Import options
								</p>
								<div class="space-y-2">
									{#each [{ key: 'importAccounts', label: 'Accounts' }, { key: 'importCategories', label: 'Categories' }, { key: 'importTransactions', label: 'Transactions' }, { key: 'importCurrencies', label: 'Currencies' }, { key: 'importBudgets', label: 'Budgets (optional)' }] as opt}
										<label class="flex cursor-pointer items-center gap-2.5">
											<Checkbox
												bind:checked={
													mmImportOptions[opt.key as keyof typeof mmImportOptions] as boolean
												}
											/>
											<span class="text-sm text-[var(--color-text-primary)]"
												>Import {opt.label}</span
											>
										</label>
									{/each}
								</div>
								<div class="space-y-1.5">
									<p class="text-xs font-medium text-[var(--color-text-secondary)]">
										Conflict resolution
									</p>
									<Select.Root type="single" bind:value={mmImportOptions.conflictResolution}>
										<Select.Trigger class="w-full max-w-xs">
											{mmImportOptions.conflictResolution === 'skip'
												? 'Skip duplicates'
												: mmImportOptions.conflictResolution === 'rename'
													? 'Rename with suffix'
													: mmImportOptions.conflictResolution === 'merge'
														? 'Merge data'
														: 'Replace existing'}
										</Select.Trigger>
										<Select.Content>
											<Select.Item value="skip">Skip duplicates</Select.Item>
											<Select.Item value="rename">Rename with suffix</Select.Item>
											<Select.Item value="merge">Merge data</Select.Item>
											<Select.Item value="replace">Replace existing</Select.Item>
										</Select.Content>
									</Select.Root>
								</div>
								{#if mmImportOptions.importTransactions}
									<div class="space-y-1.5">
										<p class="text-xs font-medium text-[var(--color-text-secondary)]">
											Re-import: same MM transaction UID
										</p>
										<Select.Root
											type="single"
											bind:value={mmImportOptions.mmTransactionUidConflict}
										>
											<Select.Trigger class="w-full max-w-xs">
												{mmImportOptions.mmTransactionUidConflict === 'skip'
													? 'Skip (keep existing row)'
													: mmImportOptions.mmTransactionUidConflict === 'merge'
														? 'Merge — refresh amounts/dates/FX from MM'
														: 'Replace — full row from MM'}
											</Select.Trigger>
											<Select.Content>
												<Select.Item value="skip">Skip (keep existing row)</Select.Item>
												<Select.Item value="merge"
													>Merge — refresh amounts/dates/FX from MM</Select.Item
												>
												<Select.Item value="replace">Replace — full row from MM</Select.Item>
											</Select.Content>
										</Select.Root>
										<p class="text-[11px] leading-snug text-[var(--color-text-tertiary)]">
											Merge keeps your category, notes, and description; replace overwrites them
											with the CSV.
										</p>
										<label class="flex cursor-pointer items-center gap-2.5">
											<Checkbox bind:checked={mmImportOptions.includeMmUidConflictReport} />
											<span class="text-sm text-[var(--color-text-primary)]"
												>Include UID conflict details in result (can be large)</span
											>
										</label>
									</div>
									<div class="grid grid-cols-2 gap-3">
										<div class="space-y-1.5">
											<label
												for="mm-date-start"
												class="text-xs font-medium text-[var(--color-text-secondary)]"
												>Date start</label
											>
											<input
												id="mm-date-start"
												type="date"
												bind:value={mmImportOptions.transactionDateStart}
												class="border-border w-full rounded-xl border bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
											/>
										</div>
										<div class="space-y-1.5">
											<label
												for="mm-date-end"
												class="text-xs font-medium text-[var(--color-text-secondary)]"
												>Date end</label
											>
											<input
												id="mm-date-end"
												type="date"
												bind:value={mmImportOptions.transactionDateEnd}
												class="border-border w-full rounded-xl border bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
											/>
										</div>
									</div>
								{/if}
							</div>
						{/if}

						{#if mmProgress}
							<div class="space-y-2 rounded-xl bg-[var(--color-bg-surface)] p-4">
								<div class="flex items-center justify-between">
									<p class="text-xs font-medium text-[var(--color-text-primary)]">
										{mmProgress.step}
									</p>
									<p class="text-xs text-[var(--color-text-tertiary)]">
										{formatPercentage(mmProgress.percentage, { maxDecimals: 0 })}
									</p>
								</div>
								<div class="budget-progress">
									<div class="budget-progress-fill" style="width: {mmProgress.percentage}%"></div>
								</div>
								<p class="text-xs text-[var(--color-text-tertiary)]">
									{mmProgress.itemsProcessed} / {mmProgress.totalItems}
								</p>
							</div>
						{/if}

						{#if mmResult}
							<div
								class="rounded-xl border {mmResult.success
									? 'border-[var(--color-sage-green)]/30 bg-[var(--color-sage-green)]/8'
									: 'border-[var(--color-warm-coral)]/30 bg-[var(--color-warm-coral)]/8'} space-y-3 p-4"
							>
								<p
									class="text-sm font-medium {mmResult.success
										? 'text-[var(--color-sage-green)]'
										: 'text-[var(--color-warm-coral)]'}"
								>
									{mmResult.success ? 'Import complete' : 'Import completed with errors'}
								</p>
								<div class="grid grid-cols-2 gap-3 text-xs">
									<div>
										<p class="mb-1 font-medium text-[var(--color-text-secondary)]">Imported</p>
										<p class="text-[var(--color-text-tertiary)]">
											Accounts: {mmResult.statistics.accountsImported}
										</p>
										<p class="text-[var(--color-text-tertiary)]">
											Categories: {mmResult.statistics.categoriesImported}
										</p>
										<p class="text-[var(--color-text-tertiary)]">
											Transactions: {mmResult.statistics.transactionsImported}
										</p>
										{#if (mmResult.statistics.transactionsMerged ?? 0) > 0 || (mmResult.statistics.transactionsReplaced ?? 0) > 0}
											<p class="text-[var(--color-text-tertiary)]">
												Re-import: {mmResult.statistics.transactionsMerged ?? 0} merged, {mmResult
													.statistics.transactionsReplaced ?? 0} replaced
											</p>
										{/if}
									</div>
									<div>
										<p class="mb-1 font-medium text-[var(--color-text-secondary)]">Skipped</p>
										<p class="text-[var(--color-text-tertiary)]">
											Accounts: {mmResult.statistics.accountsSkipped}
										</p>
										<p class="text-[var(--color-text-tertiary)]">
											Categories: {mmResult.statistics.categoriesSkipped}
										</p>
										<p class="text-[var(--color-text-tertiary)]">
											Transactions: {mmResult.statistics.transactionsSkipped}
										</p>
									</div>
								</div>
								{#if mmResult.importBatch?.mmUidConflicts?.length}
									<details class="text-xs text-[var(--color-text-secondary)]">
										<summary class="cursor-pointer font-medium text-[var(--color-text-primary)]">
											MM UID conflict details ({mmResult.importBatch.mmUidConflicts.length})
										</summary>
										<ul
											class="mt-2 max-h-40 space-y-2 overflow-y-auto text-[var(--color-text-tertiary)]"
										>
											{#each mmResult.importBatch.mmUidConflicts as row}
												<li>
													<span class="font-mono">{row.mmUid}</span>
													— {row.action}
													{#if row.diffs?.length}
														<ul class="mt-0.5 ml-2 list-disc pl-4">
															{#each row.diffs as d}
																<li>{d.field}</li>
															{/each}
														</ul>
													{/if}
												</li>
											{/each}
										</ul>
									</details>
								{/if}
								{#if mmResult.errors.length > 0}
									<div class="max-h-32 space-y-1 overflow-y-auto">
										{#each mmResult.errors.slice(0, 8) as err}
											<p class="text-xs text-[var(--color-warm-coral)]">
												{err.entityType || 'Unknown'}: {err.message}
											</p>
										{/each}
										{#if mmResult.errors.length > 8}
											<p class="text-xs text-[var(--color-text-tertiary)]">
												…and {mmResult.errors.length - 8} more
											</p>
										{/if}
									</div>
								{/if}
								<p class="text-xs text-[var(--color-text-tertiary)]">
									Completed in {(mmResult.duration / 1000).toFixed(2)}s
								</p>
							</div>
						{/if}

						{#if mmResult?.success && mmResult.importBatch?.qualitySummary}
							{@const qs = mmResult.importBatch.qualitySummary}
							<div
								class="space-y-3 rounded-xl border border-[var(--color-amber)]/25 bg-[var(--color-amber-subtle)] p-4"
							>
								<p class="text-sm font-medium text-[var(--color-text-primary)]">
									Import quality summary
								</p>
								<ul class="space-y-1 text-xs text-[var(--color-text-secondary)]">
									<li>Total imported transactions: {qs.total}</li>
									<li>Clean (no inferred flags): {qs.clean}</li>
									<li>Date inferred: {qs.dateInferred}</li>
									<li>Amount inferred / zero fallback: {qs.amountInferred}</li>
									<li>Currency fallback: {qs.currencyFallback}</li>
									{#if mmResult.importBatch?.splitCandidateSummary}
										<li>
											Possible splits: {mmResult.importBatch.splitCandidateSummary.groupCount} group(s),
											{mmResult.importBatch.splitCandidateSummary.transactionCount} transaction(s)
										</li>
									{/if}
								</ul>
								<a
									href="/data?tab=review"
									class="inline-flex text-sm font-semibold text-[var(--color-amber)] underline-offset-2 hover:underline"
									>Review flagged →</a
								>
							</div>
						{/if}

						{#if importDetection?.kind === 'budgic-json' || isMmImportSource}
							<button
								type="button"
								onclick={runUnifiedImport}
								disabled={isImporting ||
									isImportingMM ||
									(importDetection?.kind === 'budgic-json' ? false : !mmCsvFilesReady)}
								class="rounded-xl bg-[var(--color-amber)] px-5 py-2.5 text-sm font-semibold text-[var(--color-bg-primary)] transition-opacity disabled:opacity-60"
							>
								{isImporting || isImportingMM
									? 'Importing…'
									: importDetection?.kind === 'budgic-json'
										? 'Import Budgic backup'
										: 'Import from Money Manager'}
							</button>
						{/if}
					</div>
				</div>

				<!-- Danger zone -->
				<div
					class="overflow-hidden rounded-2xl border border-[var(--color-warm-coral)]/20 bg-[var(--color-warm-coral)]/5"
				>
					<div class="border-b border-[var(--color-warm-coral)]/15 px-5 py-3">
						<h2
							class="text-[10px] font-semibold tracking-widest text-[var(--color-warm-coral)] uppercase"
						>
							Danger zone
						</h2>
					</div>
					<div class="space-y-5 px-5 py-4">
						<div class="space-y-2">
							<button
								type="button"
								onclick={handleClearTransactionData}
								disabled={dangerBusy !== null}
								class="w-full rounded-xl border border-[var(--color-warm-coral)]/30 bg-[var(--color-warm-coral)]/8 px-5 py-2.5 text-sm font-semibold text-[var(--color-warm-coral)] transition-colors hover:bg-[var(--color-warm-coral)]/12 disabled:opacity-50"
							>
								{dangerBusy === 'transactions' ? 'Working…' : 'Clear transaction data'}
							</button>
							<p class="text-xs font-medium text-[var(--color-text-secondary)]">Removes</p>
							<ul
								class="list-inside list-disc space-y-0.5 text-xs text-[var(--color-text-tertiary)]"
							>
								{#each TRANSACTION_DATA_PRESET_REMOVES_BULLETS as line}
									<li>{line}</li>
								{/each}
							</ul>
							<p class="text-xs font-medium text-[var(--color-text-secondary)]">Keeps</p>
							<ul
								class="list-inside list-disc space-y-0.5 text-xs text-[var(--color-text-tertiary)]"
							>
								{#each TRANSACTION_DATA_PRESET_KEEPS_BULLETS as line}
									<li>{line}</li>
								{/each}
							</ul>
						</div>
						<div class="space-y-2 border-t border-[var(--color-warm-coral)]/15 pt-4">
							<button
								type="button"
								onclick={handleFullDatabaseReset}
								disabled={dangerBusy !== null}
								class="w-full rounded-xl border border-[var(--color-warm-coral)]/40 bg-[var(--color-warm-coral)]/12 px-5 py-2.5 text-sm font-semibold text-[var(--color-warm-coral)] transition-colors hover:bg-[var(--color-warm-coral)]/18 disabled:opacity-50"
							>
								{dangerBusy === 'full' ? 'Working…' : 'Full reset (all local data)'}
							</button>
							<p class="text-xs font-medium text-[var(--color-text-secondary)]">Removes</p>
							<ul
								class="list-inside list-disc space-y-0.5 text-xs text-[var(--color-text-tertiary)]"
							>
								{#each FULL_DATABASE_RESET_REMOVES_BULLETS as line}
									<li>{line}</li>
								{/each}
							</ul>
							<p class="text-xs text-[var(--color-text-tertiary)]">
								Reloads the app and sends you to onboarding so system data can re-initialize. Export
								first.
							</p>
						</div>
					</div>
				</div>
			{:else if dataTab === 'review'}
				<div class="space-y-6">
					{#if reviewLoading}
						<p class="text-sm text-[var(--color-text-tertiary)]">Loading…</p>
					{:else if splitReviewGroups.length === 0 && reviewQueue.length === 0}
						<p class="text-sm text-[var(--color-text-tertiary)]">
							No transactions need import review.
						</p>
					{:else}
						{#if splitReviewGroups.length > 0}
							<section class="space-y-3">
								<h3 class="text-sm font-semibold text-[var(--color-text-primary)]">
									Possible splits ({splitReviewGroups.length})
								</h3>
								<ul class="space-y-3">
									{#each splitReviewGroups as group (group.groupId)}
										<ImportSplitReviewCard
											{group}
											accountName={accountNameById[group.transactions[0]?.accountId ?? '']}
											busy={splitReviewBusyGroupId !== null}
											onconfirm={(ids) => confirmSplitGroup(group.groupId, ids)}
											ondismiss={() => dismissSplitGroup(group.groupId)}
										/>
									{/each}
								</ul>
							</section>
						{/if}

						{#if reviewQueue.length > 0}
							<section class="space-y-3">
								<h3 class="text-sm font-semibold text-[var(--color-text-primary)]">
									Import quality flags ({reviewQueue.length})
								</h3>
								<ul class="space-y-3">
									{#each reviewQueue as tx (tx.id)}
										<li
											class="border-border rounded-xl border bg-[var(--color-bg-tertiary)] px-4 py-3"
										>
											<p class="text-sm font-medium text-[var(--color-text-primary)]">
												{tx.description || 'No description'}
											</p>
											<p
												class="mt-1 flex flex-wrap gap-2 text-xs text-[var(--color-text-tertiary)]"
											>
												{#if tx.importQuality?.amountInferred}
													<span class="rounded bg-amber-500/15 px-1.5 py-0.5">Amount inferred</span>
												{/if}
												{#if tx.importQuality?.dateInferred}
													<span class="rounded bg-amber-500/15 px-1.5 py-0.5">Date inferred</span>
												{/if}
												{#if tx.importQuality?.currencyFallback}
													<span class="rounded bg-amber-500/15 px-1.5 py-0.5"
														>Currency fallback</span
													>
												{/if}
											</p>
											<div class="mt-3 flex flex-wrap gap-2">
												<Button
													variant="outline"
													size="sm"
													onclick={() => goto(`/transactions/add/${tx.id}`)}>Edit</Button
												>
												<Button
													variant="secondary"
													size="sm"
													onclick={() => confirmReviewItem(tx.id)}>Confirm</Button
												>
												<Button
													variant="ghost"
													size="sm"
													onclick={() => {
														const q = tx.importQuality;
														if (q) dismissReviewItem(tx.id, q);
													}}>Dismiss</Button
												>
											</div>
										</li>
									{/each}
								</ul>
							</section>
						{/if}
					{/if}
				</div>
			{:else if dataTab === 'reconcile'}
				<DataReconciliationTab />
			{:else if dataTab === 'corrections'}
				<div class="max-h-[70vh] space-y-2 overflow-y-auto">
					{#if correctionsLog.length === 0}
						<p class="text-sm text-[var(--color-text-tertiary)]">No corrections recorded yet.</p>
					{:else}
						{#each correctionsLog as row (row.id)}
							<div
								class="border-border rounded-lg border bg-[var(--color-bg-tertiary)] px-3 py-2 text-xs"
							>
								<p class="font-medium text-[var(--color-text-primary)]">{row.field}</p>
								<p class="text-[var(--color-text-tertiary)]">
									{row.source} · {new Date(row.timestamp).toLocaleString()}
								</p>
								{#if row.transactionId}
									<p class="mt-1">
										<a
											href="/transactions/add/{row.transactionId}"
											class="text-[var(--color-amber)] underline-offset-2 hover:underline"
											>Open transaction</a
										>
									</p>
								{/if}
								{#if row.accountId}
									<p class="text-[var(--color-text-tertiary)]">Account {row.accountId}</p>
								{/if}
								<pre
									class="mt-1 overflow-x-auto text-[10px] text-[var(--color-text-tertiary)]">{JSON.stringify(
										{ old: row.oldValue, new: row.newValue },
										null,
										0
									)}</pre>
							</div>
						{/each}
					{/if}
				</div>
			{/if}
		{/if}
	</div>
</PageLayout>

<ImportCurrencyReviewDialog
	open={mmCurrencyReviewOpen}
	rows={mmCurrencyReviewRows}
	currencies={mmCurrencyReviewCurrencies}
	selection={mmCurrencyUidMap}
	onSelectionChange={updateMmCurrencySelection}
	onConfirm={() => void confirmMmCurrencyReview()}
	onCancel={cancelMmCurrencyReview}
/>

<ImportAccountsReviewDialog
	open={mmAccountReviewOpen}
	rows={mmAccountReviewRows}
	typeSelection={mmAccountTypeMap}
	personSelection={mmAccountPersonMap}
	onTypeChange={updateMmAccountType}
	onPersonChange={updateMmAccountPerson}
	onConfirm={() => void confirmMmAccountReview()}
	onCancel={cancelMmAccountReview}
/>

{#if mmResult?.importBatch}
	<ImportWizard
		open={importWizardOpen}
		importResult={mmResult}
		beforeClassifiedExpenseShare={wizardBeforeClassifiedExpenseShare}
		expenseTxIds={wizardExpenseTxIds}
		expenseAbsByTxId={wizardExpenseAbsByTxId}
		categoriesByTransactionId={wizardCategoryTierByTxId}
		onApplyTier={applyCandidateTier}
		personAccountCandidates={wizardPersonAccountCandidates}
		personAccountPreFlagged={wizardPersonAccountPreFlagged}
		personAccountPanels={wizardPersonAccountPanels}
		personLedgerCloseQueue={wizardPersonLedgerCloseQueue}
		startStep={importWizardStartStep}
		onPersonLedgerCloseApplied={() => void navigationStore.updateBadges()}
		onTagPersonTxGift={tagPersonTxAsGift}
		onTagPersonTxReimbursement={tagPersonTxAsReimbursement}
		onGoPatterns={() => goto('/insights?tab=patterns')}
		onClose={() => (importWizardOpen = false)}
	/>
{/if}
