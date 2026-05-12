<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
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
		readMultipleCSVFiles,
		inspectSchema,
		type ImportResult,
		type ImportProgress,
		type DetectedSchema,
		type MmTransactionUidConflict
	} from '$lib/core/services/import-export';
	import ImportWizard from '$lib/components/import/ImportWizard.svelte';
	import { pickFile, pickMultipleFiles } from '$lib/utils/file-picker-utils';
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
	import type { Transaction, Account, DataCorrection } from '$lib/core/db';
	import { devLog } from '$lib/utils/dev-log';
	import { page } from '$app/stores';
	import { dataQualityService, dataCorrectionService } from '$lib/core/services';
	import DataReconciliationTab from '$lib/components/data/DataReconciliationTab.svelte';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { navigationStore } from '$lib/stores/navigation-store.svelte';

	const DATA_TABS = new Set(['import', 'export', 'review', 'reconcile', 'corrections']);
	const dataTab = $derived.by(() => {
		const raw = $page.url.searchParams.get('tab') ?? 'import';
		return DATA_TABS.has(raw) ? raw : 'import';
	});

	let reviewQueue = $state<Transaction[]>([]);
	let correctionsLog = $state<DataCorrection[]>([]);
	let reviewLoading = $state(false);

	async function refreshReviewQueue() {
		reviewLoading = true;
		try {
			reviewQueue = await dataQualityService.getImportReviewQueue();
		} finally {
			reviewLoading = false;
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
		await transactionService.updateTransaction(
			id,
			{ importQuality: undefined },
			{ dataCorrectionSource: 'user' }
		);
		await refreshReviewQueue();
		void navigationStore.updateBadges();
	}

	async function dismissReviewItem(id: string, q: NonNullable<Transaction['importQuality']>) {
		await transactionService.updateTransaction(
			id,
			{ importQuality: { ...q, reviewDismissed: true } },
			{ dataCorrectionSource: 'user' }
		);
		await refreshReviewQueue();
		void navigationStore.updateBadges();
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

	// Money Manager import state
	let mmFiles = $state<File[]>([]);
	let mmSchema = $state<DetectedSchema | null>(null);
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
	let wizardBeforeClassifiedExpenseShare = $state(0);
	let wizardExpenseTxIds = $state<string[]>([]);
	let wizardExpenseAbsByTxId = $state<Record<string, number>>({});
	let wizardCategoryTierByTxId = $state<Record<string, string | undefined>>({});
	let wizardPersonAccountCandidates = $state<string[]>([]);
	let wizardPersonAccountPanels = $state<
		Array<{ accountId: string; name: string; txs: Transaction[] }>
	>([]);

	// Export format options
	const exportFormatOptions = [
		{ value: 'json', label: 'JSON', description: 'Complete data backup (recommended)' },
		{ value: 'csv', label: 'CSV', description: 'Spreadsheet format' },
		{ value: 'pdf', label: 'PDF', description: 'Printable report' }
	];

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
			// Simple JSON export for now
			const data = {
				accounts: await db.accounts.toArray(),
				transactions: await db.transactions.toArray(),
				categories: await db.categories.toArray(),
				goals: await db.goals.toArray(),
				insights: await db.insights.toArray(),
				userActions: await db.userActions.toArray(),
				userPreferences: await db.userPreferences.toArray(),
				exportDate: new Date().toISOString(),
				version: '1.0'
			};

			// Create download link
			const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `budgic-export-${new Date().toISOString().split('T')[0]}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);

			success = 'Saved';
		} catch (err) {
			error = 'Failed to export data';
			console.error('Error exporting data:', err);
		} finally {
			isExporting = false;
		}
	}

	// Import data
	async function importData() {
		isImporting = true;
		error = null;
		success = null;

		try {
			const file = await pickFile({
				types: ['application/json'],
				extensions: ['.json']
			});

			if (!file) {
				// User cancelled
				isImporting = false;
				return;
			}

			const text = await file.text();
			const data = JSON.parse(text);

			// Validate import data structure
			if (!data.version || !data.exportDate) {
				throw new Error('Invalid export file format');
			}

			// Import user preferences if present
			if (data.userPreferences && data.userPreferences.length > 0) {
				await userService.updateUserPreferences(data.userPreferences[0]);
			}

			success = 'Saved';
		} catch (err) {
			error = 'Failed to import data: ' + (err instanceof Error ? err.message : 'Unknown error');
			console.error('Error importing data:', err);
		} finally {
			isImporting = false;
		}
	}

	// Handle Money Manager file selection
	async function handleMMFileSelection() {
		if (mmFiles.length === 0) {
			mmSchema = null;
			return;
		}

		try {
			const csvFiles = await readMultipleCSVFiles(mmFiles);
			const schema = inspectSchema(csvFiles, 'money-manager-csv');
			mmSchema = schema;

			if (!schema.isValid) {
				error = `Missing required tables: ${schema.missingTables.join(', ')}`;
			} else {
				error = null;
			}
		} catch (err) {
			error = `Failed to analyze CSV files: ${err instanceof Error ? err.message : 'Unknown error'}`;
			mmSchema = null;
		}
	}

	// Pick Money Manager CSV files
	async function pickMMFiles() {
		try {
			devLog('Picking CSV files...');
			const files = await pickMultipleFiles({
				types: ['text/csv'],
				extensions: ['.csv']
			});

			devLog(
				'Picked files:',
				files.length,
				files.map((f) => ({ name: f.name, size: f.size }))
			);

			if (files.length > 0) {
				mmFiles = files;
				devLog(
					'mmFiles updated:',
					mmFiles.length,
					mmFiles.map((f) => ({ name: f.name, size: f.size }))
				);
				await handleMMFileSelection();
			} else {
				devLog('No files selected or user cancelled');
			}
		} catch (err) {
			error = `Failed to pick files: ${err instanceof Error ? err.message : 'Unknown error'}`;
			console.error('Error picking files:', err);
		}
	}

	// Handle Money Manager import
	async function handleMMImport() {
		if (mmFiles.length === 0) {
			error = 'Please select CSV files to import';
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
			// Read CSV files
			const csvFiles = await readMultipleCSVFiles(mmFiles);

			// Create importer
			const importer = new MoneyManagerImporter({
				...mmImportOptions,
				onProgress: (progress) => {
					mmProgress = progress;
				}
			});

			// Execute import
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

				// Clear files after successful import
				mmFiles = [];
				mmSchema = null;

				await prepareImportWizardState(result);
				void navigationStore.updateBadges();
			} else {
				error = `Import completed with ${result.errors.length} error(s). Check details below.`;
			}
		} catch (err) {
			error = `Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
			console.error('Money Manager import error:', err);
		} finally {
			isImportingMM = false;
			mmProgress = null;
		}
	}

	async function prepareImportWizardState(result: ImportResult): Promise<void> {
		const batch = result.importBatch;
		if (!batch?.transactionIds?.length) {
			importWizardOpen = false;
			return;
		}

		const categories = await db.getActiveCategories();
		const categoryTierById = Object.fromEntries(categories.map((c) => [c.id, c.waterfallTier]));
		const txs = (
			await Promise.all(batch.transactionIds.map((id) => db.transactions.get(id)))
		).filter((tx): tx is Transaction => !!tx && !tx.deletedAt);

		const breakdown = computeBatchExpenseSpendBreakdown(txs, categoryTierById);
		const ucCount = countUnclassifiedExpenseTransactions(txs, categoryTierById);
		if (!shouldOpenImportWizard(breakdown, ucCount)) {
			importWizardOpen = false;
			return;
		}

		wizardExpenseTxIds = batch.wizardExpenseTransactionIds ?? [];
		wizardExpenseAbsByTxId = batch.wizardExpenseAbsByTransactionId ?? {};
		wizardBeforeClassifiedExpenseShare = classifiedExpenseShare(breakdown);

		wizardCategoryTierByTxId = Object.fromEntries(
			txs.map((tx) => [
				tx.id,
				(tx.categoryId ? categoryTierById[tx.categoryId] : undefined) as string | undefined
			])
		);

		wizardPersonAccountCandidates = await detectPersonAccountCandidates(batch.accountIdsAffected);
		wizardPersonAccountPanels = await loadPersonAccountTransactionPanels(
			batch.accountIdsAffected,
			wizardPersonAccountCandidates
		);
		importWizardOpen = true;
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

	async function detectPersonAccountCandidates(accountIds: string[]): Promise<string[]> {
		const accounts = (
			await Promise.all(accountIds.map((id) => accountService.getAccount(id)))
		).filter((a): a is Account => !!a);
		const firstNameLike = /^[A-ZА-Я][a-zа-я]{2,20}$/;
		const recentCutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
		const candidates: string[] = [];

		for (const account of accounts) {
			if (!firstNameLike.test(account.name.trim())) continue;
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

	async function runPersonAccountMigration() {
		if (!mmResult?.importBatch) return;
		const accounts = await accountService.getAccounts();
		const targets = accounts.filter((a) => wizardPersonAccountCandidates.includes(a.name));
		const uncategorized = await getOrCreateUncategorizedCategory();
		for (const account of targets) {
			if (Math.abs(account.currentBalance) <= 0.01) continue;
			const direction = account.currentBalance > 0 ? 'lending' : 'borrowing';
			const amount = Math.abs(account.currentBalance);
			await transactionService.createTransaction({
				type: account.currentBalance > 0 ? 'expense' : 'income',
				status: 'cleared',
				accountId: account.id,
				amount: account.currentBalance > 0 ? amount : -amount,
				currency: account.currency,
				description: `Person account migration: ${account.name}`,
				categoryId: uncategorized.id,
				reimbursements: [
					{
						id: crypto.randomUUID(),
						direction,
						amount,
						currency: account.currency,
						person: account.name,
						status: direction === 'lending' ? 'expecting' : 'owed',
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString()
					}
				],
				clearedDate: new Date().toISOString()
			});
		}
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
			success = 'Transaction data cleared. Account balances were recalculated from opening balances.';
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
			success = 'All data cleared. Reloading…';
			setTimeout(() => {
				window.location.assign('/onboarding');
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
				<!-- Import Budgic backup -->
				<div class="border-border overflow-hidden rounded-2xl border bg-[var(--color-bg-tertiary)]">
					<div class="border-border border-b px-5 py-3">
						<h2
							class="text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
						>
							Import from Budgic backup
						</h2>
					</div>
					<div class="space-y-2 px-5 py-4">
						<button
							onclick={importData}
							disabled={isImporting || isImportingMM}
							class="border-border rounded-xl border px-5 py-2.5 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-surface)] disabled:opacity-50"
						>
							Select JSON file
						</button>
						<p class="text-xs text-[var(--color-text-tertiary)]">
							Restore from a previous Budgic JSON export
						</p>
					</div>
				</div>

				<!-- Import Money Manager -->
				<div class="border-border overflow-hidden rounded-2xl border bg-[var(--color-bg-tertiary)]">
					<div class="border-border flex items-center justify-between border-b px-5 py-3">
						<div>
							<h2
								class="text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
							>
								Import from Money Manager
							</h2>
							<p class="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
								ASSETS.csv, ZCATEGORY.csv, INOUTCOME.csv, CURRENCY.csv…
							</p>
						</div>
						<button
							type="button"
							onclick={() => (showMMImport = !showMMImport)}
							class="text-xs font-medium text-[var(--color-amber)]"
						>
							{showMMImport ? 'Hide' : 'Options'}
						</button>
					</div>
					<div class="space-y-4 px-5 py-4">
						<button
							onclick={pickMMFiles}
							disabled={isImporting || isImportingMM}
							class="border-border rounded-xl border px-5 py-2.5 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-surface)] disabled:opacity-50"
						>
							Select CSV files
						</button>

						{#if mmFiles.length > 0}
							<div class="space-y-1 rounded-xl bg-[var(--color-bg-surface)] p-3">
								<p class="text-xs font-medium text-[var(--color-text-secondary)]">
									{mmFiles.length} file{mmFiles.length > 1 ? 's' : ''} selected
								</p>
								{#each mmFiles as file}
									<p class="text-xs text-[var(--color-text-tertiary)]">• {file.name}</p>
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
										<Select.Root type="single" bind:value={mmImportOptions.mmTransactionUidConflict}>
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
												Re-import: {(mmResult.statistics.transactionsMerged ?? 0)} merged, {(mmResult.statistics.transactionsReplaced ?? 0)} replaced
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
										<ul class="mt-2 max-h-40 space-y-2 overflow-y-auto text-[var(--color-text-tertiary)]">
											{#each mmResult.importBatch.mmUidConflicts as row}
												<li>
													<span class="font-mono">{row.mmUid}</span>
													— {row.action}
													{#if row.diffs?.length}
														<ul class="ml-2 mt-0.5 list-disc pl-4">
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
								</ul>
								<a
									href="/data?tab=review"
									class="inline-flex text-sm font-semibold text-[var(--color-amber)] underline-offset-2 hover:underline"
									>Review flagged →</a
								>
							</div>
						{/if}

						<button
							onclick={handleMMImport}
							disabled={isImporting || isImportingMM || mmFiles.length === 0}
							class="rounded-xl bg-[var(--color-amber)] px-5 py-2.5 text-sm font-semibold text-[var(--color-bg-primary)] transition-opacity disabled:opacity-60"
						>
							{isImportingMM ? 'Importing…' : 'Import from Money Manager'}
						</button>
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
							<ul class="list-inside list-disc space-y-0.5 text-xs text-[var(--color-text-tertiary)]">
								{#each TRANSACTION_DATA_PRESET_REMOVES_BULLETS as line}
									<li>{line}</li>
								{/each}
							</ul>
							<p class="text-xs font-medium text-[var(--color-text-secondary)]">Keeps</p>
							<ul class="list-inside list-disc space-y-0.5 text-xs text-[var(--color-text-tertiary)]">
								{#each TRANSACTION_DATA_PRESET_KEEPS_BULLETS as line}
									<li>{line}</li>
								{/each}
							</ul>
						</div>
						<div class="border-t border-[var(--color-warm-coral)]/15 pt-4 space-y-2">
							<button
								type="button"
								onclick={handleFullDatabaseReset}
								disabled={dangerBusy !== null}
								class="w-full rounded-xl border border-[var(--color-warm-coral)]/40 bg-[var(--color-warm-coral)]/12 px-5 py-2.5 text-sm font-semibold text-[var(--color-warm-coral)] transition-colors hover:bg-[var(--color-warm-coral)]/18 disabled:opacity-50"
							>
								{dangerBusy === 'full' ? 'Working…' : 'Full reset (all local data)'}
							</button>
							<p class="text-xs font-medium text-[var(--color-text-secondary)]">Removes</p>
							<ul class="list-inside list-disc space-y-0.5 text-xs text-[var(--color-text-tertiary)]">
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
				<div class="space-y-4">
					{#if reviewLoading}
						<p class="text-sm text-[var(--color-text-tertiary)]">Loading…</p>
					{:else if reviewQueue.length === 0}
						<p class="text-sm text-[var(--color-text-tertiary)]">
							No transactions need import review.
						</p>
					{:else}
						<ul class="space-y-3">
							{#each reviewQueue as tx (tx.id)}
								<li class="border-border rounded-xl border bg-[var(--color-bg-tertiary)] px-4 py-3">
									<p class="text-sm font-medium text-[var(--color-text-primary)]">
										{tx.description || 'No description'}
									</p>
									<p class="mt-1 flex flex-wrap gap-2 text-xs text-[var(--color-text-tertiary)]">
										{#if tx.importQuality?.amountInferred}
											<span class="rounded bg-amber-500/15 px-1.5 py-0.5">Amount inferred</span>
										{/if}
										{#if tx.importQuality?.dateInferred}
											<span class="rounded bg-amber-500/15 px-1.5 py-0.5">Date inferred</span>
										{/if}
										{#if tx.importQuality?.currencyFallback}
											<span class="rounded bg-amber-500/15 px-1.5 py-0.5">Currency fallback</span>
										{/if}
									</p>
									<div class="mt-3 flex flex-wrap gap-2">
										<Button
											variant="outline"
											size="sm"
											onclick={() => goto(`/transactions/add/${tx.id}`)}>Edit</Button
										>
										<Button variant="secondary" size="sm" onclick={() => confirmReviewItem(tx.id)}
											>Confirm</Button
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
		personAccountPanels={wizardPersonAccountPanels}
		onMigratePersonAccounts={runPersonAccountMigration}
		onTagPersonTxGift={tagPersonTxAsGift}
		onTagPersonTxReimbursement={tagPersonTxAsReimbursement}
		onGoPatterns={() => goto('/insights?tab=patterns')}
		onClose={() => (importWizardOpen = false)}
	/>
{/if}
