<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import {
		transactionService,
		accountService,
		budgetService,
		userService,
		planService,
		negativeAllowanceService
	} from '$lib/core/services';
	import { db } from '$lib/core/db';
	import type { Account, Transaction, Category } from '$lib/core/db';
	import { getOrCreateUncategorizedCategory } from '$lib/utils/category-utils';
	import * as Form from '$lib/components/ui/form/index.ts';
	import * as Select from '$lib/components/ui/select/index.ts';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.ts';
	import * as Label from '$lib/components/ui/label/index.ts';
	import * as Alert from '$lib/components/ui/alert/index.ts';
	import * as Button from '$lib/components/ui/button/index.ts';
	import * as Input from '$lib/components/ui/input/index.ts';
	import * as Switch from '$lib/components/ui/switch/index.ts';
	import * as Dialog from '$lib/components/ui/dialog/index.ts';
	import * as Sheet from '$lib/components/ui/sheet/index.ts';
	import * as Tooltip from '$lib/components/ui/tooltip/index.ts';
	import { Trash2, HelpCircle, ChevronDown, Tag } from '@lucide/svelte';
	import { PageLayout } from '$lib/components/layouts';
	import Header from '$lib/components/Header.svelte';
	import {
		FormFieldGrid,
		FormErrorAlert,
		AdvancedOptionsSection,
		LabelWithTooltip
	} from '$lib/components/forms';
	import { DependencyManager, DependencyGraphVisualization } from '$lib/components/transactions';
	import type { DirectionalConstraint, FlexibilityTier, CurrencyInfo } from '$lib/core/db';
	import { PRIORITY_LEVELS, suggestPriority } from '$lib/utils/priority-utils';
	import {
		DIRECTIONAL_CONSTRAINTS,
		suggestConstraint
	} from '$lib/utils/directional-constraint-utils';
	import {
		FLEXIBILITY_TIERS,
		suggestFlexibilityTierWithConstraint
	} from '$lib/utils/flexibility-tier-utils';
	import { getCurrencyInfo } from '$lib/utils/currency-utils';
	import { dateUtils } from '$lib/utils/date-utils';

	let accounts = $state<Account[]>([]);
	let categories = $state<Category[]>([]);
	let transaction = $state<Transaction | null>(null);

	// Form state
	let selectedAccount = $state('');
	let description = $state('');
	let amount = $state(0);
	let currency = $state<string | null>(null);
	let transactionType = $state<Transaction['type']>('expense');
	let status = $state<Transaction['status']>('cleared');

	// Store previous valid values to restore when deselection is attempted
	let previousTransactionType = $state<Transaction['type']>('expense');
	let previousStatus = $state<Transaction['status']>('cleared');

	// Prevent deselection in toggle groups - restore previous value instead of default
	$effect(() => {
		if (transactionType) {
			previousTransactionType = transactionType;
		} else {
			transactionType = previousTransactionType;
		}
	});

	$effect(() => {
		if (status) {
			previousStatus = status;
		} else {
			status = previousStatus;
		}
	});
	let selectedCategory = $state('');
	let notes = $state('');
	let reference = $state('');
	let toAccountId = $state('');
	let plannedDate = $state('');
	let clearedDate = $state('');
	let isRecurring = $state(false);
	let recurrenceRule = $state('');
	let isGroupTransaction = $state(false);
	let groupName = $state('');
	let isLoading = $state(false);
	let error = $state('');

	// Currency selection state
	let currencies = $state<
		Array<{
			code: string;
			name: string;
			symbol: string;
			placement: 'before' | 'after';
			decimalPlaces: number;
		}>
	>([]);
	let showCurrencySheet = $state(false);

	// Currency button ref and dynamic padding
	let currencyButtonRef: HTMLButtonElement | null = $state(null);
	let currencyButtonPadding = $state(64); // Default padding in pixels (button width + spacing)

	// Transfer fee fields
	let transferFeeAmount = $state(0);
	let transferFeeAccountId = $state('');
	let transferFeeCategoryId = $state('');
	let hasTransferFee = $state(false);

	// Optimization fields
	let priority = $state<number | undefined>(undefined);
	let directionalConstraint = $state<DirectionalConstraint | undefined>(undefined);
	let flexibilityTier = $state<FlexibilityTier | undefined>(undefined);

	// String version of priority for Select component (Select expects strings)
	let priorityString = $state<string>('');

	// UI state
	let showDeleteDialog = $state(false);
	let isDeleting = $state(false);
	let showAllowanceBlockDialog = $state(false);
	let pendingTransactionData = $state<Record<string, unknown> | null>(null);
	let pendingIsEdit = $state(false);
	let pendingTransactionId = $state<string | null>(null);

	// Computed date label
	let dateLabel = $derived(() => {
		if (status === 'cleared') return 'Date *';
		if (status === 'planned') return 'Planned Date *';
		if (status === 'pending') return 'Date';
		return 'Date';
	});

	// Get current currency info
	let currentCurrencyInfo = $derived(() => {
		if (!currency) return null;
		const info = getCurrencyInfo(currency);
		if (!info) {
			console.warn(`Currency info not found for code: ${currency}`);
		}
		return info;
	});

	// Get currency symbol for display
	let currencySymbol = $derived(() => currentCurrencyInfo()?.symbol || currency || '?');

	// Get account currency when account is selected
	// IMPORTANT: For imported transactions, always preserve the original transaction currency
	$effect(() => {
		if (selectedAccount && accounts.length > 0) {
			const account = accounts.find((a) => a.id === selectedAccount);
			if (account && account.currency) {
				// Only update currency if:
				// 1. It's a new transaction (no transaction loaded), OR
				// 2. The transaction doesn't have an importSource (user-created), OR
				// 3. The transaction currency already matches the account currency
				// NEVER change currency for imported transactions - they may have different currencies
				if (
					!transaction ||
					!transaction.importSource ||
					transaction.currency === account.currency
				) {
					currency = account.currency;
				} else {
					// For imported transactions, keep the original transaction currency
					currency = transaction.currency || account.currency;
				}
			}
		}
	});

	// Measure currency button width and update padding
	$effect(() => {
		// Trigger measurement when currency changes
		const currentCurrency = currency;

		if (currencyButtonRef) {
			// Use ResizeObserver to track button width changes
			const resizeObserver = new ResizeObserver((entries) => {
				for (const entry of entries) {
					const width = entry.contentRect.width;
					// Add 8px (0.5rem) base spacing + 8px (pl-2) for extra breathing room
					currencyButtonPadding = width + 12;
				}
			});

			resizeObserver.observe(currencyButtonRef);

			// Initial measurement with a small delay to ensure DOM is updated
			const updatePadding = () => {
				if (currencyButtonRef) {
					const width = currencyButtonRef.offsetWidth;
					// Add 8px (0.5rem) base spacing + 8px (pl-2) for extra breathing room
					currencyButtonPadding = width + 12;
				}
			};

			// Immediate measurement
			updatePadding();

			// Also measure after a short delay to catch any layout changes
			const timeoutId = setTimeout(updatePadding, 50);

			return () => {
				resizeObserver.disconnect();
				clearTimeout(timeoutId);
			};
		}
	});

	// Mobile keyboard handling - scroll to focused input
	function handleInputFocus(event: FocusEvent) {
		const target = event.target as HTMLElement;
		if (target && 'scrollIntoView' in target) {
			// Small delay to ensure keyboard is shown
			setTimeout(() => {
				target.scrollIntoView({
					behavior: 'smooth',
					block: 'center',
					inline: 'nearest'
				});
			}, 300);
		}
	}

	onMount(async () => {
		try {
			[accounts, categories] = await Promise.all([
				accountService.getAccounts(),
				db.getActiveCategories()
			]);

			// Load available currencies
			const activeCurrencies = await db.getActiveCurrencies();
			currencies = activeCurrencies
				.filter((c) => c.isActive)
				.sort((a, b) => {
					// Sort system currencies first, then by code
					if (a.isSystem && !b.isSystem) return -1;
					if (!a.isSystem && b.isSystem) return 1;
					return a.code.localeCompare(b.code);
				})
				.map((curr) => ({
					code: curr.code,
					name: curr.name,
					symbol: curr.symbol,
					placement: curr.placement,
					decimalPlaces: curr.decimalPlaces
				}));

			// If no currencies found, this is an error state
			if (currencies.length === 0) {
				console.error('No currencies available in database');
			}

			// Set default currency from user preferences if not already set
			if (!currency && currencies.length > 0) {
				try {
					const preferences = await userService.getUserPreferences();
					if (preferences?.currency && currencies.some((c) => c.code === preferences.currency)) {
						currency = preferences.currency;
					} else {
						currency = currencies[0].code;
					}
				} catch (err) {
					console.error('Error loading user preferences:', err);
					if (currencies.length > 0) {
						currency = currencies[0].code;
					}
				}
			}

			// Check if we have an ID parameter (edit mode)
			const transactionId = $page.params.id;
			if (transactionId) {
				transaction = await transactionService.getTransaction(transactionId);
				if (transaction) {
					// Populate form with existing transaction data
					selectedAccount = transaction.accountId || '';
					description = transaction.description || '';
					amount = transaction.amount || 0;
					currency = transaction.currency || currency || null;
					transactionType = transaction.type;
					status = transaction.status;
					selectedCategory = transaction.categoryId || '';
					notes = transaction.notes || '';
					reference = transaction.reference || '';
					toAccountId = transaction.toAccountId || '';
					// Convert UTC dates to local datetime-local format for input
					plannedDate = transaction.plannedDate
						? dateUtils.toLocalDateTimeInput(transaction.plannedDate)
						: '';
					clearedDate = transaction.clearedDate
						? dateUtils.toLocalDateTimeInput(transaction.clearedDate)
						: '';
					isRecurring = !!transaction.recurrenceRule;
					recurrenceRule = transaction.recurrenceRule || '';
					isGroupTransaction = !!transaction.groupName;
					groupName = transaction.groupName || '';
					priority = transaction.priority;
					priorityString = transaction.priority?.toString() || '';
					directionalConstraint = transaction.directionalConstraint || undefined;
					flexibilityTier = transaction.flexibilityTier || undefined;
					// Reset suggestion flags when editing
					hasSuggestedPriority = true;
					hasSuggestedConstraint = true;
					hasSuggestedFlexibilityTier = true;
				} else {
					error = 'Transaction not found';
				}
			} else {
				// Default values for new transaction
				// Don't default account - let user select it themselves
				// This gives users more control, especially for planned transactions
				if (accounts.length > 0) {
					// Set transfer fee account and currency defaults (needed for transfer fees)
					transferFeeAccountId = accounts[0].id;
					if (accounts[0].currency) {
						currency = accounts[0].currency;
					} else if (!currency && currencies.length > 0) {
						currency = currencies[0].code;
					}
					// Note: selectedAccount is intentionally left empty - user must select it
					// Validation will catch missing accounts for cleared/pending/transfer transactions
				}
				// Set default dates in local timezone for datetime-local input
				const now = new Date();
				clearedDate = dateUtils.toLocalDateTimeInput(now.toISOString());
				plannedDate = dateUtils.toLocalDateTimeInput(now.toISOString());
			}
		} catch (err) {
			error = 'Failed to load data';
			console.error(err);
		}
	});

	// Computed properties
	let isEditMode = $derived(!!transaction);
	let pageTitle = $derived(isEditMode ? 'Edit Transaction' : 'Add Transaction');
	let submitButtonText = $derived(
		isLoading ? (isEditMode ? 'Updating...' : 'Creating...') : isEditMode ? 'Update' : 'Create'
	);

	// Auto-suggest priority, constraint, and flexibility tier when category or type changes
	// Only suggest once when category/type is first set, not on every change
	let hasSuggestedPriority = $state(false);
	let hasSuggestedConstraint = $state(false);
	let hasSuggestedFlexibilityTier = $state(false);

	$effect(() => {
		// Only auto-suggest for new transactions (not when editing)
		if (!isEditMode && (selectedCategory || transactionType)) {
			const category = selectedCategory
				? categories.find((c) => c.id === selectedCategory)
				: undefined;
			const categoryName = category?.name;

			// Auto-suggest priority if not set and haven't suggested yet
			if (!hasSuggestedPriority && priority === undefined && (transactionType || categoryName)) {
				priority = suggestPriority(transactionType, categoryName);
				hasSuggestedPriority = true;
			}

			// Auto-suggest constraint if not set and haven't suggested yet
			if (
				!hasSuggestedConstraint &&
				directionalConstraint === undefined &&
				(transactionType || categoryName)
			) {
				directionalConstraint = suggestConstraint(transactionType, categoryName, isRecurring);
				hasSuggestedConstraint = true;
			}

			// Auto-suggest flexibility tier if not set and haven't suggested yet
			// This should run after constraint is set to ensure consistency
			if (
				!hasSuggestedFlexibilityTier &&
				flexibilityTier === undefined &&
				(transactionType || categoryName)
			) {
				flexibilityTier = suggestFlexibilityTierWithConstraint(
					transactionType,
					categoryName,
					directionalConstraint
				);
				hasSuggestedFlexibilityTier = true;
			}
		}
	});

	// Update flexibility tier when directional constraint changes to maintain consistency
	$effect(() => {
		if (directionalConstraint === 'fixed' && flexibilityTier !== 'fixed') {
			flexibilityTier = 'fixed';
		} else if (
			directionalConstraint &&
			directionalConstraint !== 'fixed' &&
			flexibilityTier === 'fixed'
		) {
			// If constraint is not fixed but tier is fixed, suggest a more flexible tier
			const category = selectedCategory
				? categories.find((c) => c.id === selectedCategory)
				: undefined;
			const categoryName = category?.name;
			flexibilityTier = suggestFlexibilityTierWithConstraint(
				transactionType,
				categoryName,
				directionalConstraint
			);
		}
	});

	async function doActualSubmit(
		txData: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
		isEdit: boolean,
		existingId: string | null
	) {
		if (isEdit && existingId) {
			await transactionService.updateTransaction(existingId, txData);
		} else {
			await transactionService.createTransaction(txData);
		}
		goto('/transactions');
	}

	async function handleSubmit(event: Event) {
		event.preventDefault();
		isLoading = true;
		error = '';

		try {
			// Validate required fields
			// Account is required for cleared, pending, and transfers; optional for planned
			if (
				(status === 'cleared' || status === 'pending' || transactionType === 'transfer') &&
				!selectedAccount
			) {
				throw new Error('Please select an account');
			}
			if (!description.trim()) {
				throw new Error('Enter a description');
			}
			if (amount === 0) {
				throw new Error('Enter an amount');
			}
			if (transactionType === 'transfer' && !toAccountId) {
				throw new Error('Please select a destination account for transfers');
			}

			// Auto-assign "Uncategorized" category for expenses without a category
			let finalCategoryId = selectedCategory;
			if (transactionType === 'expense' && !selectedCategory) {
				const uncategorizedCategory = await getOrCreateUncategorizedCategory();
				finalCategoryId = uncategorizedCategory.id;
			}

			// Prepare transaction data
			const transactionData: any = {
				accountId: selectedAccount || undefined, // Optional for planned transactions
				description: description.trim(),
				amount: amount,
				type: transactionType,
				status: status,
				currency: currency,
				categoryId: finalCategoryId || undefined,
				notes: notes || undefined,
				reference: reference || undefined,
				toAccountId: transactionType === 'transfer' ? toAccountId : undefined,
				// Convert local datetime-local input values back to UTC ISO strings
				plannedDate:
					status === 'planned'
						? plannedDate
							? dateUtils.fromLocalDateTimeInput(plannedDate)
							: undefined
						: undefined,
				clearedDate:
					status === 'cleared'
						? clearedDate
							? dateUtils.fromLocalDateTimeInput(clearedDate)
							: undefined
						: undefined,
				recurrenceRule: isRecurring ? recurrenceRule : undefined,
				groupName: isGroupTransaction ? groupName : undefined,
				groupId: isGroupTransaction ? crypto.randomUUID() : undefined,
				priority: priority,
				directionalConstraint: directionalConstraint === 'none' ? undefined : directionalConstraint,
				flexibilityTier: flexibilityTier
			};

			// Handle transfer details if it's a transfer
			// transferDetails is required for all transfers, not just those with fees
			if (transactionType === 'transfer') {
				transactionData.transferDetails = {
					toAccountId: toAccountId!,
					transferAmount: Math.abs(amount),
					feeAmount: hasTransferFee ? transferFeeAmount : 0,
					feeAccountId: hasTransferFee ? transferFeeAccountId || selectedAccount : undefined,
					feeCategoryId: hasTransferFee ? transferFeeCategoryId : undefined
				};
			}

			// Block-with-warning: if user prefers to be prompted when over allowance, check before saving an expense
			if (
				transactionType === 'expense' &&
				(status === 'cleared' || status === 'pending') &&
				(selectedAccount || true)
			) {
				try {
					const allowance = selectedAccount
						? await planService.getEnhancedAllowance(selectedAccount)
						: await planService.getEnhancedAllowance();
					const prefs = await userService.getUserPreferences();
					const handling =
						(prefs as { negativeAllowanceHandling?: string }).negativeAllowanceHandling ??
						'allow_with_strong_warning';
					const negStatus = await negativeAllowanceService.checkNegativeAllowance(
						allowance,
						handling as 'block_with_warning' | 'allow_with_strong_warning' | 'borrow_from_future' | 'borrow_from_other_categories',
						selectedAccount || undefined
					);
					if (negStatus.shouldBlock) {
						pendingTransactionData = transactionData as Record<string, unknown>;
						pendingIsEdit = isEditMode;
						pendingTransactionId = transaction?.id ?? null;
						showAllowanceBlockDialog = true;
						isLoading = false;
						return;
					}
				} catch (_e) {
					// Allow submit if allowance check fails (e.g. no accounts)
				}
			}

			// Create or update transaction
			await doActualSubmit(
				transactionData as Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
				isEditMode,
				transaction?.id ?? null
			);
		} catch (err) {
			error =
				err instanceof Error
					? err.message
					: isEditMode
						? 'Failed to update transaction'
						: 'Failed to create transaction';
			console.error(err);
		} finally {
			isLoading = false;
		}
	}

	function formatDateForInput(dateString: string): string {
		if (!dateString) return '';
		// Convert UTC ISO string to local datetime-local format
		return dateUtils.toLocalDateTimeInput(dateString);
	}

	async function handleDelete() {
		if (!transaction) return;

		isDeleting = true;
		error = '';

		try {
			await transactionService.deleteTransaction(transaction.id);
			// Redirect to transactions list after successful deletion
			goto('/transactions');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete transaction';
			console.error(err);
			showDeleteDialog = false;
		} finally {
			isDeleting = false;
		}
	}
</script>

<svelte:head>
	<title>{pageTitle} - Budgic</title>
</svelte:head>

<PageLayout>
	{#snippet topBar()}
		<Header
			title={pageTitle}
			showBackButton={true}
			backButtonLink="/transactions"
			backButtonLabel="Back to transactions"
		/>
	{/snippet}

	<div class="mx-auto max-w-2xl px-4 py-6">
		<FormErrorAlert error={error || null} />

		<form id="transaction-form" onsubmit={handleSubmit} class="space-y-8">

			<!-- ── Amount (hero of the form) ── -->
			<div class="flex flex-col items-center gap-3 py-4">
				<h2 class="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Amount</h2>
				<div class="relative flex items-center gap-2">
					<button
						type="button"
						bind:this={currencyButtonRef}
						onclick={() => (showCurrencySheet = true)}
						class="flex items-center gap-1 rounded-lg px-2 py-1 transition-colors hover:bg-[var(--color-bg-surface)]"
						aria-label="Change currency"
					>
						<span class="currency-symbol font-display text-2xl text-[var(--color-text-secondary)]">{currencySymbol()}</span>
						<ChevronDown class="size-3.5 text-[var(--color-text-tertiary)]" />
					</button>
					<input
						id="amount"
						type="number"
						bind:value={amount}
						placeholder="0.00"
						step={(() => {
							const info = currentCurrencyInfo();
							if (!info) return '0.01';
							const decimals = info.decimalPlaces;
							if (decimals === 0) return '1';
							if (decimals === 1) return '0.1';
							if (decimals === 2) return '0.01';
							return `0.${'0'.repeat(decimals - 1)}1`;
						})()}
						required
						onfocus={handleInputFocus}
						class="w-48 border-0 border-b-2 border-[var(--color-amber)] bg-transparent text-center font-display text-4xl text-[var(--color-hero-number)] outline-none placeholder:text-[var(--color-text-disabled)] focus:border-[var(--color-amber)]"
					/>
				</div>
			</div>

			<!-- ── Type & status ── -->
			<div class="space-y-5">
				<h2 class="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Type</h2>
				<ToggleGroup.Root
					type="single"
					size="sm"
					variant="outline"
					bind:value={transactionType}
					class="w-full"
				>
					<ToggleGroup.Item value="expense" aria-label="Expense" class="flex-1">Expense</ToggleGroup.Item>
					<ToggleGroup.Item value="income" aria-label="Income" class="flex-1">Income</ToggleGroup.Item>
					<ToggleGroup.Item value="transfer" aria-label="Transfer" class="flex-1">Transfer</ToggleGroup.Item>
					<ToggleGroup.Item value="adjustment" aria-label="Adjustment" class="flex-1">Adjustment</ToggleGroup.Item>
				</ToggleGroup.Root>

				<ToggleGroup.Root
					type="single"
					size="sm"
					variant="outline"
					bind:value={status}
					class="w-full"
				>
					<ToggleGroup.Item value="cleared" aria-label="Cleared" class="flex-1">Cleared</ToggleGroup.Item>
					<ToggleGroup.Item value="planned" aria-label="Planned" class="flex-1">Planned</ToggleGroup.Item>
					<ToggleGroup.Item value="pending" aria-label="Pending" class="flex-1">Pending</ToggleGroup.Item>
				</ToggleGroup.Root>
			</div>

			<!-- ── Details ── -->
			<div class="space-y-4">
				<h2 class="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Details</h2>

				<div class="space-y-2">
					<Label.Root for="description">Description *</Label.Root>
					<Input.Root
						id="description"
						bind:value={description}
						placeholder="e.g., Grocery shopping, Salary deposit"
						required
						onfocus={handleInputFocus}
					/>
				</div>

				<div class="space-y-2">
					<Label.Root for="account">
						Account {status === 'planned' && transactionType !== 'transfer' ? '' : '*'}
					</Label.Root>
					<Select.Root
						type="single"
						bind:value={selectedAccount}
						required={status !== 'planned' || transactionType === 'transfer'}
					>
						<Select.Trigger class="w-full">
							{selectedAccount
								? accounts.find((a) => a.id === selectedAccount)?.name
								: status === 'planned' && transactionType !== 'transfer'
									? 'Select an account (optional)'
									: 'Select an account'}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="">
								{status === 'planned' && transactionType !== 'transfer' ? 'No account (optional)' : 'Select an account'}
							</Select.Item>
							{#each accounts as account}
								<Select.Item value={account.id}>
									{account.name} (${account.currentBalance.toFixed(2)})
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>

				<div class="space-y-2">
					<Label.Root for="transactionDate">{dateLabel()}</Label.Root>
					{#if status === 'cleared'}
						<Input.Root id="transactionDate" type="datetime-local" bind:value={clearedDate} required onfocus={handleInputFocus} />
					{:else if status === 'planned'}
						<Input.Root id="transactionDate" type="datetime-local" bind:value={plannedDate} required onfocus={handleInputFocus} />
					{:else}
						<Input.Root id="transactionDate" type="datetime-local" bind:value={clearedDate} onfocus={handleInputFocus} />
					{/if}
				</div>

				{#if status === 'planned' || status === 'cleared'}
					<div class="flex items-center justify-between rounded-xl bg-[var(--color-bg-tertiary)] px-4 py-3">
						<div>
							<p class="text-sm font-medium">Recurring</p>
							{#if isRecurring}
								<p class="text-xs text-[var(--color-text-tertiary)] mt-0.5">Set frequency below</p>
							{/if}
						</div>
						<Switch.Root bind:checked={isRecurring} />
					</div>
					{#if isRecurring}
						<Select.Root type="single" bind:value={recurrenceRule}>
							<Select.Trigger class="w-full">
								{recurrenceRule || 'Select frequency'}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="daily">Daily</Select.Item>
								<Select.Item value="weekly">Weekly</Select.Item>
								<Select.Item value="biweekly">Bi-weekly</Select.Item>
								<Select.Item value="monthly">Monthly</Select.Item>
								<Select.Item value="quarterly">Quarterly</Select.Item>
								<Select.Item value="yearly">Yearly</Select.Item>
							</Select.Content>
						</Select.Root>
					{/if}
				{/if}
			</div>

			<!-- ── Category ── -->
			<div class="space-y-4">
				<h2 class="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Category</h2>

				<div class="space-y-2">
					<Label.Root for="category">Category</Label.Root>
					<Select.Root type="single" bind:value={selectedCategory}>
						<Select.Trigger class="w-full">
							{selectedCategory
								? categories.find((c) => c.id === selectedCategory)?.name
								: 'Select a category (optional)'}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="">Select a category (optional)</Select.Item>
							{#each categories as category}
								<Select.Item value={category.id} style="color: {category.color}">
									{category.name}
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>

				{#if transactionType === 'expense' && !selectedCategory}
					<div class="flex items-center gap-3 rounded-xl border border-[var(--color-amber)]/20 bg-[var(--color-amber-subtle)] px-4 py-3">
						<Tag class="size-4 shrink-0 text-[var(--color-amber)]" />
						<p class="text-sm text-[var(--color-text-secondary)]">
							This expense will be assigned to "Uncategorized". Add a category for better tracking.
						</p>
					</div>
				{/if}

				{#if transactionType === 'transfer'}
					<div class="space-y-2">
						<Label.Root for="toAccount">Destination account *</Label.Root>
						<Select.Root type="single" bind:value={toAccountId} required>
							<Select.Trigger class="w-full">
								{toAccountId ? accounts.find((a) => a.id === toAccountId)?.name : 'Select destination account'}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="">Select destination account</Select.Item>
								{#each accounts as account}
									<Select.Item value={account.id}>{account.name} (${account.currentBalance.toFixed(2)})</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>

					{#if hasTransferFee}
						<div class="space-y-2">
							<div class="flex items-center justify-between">
								<Label.Root for="feeAmount">Transfer fee</Label.Root>
								<button type="button" onclick={() => (hasTransferFee = false)} class="text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]">
									Remove
								</button>
							</div>
							<div class="grid grid-cols-1 gap-2 md:grid-cols-3">
								<div class="relative">
									<span class="absolute top-1/2 left-3 -translate-y-1/2 text-sm text-[var(--color-text-tertiary)]">{currencySymbol()}</span>
									<Input.Root id="feeAmount" type="number" bind:value={transferFeeAmount} placeholder="0.00" step={(() => { const info = currentCurrencyInfo(); if (!info) return '0.01'; const d = info.decimalPlaces; if (d === 0) return '1'; if (d === 1) return '0.1'; if (d === 2) return '0.01'; return `0.${'0'.repeat(d - 1)}1`; })()} class="pl-8" min="0" onfocus={handleInputFocus} />
								</div>
								<Select.Root type="single" bind:value={transferFeeAccountId}>
									<Select.Trigger class="text-sm">{transferFeeAccountId ? accounts.find((a) => a.id === transferFeeAccountId)?.name : 'Account'}</Select.Trigger>
									<Select.Content>
										<Select.Item value="">Source account</Select.Item>
										{#each accounts as account}<Select.Item value={account.id}>{account.name}</Select.Item>{/each}
									</Select.Content>
								</Select.Root>
								<Select.Root type="single" bind:value={transferFeeCategoryId}>
									<Select.Trigger class="text-sm">{transferFeeCategoryId ? categories.find((c) => c.id === transferFeeCategoryId)?.name : 'Category'}</Select.Trigger>
									<Select.Content>
										<Select.Item value="">Default</Select.Item>
										{#each categories as category}<Select.Item value={category.id}>{category.name}</Select.Item>{/each}
									</Select.Content>
								</Select.Root>
							</div>
						</div>
					{:else}
						<button type="button" onclick={() => (hasTransferFee = true)} class="text-sm text-[var(--color-text-tertiary)] hover:text-[var(--color-amber)] transition-colors">
							+ Add transfer fee
						</button>
					{/if}
				{/if}
			</div>

			<!-- ── Advanced ── -->
			<AdvancedOptionsSection>
				<Label.Root for="group" class="text-right md:flex-shrink-0">Group</Label.Root>
				<div class="flex-1 space-y-2">
					<div class="flex items-center space-x-2">
						<Switch.Root bind:checked={isGroupTransaction} />
						<Label.Root for="group" class="font-normal">Grouped transaction</Label.Root>
					</div>
					{#if isGroupTransaction}
						<Input.Root id="groupName" bind:value={groupName} placeholder="Group name" required onfocus={handleInputFocus} />
					{/if}
				</div>

				<Label.Root for="reference" class="md:w-40 md:flex-shrink-0 md:text-right">Reference</Label.Root>
				<Input.Root id="reference" bind:value={reference} placeholder="e.g., Check #1234, Invoice #ABC123" onfocus={handleInputFocus} />

				<Label.Root for="notes" class="md:w-40 md:flex-shrink-0 md:pt-2 md:text-right">Notes</Label.Root>
				<textarea
					id="notes"
					bind:value={notes}
					placeholder="Additional notes..."
					rows="3"
					class="border-input bg-background text-primary focus:ring-ring w-full resize-none rounded-md border px-3 py-2 focus:border-transparent focus:ring-2"
					onfocus={handleInputFocus}
				></textarea>

				<LabelWithTooltip for="priority" tooltip="Priority helps the optimization system understand transaction importance. Higher numbers = more important.">
					Priority
				</LabelWithTooltip>
				<Select.Root type="single" value={priorityString} onValueChange={(value) => { if (value && value !== '') { const numValue = parseInt(value, 10); if (!isNaN(numValue)) { priority = numValue; priorityString = value; } } else { priority = undefined; priorityString = ''; } }}>
					<Select.Trigger class="w-full">{priority ? `${priority} - ${PRIORITY_LEVELS.find((p) => p.value === priority)?.name || 'Unknown'}` : 'Select priority'}</Select.Trigger>
					<Select.Content>
						<Select.Item value="">No priority</Select.Item>
						{#each PRIORITY_LEVELS as level}<Select.Item value={level.value.toString()}>{level.value} - {level.name}</Select.Item>{/each}
					</Select.Content>
				</Select.Root>

				<LabelWithTooltip for="directionalConstraint" tooltip="Controls how the transaction date can be moved during optimization. Leave empty for full flexibility.">
					Directional constraint
				</LabelWithTooltip>
				<Select.Root type="single" value={directionalConstraint || 'none'} onValueChange={(value) => { directionalConstraint = value === 'none' || value === '' ? undefined : (value as DirectionalConstraint); }}>
					<Select.Trigger class="w-full">{directionalConstraint && directionalConstraint !== 'none' ? DIRECTIONAL_CONSTRAINTS.find((c) => c.value === directionalConstraint)?.name : 'Select constraint'}</Select.Trigger>
					<Select.Content>
						<Select.Item value="none">No constraint</Select.Item>
						{#each DIRECTIONAL_CONSTRAINTS.filter((c) => c.value !== 'none') as constraint}<Select.Item value={constraint.value}>{constraint.icon} {constraint.name}</Select.Item>{/each}
					</Select.Content>
				</Select.Root>

				<LabelWithTooltip for="flexibilityTier" tooltip="Defines how many days the transaction date can be moved during optimization. Works together with directional constraints.">
					Flexibility tier
				</LabelWithTooltip>
				<Select.Root type="single" value={flexibilityTier || ''} onValueChange={(value) => { flexibilityTier = value === '' || !value ? undefined : (value as FlexibilityTier); }}>
					<Select.Trigger class="w-full">{flexibilityTier ? FLEXIBILITY_TIERS.find((t) => t.value === flexibilityTier)?.name : 'Select flexibility tier'}</Select.Trigger>
					<Select.Content>
						<Select.Item value="">No tier</Select.Item>
						{#each FLEXIBILITY_TIERS as tier}<Select.Item value={tier.value}>{tier.icon} {tier.name} ({tier.daysRange})</Select.Item>{/each}
					</Select.Content>
				</Select.Root>
			</AdvancedOptionsSection>
		</form>

		<!-- Dependency Tracking (only in edit mode) -->
		{#if transaction?.id}
			<section class="mt-8 space-y-6">
				<DependencyManager
					transactionId={transaction.id}
					onDependenciesChange={() => { console.log('Dependencies updated'); }}
				/>
				<DependencyGraphVisualization transactionId={transaction.id} />
			</section>
		{/if}
	</div>

	{#snippet bottomBar()}
		<div class="mx-auto flex max-w-2xl items-center justify-between bg-[var(--color-bg-secondary)]/90 backdrop-blur-sm px-4">
			{#if isEditMode}
				<Button.Root type="button" variant="destructive" onclick={() => (showDeleteDialog = true)} disabled={isLoading || isDeleting} class="flex items-center gap-2">
					<Trash2 size={16} />
					Delete
				</Button.Root>
			{:else}
				<div></div>
			{/if}
			<div class="flex gap-3">
				<Button.Root type="button" variant="ghost" onclick={() => goto('/transactions')} disabled={isLoading || isDeleting}>
					Cancel
				</Button.Root>
				<Button.Root type="submit" form="transaction-form" disabled={isLoading || isDeleting}>
					{isLoading ? 'Saving…' : submitButtonText}
				</Button.Root>
			</div>
		</div>
	{/snippet}

	<!-- Delete Confirmation Dialog -->
	<Dialog.Root bind:open={showDeleteDialog}>
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>Delete Transaction</Dialog.Title>
				<Dialog.Description>
					Are you sure you want to delete this transaction? This action cannot be undone.
					{#if transaction}
						<br />
						<br />
						<strong>Transaction:</strong>
						{transaction.description || 'Untitled'}
						{#if transaction.amount !== undefined}
							<br />
							<strong>Amount:</strong> ${Math.abs(transaction.amount).toFixed(2)}
						{/if}
					{/if}
				</Dialog.Description>
			</Dialog.Header>
			<Dialog.Footer class="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
				<Button.Root
					variant="outline"
					onclick={() => (showDeleteDialog = false)}
					disabled={isDeleting}
				>
					Cancel
				</Button.Root>
				<Button.Root
					variant="destructive"
					onclick={handleDelete}
					disabled={isDeleting}
					class="flex items-center gap-2"
				>
					{#if isDeleting}
						<span>Deleting...</span>
					{:else}
						<Trash2 size={16} />
						<span>Delete Transaction</span>
					{/if}
				</Button.Root>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>

	<!-- Over allowance – block with warning confirmation -->
	<Dialog.Root bind:open={showAllowanceBlockDialog}>
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>Over spending allowance</Dialog.Title>
				<Dialog.Description>
					You're over your spending allowance for this period. Do you want to proceed and record this transaction anyway?
				</Dialog.Description>
			</Dialog.Header>
			<Dialog.Footer class="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
				<Button.Root
					variant="outline"
					onclick={() => {
						showAllowanceBlockDialog = false;
						pendingTransactionData = null;
						pendingTransactionId = null;
					}}
					disabled={isLoading}
				>
					Cancel
				</Button.Root>
				<Button.Root
					variant="default"
					disabled={isLoading || !pendingTransactionData}
					onclick={async () => {
						if (!pendingTransactionData) return;
						isLoading = true;
						error = '';
						try {
							await doActualSubmit(
								pendingTransactionData as Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
								pendingIsEdit,
								pendingTransactionId
							);
							showAllowanceBlockDialog = false;
							pendingTransactionData = null;
							pendingTransactionId = null;
						} catch (err) {
							error = err instanceof Error ? err.message : 'Failed to save transaction';
						} finally {
							isLoading = false;
						}
					}}
				>
					{isLoading ? 'Saving...' : 'Proceed anyway'}
				</Button.Root>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>

	<!-- Currency Selection Sheet -->
	<Sheet.Root bind:open={showCurrencySheet}>
		<Sheet.Content side="bottom" class="mx-auto sm:max-w-md">
			<Sheet.Header>
				<Sheet.Title>Select Currency</Sheet.Title>
				<Sheet.Description>Choose the currency for this transaction</Sheet.Description>
			</Sheet.Header>
			<div class="max-h-[60vh] overflow-y-auto py-4">
				<div class="space-y-1">
					{#each currencies as curr}
						<button
							type="button"
							onclick={() => {
								currency = curr.code;
								showCurrencySheet = false;
							}}
							class="hover:bg-secondary flex w-full items-center justify-between rounded-md px-4 py-3 text-left transition-colors {currency ===
							curr.code
								? 'bg-secondary border-primary border'
								: ''}"
						>
							<div class="flex items-center gap-3">
								<span class="text-lg font-medium">{curr.symbol}</span>
								<div class="flex flex-col">
									<span class="text-primary text-sm font-medium">{curr.name}</span>
									<span class="text-muted-foreground text-xs">{curr.code}</span>
								</div>
							</div>
							{#if currency === curr.code}
								<div class="bg-primary h-2 w-2 rounded-full"></div>
							{/if}
						</button>
					{/each}
				</div>
			</div>
		</Sheet.Content>
	</Sheet.Root>
</PageLayout>
