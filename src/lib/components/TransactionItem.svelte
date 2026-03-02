<script lang="ts">
	import { RefreshCcw, Split, ChevronDown, Tag } from '@lucide/svelte';
	import type { Transaction, Category } from '$lib/core/db';
	import { longpress } from '$lib/actions/longpress';
	import { formatTransactionAmount, formatTransferAmount } from '$lib/utils/currency-utils';
	import { db } from '$lib/core/db';
	import { getPriorityName, getPriorityColor } from '$lib/utils/priority-utils';
	import { isUncategorizedCategory } from '$lib/utils/category-utils';
	import { dateUtils } from '$lib/utils/date-utils';
	import { getWaterfallTierStyle, getWaterfallTierBorder, getWaterfallTierLabel } from '$lib/utils/waterfall-tier-utils';

	interface Props {
		transaction: Transaction | any; // Allow grouped transaction objects
		onClick?: (transaction: Transaction | any) => void;
		onLongPress?: (transaction: Transaction | any) => void;
		isSelected?: boolean;
		context?: 'main' | 'transactions' | 'plan';
		showDate?: boolean;
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
		isSelected = false,
		context = 'main',
		showDate = true,
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
			return 'Transfer';
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
	let isExpanded = $state(defaultExpanded);
	
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
						transferAccountNames = `${fromAccount.name} → ${toAccount.name}`;
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
			if (transaction.categoryId && (transaction.type === 'expense' || transaction.type === 'income')) {
				db.categories.get(transaction.categoryId).then(cat => {
					category = cat || null;
				}).catch(() => {
					category = null;
				});
			}
			
			// Load account
			if (transaction.accountId) {
				db.accounts.get(transaction.accountId).then(acc => {
					account = acc || null;
				}).catch(() => {
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
			db.categories.where('name').equals(groupCategory).first().then(cat => {
				groupCategoryObj = cat || null;
			}).catch(() => {
				groupCategoryObj = null;
			});
		}
	});
	
	const getGroupCategoryBorder = () => {
		return getCategoryBorder(groupCategoryObj);
	};

	// Calculate the actual balance impact of the transaction
	const calculateTransactionImpact = (transaction: Transaction): number => {
		const amount = isGroup ? displayAmount() : (transaction.amount || 0);
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
	let buttonElement = $state<HTMLButtonElement | undefined>(undefined);
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;

	// Grouped/split transaction collapsible state (already declared above at line 185)

	const handleLongPressStart = () => {
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
	};

	const handleLongPress = () => {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
		isLongPressing = false;
		onLongPress(transaction);
	};

	const handleClick = () => {
		// Cancel any pending longpress visual feedback
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
		isLongPressing = false;
		onClick(transaction);
	};

	// Add event listener for longpress event
	$effect(() => {
		if (buttonElement) {
			const handleLongPressEvent = () => {
				handleLongPress();
			};
			
			buttonElement.addEventListener('longpress', handleLongPressEvent);
			
			return () => {
				buttonElement?.removeEventListener('longpress', handleLongPressEvent);
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
			return 'ring-2 ring-golden-amber ring-offset-2 ring-offset-bg-primary bg-golden-amber/10';
		}
		return '';
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
		let tier: 'survival' | 'security' | 'growth' | 'lifestyle' | null | undefined = null;
		
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

<div class="relative group">
	{#if isTransfer()}
		<!-- Transfer Display -->
		<div 
			class="relative overflow-hidden rounded-xl transition-all duration-200 ease-out
				   {cardStyling()} {statusInfo().mainBorderClass} {statusInfo().leftBorderClass} {statusInfo().bgClass} {statusInfo().shadowClass} {statusInfo().animateClass} {selectionClass()}
				   hover:shadow-xl hover:shadow-bg-primary/30
				   hover:scale-[1.008] hover:-translate-y-[0.5]
				   {isLongPressing ? 'scale-[0.98] shadow-inner' : ''}
				   group-hover:border-golden-amber/50"
		>
			<!-- Subtle gradient overlay for depth -->
			<div class="absolute inset-0 bg-gradient-to-br from-warm-ivory/[0.02] to-transparent pointer-events-none"></div>
			
			<!-- Transfer content -->
			<button
				class="w-full text-left relative z-10 {layoutClass()}
					focus:outline-none focus:ring-2 focus:ring-info focus:ring-offset-2 focus:ring-offset-bg-primary
					transition-all duration-200
					touch-manipulation cursor-pointer"
				style="touch-action: manipulation; -webkit-tap-highlight-color: transparent;"
				onclick={handleClick}
				use:longpress={{ 
					duration: 500,
					onStart: handleLongPressStart,
					onCancel: handleLongPressCancel
				}}
				bind:this={buttonElement}
				aria-label={`${ariaLabel()}, click to view details`}
			>
				<div class="flex items-center gap-2">
					<!-- Left Border Area: Time Display (Fixed Width) -->
					<div class="flex-shrink-0 flex items-center justify-center w-[10px] min-h-[3rem]">
						{#if displayTime()}
							<div class="text-xs font-medium text-text-secondary transform -rotate-90 whitespace-nowrap">
								{displayTime()}
							</div>
						{/if}
					</div>
					
					<!-- Middle Column: Transfer Details (Flexible, Truncates) -->
					<div class="flex-1 min-w-0">
						<div class="font-semibold text-text-primary text-base truncate">
							Transfer
						</div>
						<div class="text-sm text-text-tertiary truncate">
							{transferAccountNames}
						</div>
					</div>
					
					<!-- Right Column: Amount + Fee (Flexible) -->
					<div class="flex-shrink-0 text-right flex flex-col items-end">
					<!-- Transfer amount -->
					<div class="text-amount text-[var(--color-info)]">
						{formatTransferAmount(displayAmount(), displayCurrency())}
					</div>
						
						<!-- Fee badge -->
						{#if transferDetails()?.feeAmount && transferDetails()!.feeAmount > 0}
							<div class="text-xs text-text-tertiary font-medium mt-0.5">
								Fee: {formatTransactionAmount(transferDetails()!.feeAmount, displayCurrency(), true)}
							</div>
						{/if}
					</div>
				</div>
			</button>
		</div>
	{:else if isGroup}
		<!-- Grouped Transaction with Double Border -->
		<div 
			class="relative overflow-hidden rounded-xl transition-all duration-200 ease-out
				   {cardStyling()} {statusInfo().mainBorderClass} {statusInfo().leftBorderClass} {statusInfo().bgClass} {statusInfo().shadowClass} {statusInfo().animateClass} {selectionClass()}
				   hover:shadow-xl hover:shadow-bg-primary/30
				   hover:scale-[1.008] hover:-translate-y-[0.5]
				   {isLongPressing ? 'scale-[0.98] shadow-inner' : ''}
				   group-hover:border-golden-amber/50"
		>
			<!-- Double border effect for grouped transactions -->
			<div class="absolute inset-0 rounded-xl {statusInfo().mainBorderClass} {statusInfo().leftBorderClass} pointer-events-none" style="margin: 2px;"></div>
			
			<!-- Subtle gradient overlay for depth -->
			<div class="absolute inset-0 bg-gradient-to-br from-warm-ivory/[0.02] to-transparent pointer-events-none"></div>
			
			<!-- Grouped transaction content with two clickable areas -->
			<div class="flex relative z-10">
				<!-- Main content area - clickable to open transaction -->
				<button
					class="flex-1 text-left relative z-10 {layoutClass()}
						focus:outline-none focus:ring-2 focus:ring-info focus:ring-offset-2 focus:ring-offset-bg-primary
						transition-all duration-200
						touch-manipulation cursor-pointer
						hover:bg-bg-tertiary/20"
					style="touch-action: manipulation; -webkit-tap-highlight-color: transparent;"
					onclick={handleClick}
					use:longpress={{ 
						duration: 500,
						onStart: handleLongPressStart,
						onCancel: handleLongPressCancel
					}}
					bind:this={buttonElement}
					aria-label={`${ariaLabel()}, click to view details`}
				>
					<div class="flex items-center gap-2">
						<!-- Left Border Area: Time Display (Fixed Width) -->
						<div class="flex-shrink-0 flex items-center justify-center w-[10px] min-h-[3rem]">
							{#if displayTime()}
								<div class="text-xs font-medium text-text-secondary transform -rotate-90 whitespace-nowrap">
									{displayTime()}
								</div>
							{/if}
						</div>
						
						<!-- Middle Column: Grouped Transaction Info (Flexible, Truncates) -->
						<div class="flex-1 min-w-0">
							<div class="font-semibold text-text-primary text-base truncate">{transactionDescription() || 'Grouped transaction'}</div>
							<div class="text-sm text-text-tertiary truncate">
								<span>{accountName()}</span>
								<span class="mx-1">-</span>
								<span class="{categoryTextColor()} font-medium">
									{primaryTag()}
								</span>
							</div>
							<div class="text-xs text-text-tertiary">
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
				<div class="w-px bg-border/30"></div>
				
				<!-- Expand/collapse button area - full height -->
				<button
					class="flex-shrink-0 px-3 py-2 flex items-center justify-center
						focus:outline-none focus:ring-2 focus:ring-info focus:ring-offset-2 focus:ring-offset-bg-primary
						transition-all duration-200
						touch-manipulation cursor-pointer
						hover:bg-bg-tertiary/30 active:bg-bg-tertiary/50"
					style="touch-action: manipulation; -webkit-tap-highlight-color: transparent;"
					onclick={toggleExpansion}
					aria-label={isExpanded ? 'Collapse group details' : 'Expand group details'}
					aria-expanded={isExpanded}
					aria-controls="group-transactions-{transaction.id}"
				>
					<ChevronDown 
						class="w-5 h-5 text-text-secondary transition-transform duration-200 {isExpanded ? 'rotate-180' : ''}"
					>
					</ChevronDown>
				</button>
			</div>
			
			<!-- Individual grouped transactions -->
			{#if isExpanded}
				<div id="group-transactions-{transaction.id}" class="px-4 pb-4 space-y-2" role="region" aria-label="Grouped transaction details">
					{#each groupTransactions as groupTransaction}
						{@const groupCategory = groupTransactionCategories.get(groupTransaction.id) || null}
						<div class="bg-bg-tertiary/50 rounded-lg p-3 border border-bg-surface {getCategoryBorder(groupCategory)}">
							<div class="flex items-center justify-between">
								<div class="min-w-0 flex-1">
									<div class="text-sm font-medium text-text-primary">
										{groupTransaction.description || 'No description'}
									</div>
									{#if groupCategory}
										<div class="text-xs text-text-secondary truncate mt-1">
											{groupCategory.name} • {getWaterfallTierLabel(groupCategory.waterfallTier)}
										</div>
									{:else if groupTransaction.categoryId}
										<div class="text-xs text-text-tertiary truncate mt-1">
											Loading category...
										</div>
									{/if}
								</div>
								<div class="text-right ml-3">
									<div class="text-amount {groupTransaction.type === 'income' ? 'text-[var(--color-sage-green)]' : 'text-foreground'}">
										{formatTransactionAmount(groupTransaction.amount, groupTransaction.currency, true)}
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
				   {cardStyling()} {statusInfo().mainBorderClass} {statusInfo().leftBorderClass} {statusInfo().bgClass} {statusInfo().shadowClass} {statusInfo().animateClass} {selectionClass()}
				   hover:shadow-xl hover:shadow-bg-primary/30
				   hover:scale-[1.008] hover:-translate-y-[0.5]
				   {isLongPressing ? 'scale-[0.98] shadow-inner' : ''}
				   group-hover:border-golden-amber/50"
		>
			<!-- Subtle gradient overlay for depth -->
			<div class="absolute inset-0 bg-gradient-to-br from-warm-ivory/[0.02] to-transparent pointer-events-none"></div>
			
			<!-- Main interactive button -->
			<button
				class="w-full text-left relative z-10 {layoutClass()}
					focus:outline-none focus:ring-2 focus:ring-info focus:ring-offset-2 focus:ring-offset-bg-primary
					transition-all duration-200
					touch-manipulation cursor-pointer"
				style="touch-action: manipulation; -webkit-tap-highlight-color: transparent;"
				onclick={handleClick}
				use:longpress={{ 
					duration: 500,
					onStart: handleLongPressStart,
					onCancel: handleLongPressCancel
				}}
				bind:this={buttonElement}
				aria-label={ariaLabel()}
			>
				<div class="flex items-center gap-2">
					<!-- Left Border Area: Time Display (Fixed Width) -->
					<div class="flex-shrink-0 flex items-center justify-center w-[10px] min-h-[3rem]">
						{#if displayTime()}
							<div class="text-xs font-medium text-text-secondary transform -rotate-90 whitespace-nowrap">
								{displayTime()}
							</div>
						{/if}
					</div>
					
					<!-- Middle Column: Content (Flexible, Truncates) -->
					<div class="flex-1 min-w-0">
						<!-- Description (first line) -->
						<div class="flex items-center space-x-2">
							<!-- Split indicator -->
							{#if transaction.groupId}
								<div class="flex-shrink-0 w-0.5 h-4 bg-golden-amber rounded-full" title="Split transaction"></div>
							{/if}
							
							<p class="font-semibold text-text-primary truncate text-base">
								{transactionDescription() || 'No description'}
							</p>

							<!-- Uncategorized indicator -->
							{#if isUncategorized()}
								<span 
									class="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-warning border border-warning/50" 
									title="This transaction needs to be categorized"
									aria-label="Uncategorized transaction"
								></span>
							{/if}
							
							<!-- Recurring indicator -->
							{#if transaction.recurrenceRule}
								<div class="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-info border border-info/50 animate-pulse" title="Recurring transaction"></div>
							{/if}
						</div>
						
						<!-- Account - Category (second line, muted with colored category) -->
						<div class="text-sm text-text-tertiary truncate mt-0.5">
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
							<div class="flex items-center space-x-1 mt-1">
								<span class="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-bg-tertiary text-text-secondary border border-bg-surface">
									{confidenceInfo()?.label}
								</span>
							</div>
						{/if}
					</div>
					
					<!-- Right Column: Amount + Fee (Flexible) -->
					<div class="flex-shrink-0 text-right flex flex-col items-end">
					<!-- Amount -->
					<div class="text-amount {amountInfo().class}">
						{amountInfo().text}
					</div>
						
						<!-- Fee badge (if applicable) -->
						{#if isTransfer() && transferDetails()?.feeAmount && transferDetails()!.feeAmount > 0}
							<div class="text-xs text-text-tertiary font-medium mt-0.5">
								Fee: {formatTransactionAmount(transferDetails()!.feeAmount, displayCurrency(), true)}
							</div>
						{/if}
					</div>
				</div>
			</button>
		</div>
	{/if}
	
	<!-- Enhanced long press hint -->
	{#if isLongPressing}
		<div class="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
			<div class="bg-bg-primary/90 backdrop-blur-sm text-text-primary 
						px-3 py-1.5 rounded-full text-xs font-medium border border-bg-surface
						shadow-lg animate-pulse">
				<span class="flex items-center space-x-1.5">
					<div class="w-1.5 h-1.5 bg-golden-amber rounded-full animate-ping"></div>
					<span>Release for options</span>
				</span>
			</div>
		</div>
	{/if}
	
	<!-- Hover effect overlay -->
	<div class="absolute inset-0 bg-gradient-to-br from-golden-amber/0 to-golden-amber/5 
				rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
</div>