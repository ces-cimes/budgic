<script lang="ts">
	import { RefreshCcw, Split, ChevronDown, Tag, Check } from '@lucide/svelte';
	import type { Transaction, Category } from '$lib/core/db';
	import { longpress } from '$lib/actions/longpress';
	import { formatTransactionAmount, formatTransferAmount } from '$lib/utils/currency-utils';
	import { db } from '$lib/core/db';
	import { getPriorityName, getPriorityColor } from '$lib/utils/priority-utils';
	import { isUncategorizedCategory } from '$lib/utils/category-utils';
	import { dateUtils } from '$lib/utils/date-utils';
	import {
		getWaterfallTierStyle,
		getWaterfallTierBorder,
		getWaterfallTierLabel
	} from '$lib/utils/waterfall-tier-utils';
	import { formatTransferLabel } from '$lib/utils/transfer-utils';

	interface Props {
		transaction: Transaction | any; // Allow grouped transaction objects
		onClick?: (transaction: Transaction | any) => void;
		onLongPress?: (transaction: Transaction | any) => void;
		enableLongPress?: boolean;
		isSelected?: boolean;
		context?: 'main' | 'transactions' | 'plan';
		showDate?: boolean;
		/** When the date group spans multiple calendar days, show a short date instead of time. */
		secondaryDateMode?: 'time' | 'calendar';
		// Grouped transaction props
		isGroup?: boolean;
		groupTransactions?: Transaction[];
		totalAmount?: number;
		groupDescription?: string;
		groupCategory?: string;
		groupCurrency?: string;
		defaultExpanded?: boolean;
	}

	let {
		transaction,
		onClick = () => {},
		onLongPress = () => {},
		enableLongPress = true,
		isSelected = false,
		context = 'main',
		showDate = true,
		secondaryDateMode = 'time',
		// Grouped transaction props
		isGroup = false,
		groupTransactions = [],
		totalAmount = 0,
		groupDescription = '',
		groupCategory = '',
		groupCurrency = 'USD',
		defaultExpanded = false
	}: Props = $props();

	// Extract time (HH:MM) from date string - timezone-safe
	const getTime = (dateString: string | undefined): string => {
		if (!dateString) return '';
		try {
			const date = new Date(dateString);
			const hours = date.getHours().toString().padStart(2, '0');
			const minutes = date.getMinutes().toString().padStart(2, '0');
			return `${hours}:${minutes}`;
		} catch {
			return '';
		}
	};

	// Get time for display (HH:MM format only)
	const displayTime = $derived(() => {
		if (transaction.status === 'planned') {
			return getTime(transaction.plannedDate);
		} else {
			return getTime(transaction.clearedDate);
		}
	});

	const displayLeftStripe = $derived(() => {
		if (secondaryDateMode === 'calendar') {
			const raw =
				transaction.status === 'planned' ? transaction.plannedDate : transaction.clearedDate;
			if (!raw) return '';
			try {
				return dateUtils.formatDate(raw, 'MMM d');
			} catch {
				return '';
			}
		}
		return displayTime();
	});

	// Determine if transaction is overdue
	const isOverdue = $derived(() => {
		if (transaction.status !== 'planned' || !transaction.plannedDate) return false;
		return new Date(transaction.plannedDate) < new Date();
	});

	// Get status border styling - asymmetric border system
	const statusInfo = $derived(() => {
		switch (transaction.status) {
			case 'planned':
				if (isOverdue()) {
					return {
						// Main border: dashed, left side wider and colored
						mainBorderClass: 'border-2 border-dashed border-alert',
						leftBorderClass: 'border-l-6 border-l-alert',
						bgClass: 'bg-alert/10',
						shadowClass: 'shadow-alert/20',
						animateClass: 'animate-pulse',
						borderStyle: 'border-dashed',
						borderColor: 'border-alert',
						urgency: 'high'
					};
				}
				return {
					mainBorderClass: 'border-2 border-dashed border-info',
					leftBorderClass: 'border-l-6 border-l-info',
					bgClass: 'bg-info/5',
					shadowClass: 'shadow-info/10',
					animateClass: '',
					borderStyle: 'border-dashed',
					borderColor: 'border-info',
					urgency: 'medium'
				};
			case 'pending':
				return {
					mainBorderClass: 'border-2 border-solid border-warning',
					leftBorderClass: 'border-l-8 border-l-warning',
					bgClass: 'bg-warning/5',
					shadowClass: 'shadow-warning/10',
					animateClass: '',
					borderStyle: 'border-solid',
					borderColor: 'border-warning',
					urgency: 'medium'
				};
			case 'cleared':
				return {
					mainBorderClass: 'border-2 border-solid border-sage-green',
					leftBorderClass: 'border-l-8 border-l-sage-green',
					bgClass: 'bg-sage-green/5',
					shadowClass: 'shadow-sage-green/10',
					animateClass: '',
					borderStyle: 'border-solid',
					borderColor: 'border-sage-green',
					urgency: 'low'
				};
			case 'cancelled':
				return {
					mainBorderClass: 'border-2 border-dotted border-text-disabled',
					leftBorderClass: 'border-l-6 border-l-text-disabled',
					bgClass: 'bg-text-disabled/5',
					shadowClass: 'shadow-text-disabled/10',
					animateClass: '',
					borderStyle: 'border-dotted',
					borderColor: 'border-text-disabled',
					urgency: 'low'
				};
			default:
				return {
					mainBorderClass: 'border-2 border-solid border-text-disabled',
					leftBorderClass: 'border-l-8 border-l-text-disabled',
					bgClass: 'bg-text-disabled/5',
					shadowClass: 'shadow-text-disabled/10',
					animateClass: '',
					borderStyle: 'border-solid',
					borderColor: 'border-text-disabled',
					urgency: 'low'
				};
		}
	});

	// Get transfer details for transfer transactions
	const transferDetails = $derived(() => {
		if (transaction.type === 'transfer' && transaction.transferDetails) {
			return transaction.transferDetails;
		}
		return null;
	});

	// Check if this is a transfer transaction
	const isTransfer = $derived(() => {
		return transaction.type === 'transfer' && transaction.transferDetails;
	});

	// Get transaction description
	const transactionDescription = $derived(() => {
		if (isTransfer()) {
			return transferAccountNames;
		}
		if (isGroup) {
			return groupDescription || 'Grouped transaction';
		}
		return transaction.description || '';
	});

	// Get amount for display
	const displayAmount = $derived(() => {
		if (isTransfer()) {
			return transferDetails()?.transferAmount || 0;
		}
		if (isGroup) {
			return totalAmount;
		}
		return transaction.amount || 0;
	});

	// Get currency for display
	const displayCurrency = $derived(() => {
		if (isTransfer()) {
			return transaction.currency;
		}
		if (isGroup) {
			return groupCurrency;
		}
		return transaction.currency;
	});

	// Get account names for transfer display
	let transferAccountNames = $state('Account Transfer');

	// State for grouped transaction expansion
	let isExpanded = $state(false);

	$effect.pre(() => {
		isExpanded = defaultExpanded;
	});

	// State for loaded categories in grouped transactions
	let groupTransactionCategories = $state<Map<string, Category | null>>(new Map());

	// Load categories for grouped transactions
	$effect(() => {
		if (isGroup && isExpanded && groupTransactions.length > 0) {
			groupTransactions.forEach(async (tx) => {
				if (tx.categoryId && !groupTransactionCategories.has(tx.id)) {
					try {
						const cat = await db.categories.get(tx.categoryId);
						groupTransactionCategories.set(tx.id, cat || null);
					} catch {
						groupTransactionCategories.set(tx.id, null);
					}
				} else if (!tx.categoryId) {
					groupTransactionCategories.set(tx.id, null);
				}
			});
		}
	});

	// Toggle expansion for grouped transactions
	function toggleExpansion() {
		if (isGroup) {
			isExpanded = !isExpanded;
		}
	}

	// Helper function to get category name from a transaction
	async function getCategoryName(transaction: any): Promise<string> {
		if (transaction.categoryId) {
			try {
				const category = await db.categories.get(transaction.categoryId);
				return category?.name || 'Uncategorized';
			} catch (error) {
				console.warn('Failed to load category:', error);
				return 'Uncategorized';
			}
		}
		return 'Uncategorized';
	}

	$effect(() => {
		if (isTransfer() && transferDetails()) {
			// Load account names asynchronously
			(async () => {
				try {
					const fromAccount = await db.accounts.get(transaction.accountId);
					const toAccount = await db.accounts.get(transferDetails()!.toAccountId);

					if (fromAccount && toAccount) {
						transferAccountNames = formatTransferLabel(transaction as Transaction, [
							fromAccount,
							toAccount
						]);
					}
				} catch (error) {
					console.warn('Failed to load account names for transfer:', error);
					transferAccountNames = 'Account Transfer';
				}
			})();
		}
	});

	// Check if transaction is uncategorized
	let category = $state<Category | null>(null);
	let account = $state<any>(null);

	let isUncategorized = $derived(() => {
		if (isTransfer() || transaction.type !== 'expense') return false;
		if (isGroup) {
			return groupCategory === 'Uncategorized' || !groupCategory;
		}
		if (!transaction.categoryId) return true;
		return category ? isUncategorizedCategory(category) : false;
	});

	// Load category and account for display
	$effect(() => {
		if (!isGroup) {
			// Load category
			if (
				transaction.categoryId &&
				(transaction.type === 'expense' || transaction.type === 'income')
			) {
				db.categories
					.get(transaction.categoryId)
					.then((cat) => {
						category = cat || null;
					})
					.catch(() => {
						category = null;
					});
			}

			// Load account
			if (transaction.accountId) {
				db.accounts
					.get(transaction.accountId)
					.then((acc) => {
						account = acc || null;
					})
					.catch(() => {
						account = null;
					});
			}
		}
	});

	// Get primary tag for display (category name, not UID)
	const primaryTag = $derived(() => {
		if (isTransfer()) {
			return 'Transfer';
		}
		if (isGroup) {
			return groupCategory || 'Uncategorized';
		}
		if (category) {
			return category.name || 'Uncategorized';
		}
		if (transaction.categoryId) {
			// Fallback to categoryId if category not loaded yet (will show UID temporarily)
			return transaction.categoryId;
		}
		return 'Uncategorized';
	});

	// Get waterfall tier border styling for category
	const getCategoryBorder = (category: Category | null | undefined) => {
		if (!category) {
			return getWaterfallTierBorder(null);
		}
		return getWaterfallTierBorder(category.waterfallTier);
	};

	// Get waterfall tier border styling for grouped transactions
	// For grouped transactions, we try to get the category from the groupCategory string
	let groupCategoryObj = $state<Category | null>(null);

	$effect(() => {
		if (isGroup && groupCategory) {
			// Try to find category by name
			db.categories
				.where('name')
				.equals(groupCategory)
				.first()
				.then((cat) => {
					groupCategoryObj = cat || null;
				})
				.catch(() => {
					groupCategoryObj = null;
				});
		}
	});

	const getGroupCategoryBorder = () => {
		return getCategoryBorder(groupCategoryObj);
	};

	// Calculate the actual balance impact of the transaction
	const calculateTransactionImpact = (transaction: Transaction): number => {
		const amount = isGroup ? displayAmount() : transaction.amount || 0;
		switch (transaction.type) {
			case 'income':
				return amount; // Positive adds, negative subtracts
			case 'expense':
				return -amount; // Positive subtracts, negative adds (like cashback)
			case 'transfer':
				return amount; // Net change
			case 'adjustment':
				return amount; // Direct modification
			default:
				return 0;
		}
	};

	// Format amount with proper styling — design system rules:
	// Income = sage green, Expense = foreground (NOT coral), Transfer = info
	/** Phase 8 — planned vs actual variance chip (>15% of |planned|). */
	const planVarianceChip = $derived(() => {
		if (isGroup) return null;
		const pa = transaction.plannedAmount;
		if (pa === undefined || pa === null) return null;
		const absPlanned = Math.abs(pa);
		if (absPlanned < 1e-9) return null;
		const amt = transaction.amount ?? 0;
		if (Math.abs(amt - pa) / absPlanned <= 0.15) return null;
		const diff = amt - pa;
		const formatted = formatTransactionAmount(diff, displayCurrency(), true);
		return formatted;
	});

	const amountInfo = $derived(() => {
		let textClass = '';

		if (transaction.type === 'income') {
			textClass = 'text-[var(--color-sage-green)]';
		} else if (transaction.type === 'expense') {
			textClass = 'text-foreground'; // expenses are normal, not alarming
		} else {
			// Transfer and adjustment: use info color (neutral movement)
			textClass = 'text-[var(--color-info)]';
		}

		// Soften planned transactions
		if (transaction.status === 'planned') {
			textClass += ' opacity-70';
		}

		// Format amount with correct sign based on transaction type
		const rawAmount = displayAmount();
		let amountForFormatting = rawAmount;

		if (transaction.type === 'expense') {
			amountForFormatting = -rawAmount;
		}

		const formattedAmount = formatTransactionAmount(amountForFormatting, displayCurrency(), true);

		return {
			text: formattedAmount,
			class: textClass,
			fontSize: '', // unused — amount class handles sizing
			isIncome: transaction.type === 'income'
		};
	});

	// Get confidence-based styling
	const confidenceInfo = $derived(() => {
		if (transaction.status !== 'planned' || !transaction.confidence) return null;

		switch (transaction.confidence) {
			case 'confirmed':
				return {
					color: 'bg-high-confidence',
					label: 'Confirmed',
					accent: 'bg-high-confidence-accent'
				};
			case 'expected':
				return {
					color: 'bg-medium-confidence',
					label: 'Expected',
					accent: 'bg-medium-confidence'
				};
			default:
				return {
					color: 'bg-text-tertiary',
					label: 'Tentative',
					accent: 'bg-text-tertiary'
				};
		}
	});

	// Long press visual feedback
	let isLongPressing = $state(false);
	let isLongPressReady = $state(false);
	let ignoreClicksUntilTs = 0;
	let buttonElement = $state<HTMLButtonElement | undefined>(undefined);
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;

	// Grouped/split transaction collapsible state (already declared above at line 185)

	const handleLongPressStart = () => {
		isLongPressReady = false;
		// Add a small delay before showing visual feedback to prevent accidental triggers
		longPressTimer = setTimeout(() => {
			isLongPressing = true;
		}, 300);
	};

	const handleLongPressCancel = () => {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
		isLongPressing = false;
		isLongPressReady = false;
	};

	const handleLongPress = () => {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
		isLongPressing = false;
		isLongPressReady = false;
		// Emulated touch can still emit a synthetic click after release.
		// Ignore a short window so release-select does not immediately toggle off.
		ignoreClicksUntilTs = Date.now() + 900;
		onLongPress(transaction);
	};

	const handleLongPressReady = () => {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
		// Keep the hold hint visible while waiting for release to confirm selection.
		isLongPressing = true;
		isLongPressReady = true;
	};

	const handleClick = () => {
		// Cancel any pending longpress visual feedback
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
		isLongPressing = false;
		isLongPressReady = false;
		if (Date.now() < ignoreClicksUntilTs) return;
		onClick(transaction);
	};

	// Add event listener for longpress event
	$effect(() => {
		if (buttonElement) {
			const handleLongPressEvent = () => {
				handleLongPress();
			};
			const handleLongPressReadyEvent = () => {
				handleLongPressReady();
			};

			buttonElement.addEventListener('longpress', handleLongPressEvent);
			buttonElement.addEventListener('longpressready', handleLongPressReadyEvent);

			return () => {
				buttonElement?.removeEventListener('longpress', handleLongPressEvent);
				buttonElement?.removeEventListener('longpressready', handleLongPressReadyEvent);
			};
		}
	});

	// Cleanup timers when component is destroyed
	$effect(() => {
		return () => {
			if (longPressTimer) {
				clearTimeout(longPressTimer);
				longPressTimer = null;
			}
		};
	});

	// Selection styling with Tailwind colors
	const selectionClass = $derived(() => {
		if (isSelected) {
			// Inset ring stays inside overflow-hidden cards (outline sits outside and gets clipped).
			return 'ring-2 ring-inset ring-zinc-900/85 bg-zinc-900/10 transition-all duration-100 dark:ring-white/90 dark:bg-white/10';
		}
		return 'transition-all duration-100';
	});

	// Context-specific layout adjustments
	const layoutClass = $derived(() => {
		switch (context) {
			case 'main':
				return 'py-3 px-4'; // More generous spacing for main page
			case 'transactions':
				return 'py-2 px-2'; // Compact for lists
			case 'plan':
				return 'py-4.5 px-5'; // Medium spacing for planning
			default:
				return 'py-3 px-4';
		}
	});

	// Context-specific styling enhancements
	const contextStyling = $derived(() => {
		switch (context) {
			case 'main':
				return 'shadow-lg shadow-bg-primary/15'; // More prominent for main page
			case 'transactions':
				return 'shadow-sm shadow-bg-primary/10'; // Subtle for lists
			case 'plan':
				return 'shadow-md shadow-bg-primary/12 border-l-2 border-l-info/30'; // Planning-focused
			default:
				return 'shadow-sm shadow-bg-primary/10';
		}
	});

	// Accessibility label
	const ariaLabel = $derived(() => {
		const amount = amountInfo().text;
		const status = transaction.status;
		const tag = primaryTag.toString().replace('_', ' ');
		return `${status} transaction: ${tag}, ${amount}`;
	});

	// Get waterfall tier text color for category display (using CSS variables like amount colors)
	const categoryTextColor = $derived(() => {
		let tier: 'survival' | 'security' | 'growth' | 'lifestyle' | 'unclassified' | null | undefined =
			null;

		if (isGroup && groupCategoryObj) {
			tier = groupCategoryObj.waterfallTier;
		} else if (!isGroup && category) {
			tier = category.waterfallTier;
		}

		// Use CSS variables like amount colors
		switch (tier) {
			case 'survival':
				return 'text-[var(--color-warm-coral)]';
			case 'security':
				return 'text-[var(--color-info)]';
			case 'growth':
				return 'text-[var(--color-sage-green)]';
			case 'lifestyle':
				return 'text-[var(--color-golden-amber)]';
			case 'unclassified':
				return 'text-text-tertiary';
			default:
				return 'text-text-tertiary';
		}
	});

	// Get account name for display
	const accountName = $derived(() => {
		if (isTransfer() && transferDetails()) {
			return transferAccountNames;
		}
		if (isGroup) {
			return 'Grouped';
		}
		return account?.name || 'Unknown Account';
	});

	// Dynamic card styling based on transaction type and status
	const cardStyling = $derived(() => {
		let baseClass = 'bg-bg-secondary backdrop-blur-sm';

		// Add subtle texture based on transaction type
		if (transaction.status === 'planned') {
			baseClass += ' bg-gradient-to-br from-bg-secondary to-bg-tertiary';
		}

		// Add context-specific styling
		baseClass += ` ${contextStyling()}`;

		return baseClass;
	});
</script>

<div class="group relative">
	{#if isTransfer()}
		<!-- Transfer Display -->
		<div
			class="relative overflow-hidden rounded-xl transition-all duration-200 ease-out
				   {cardStyling()} {statusInfo().mainBorderClass} {statusInfo().leftBorderClass} {statusInfo()
				.bgClass} {statusInfo().shadowClass} {statusInfo().animateClass} {selectionClass()}
				   hover:shadow-bg-primary/30 hover:-translate-y-[0.5]
				   hover:scale-[1.008] hover:shadow-xl
				   {isLongPressing ? 'scale-[0.98] shadow-inner' : ''}
				   group-hover:border-golden-amber/50"
		>
			<!-- Subtle gradient overlay for depth -->
			<div
				class="from-warm-ivory/[0.02] pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent"
			></div>

			<!-- Transfer content -->
			<button
				class="relative z-10 w-full text-left {layoutClass()}
					focus:ring-info focus:ring-offset-bg-primary cursor-pointer touch-manipulation transition-all
					duration-200 focus:ring-2
					focus:ring-offset-2 focus:outline-none"
				style="touch-action: manipulation; -webkit-tap-highlight-color: transparent;"
				onclick={handleClick}
				use:longpress={enableLongPress
					? {
							duration: 500,
							onStart: handleLongPressStart,
							onCancel: handleLongPressCancel
						}
					: undefined}
				bind:this={buttonElement}
				aria-label={`${ariaLabel()}, click to view details`}
			>
				<div class="flex items-center gap-2">
					<!-- Left Border Area: Time Display (Fixed Width) -->
					<div class="flex min-h-[3rem] w-[10px] flex-shrink-0 items-center justify-center">
						{#if displayLeftStripe()}
							<div
								class="text-text-secondary -rotate-90 transform text-xs font-medium whitespace-nowrap"
							>
								{displayLeftStripe()}
							</div>
						{/if}
					</div>

					<!-- Middle Column: Transfer Details (Flexible, Truncates) -->
					<div class="min-w-0 flex-1">
						<div class="text-text-primary truncate text-base font-semibold">
							{transferAccountNames}
						</div>
						{#if transaction.memo}
							<div class="text-text-tertiary truncate text-sm">{transaction.memo}</div>
						{/if}
					</div>

					<!-- Right Column: Amount + Fee (Flexible) -->
					<div class="flex flex-shrink-0 items-end gap-1.5 text-right">
						{#if transaction.reconciledAt}
							<Check
								class="text-muted-foreground mb-1 h-3.5 w-3.5 shrink-0 opacity-80"
								strokeWidth={2.5}
								aria-label="Reconciled"
							/>
						{/if}
						<div class="flex flex-col items-end">
							<!-- Transfer amount -->
							<div class="text-amount text-[var(--color-info)]">
								{formatTransferAmount(displayAmount(), displayCurrency())}
							</div>
							{#if planVarianceChip()}
								<span class="text-muted-foreground mt-0.5 text-xs">{planVarianceChip()}</span>
							{/if}

							<!-- Fee badge -->
							{#if transferDetails()?.feeAmount && transferDetails()!.feeAmount > 0}
								<div class="text-text-tertiary mt-0.5 text-xs font-medium">
									Fee: {formatTransactionAmount(
										transferDetails()!.feeAmount,
										displayCurrency(),
										true
									)}
								</div>
							{/if}
						</div>
					</div>
				</div>
			</button>
		</div>
	{:else if isGroup}
		<!-- Grouped Transaction with Double Border -->
		<div
			class="relative overflow-hidden rounded-xl transition-all duration-200 ease-out
				   {cardStyling()} {statusInfo().mainBorderClass} {statusInfo().leftBorderClass} {statusInfo()
				.bgClass} {statusInfo().shadowClass} {statusInfo().animateClass} {selectionClass()}
				   hover:shadow-bg-primary/30 hover:-translate-y-[0.5]
				   hover:scale-[1.008] hover:shadow-xl
				   {isLongPressing ? 'scale-[0.98] shadow-inner' : ''}
				   group-hover:border-golden-amber/50"
		>
			<!-- Double border effect for grouped transactions -->
			<div
				class="absolute inset-0 rounded-xl {statusInfo().mainBorderClass} {statusInfo()
					.leftBorderClass} pointer-events-none"
				style="margin: 2px;"
			></div>

			<!-- Subtle gradient overlay for depth -->
			<div
				class="from-warm-ivory/[0.02] pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent"
			></div>

			<!-- Grouped transaction content with two clickable areas -->
			<div class="relative z-10 flex">
				<!-- Main content area - clickable to open transaction -->
				<button
					class="relative z-10 flex-1 text-left {layoutClass()}
						focus:ring-info focus:ring-offset-bg-primary hover:bg-bg-tertiary/20 cursor-pointer touch-manipulation
						transition-all duration-200
						focus:ring-2 focus:ring-offset-2
						focus:outline-none"
					style="touch-action: manipulation; -webkit-tap-highlight-color: transparent;"
					onclick={handleClick}
					use:longpress={enableLongPress
						? {
								duration: 500,
								onStart: handleLongPressStart,
								onCancel: handleLongPressCancel
							}
						: undefined}
					bind:this={buttonElement}
					aria-label={`${ariaLabel()}, click to view details`}
				>
					<div class="flex items-center gap-2">
						<!-- Left Border Area: Time Display (Fixed Width) -->
						<div class="flex min-h-[3rem] w-[10px] flex-shrink-0 items-center justify-center">
							{#if displayLeftStripe()}
								<div
									class="text-text-secondary -rotate-90 transform text-xs font-medium whitespace-nowrap"
								>
									{displayLeftStripe()}
								</div>
							{/if}
						</div>

						<!-- Middle Column: Grouped Transaction Info (Flexible, Truncates) -->
						<div class="min-w-0 flex-1">
							<div class="text-text-primary truncate text-base font-semibold">
								{transactionDescription() || 'Grouped transaction'}
							</div>
							<div class="text-text-tertiary truncate text-sm">
								<span>{accountName()}</span>
								<span class="mx-1">-</span>
								<span class="{categoryTextColor()} font-medium">
									{primaryTag()}
								</span>
							</div>
							<div class="text-text-tertiary text-xs">
								({groupTransactions.length} parts)
							</div>
						</div>

						<!-- Right Column: Amount (Flexible) -->
						<div class="flex-shrink-0 text-right">
							<div class="text-amount {amountInfo().class}">
								{amountInfo().text}
							</div>
						</div>
					</div>
				</button>

				<!-- Separator -->
				<div class="bg-border/30 w-px"></div>

				<!-- Expand/collapse button area - full height -->
				<button
					class="focus:ring-info focus:ring-offset-bg-primary hover:bg-bg-tertiary/30 active:bg-bg-tertiary/50 flex flex-shrink-0
						cursor-pointer touch-manipulation items-center justify-center px-3
						py-2 transition-all
						duration-200 focus:ring-2
						focus:ring-offset-2 focus:outline-none"
					style="touch-action: manipulation; -webkit-tap-highlight-color: transparent;"
					onclick={toggleExpansion}
					aria-label={isExpanded ? 'Collapse group details' : 'Expand group details'}
					aria-expanded={isExpanded}
					aria-controls="group-transactions-{transaction.id}"
				>
					<ChevronDown
						class="text-text-secondary h-5 w-5 transition-transform duration-200 {isExpanded
							? 'rotate-180'
							: ''}"
					></ChevronDown>
				</button>
			</div>

			<!-- Individual grouped transactions -->
			{#if isExpanded}
				<div
					id="group-transactions-{transaction.id}"
					class="space-y-2 px-4 pb-4"
					role="region"
					aria-label="Grouped transaction details"
				>
					{#each groupTransactions as groupTransaction}
						{@const groupCategory = groupTransactionCategories.get(groupTransaction.id) || null}
						<div
							class="bg-bg-tertiary/50 border-bg-surface rounded-lg border p-3 {getCategoryBorder(
								groupCategory
							)}"
						>
							<div class="flex items-center justify-between">
								<div class="min-w-0 flex-1">
									<div class="text-text-primary text-sm font-medium">
										{groupTransaction.description || 'No description'}
									</div>
									{#if groupCategory}
										<div class="text-text-secondary mt-1 truncate text-xs">
											{groupCategory.name} • {getWaterfallTierLabel(groupCategory.waterfallTier)}
										</div>
									{:else if groupTransaction.categoryId}
										<div class="text-text-tertiary mt-1 truncate text-xs">Loading category...</div>
									{/if}
								</div>
								<div class="ml-3 text-right">
									<div
										class="text-amount {groupTransaction.type === 'income'
											? 'text-[var(--color-sage-green)]'
											: 'text-foreground'}"
									>
										{formatTransactionAmount(
											groupTransaction.amount,
											groupTransaction.currency,
											true
										)}
									</div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{:else}
		<!-- Single Transaction -->
		<div
			class="relative overflow-hidden rounded-xl transition-all duration-200 ease-out
				   {cardStyling()} {statusInfo().mainBorderClass} {statusInfo().leftBorderClass} {statusInfo()
				.bgClass} {statusInfo().shadowClass} {statusInfo().animateClass} {selectionClass()}
				   hover:shadow-bg-primary/30 hover:-translate-y-[0.5]
				   hover:scale-[1.008] hover:shadow-xl
				   {isLongPressing ? 'scale-[0.98] shadow-inner' : ''}
				   group-hover:border-golden-amber/50"
		>
			<!-- Subtle gradient overlay for depth -->
			<div
				class="from-warm-ivory/[0.02] pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent"
			></div>

			<!-- Main interactive button -->
			<button
				class="relative z-10 w-full text-left {layoutClass()}
					focus:ring-info focus:ring-offset-bg-primary cursor-pointer touch-manipulation transition-all
					duration-200 focus:ring-2
					focus:ring-offset-2 focus:outline-none"
				style="touch-action: manipulation; -webkit-tap-highlight-color: transparent;"
				onclick={handleClick}
				use:longpress={enableLongPress
					? {
							duration: 500,
							onStart: handleLongPressStart,
							onCancel: handleLongPressCancel
						}
					: undefined}
				bind:this={buttonElement}
				aria-label={ariaLabel()}
			>
				<div class="flex items-center gap-2">
					<!-- Left Border Area: Time Display (Fixed Width) -->
					<div class="flex min-h-[3rem] w-[10px] flex-shrink-0 items-center justify-center">
						{#if displayLeftStripe()}
							<div
								class="text-text-secondary -rotate-90 transform text-xs font-medium whitespace-nowrap"
							>
								{displayLeftStripe()}
							</div>
						{/if}
					</div>

					<!-- Middle Column: Content (Flexible, Truncates) -->
					<div class="min-w-0 flex-1">
						<!-- Description (first line) -->
						<div class="flex items-center space-x-2">
							<!-- Split indicator -->
							{#if transaction.groupId}
								<div
									class="bg-golden-amber h-4 w-0.5 flex-shrink-0 rounded-full"
									title="Split transaction"
								></div>
							{/if}

							<p class="text-text-primary truncate text-base font-semibold">
								{transactionDescription() || 'No description'}
							</p>

							<!-- Uncategorized indicator -->
							{#if isUncategorized()}
								<span
									class="bg-warning border-warning/50 h-1.5 w-1.5 flex-shrink-0 rounded-full border"
									title="This transaction needs to be categorized"
									aria-label="Uncategorized transaction"
								></span>
							{/if}

							<!-- Recurring indicator -->
							{#if transaction.recurrenceRule}
								<div
									class="bg-info border-info/50 h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full border"
									title="Recurring transaction"
								></div>
							{/if}
						</div>

						<!-- Account - Category (second line, muted with colored category) -->
						<div class="text-text-tertiary mt-0.5 truncate text-sm">
							<span>{accountName()}</span>
							{#if !isTransfer()}
								<span class="mx-1">-</span>
								<span class="{categoryTextColor()} font-medium">
									{primaryTag().toString().replace('_', ' ')}
								</span>
							{/if}
						</div>

						<!-- Confidence label for planned transactions -->
						{#if confidenceInfo()}
							<div class="mt-1 flex items-center space-x-1">
								<span
									class="bg-bg-tertiary text-text-secondary border-bg-surface inline-block rounded-full border px-2 py-0.5 text-xs font-medium"
								>
									{confidenceInfo()?.label}
								</span>
							</div>
						{/if}
					</div>

					<!-- Right Column: Amount + Fee (Flexible) -->
					<div class="flex flex-shrink-0 items-end gap-1.5 text-right">
						{#if transaction.reconciledAt}
							<Check
								class="text-muted-foreground mb-1 h-3.5 w-3.5 shrink-0 opacity-80"
								strokeWidth={2.5}
								aria-label="Reconciled"
							/>
						{/if}
						<div class="flex flex-col items-end">
							<!-- Amount -->
							<div class="text-amount {amountInfo().class}">
								{amountInfo().text}
							</div>
							{#if planVarianceChip()}
								<span class="text-muted-foreground mt-0.5 text-xs">{planVarianceChip()}</span>
							{/if}

							<!-- Fee badge (if applicable) -->
							{#if isTransfer() && transferDetails()?.feeAmount && transferDetails()!.feeAmount > 0}
								<div class="text-text-tertiary mt-0.5 text-xs font-medium">
									Fee: {formatTransactionAmount(
										transferDetails()!.feeAmount,
										displayCurrency(),
										true
									)}
								</div>
							{/if}
						</div>
					</div>
				</div>
			</button>
		</div>
	{/if}

	<!-- Enhanced long press hint -->
	{#if isLongPressing}
		<div class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
			<div
				class="bg-bg-primary/90 text-text-primary border-bg-surface
						animate-pulse rounded-full border px-3 py-1.5 text-xs font-medium
						shadow-lg backdrop-blur-sm"
			>
				<span class="flex items-center space-x-1.5">
					<div class="bg-golden-amber h-1.5 w-1.5 animate-ping rounded-full"></div>
					<span>{isLongPressReady ? 'Release to select' : 'Hold to select'}</span>
				</span>
			</div>
		</div>
	{/if}

	<!-- Hover effect overlay -->
	<div
		class="from-golden-amber/0 to-golden-amber/5 pointer-events-none absolute inset-0
				rounded-xl bg-gradient-to-br opacity-0 transition-opacity duration-300 group-hover:opacity-100"
	></div>
</div>
