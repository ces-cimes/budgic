<script lang="ts">
	import { RefreshCcw, Clock, CheckCircle, AlertCircle, XCircle, Split } from '@lucide/svelte';
	import type { Transaction } from '$lib/core/db';
	import { settingsService } from '$lib/core/services/settings-service';
	import { longpress } from '$lib/actions/longpress';

	interface Props {
		transaction: Transaction;
		onClick?: (transaction: Transaction) => void;
		onLongPress?: (transaction: Transaction) => void;
		isSelected?: boolean;
		context?: 'main' | 'transactions' | 'plan';
		showDate?: boolean;
	}

	let {
		transaction,
		onClick = () => {},
		onLongPress = () => {},
		isSelected = false,
		context = 'main',
		showDate = true
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
						containerClass: 'border-2 border-dashed border-alert bg-alert/5 shadow-alert/10',
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

	// Get primary tag for display
	const primaryTag = $derived(() => {
		if (transaction.whyTag) return transaction.whyTag;
		if (transaction.whatTag) return transaction.whatTag;
		return 'Uncategorized';
	});

	// Calculate the actual balance impact of the transaction
	const calculateTransactionImpact = (transaction: Transaction): number => {
		switch (transaction.type) {
			case 'income':
				return transaction.amount; // Positive adds, negative subtracts
			case 'expense':
				return -transaction.amount; // Positive subtracts, negative adds (like cashback)
			case 'transfer':
				return transaction.amount; // Net change
			case 'adjustment':
				return transaction.amount; // Direct modification
			default:
				return 0;
		}
	};

	// Format amount with proper styling using Tailwind colors
	const amountInfo = $derived(() => {
		const balanceImpact = calculateTransactionImpact(transaction);
		const isPositiveImpact = balanceImpact > 0;
		const absAmount = Math.abs(transaction.amount);
		
		let textClass = '';
		let glowClass = '';
		let sign = '';
		
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
		
		// Sign based on balance impact
		sign = isPositiveImpact ? '+' : '-';
		
		// Adjust opacity for planned transactions
		if (transaction.status === 'planned') {
			textClass += ' opacity-80';
			glowClass = ''; // Remove glow for planned transactions
		}
		
		return {
			text: `${sign}$${absAmount.toFixed(2)}`,
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
	let buttonElement: HTMLButtonElement;
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;

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
				buttonElement.removeEventListener('longpress', handleLongPressEvent);
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
				return 'py-1 px-2'; // More generous spacing for main page
			case 'transactions':
				return 'py-4 px-5'; // Compact for lists
			case 'plan':
				return 'py-4.5 px-5'; // Medium spacing for planning
			default:
				return 'py-1 px-2';
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
		
		// Add shadow effect for high-value transactions
		const amount = Math.abs(transaction.amount);
		if (amount > 100) {
			baseClass += ' shadow-lg shadow-bg-primary/20';
		}
		
		return baseClass;
	});
</script>

<div class="relative group">
	<!-- Main transaction card -->
	<div 
		class="relative overflow-hidden rounded-xl transition-all duration-100 ease-out
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
				   touch-manipulation"
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
									transition-all duration-200 group-hover:scale-110">
							{#if statusInfo().icon === AlertCircle}
								<AlertCircle class="w-5 h-5 {statusInfo().iconClass}" />
							{:else if statusInfo().icon === Clock}
								<Clock class="w-5 h-5 {statusInfo().iconClass}" />
							{:else if statusInfo().icon === CheckCircle}
								<CheckCircle class="w-5 h-5 {statusInfo().iconClass}" />
							{:else if statusInfo().icon === XCircle}
								<XCircle class="w-5 h-5 {statusInfo().iconClass}" />
							{/if}
						</div>
						
						<!-- Confidence indicator ring for planned transactions -->
						{#if confidenceInfo()}
							<div class="absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-bg-secondary
									 {confidenceInfo()?.color}"></div>
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
						</div>
						
						<!-- Description with improved typography -->
						{#if transaction.description}
							<p class="text-sm text-text-secondary truncate leading-relaxed">
								{transaction.description}
							</p>
						{/if}
						
						<!-- Confidence label for planned transactions -->
						<!-- {#if confidenceInfo()}
							<div class="flex items-center space-x-1 mt-1">
								<div class="w-2 h-2 rounded-full {confidenceInfo()?.color}"></div>
								<span class="text-xs text-text-tertiary font-medium">
									{confidenceInfo()?.label}
								</span>
							</div>
						{/if} -->
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
						
						<div class="font-bold text-xl {amountInfo().class} tracking-tight">
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