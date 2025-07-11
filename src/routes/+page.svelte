<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import DailyBudgetMeter from '$lib/components/layout/DailyBudgetMeter.svelte';
	import SpendingVelocityAlert from '$lib/components/layout/SpendingVelocityAlert.svelte';
	import TransactionList from '$lib/components/layout/TransactionList.svelte';
	import QuickStats from '$lib/components/layout/QuickStats.svelte';
	import BehavioralNudge from '$lib/components/layout/BehavioralNudge.svelte';
	import TodaysWins from '$lib/components/layout/TodaysWins.svelte';
	import SmartAlert from '$lib/components/layout/SmartAlert.svelte';
	import BehavioralInsight from '$lib/components/layout/BehavioralInsight.svelte';
	import QuickActions from '$lib/components/layout/QuickActions.svelte';
	import FinancialHealthScore from '$lib/components/layout/FinancialHealthScore.svelte';
	import { transactionService, type TransactionOrGroup } from '$lib/core/services/transaction-service';
	import { flattenProcessedTransactionGroups, type ProcessedTransaction } from '$lib/utils/transaction-display';
	import { settingsService } from '$lib/core/services/settings-service';
	import { unifiedInsightsService, type TodayWin, type UnifiedAlert as InsightSmartAlert, type UnifiedInsight as InsightBehavioralInsight, type CoreFinancialHealthScore as InsightFinancialHealthScore, type QuickAction as InsightQuickAction } from '$lib/core/services';
	import { dateUtils } from '$lib/utils/utils';
	import Fab from '$lib/components/primitives/Fab.svelte';
	import LoadingSpinner from '$lib/components/primitives/LoadingSpinner.svelte';
	import { Plus, Bell, Settings } from '@lucide/svelte';
	import type { Transaction } from '$lib/core/db';
	import { isSpendingTransaction } from '$lib/core/db';
	
	// Helper function to flatten TransactionOrGroup into individual transactions
	const flattenTransactionGroups = (groups: TransactionOrGroup[]): Transaction[] => {
		const flattened: Transaction[] = [];
		for (const group of groups) {
			if (group.type === 'single') {
				flattened.push(group.representative);
			} else {
				// For splits, add all transactions in the group
				flattened.push(...group.transactions);
			}
		}
		return flattened;
	};
	
	// Reactive state
	let dailyBudget = $state({
		allocated: 0,
		spent: 0,
		remaining: 0,
		borrowed: 0,
		rollover: 0,
		status: 'good' as 'good' | 'warning' | 'danger'
	});
	
	let spendingVelocity = $state({
		multiplier: 1.0,
		isAlert: false,
		period: 'this week'
	});
	
	let behavioralNudge = $state({
		type: 'momentum_warning' as 'momentum_warning' | 'positive_reinforcement' | 'cooldown' | 'discretionary_reminder',
		message: '',
		countdown: 0,
		show: false
	});
	
	let isLoading = $state(true);
	let error = $state<Error | null>(null);
	let todaysTransactions = $state<ProcessedTransaction[]>([]);
	
	// New state for enhanced features
	let todaysWins = $state<TodayWin[]>([]);
	let smartAlert = $state<InsightSmartAlert | null>(null);
	let behavioralInsight = $state<InsightBehavioralInsight | null>(null);
	let healthScore = $state<InsightFinancialHealthScore | null>(null);
	let quickActions = $state<InsightQuickAction[]>([]);
	
	// Morning/Evening greeting logic
	const currentHour = $derived(new Date().getHours());
	const greeting = $derived(currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening');
	const isEvening = $derived(currentHour >= 17);
	
	// Load today's transactions and calculate daily budget
	const loadDailyData = async () => {
		try {
			isLoading = true;
			error = null;
			
			// Get today's date range
			const today = new Date();
			const startOfDay = new Date(today);
			startOfDay.setHours(0, 0, 0, 0);
			const endOfDay = new Date(today);
			endOfDay.setHours(23, 59, 59, 999);
			
			// Get today's transactions (now returns TransactionOrGroup[])
			const todaysTransactionGroups = await transactionService.getTransactionsByDateRange(
				startOfDay.toISOString(),
				endOfDay.toISOString()
			);
			todaysTransactions = await flattenProcessedTransactionGroups(todaysTransactionGroups as TransactionOrGroup[]);
			
			// Calculate spent amount (only actual expenses, not income or adjustments)
			const spent = todaysTransactions
				.filter(tx => isSpendingTransaction(tx)) // Only positive expenses
				.reduce((total, tx) => total + tx.amount, 0);
			
			// Get user preferences for default budget type
			const defaultBudgetType = await settingsService.getDefaultBudgetType();
			
			// For now, use a simple daily budget calculation
			// In a real app, you'd get this from actual budget settings
			const allocated = 50.00; // Default daily budget
			const remaining = allocated - spent;
			const borrowed = 0; // Would be calculated from budget service
			const rollover = 0; // Would be calculated from budget service
			
			// Determine status based on spending
			let status: 'good' | 'warning' | 'danger' = 'good';
			if (spent > allocated * 0.8) status = 'warning';
			if (spent > allocated) status = 'danger';
			
			dailyBudget = {
				allocated,
				spent,
				remaining,
				borrowed,
				rollover,
				status
			};
			
			// Calculate spending velocity (simplified)
			const weekStart = dateUtils.getWeekStart();
			const weekEnd = dateUtils.getWeekEnd();
			const weekTransactionGroups = await transactionService.getTransactionsByDateRange(
				weekStart.toISOString(),
				weekEnd.toISOString()
			);
			const weekTransactions = flattenTransactionGroups(weekTransactionGroups as TransactionOrGroup[]);
			
			const weekSpent = weekTransactions
				.filter(tx => isSpendingTransaction(tx))
				.reduce((total, tx) => total + tx.amount, 0);
			
			const daysInWeek = 7;
			const averageDailySpending = weekSpent / daysInWeek;
			const velocityMultiplier = averageDailySpending > 0 ? spent / averageDailySpending : 1.0;
			
			spendingVelocity = {
				multiplier: velocityMultiplier,
				isAlert: velocityMultiplier > 2.0,
				period: 'this week'
			};
			
			// Simple behavioral nudge logic
			if (spent > allocated * 0.7 && spent < allocated) {
				behavioralNudge = {
					type: 'momentum_warning',
					message: `You've spent $${spent.toFixed(2)} today. Consider waiting before your next purchase.`,
					countdown: 1800, // 30 minutes
					show: true
				};
			} else {
				behavioralNudge.show = false;
			}
			
		} catch (err) {
			error = err instanceof Error ? err : new Error('Failed to load daily data');
			console.error('Error loading daily data:', error);
		} finally {
			isLoading = false;
		}
	};
	
	// Load insights data
	const loadInsightsData = async () => {
		try {
			// Load all insights in parallel using unified service
			const { wins, alerts, insights, healthScore: health, quickActions: actions } = await unifiedInsightsService.generateAllInsights();
			
			todaysWins = wins;
			smartAlert = alerts.length > 0 ? alerts[0] : null; // Show first alert
			behavioralInsight = insights.length > 0 ? insights[0] : null; // Show first insight
			healthScore = health;
			quickActions = actions;
		} catch (err) {
			console.error('Error loading insights data:', err);
			// Keep placeholders if insights fail to load
		}
	};
	
	const handleQuickAction = (action: string) => {
		console.log(`Quick action: ${action}`);
		// TODO: Implement quick action logic
		goto('/transaction/new');
	};
	
	const handleCustomTransaction = () => {
		goto('/transaction/new');
	};
	
	onMount(() => {
		loadDailyData();
		loadInsightsData();
	});
</script>

<div class="max-w-full mx-auto bg-bg-primary min-h-screen">
	<!-- Enhanced Header with TopBar -->
	<header class="sticky top-0 z-10 bg-bg-primary/95 backdrop-blur-sm border-b border-primary/20">
		<div class="flex items-center justify-between p-4">
			<div class="flex items-center gap-3">
				<span class="text-2xl">🏠</span>
				<div>
					<h1 class="text-xl font-bold text-text-primary">Today's Pulse</h1>
					<p class="text-xs text-text-secondary">
						{greeting}! You have ${dailyBudget.remaining.toFixed(2)} left today to spend wisely
					</p>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<button class="p-2 rounded-lg bg-bg-tertiary hover:bg-bg-surface transition-colors">
					<Bell size={20} class="text-text-primary" />
				</button>
				<button class="p-2 rounded-lg bg-bg-tertiary hover:bg-bg-surface transition-colors">
					<Settings size={20} class="text-text-primary" />
				</button>
			</div>
		</div>
	</header>

	{#if isLoading}
		<div class="flex items-center justify-center min-h-[60vh]">
			<LoadingSpinner />
		</div>
	{:else if error}
		<div class="text-center py-8 px-4">
			<p class="text-red-400 mb-4">Error: {error.message}</p>
			<button 
				class="px-4 py-2 bg-bg-tertiary text-text-primary rounded-lg hover:bg-bg-surface transition-colors"
				onclick={loadDailyData}
			>
				Retry
			</button>
		</div>
	{:else}
		<div class="p-4 space-y-6">
			<!-- Daily Budget Remaining - Large, prominent display -->
			<section>
				<DailyBudgetMeter {dailyBudget} />
			</section>
			
			<!-- Financial Health Score -->
			<section>
				<FinancialHealthScore healthScore={healthScore} showPlaceholder={!healthScore} />
			</section>
			
			<!-- Today's Wins -->
			<section>
				<TodaysWins wins={todaysWins} showPlaceholder={todaysWins.length === 0} />
			</section>
			
			<!-- Smart Alert -->
			<section>
				<SmartAlert alert={smartAlert} showPlaceholder={!smartAlert} />
			</section>
			
			<!-- Behavioral Insight -->
			<section>
				<BehavioralInsight insight={behavioralInsight} showPlaceholder={!behavioralInsight} />
			</section>
			
			<!-- Quick Actions -->
			<section>
				<QuickActions 
					actions={quickActions} 
					onCustomClick={handleCustomTransaction}
					showPlaceholder={quickActions.length === 0} 
				/>
			</section>
			
			<!-- Legacy components (keeping for now) -->
			{#if spendingVelocity.isAlert}
				<section>
					<SpendingVelocityAlert {spendingVelocity} />
				</section>
			{/if}
		
			{#if behavioralNudge.show}
				<section>
					<BehavioralNudge {behavioralNudge} />
				</section>
			{/if}
		
			<!-- Today's transactions -->
			<section>
				<h2 class="text-xl font-semibold text-text-primary mb-4">Today's Activity</h2>
				<TransactionList 
					transactions={todaysTransactions}
					onTransactionClick={(transaction) => goto(`/transaction/${transaction.id}`)}
				/>
			</section>
		</div>
	{/if}
</div>

<Fab onclick={() => goto('/transaction/new')} size='md'>
    <Plus/>
</Fab>