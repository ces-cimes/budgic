<script lang="ts">
	import { Plus } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { openTypePicker } from '$lib/stores/type-picker-store.svelte';
	import { periodStore } from '$lib/stores/period-store';
	import { onMount, onDestroy } from 'svelte';
	import { fly } from 'svelte/transition';
	import { transactionService, userService, accountService } from '$lib/core/services';
	import type { BulkOperationResult } from '$lib/core/services/core/transaction-service';
	import { db } from '$lib/core/db';
	import { getAllSystemCurrencyDefaults } from '$lib/core/currency-defaults';
	import TransactionList, {
		type FilterState
	} from '$lib/components/transactions/TransactionList.svelte';
	import { bulkSelection } from '$lib/stores/bulk-selection-store.svelte';
	import Header from '$lib/components/Header.svelte';
	import { PageLayout } from '$lib/components/layouts';
	import * as Popover from '$lib/components/ui/popover/index.ts';
	import { BulkActionBar, BulkEditDialog, TypePicker } from '$lib/components/transactions';
	import type { Transaction, Account, Category } from '$lib/core/db';
	import { toast } from 'svelte-sonner';
	import {
		countTransactionsInMonth,
		findLatestMonthWithTransactions,
		monthDateFromKey,
		shouldAutoSnapToLatestMonth
	} from '$lib/utils/transaction-month-empty';
	import { Skeleton } from '$lib/components/ui/skeleton';

	const { data } = $props<{ data: any }>();

	let transactions = $state<Transaction[]>([]);
	let accounts = $state<Record<string, Account>>({});
	let budgetCategories = $state<Record<string, Category>>({});
	let userCurrency = $state<string | null>(null);
	let isLoading = $state(true);
	let headerAddPopoverOpen = $state(false);
	let selectionMode = $state(false);
	let selectedIds = $state<Set<string>>(new Set());
	let visibleSelectableIds = $state<Set<string>>(new Set());
	let bulkAction = $state<
		| 'account'
		| 'category'
		| 'description'
		| 'dates'
		| 'notes'
		| 'amount'
		| 'currency'
		| 'status'
		| 'delete'
		| null
	>(null);
	let isBulkDialogOpen = $state(false);
	let isBulkProcessing = $state(false);
	/** Persisted across bar hide/show cycles; initialised once in onMount */
	let bulkBarExpanded = $state(false);
	let lastLongPressSelectionTs = $state(0);

	// Phase 5: shared period state — sync with Reports; URL ?month=YYYY-MM
	let transactionFilters = $state<FilterState>({
		searchQuery: '',
		showPendingOnly: false,
		dateFilterEnabled: true,
		groupingMode: 'smart',
		currentMonth: new Date()
	});
	const reviewQueueHref = '/transactions?quality=flagged';
	const qualityFilter = $derived.by(() => {
		const qualityParam = $page.url.searchParams.get('quality');
		return qualityParam === 'flagged' ? 'flagged' : 'all';
	});

	function onFiltersChange(newFilters: FilterState) {
		transactionFilters = newFilters;
		if (selectionMode) {
			selectedIds = new Set();
		}
		const d = newFilters.currentMonth;
		const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
		if (periodStore.month !== ym) {
			periodStore.month = ym;
			const url = periodStore.applyToUrl($page.url.pathname, $page.url.search);
			goto(url, { replaceState: true, noScroll: true });
		}
	}

	function handleHeaderAddTypeSelect(type: Transaction['type'], status: Transaction['status']) {
		headerAddPopoverOpen = false;
		goto(
			`/transactions/add?type=${encodeURIComponent(type)}&status=${encodeURIComponent(status)}`
		);
	}

	function exitSelectionMode() {
		selectionMode = false;
		selectedIds = new Set();
	}

	$effect(() => {
		if (selectionMode && selectedIds.size === 0) {
			exitSelectionMode();
		}
	});

	function handleSelectionChange(ids: Set<string>) {
		const now = Date.now();
		const millisSinceLongPress = now - lastLongPressSelectionTs;
		if (selectionMode && ids.size === 0 && selectedIds.size > 0 && millisSinceLongPress < 350) {
			return;
		}
		selectedIds = ids;
	}

	$effect(() => {
		bulkSelection.active = selectionMode;
	});

	onDestroy(() => {
		bulkSelection.active = false;
	});

	const BULK_CURRENCY_PICKER_BASE = getAllSystemCurrencyDefaults().map((row) =>
		row.currencyCode.toUpperCase()
	);

	const bulkCurrencyCodes = $derived(
		[
			...new Set([
				...BULK_CURRENCY_PICKER_BASE,
				...(userCurrency && userCurrency.trim() ? [userCurrency.trim().toUpperCase()] : []),
				...Object.values(accounts)
					.map((a) => a.currency)
					.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
					.map((c) => c.toUpperCase())
			])
		].sort()
	);

	function openBulkAction(
		action:
			| 'account'
			| 'category'
			| 'description'
			| 'dates'
			| 'notes'
			| 'amount'
			| 'currency'
			| 'status'
			| 'delete'
	) {
		bulkAction = action;
		isBulkDialogOpen = true;
	}

	function handleBulkCancel() {
		isBulkDialogOpen = false;
		bulkAction = null;
	}

	function selectAllFiltered() {
		if (visibleSelectableIds.size === 0) return;
		selectedIds = new Set(visibleSelectableIds);
	}

	function handleTransactionLongPress(id: string) {
		lastLongPressSelectionTs = Date.now();
		selectionMode = true;
		selectedIds = new Set([...selectedIds, id]);
	}

	async function resolveSelectedTransactionIds(): Promise<string[]> {
		const resolved = new Set<string>();
		for (const selectedId of selectedIds) {
			try {
				const groupMembers = await transactionService.getGroupTransactions(selectedId);
				if (groupMembers.length > 0) {
					for (const member of groupMembers) {
						resolved.add(member.id);
					}
				} else {
					resolved.add(selectedId);
				}
			} catch {
				resolved.add(selectedId);
			}
		}
		return Array.from(resolved);
	}

	function logBulkRowFailures(context: string, result: BulkOperationResult) {
		if (result.failed === 0) return;
		console.error(`[transactions/bulk:${context}] ${result.failed} row(s) failed`, {
			success: result.success,
			failed: result.failed,
			errors: result.errors
		});
	}

	function logBulkException(context: string, error: unknown) {
		console.error(`[transactions/bulk:${context}]`, error);
	}

	function showBulkResultToast(
		result: BulkOperationResult,
		operation: 'updated' | 'deleted',
		context: string
	) {
		logBulkRowFailures(context, result);

		if (result.success > 0 && result.failed === 0) {
			toast.success(`${result.success} transactions ${operation}`);
			return;
		}

		if (result.success > 0 && result.failed > 0) {
			toast.warning(`${result.success} ${operation}, ${result.failed} failed`);
			return;
		}

		toast.error(`Failed to apply bulk action`);
	}

	async function refreshTransactions() {
		const transactionsData = await transactionService.getAllTransactions();
		transactions = transactionsData.filter((t) => t && !t.deletedAt);
	}

	async function handleBulkCategory(categoryId: string) {
		isBulkProcessing = true;
		try {
			const ids = await resolveSelectedTransactionIds();
			const result = await transactionService.bulkUpdateTransactions(ids, { categoryId });
			showBulkResultToast(result, 'updated', 'category');
			if (result.success > 0) {
				selectedIds = new Set();
				await refreshTransactions();
			}
		} catch (error) {
			logBulkException('category', error);
			toast.error(error instanceof Error ? error.message : 'Failed to update transactions');
		} finally {
			isBulkProcessing = false;
			isBulkDialogOpen = false;
			bulkAction = null;
		}
	}

	async function handleBulkAccount(accountId: string) {
		isBulkProcessing = true;
		try {
			const ids = await resolveSelectedTransactionIds();
			const result = await transactionService.bulkUpdateTransactions(ids, { accountId });
			showBulkResultToast(result, 'updated', 'account');
			if (result.success > 0) {
				selectedIds = new Set();
				await refreshTransactions();
			}
		} catch (error) {
			logBulkException('account', error);
			toast.error(error instanceof Error ? error.message : 'Failed to move transactions');
		} finally {
			isBulkProcessing = false;
			isBulkDialogOpen = false;
			bulkAction = null;
		}
	}

	async function handleBulkDescription(
		payload:
			| { kind: 'findReplace'; find: string; replaceWith: string }
			| { kind: 'set'; text: string }
	) {
		isBulkProcessing = true;
		try {
			const ids = await resolveSelectedTransactionIds();
			const result =
				payload.kind === 'findReplace'
					? await transactionService.bulkReplaceTransactionDescriptions(
							ids,
							payload.find,
							payload.replaceWith
						)
					: await transactionService.bulkSetTransactionDescriptions(ids, payload.text);
			if (result.success > 0) {
				showBulkResultToast(result, 'updated', 'description');
				selectedIds = new Set();
				await refreshTransactions();
			} else if (result.failed > 0) {
				showBulkResultToast(result, 'updated', 'description');
			} else {
				toast.info(
					payload.kind === 'findReplace'
						? 'No descriptions contained the search text.'
						: 'No descriptions were changed (already identical).'
				);
			}
		} catch (error) {
			logBulkException('description', error);
			toast.error(error instanceof Error ? error.message : 'Failed to update descriptions');
		} finally {
			isBulkProcessing = false;
			isBulkDialogOpen = false;
			bulkAction = null;
		}
	}

	async function handleBulkDates(
		payload:
			| { kind: 'shift'; shiftDays: number; applyTo: 'cleared' | 'planned' | 'both' }
			| { kind: 'set'; calendarDate: string; applyTo: 'cleared' | 'planned' | 'both' }
	) {
		isBulkProcessing = true;
		try {
			const ids = await resolveSelectedTransactionIds();
			const result =
				payload.kind === 'shift'
					? await transactionService.bulkShiftTransactionDates(
							ids,
							payload.shiftDays,
							payload.applyTo
						)
					: await transactionService.bulkSetTransactionDates(
							ids,
							payload.calendarDate,
							payload.applyTo
						);
			if (result.success > 0) {
				showBulkResultToast(result, 'updated', 'dates');
				selectedIds = new Set();
				await refreshTransactions();
			} else if (result.failed > 0) {
				showBulkResultToast(result, 'updated', 'dates');
			} else {
				toast.info(
					payload.kind === 'shift'
						? 'No dates were shifted (no matching date field on selected rows).'
						: 'No dates were changed.'
				);
			}
		} catch (error) {
			logBulkException('dates', error);
			toast.error(error instanceof Error ? error.message : 'Failed to update dates');
		} finally {
			isBulkProcessing = false;
			isBulkDialogOpen = false;
			bulkAction = null;
		}
	}

	async function handleBulkNotesReference(payload: {
		field: 'notes' | 'reference';
		mode: 'append' | 'prepend' | 'replace' | 'set';
		text: string;
		find?: string;
	}) {
		isBulkProcessing = true;
		try {
			const ids = await resolveSelectedTransactionIds();
			const result = await transactionService.bulkMutateNotesOrReference(ids, payload);
			if (result.success > 0) {
				showBulkResultToast(result, 'updated', 'notes');
				selectedIds = new Set();
				await refreshTransactions();
			} else if (result.failed > 0) {
				showBulkResultToast(result, 'updated', 'notes');
			} else {
				toast.info('Nothing changed (no matching text or empty result for all rows).');
			}
		} catch (error) {
			logBulkException('notes', error);
			toast.error(
				error instanceof Error ? error.message : 'Failed to update notes or reference'
			);
		} finally {
			isBulkProcessing = false;
			isBulkDialogOpen = false;
			bulkAction = null;
		}
	}

	async function handleBulkAmountAdjust(mode: 'fixed' | 'percent' | 'absolute', value: number) {
		isBulkProcessing = true;
		try {
			const ids = await resolveSelectedTransactionIds();
			const result = await transactionService.bulkAdjustTransactionAmounts(ids, {
				mode,
				value
			});
			if (result.success > 0) {
				showBulkResultToast(result, 'updated', 'amount');
				selectedIds = new Set();
				await refreshTransactions();
			} else if (result.failed > 0) {
				const onlyTransferSkips =
					result.errors.length > 0 &&
					result.errors.every((e) => e.reason.toLowerCase().includes('transfer'));
				if (onlyTransferSkips) {
					console.warn('[transactions/bulk:amount] only transfer rows in selection', {
						failed: result.failed,
						errors: result.errors
					});
					toast.info(
						'Amount bulk edit applies only to income, expense, and adjustment rows (not transfers).'
					);
				} else {
					showBulkResultToast(result, 'updated', 'amount');
				}
			} else {
				toast.info('No amounts were changed.');
			}
		} catch (error) {
			logBulkException('amount', error);
			toast.error(error instanceof Error ? error.message : 'Failed to adjust amounts');
		} finally {
			isBulkProcessing = false;
			isBulkDialogOpen = false;
			bulkAction = null;
		}
	}

	async function handleBulkCurrency(currency: string) {
		isBulkProcessing = true;
		try {
			const ids = await resolveSelectedTransactionIds();
			const result = await transactionService.bulkSetTransactionCurrency(ids, currency);
			if (result.success > 0) {
				showBulkResultToast(result, 'updated', 'currency');
				selectedIds = new Set();
				await refreshTransactions();
			} else if (result.failed > 0) {
				const onlyTransferSkips =
					result.errors.length > 0 &&
					result.errors.every((e) => e.reason.toLowerCase().includes('transfer'));
				if (onlyTransferSkips) {
					console.warn('[transactions/bulk:currency] only transfer rows in selection', {
						failed: result.failed,
						errors: result.errors
					});
					toast.info(
						'Currency bulk edit applies only to income, expense, and adjustment rows (not transfers).'
					);
				} else {
					showBulkResultToast(result, 'updated', 'currency');
				}
			} else {
				toast.info(
					'No currencies changed (rows already use that currency or none were eligible).'
				);
			}
		} catch (error) {
			logBulkException('currency', error);
			toast.error(error instanceof Error ? error.message : 'Failed to set currency');
		} finally {
			isBulkProcessing = false;
			isBulkDialogOpen = false;
			bulkAction = null;
		}
	}

	async function handleBulkStatus(status: 'cleared' | 'pending' | 'planned' | 'cancelled') {
		isBulkProcessing = true;
		try {
			const ids = await resolveSelectedTransactionIds();
			const result = await transactionService.bulkUpdateTransactions(ids, { status });
			showBulkResultToast(result, 'updated', 'status');
			if (result.success > 0) {
				selectedIds = new Set();
				await refreshTransactions();
			}
		} catch (error) {
			logBulkException('status', error);
			toast.error(error instanceof Error ? error.message : 'Failed to update transactions');
		} finally {
			isBulkProcessing = false;
			isBulkDialogOpen = false;
			bulkAction = null;
		}
	}

	async function handleBulkDelete() {
		isBulkProcessing = true;
		try {
			const ids = await resolveSelectedTransactionIds();
			const result = await transactionService.bulkDeleteTransactions(ids);
			showBulkResultToast(result, 'deleted', 'delete');
			if (result.success > 0) {
				selectedIds = new Set();
				await refreshTransactions();
			}
		} catch (error) {
			logBulkException('delete', error);
			toast.error(error instanceof Error ? error.message : 'Failed to delete transactions');
		} finally {
			isBulkProcessing = false;
			isBulkDialogOpen = false;
			bulkAction = null;
		}
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && selectionMode) {
			exitSelectionMode();
		}
	}

	onMount(async () => {
		// Initialise the bar expanded state once based on viewport width
		bulkBarExpanded = window.matchMedia('(min-width: 768px)').matches;

		periodStore.initFromUrl($page.url.search);
		transactionFilters = { ...transactionFilters, currentMonth: periodStore.monthDate };
		try {
			// Load user currency preference first
			const preferences = await userService.getUserPreferences();
			userCurrency = preferences?.currency || null;

			// Load accounts and budget categories for name resolution
			const [accountsData, budgetCategoriesData] = await Promise.all([
				accountService.getAccounts(),
				db.getActiveCategories()
			]);

			accounts = accountsData.reduce(
				(acc, account) => {
					acc[account.id] = account;
					return acc;
				},
				{} as Record<string, Account>
			);

			budgetCategories = budgetCategoriesData.reduce(
				(acc, category) => {
					acc[category.id] = category;
					return acc;
				},
				{} as Record<string, Category>
			);

			const transactionsData = await transactionService.getAllTransactions();
			transactions = transactionsData.filter((t) => t && !t.deletedAt);

			const currentMonth = transactionFilters.currentMonth;
			if (
				transactionFilters.dateFilterEnabled &&
				shouldAutoSnapToLatestMonth($page.url.search, currentMonth) &&
				countTransactionsInMonth(transactions, currentMonth) === 0 &&
				transactions.length > 0
			) {
				const latestMonth = findLatestMonthWithTransactions(transactions);
				if (latestMonth) {
					transactionFilters = {
						...transactionFilters,
						currentMonth: monthDateFromKey(latestMonth)
					};
					periodStore.month = latestMonth;
					const url = periodStore.applyToUrl($page.url.pathname, $page.url.search);
					goto(url, { replaceState: true, noScroll: true });
				}
			}
		} catch (error) {
			console.error('Error loading transactions:', error);
		} finally {
			isLoading = false;
		}
	});

	// Handle transaction click (single tx or grouped row)
	function handleTransactionClick(transaction: Transaction | any) {
		if (
			transaction?.isGroup &&
			Array.isArray(transaction.transactions) &&
			transaction.transactions.length > 0
		) {
			const members = transaction.transactions.filter(
				(t: Transaction | undefined): t is Transaction => !!t?.id
			);
			if (members.length === 0) return;
			const master = members.reduce(
				(best: Transaction, t: Transaction) =>
					Math.abs(t.amount ?? 0) >= Math.abs(best.amount ?? 0) ? t : best,
				members[0]
			);
			goto(`/transactions/add/${master.id}`);
			return;
		}
		const transactionId = transaction?.id;
		if (!transactionId) return;
		goto(`/transactions/add/${transactionId}`);
	}
</script>

<svelte:head>
	<title>Transactions | Budgic</title>
</svelte:head>
<svelte:window onkeydown={handleWindowKeydown} />

<PageLayout>
	{#snippet topBar()}
		<Header title="Transactions" variant="with-tabs">
			{#snippet rightSlot()}
				<!-- Desktop: Popover anchored to button. Trigger hidden on mobile (FAB opens Dialog there). -->
				<Popover.Root bind:open={headerAddPopoverOpen}>
					<Popover.Trigger
						class="text-muted-foreground hover:text-foreground hidden cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent px-2 py-1.5 text-sm sm:flex"
						aria-label="Add transaction"
					>
						<Plus class="h-4 w-4" />
						<span>Add transaction</span>
					</Popover.Trigger>
					<Popover.Content
						class="w-[min(calc(100vw-2rem),20rem)] p-0"
						align="end"
						side="bottom"
						sideOffset={6}
					>
						<div class="p-2">
							<p class="text-muted-foreground px-2 pb-2 text-xs font-medium">
								Choose type
							</p>
							<TypePicker onSelect={handleHeaderAddTypeSelect} />
						</div>
					</Popover.Content>
				</Popover.Root>
			{/snippet}
		</Header>
	{/snippet}

	<div
		class="mx-auto flex min-h-full max-w-4xl min-w-0 flex-1 flex-col overflow-x-clip overscroll-x-contain px-5 py-4 sm:px-6"
	>
		{#if isLoading}
			<!-- Skeleton loading state — no spinners -->
			<div class="squircle-2xl squircle-border squircle-fill-tertiary mb-4 px-5 py-3.5">
				<div class="grid grid-cols-3 gap-4">
					{#each [1, 2, 3] as item (item)}
						<div class="flex flex-col items-center gap-1.5">
							<Skeleton class="h-4 w-16 bg-[var(--color-bg-surface)]" />
							<Skeleton class="h-2.5 w-10 bg-[var(--color-bg-surface)]" />
						</div>
					{/each}
				</div>
			</div>
			<div class="space-y-2">
				{#each [1, 2, 3, 4, 5, 6, 7, 8] as i (i)}
					<div
						class="squircle-2xl squircle-border squircle-fill-tertiary flex items-center gap-3 px-4 py-3"
						style="animation-delay: {i * 40}ms"
					>
						<Skeleton
							class="size-9 shrink-0 rounded-full bg-[var(--color-bg-surface)]"
						/>
						<div class="flex-1 space-y-2">
							<Skeleton class="h-3.5 w-2/3 bg-[var(--color-bg-surface)]" />
							<Skeleton class="h-2.5 w-1/3 bg-[var(--color-bg-surface)]" />
						</div>
						<Skeleton class="h-3.5 w-14 bg-[var(--color-bg-surface)]" />
					</div>
				{/each}
			</div>
		{:else}
			<TransactionList
				{transactions}
				{accounts}
				categories={budgetCategories}
				{userCurrency}
				{reviewQueueHref}
				{qualityFilter}
				filters={transactionFilters}
				{onFiltersChange}
				onTransactionClick={handleTransactionClick}
				onTransactionLongPress={handleTransactionLongPress}
				onAddTransaction={() => openTypePicker()}
				enableFilters={true}
				enableSearch={true}
				enableBasicToggles={true}
				enableAdvancedFilters={true}
				enableSelection={true}
				{selectionMode}
				{selectedIds}
				onSelectionChange={handleSelectionChange}
				onVisibleSelectionIdsChange={(ids) => (visibleSelectableIds = ids)}
				displayMode="detailed"
				groupingMode="smart"
				showSummary={true}
				showDateNavigation={true}
			/>
		{/if}
	</div>

	{#snippet bottomBar()}
		{#if selectionMode && selectedIds.size > 0}
			<div
				transition:fly={{ y: 80, duration: 180 }}
				class="border-border bg-background/95 border-t
					px-4 pt-2 pb-3 backdrop-blur-md supports-[padding:max(0px)]:pb-[max(0.75rem,env(safe-area-inset-bottom))]"
				role="region"
				aria-label="Bulk actions"
			>
				<div class="mx-auto max-w-4xl">
					<BulkActionBar
						selectedCount={selectedIds.size}
						selectableCount={visibleSelectableIds.size}
						isProcessing={isBulkProcessing}
						expanded={bulkBarExpanded}
						onExpandedChange={(v) => (bulkBarExpanded = v)}
						onSelectAll={selectAllFiltered}
						onAccount={() => openBulkAction('account')}
						onCategory={() => openBulkAction('category')}
						onDescription={() => openBulkAction('description')}
						onDates={() => openBulkAction('dates')}
						onNotes={() => openBulkAction('notes')}
						onAmount={() => openBulkAction('amount')}
						onCurrency={() => openBulkAction('currency')}
						onStatus={() => openBulkAction('status')}
						onDelete={() => openBulkAction('delete')}
						onClear={() => (selectedIds = new Set())}
					/>
				</div>
			</div>
		{/if}
	{/snippet}

	<BulkEditDialog
		bind:open={isBulkDialogOpen}
		action={bulkAction}
		selectedCount={selectedIds.size}
		accounts={Object.values(accounts).map((account) => ({
			id: account.id,
			name: account.name
		}))}
		categories={Object.values(budgetCategories)
			.filter((category) => category && !category.deletedAt)
			.map((category) => ({
				id: category.id,
				name: category.name,
				color: category.color
			}))}
		currencyCodes={bulkCurrencyCodes}
		defaultCurrency={userCurrency}
		isProcessing={isBulkProcessing}
		onApplyAccount={handleBulkAccount}
		onApplyCategory={handleBulkCategory}
		onApplyDescription={handleBulkDescription}
		onApplyDates={handleBulkDates}
		onApplyNotesReference={handleBulkNotesReference}
		onApplyAmountAdjust={handleBulkAmountAdjust}
		onApplyCurrency={handleBulkCurrency}
		onApplyStatus={handleBulkStatus}
		onConfirmDelete={handleBulkDelete}
		onCancel={handleBulkCancel}
	/>
</PageLayout>
