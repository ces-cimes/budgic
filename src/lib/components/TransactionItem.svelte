<script lang="ts">
	import { RefreshCcw, Clock, CheckCircle, AlertCircle, XCircle, Split, ChevronDown, Tag } from '@lucide/svelte';
	import type { Transaction, Category } from '$lib/core/db';
	import { longpress } from '$lib/actions/longpress';
	import { formatTransactionAmount } from '$lib/utils/currency-utils';
	import { db } from '$lib/core/db';
	import { getPriorityName, getPriorityColor } from '$lib/utils/priority-utils';
	import { isUncategorizedCategory } from '$lib/utils/category-utils';

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

	// Simplified date formatting
	const formatDate = (dateString: string) => {
		try {
			const date = new Date(dateString);
			const now = new Date();
			const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
			const transactionDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
			
			if (transactionDate.getTime() === today.getTime()) {
				return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
			}
			
			const diffTime = Math.abs(transactionDate.getTime() - today.getTime());
			const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
			
			if (diffDays === 1) {
				return transactionDate < today ? 'Yesterday' : 'Tomorrow';
			} else if (diffDays <= 7) {
				return date.toLocaleDateString([], { weekday: 'short' });
			} else {
				return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
			}
		} catch {
			return '';
		}
	};

	// Get primary display date
	const displayDate = $derived(() => {
		if (!showDate) return '';
		
		if (transaction.status === 'planned') {
			return transaction.plannedDate ? formatDate(transaction.plannedDate) : '';
		} else {
			return transaction.clearedDate ? formatDate(transaction.clearedDate) : '';
		}
	});

	// Determine if transaction is overdue
	const isOverdue = $derived(() => {
		if (transaction.status !== 'planned' || !transaction.plannedDate) return false;
		return new Date(transaction.plannedDate) < new Date();
	});

	// Get status icon and container styling with Tailwind colors
	const statusInfo = $derived(() => {
		switch (transaction.status) {
			case 'planned':
				if (isOverdue()) {
					return {
						icon: AlertCircle,
						containerClass: 'border-2 border-dashed border-alert bg-alert/10 shadow-alert/20 animate-pulse',
						iconClass: 'text-alert',
						urgency: 'high'
					};
				}
				return {
					icon: Clock,
					containerClass: 'border-2 border-dashed border-info bg-info/5 shadow-info/10',
					iconClass: 'text-info',
					urgency: 'medium'
				};
			case 'pending':
				return {
					icon: AlertCircle,
					containerClass: 'border-2 border-warning bg-warning/5 shadow-warning/10',
					iconClass: 'text-warning',
					urgency: 'medium'
				};
			case 'cleared':
				return {
					icon: CheckCircle,
					containerClass: 'border-2 border-sage-green bg-sage-green/5 shadow-sage-green/10',
					iconClass: 'text-success',
					urgency: 'low'
				};
			case 'cancelled':
				return {
					icon: XCircle,
					containerClass: 'border-2 border-text-disabled bg-text-disabled/5 shadow-text-disabled/10',
					iconClass: 'text-text-disabled',
					urgency: 'low'
				};
			default:
				return {
					icon: CheckCircle,
					containerClass: 'border-2 border-text-disabled bg-text-disabled/5 shadow-text-disabled/10',
					iconClass: 'text-text-disabled',
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
	let isUncategorized = $derived(() => {
		if (isTransfer() || transaction.type !== 'expense') return false;
		if (isGroup) {
			return groupCategory === 'Uncategorized' || !groupCategory;
		}
		if (!transaction.categoryId) return true;
		return category ? isUncategorizedCategory(category) : false;
	});

	// Load category for display (for both income and expense transactions)
	$effect(() => {
		if (!isGroup && transaction.categoryId && (transaction.type === 'expense' || transaction.type === 'income')) {
			db.categories.get(transaction.categoryId).then(cat => {
				category = cat || null;
			}).catch(() => {
				category = null;
			});
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

	// Get category icon for split groups
	const getCategoryIcon = (category: string) => {
		const icons: Record<string, string> = {
			'Food & Dining': '🍕',
			'Income': '💰',
			'Transportation': '⛽',
			'Shopping': '🛍️',
			'Entertainment': '🎬',
			'Healthcare': '🏥'
		};
		return icons[category] || '📊';
	};

	// Get subtle category accent color
	const getCategoryAccent = (category: string) => {
		const accents: Record<string, string> = {
			'Food & Dining': 'border-l-orange-400',
			'Income': 'border-l-green-400',
			'Transportation': 'border-l-blue-400',
			'Shopping': 'border-l-purple-400',
			'Entertainment': 'border-l-pink-400',
			'Healthcare': 'border-l-cyan-400'
		};
		return accents[category] || 'border-l-gray-400';
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

	// Format amount with proper styling using Tailwind colors
	const amountInfo = $derived(() => {
		const balanceImpact = calculateTransactionImpact(transaction);
		const isPositiveImpact = balanceImpact > 0;
		
		let textClass = '';
		let glowClass = '';
		
		// Color based on transaction type
		if (transaction.type === 'income') {
			textClass = 'text-sage-green';
			glowClass = 'drop-shadow-[0_0_1px_var(--color-success)]';
		} else if (transaction.type === 'expense') {
			textClass = 'text-warm-coral';
			glowClass = 'drop-shadow-[0_0_1px_var(--color-alert)]';
		} else {
			// For transfer and adjustment, use impact-based color
			if (isPositiveImpact) {
				textClass = 'text-sage-green';
				glowClass = 'drop-shadow-[0_0_1px_var(--color-success)]';
			} else {
				textClass = 'text-warm-coral';
				glowClass = 'drop-shadow-[0_0_1px_var(--color-alert)]';
			}
		}
		
		// Adjust opacity for planned transactions
		if (transaction.status === 'planned') {
			textClass += ' opacity-80';
			glowClass = ''; // Remove glow for planned transactions
		}
		
		// Format amount with proper currency symbol and decimal places
		const formattedAmount = formatTransactionAmount(displayAmount(), displayCurrency(), true);
		
		return {
			text: formattedAmount,
			class: `${textClass} ${glowClass}`,
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

	// Dynamic card styling based on transaction type and status
	const cardStyling = $derived(() => {
		let baseClass = 'bg-bg-secondary backdrop-blur-sm';
		
		// Add subtle texture based on transaction type
		if (transaction.status === 'planned') {
			baseClass += ' bg-gradient-to-br from-bg-secondary to-bg-tertiary';
		}
		
		// Add context-specific styling
		baseClass += ` ${contextStyling()}`;
		
		// Add category accent for non-grouped transactions
		if (!isGroup) {
			baseClass += ` ${getCategoryAccent(primaryTag())}`;
		}
		
		return baseClass;
	});
</script>

<div class="relative group">
	{#if isTransfer()}
		<!-- Transfer Group Display -->
		<div 
			class="relative overflow-hidden rounded-xl transition-all duration-200 ease-out
				   {cardStyling()} {statusInfo().containerClass} {selectionClass()}
				   hover:shadow-xl hover:shadow-bg-primary/30
				   hover:scale-[1.008] hover:-translate-y-[0.5]
				   {isLongPressing ? 'scale-[0.98] shadow-inner' : ''}
				   group-hover:border-golden-amber/50
				   border-l-2 border-l-blue-400"
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
				<div class="flex items-center justify-between">
					<!-- Left side: Transfer Info -->
					<div class="flex items-center space-x-4 min-w-0 flex-1">
						<!-- Transfer icon -->
						<div class="flex-shrink-0 relative">
							<div class="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center
										transition-all duration-200 group-hover:scale-110 group-hover:shadow-md">
								<span class="text-lg">↔️</span>
							</div>
						</div>
						
						<!-- Transfer details -->
						<div class="min-w-0 flex-1">
							<div class="font-semibold text-text-primary text-base">
								Transfer
							</div>
							<div class="text-sm text-text-secondary">
								{transferAccountNames}
							</div>
							{#if transferDetails()?.feeAmount && transferDetails()!.feeAmount > 0}
								<div class="text-xs text-text-tertiary">
									Fee: {formatTransactionAmount(transferDetails()!.feeAmount, displayCurrency(), true)}
								</div>
							{/if}
						</div>
					</div>
					
					<!-- Right side: Amount + Date -->
					<div class="flex-shrink-0 text-right">
						<!-- Transfer amount -->
						<div class="font-bold text-lg text-blue-600 dark:text-blue-400 tracking-tight">
							{formatTransactionAmount(displayAmount(), displayCurrency(), true)}
						</div>
						
						<!-- Date -->
						{#if displayDate()}
							<div class="text-xs text-text-tertiary font-medium">
								{displayDate()}
							</div>
						{/if}
					</div>
				</div>
			</button>
		</div>
	{:else if isGroup}
		<!-- Grouped Transaction -->
		<div 
			class="relative overflow-hidden rounded-xl transition-all duration-200 ease-out
				   {cardStyling()} {statusInfo().containerClass} {selectionClass()}
				   hover:shadow-xl hover:shadow-bg-primary/30
				   hover:scale-[1.008] hover:-translate-y-[0.5]
				   {isLongPressing ? 'scale-[0.98] shadow-inner' : ''}
				   group-hover:border-golden-amber/50
				   {getCategoryAccent(primaryTag())}"
		>
			<!-- Subtle gradient overlay for depth -->
			<div class="absolute inset-0 bg-gradient-to-br from-warm-ivory/[0.02] to-transparent pointer-events-none"></div>
			
			<!-- Grouped transaction content with two clickable areas -->
			<div class="flex">
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
					<div class="flex items-center justify-between">
						<div class="flex items-center space-x-3">
							<div class="w-10 h-10 bg-muted rounded-full flex items-center justify-center text-lg">
								{getCategoryIcon(primaryTag())}
							</div>
							<div class="flex-1">
								<div class="font-medium text-primary">{transactionDescription()}</div>
								<div class="text-sm text-muted-foreground">{primaryTag()}</div>
								<div class="text-xs text-muted-foreground/70">
									Grouped transaction ({groupTransactions.length} parts)
								</div>
							</div>
						</div>
						<div class="text-right">
							<div class="font-bold text-lg {(displayAmount() ?? 0) >= 0 ? 'text-success' : 'text-alert'} tracking-tight">
								{formatTransactionAmount(displayAmount(), displayCurrency(), true)}
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
						<div class="bg-bg-tertiary/50 rounded-lg p-3 border border-bg-surface {getCategoryAccent(groupTransaction.categoryId || 'Uncategorized')}">
							<div class="flex items-center justify-between">
								<div class="min-w-0 flex-1">
									<div class="text-sm font-medium text-text-primary">
										{groupTransaction.description || 'No description'}
									</div>
									{#if groupTransaction.categoryId}
										<div class="text-xs text-text-secondary truncate mt-1">
											Category: {groupTransaction.categoryId}
										</div>
									{/if}
								</div>
								<div class="text-right ml-3">
									<div class="font-semibold text-sm {(groupTransaction.amount ?? 0) >= 0 ? 'text-success' : 'text-alert'}">
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
				   {cardStyling()} {statusInfo().containerClass} {selectionClass()}
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
				<div class="flex items-center justify-between">
					<!-- Left side: Status + Content -->
					<div class="flex items-center space-x-4 min-w-0 flex-1">
						<!-- Status indicator with enhanced styling -->
						<div class="flex-shrink-0 relative">
							<div class="w-10 h-10 rounded-full bg-bg-tertiary flex items-center justify-center
										transition-all duration-200 group-hover:scale-110 group-hover:shadow-md">
								{#if statusInfo().icon === AlertCircle}
									<AlertCircle class="w-5 h-5 {statusInfo().iconClass} transition-transform duration-200 group-hover:scale-110" />
								{:else if statusInfo().icon === Clock}
									<Clock class="w-5 h-5 {statusInfo().iconClass} transition-transform duration-200 group-hover:scale-110" />
								{:else if statusInfo().icon === CheckCircle}
									<CheckCircle class="w-5 h-5 {statusInfo().iconClass} transition-transform duration-200 group-hover:scale-110" />
								{:else if statusInfo().icon === XCircle}
									<XCircle class="w-5 h-5 {statusInfo().iconClass} transition-transform duration-200 group-hover:scale-110" />
								{/if}
							</div>
							
							<!-- Confidence indicator ring for planned transactions -->
							{#if confidenceInfo()}
								<div class="absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-bg-secondary
										{confidenceInfo()?.color}"></div>
							{/if}
							
							<!-- Priority number indicator -->
							{#if transaction.priority}
								<div class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-bg-primary border-2 border-bg-secondary
										flex items-center justify-center text-[10px] font-bold {getPriorityColor(transaction.priority)}"
										title="Priority {transaction.priority} - {getPriorityName(transaction.priority)}">
									{transaction.priority}
								</div>
							{/if}
						</div>
						
						<!-- Content -->
						<div class="min-w-0 flex-1">
							<!-- Primary tag with enhanced styling -->
							<div class="flex items-center space-x-2">
								<!-- Split indicator -->
								{#if transaction.splitId}
									<div class="flex-shrink-0">
										<Split class="w-4 h-4 text-golden-amber" />
									</div>
								{/if}
								
								<h3 class="font-semibold text-text-primary capitalize truncate text-base">
									{primaryTag().toString().replace('_', ' ')}
								</h3>

								<!-- Uncategorized indicator icon -->
								{#if isUncategorized()}
									<span 
										class="flex-shrink-0" 
										title="This transaction needs to be categorized"
										aria-label="Uncategorized transaction"
									>
										<Tag class="w-4 h-4 text-warning" />
									</span>
								{/if}
							</div>
							
							<!-- Description with improved typography -->
							{#if transactionDescription()}
								<p class="text-sm text-text-secondary truncate leading-relaxed">
									{transactionDescription()}
								</p>
							{/if}
							
							<!-- Confidence label for planned transactions -->
							{#if confidenceInfo()}
								<div class="flex items-center space-x-1 mt-1">
									<span class="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-bg-tertiary text-text-secondary border border-bg-surface">
										{confidenceInfo()?.label}
									</span>
								</div>
							{/if}
						</div>
					</div>
					
					<!-- Right side: Amount + Date -->
					<div class="flex-shrink-0 text-right">
						<!-- Amount with enhanced styling -->
						<div class="flex items-center justify-end space-x-2">
							<!-- Recurring indicator -->
							{#if transaction.recurrenceRule}
								<div class="flex-shrink-0">
									<RefreshCcw class="w-4 h-4 text-info animate-pulse" />
								</div>
							{/if}
							
							<div class="font-bold text-lg {amountInfo().class} tracking-tight">
								{amountInfo().text}
							</div>
						</div>
						
						<!-- Date with improved styling -->
						{#if displayDate()}
							<div class="text-xs text-text-tertiary font-medium">
								{displayDate()}
							</div>
						{/if}
						
						<!-- Status badge -->
						<!-- <div class="mt-3">
							<span class="inline-block px-3 py-1.5 rounded-full text-xs font-medium
										bg-bg-tertiary text-text-secondary
										border border-bg-surface">
								{transaction.status}
							</span>
						</div> -->
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