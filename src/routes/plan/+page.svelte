<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { PageLayout } from '$lib/components/layouts';
	import Header from '$lib/components/Header.svelte';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { EmptyState } from '$lib/components/ui/empty-state';
	import { Skeleton } from '$lib/components/ui/skeleton/index.ts';
	import * as Card from '$lib/components/ui/card/index.ts';
	import {
		BarChart3,
		DollarSign,
		Target,
		Plus,
		TrendingUp,
		TrendingDown,
		Settings
	} from '@lucide/svelte';

	import { TabHeader, TabContent, TabContentWrapper, type TabConfig } from '$lib/components/shared';
	import { getClassifyNudgeCopy, shouldShowClassifyNudge } from '$lib/utils/guidance-presentation';
	import type { ExplanationDetail, GuidanceTone } from '$lib/utils/guidance-presentation';

	import {
		BudgetTab,
		type PlanningData,
		type DailyAllowance,
		type WeeklyProjection
	} from '$lib/components/budget';
	import AllowanceVisualization from '$lib/components/accounts/AllowanceVisualization.svelte';
	import DebtAcknowledgmentPrompt from '$lib/components/plan/DebtAcknowledgmentPrompt.svelte';
	import RecoverySection from '$lib/components/plan/RecoverySection.svelte';
	import PlanRulesSummary from '$lib/components/budget/PlanRulesSummary.svelte';
	import AllowanceWeekView from '$lib/components/plan/AllowanceWeekView.svelte';
	import OutstandingReimbursementsPanel from '$lib/components/plan/OutstandingReimbursementsPanel.svelte';
	import BalanceProjectionChart from '$lib/components/accounts/BalanceProjectionChart.svelte';
	import AddPlannedTransaction from '$lib/components/AddPlannedTransaction.svelte';
	import {
		OverviewTab as GoalsOverviewTab,
		ActiveTab as GoalsActiveTab,
		CompletedTab as GoalsCompletedTab,
		type GoalsData,
		type Goal
	} from '$lib/components/goals';

	import {
		planService,
		budgetService,
		userService,
		negativeAllowanceService,
		goalsService,
		goalService,
		recurringTransactionIntelligenceService,
		classifyFinancialState
	} from '$lib/core/services';
	import type { FinancialStateResult } from '$lib/core/services';
	import type { EnhancedAllowance } from '$lib/core/services/core/budget-service';
	import type {
		NegativeAllowanceStatus,
		RecoverySuggestion
	} from '$lib/core/services/core/negative-allowance-service';
	import { formatTransactionAmount } from '$lib/utils/currency-utils';
	import { addDays, startOfWeek } from 'date-fns';
	import { resolveSmartLabel, type SmartPatternForLabel } from '$lib/utils/smart-date-labels';
	import {
		getCachedWeekAnnotationsLookup,
		setCachedWeekAnnotations
	} from '$lib/utils/plan-week-annotations-cache';
	import {
		recordPlanAllowanceCacheHit,
		recordPlanAllowanceCacheMiss,
		recordWeekAnnotationLookup,
		recordWeekAnnDetectPatternsMs
	} from '$lib/utils/plan-perf-debug';
	import { crossRouteSyncService } from '$lib/core/services/analytics/cross-route-sync-service';
	import {
		computeRecoveryHorizon,
		type RecoveryHorizonSnapshot
	} from '$lib/core/services/core/recovery-horizon';

	type PlanAllowanceSnapshot = {
		cacheKey: string;
		enhancedAllowance: EnhancedAllowance | null;
		dailyAllowance: DailyAllowance | null;
		allowanceConfidence: {
			ratio: number;
			tier: 'low' | 'medium' | 'high';
			unclassifiedSpend: number;
			totalSpend: number;
		} | null;
		unclassifiedTransactionCount: number;
		debtPromptGroupId: string | null;
		nudgeClassifyDismissed: boolean;
		negativeAllowanceStatus: NegativeAllowanceStatus | null;
		recoverySuggestions: RecoverySuggestion[];
		recoveryHorizon: RecoveryHorizonSnapshot | null;
		planningData: PlanningData | null;
		weeklyProjections: WeeklyProjection[];
		weekDayAnnotations: Record<string, string>;
	};

	let planAllowanceCache: PlanAllowanceSnapshot | null = null;

	const planTabs: TabConfig[] = [
		{ id: 'allowance', label: 'Allowance', icon: DollarSign },
		{ id: 'budget', label: 'Budget', icon: BarChart3 },
		{ id: 'goals', label: 'Goals', icon: Target }
	];

	const goalsSubTabs: TabConfig[] = [
		{ id: 'overview', label: 'Overview', icon: BarChart3 },
		{ id: 'active', label: 'Active', icon: Target },
		{ id: 'completed', label: 'Completed', icon: Target }
	];

	// Derive active tab from URL so tab highlight is correct on first paint and when navigating with ?tab=
	const activeTab = $derived.by(() => {
		const tabParam = new URLSearchParams($page.url.search).get('tab');
		if (tabParam && planTabs.some((t) => t.id === tabParam)) return tabParam;
		return 'allowance';
	});
	let goalsSubTab = $state('overview');
	let isLoading = $state(true);
	/** True while allowance / planning data is being fetched (shows skeleton on Allowance tab) */
	let isPlanDataLoading = $state(true);
	let userCurrency = $state<string>('USD');
	let weekStartsOn = $state(0);
	let selectedAccountId = $state<string>('');
	let dailyAllowance = $state<DailyAllowance | null>(null);
	let enhancedAllowance = $state<EnhancedAllowance | null>(null);
	let negativeAllowanceStatus = $state<NegativeAllowanceStatus | null>(null);
	let recoverySuggestions = $state<RecoverySuggestion[]>([]);
	let weeklyProjections = $state<WeeklyProjection[]>([]);
	let planningData = $state<PlanningData | null>(null);
	let goalsData = $state<GoalsData | null>(null);
	let activeGoals = $state<Goal[]>([]);
	let completedGoals = $state<Goal[]>([]);
	let sinkingFunds = $state<
		Array<{
			id: string;
			name: string;
			currentAmount: number;
			targetAmount: number;
			currency: string;
			targetDate?: string;
		}>
	>([]);
	let allowanceConfidence = $state<{
		ratio: number;
		tier: 'low' | 'medium' | 'high';
		unclassifiedSpend: number;
		totalSpend: number;
	} | null>(null);
	let unclassifiedTransactionCount = $state(0);
	let nudgeClassifyDismissed = $state(false);
	let guidanceTone = $state<GuidanceTone>('balanced');
	let explanationDetail = $state<ExplanationDetail>('standard');
	let allowanceTabMarked = $state(false);
	let error = $state<string | null>(null);
	/** Phase 5.3 — intentional debt prompt (one group per period) */
	let debtPromptGroupId = $state<string | null>(null);
	/** Milestone F — financial state classifier result */
	let financialState = $state<FinancialStateResult | null>(null);
	/** Milestone F — recovery-focused view mode from user preferences */
	let recoveryModeActive = $state(false);
	let recoveryHorizon = $state<RecoveryHorizonSnapshot | null>(null);
	let weekDayAnnotations = $state<Record<string, string>>({});

	const totalPlannedIncome = $derived(planningData?.totalPlannedIncome ?? 0);
	const totalPlannedExpenses = $derived(planningData?.totalPlannedExpenses ?? 0);
	const netProjectedChange = $derived(planningData?.netProjectedChange ?? 0);
	const showClassifyNudge = $derived(
		Boolean(allowanceConfidence) &&
			shouldShowClassifyNudge(
				{ guidanceTone, explanationDetail },
				{
					allowanceConfidenceRatio: allowanceConfidence!.ratio,
					unclassifiedTransactionCount,
					dismissed: nudgeClassifyDismissed
				}
			)
	);
	const classifyNudgeCopy = $derived(getClassifyNudgeCopy(explanationDetail));

	onMount(async () => {
		try {
			const preferences = await userService.getUserPreferences();
			weekStartsOn = preferences.weekStartsOn ?? 0;
			userCurrency = preferences?.currency || 'USD';
			nudgeClassifyDismissed = preferences?.nudgeClassifyDismissed ?? false;
			guidanceTone = preferences?.guidanceTone ?? 'balanced';
			explanationDetail = preferences?.explanationDetail ?? 'standard';
			allowanceTabMarked = preferences?.allowanceTabReviewed ?? false;
			recoveryModeActive = preferences?.recoveryModeActive ?? false;
			const accounts = await planService.getAccounts();
			const activeAccount = accounts.find((a) => a.isActive);
			if (activeAccount) selectedAccountId = activeAccount.id;
			await loadPlanData();
			await loadGoalsData();
		} catch (err) {
			console.error('Error loading plan data:', err);
			error = err instanceof Error ? err.message : 'Failed to load plan data';
		} finally {
			isLoading = false;
		}
	});

	$effect(() => {
		const urlParams = new URLSearchParams($page.url.search);
		const goalsParam = urlParams.get('goalsTab');
		if (goalsParam && goalsSubTabs.some((t) => t.id === goalsParam)) goalsSubTab = goalsParam;
	});

	$effect(() => {
		if (activeTab !== 'allowance' || allowanceTabMarked) return;
		allowanceTabMarked = true;
		void userService.updateUserPreferences({ allowanceTabReviewed: true });
	});

	async function loadPlanData(options?: { force?: boolean }) {
		const dayKey = new Date().toISOString().slice(0, 10);
		const rev = crossRouteSyncService.getSurfaceDataRevision();
		const cacheKey = `${rev}:${userCurrency}:${selectedAccountId}:${dayKey}`;
		if (!options?.force && planAllowanceCache?.cacheKey === cacheKey) {
			recordPlanAllowanceCacheHit({
				rev,
				dayKey,
				selectedAccountId
			});
			enhancedAllowance = planAllowanceCache.enhancedAllowance;
			dailyAllowance = planAllowanceCache.dailyAllowance;
			allowanceConfidence = planAllowanceCache.allowanceConfidence;
			unclassifiedTransactionCount = planAllowanceCache.unclassifiedTransactionCount;
			debtPromptGroupId = planAllowanceCache.debtPromptGroupId;
			nudgeClassifyDismissed = planAllowanceCache.nudgeClassifyDismissed;
			negativeAllowanceStatus = planAllowanceCache.negativeAllowanceStatus;
			recoverySuggestions = planAllowanceCache.recoverySuggestions;
			recoveryHorizon = planAllowanceCache.recoveryHorizon;
			planningData = planAllowanceCache.planningData;
			weeklyProjections = planAllowanceCache.weeklyProjections;
			weekDayAnnotations = planAllowanceCache.weekDayAnnotations;
			isPlanDataLoading = false;
			return;
		}

		recordPlanAllowanceCacheMiss({
			rev,
			dayKey,
			selectedAccountId
		});
		isPlanDataLoading = true;
		try {
			const [_enhancedAllowance, _dailyAllowance, classifierResult] = await Promise.all([
				planService.getEnhancedAllowance(),
				planService.getDailyAllowance(),
				classifyFinancialState()
			]);
			enhancedAllowance = _enhancedAllowance;
			dailyAllowance = _dailyAllowance;
			financialState = classifierResult;
			const budgetSummary = await budgetService.getBudgetSummary();
			allowanceConfidence = budgetSummary?.confidence ?? null;
			unclassifiedTransactionCount = budgetSummary?.unclassifiedTransactionCount ?? 0;
			debtPromptGroupId = null;
			const proj = enhancedAllowance?.projection;
			if (proj && proj.debtOverflowShortfall > 0 && proj.activeDebtGroupIds.length > 0) {
				const prefs = await userService.getUserPreferences();
				const now = new Date();
				const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
				for (const gid of proj.activeDebtGroupIds) {
					const dismissed = prefs?.debtPromptDismissedPeriodByGroup?.[gid] === periodKey;
					const acked = prefs?.debtAcknowledgedPeriodByGroup?.[gid] === periodKey;
					if (!dismissed && !acked) {
						debtPromptGroupId = gid;
						break;
					}
				}
			}
			if (enhancedAllowance) {
				const prefs = await userService.getUserPreferences();
				nudgeClassifyDismissed = prefs?.nudgeClassifyDismissed ?? false;
				const handling =
					(prefs as { negativeAllowanceHandling?: string }).negativeAllowanceHandling ??
					'allow_with_strong_warning';
				negativeAllowanceStatus = await negativeAllowanceService.checkNegativeAllowance(
					enhancedAllowance,
					handling as
						| 'block_with_warning'
						| 'allow_with_strong_warning'
						| 'borrow_from_future'
						| 'borrow_from_other_categories'
				);
				recoverySuggestions = negativeAllowanceStatus.isNegative
					? negativeAllowanceService.getRecoverySuggestions(enhancedAllowance)
					: [];
			} else {
				negativeAllowanceStatus = null;
				recoverySuggestions = [];
			}
			if (selectedAccountId) {
				planningData = await planService.getPlanningData(selectedAccountId);
				weeklyProjections = await planService.getWeeklyProjections(selectedAccountId);
			}

			try {
				const annCacheKey = selectedAccountId || 'default';
				const annLookup = getCachedWeekAnnotationsLookup(annCacheKey);
				recordWeekAnnotationLookup(annLookup.reason);
				if (annLookup.reason === 'hit') {
					weekDayAnnotations = annLookup.ann;
				} else {
					const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
					const patterns = await recurringTransactionIntelligenceService.detectPatterns(365, 3);
					if (typeof performance !== 'undefined') {
						recordWeekAnnDetectPatternsMs(performance.now() - t0);
					}
					const slices: SmartPatternForLabel[] = patterns.map((p) => ({
						frequency: p.frequency,
						confidence: p.confidence,
						typicalDayOfMonth: p.typicalDayOfMonth,
						typicalDayOfWeek: p.typicalDayOfWeek,
						averageAmount: p.averageAmount,
						txType: p.metadata?.type
					}));
					const now = new Date();
					const ws = startOfWeek(now, {
						weekStartsOn: weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6
					});
					const ann: Record<string, string> = {};
					for (let i = 0; i < 7; i++) {
						const d = addDays(ws, i);
						const key = d.toISOString().slice(0, 10);
						const lab = resolveSmartLabel(d, slices);
						if (lab === 'Payday' || lab === 'Rent day') ann[key] = lab;
					}
					weekDayAnnotations = ann;
					setCachedWeekAnnotations(annCacheKey, ann);
				}
			} catch {
				weekDayAnnotations = {};
			}

			if (recoveryModeActive) {
				try {
					recoveryHorizon = await computeRecoveryHorizon({
						daysRemaining: enhancedAllowance?.total?.daysRemaining ?? 30,
						dailyAllowance: enhancedAllowance?.total?.dailySafe ?? 0
					});
				} catch {
					recoveryHorizon = null;
				}
			} else {
				recoveryHorizon = null;
			}

			const revAfter = crossRouteSyncService.getSurfaceDataRevision();
			planAllowanceCache = {
				cacheKey: `${revAfter}:${userCurrency}:${selectedAccountId}:${dayKey}`,
				enhancedAllowance,
				dailyAllowance,
				allowanceConfidence,
				unclassifiedTransactionCount,
				debtPromptGroupId,
				nudgeClassifyDismissed,
				negativeAllowanceStatus,
				recoverySuggestions: [...recoverySuggestions],
				recoveryHorizon,
				planningData,
				weeklyProjections: [...weeklyProjections],
				weekDayAnnotations: { ...weekDayAnnotations }
			};
		} catch (err) {
			console.error('Error loading plan data:', err);
		} finally {
			isPlanDataLoading = false;
		}
	}

	function currentPeriodKey(): string {
		const now = new Date();
		return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
	}

	async function handleDebtAckConfirm() {
		if (!debtPromptGroupId) return;
		try {
			await budgetService.acknowledgeIntentionalDebt(debtPromptGroupId, currentPeriodKey());
			debtPromptGroupId = null;
			await loadPlanData({ force: true });
		} catch (e) {
			console.error(e);
		}
	}

	async function handleDebtAckDismiss() {
		if (!debtPromptGroupId) return;
		try {
			await budgetService.dismissDebtPromptForPeriod(debtPromptGroupId, currentPeriodKey());
			debtPromptGroupId = null;
			await loadPlanData({ force: true });
		} catch (e) {
			console.error(e);
		}
	}

	async function loadGoalsData() {
		try {
			const result = await goalsService.getGoalsData();
			goalsData = result;
			activeGoals = result.activeGoals;
			completedGoals = result.completedGoals;
			const allGoals = await goalService.getGoals();
			const progress = await goalService.getGoalsProgress();
			const progressByGoal = new Map(progress.map((p) => [p.goalId, p]));
			sinkingFunds = allGoals
				.filter((goal) => !!goal.linkedAccountId && goal.status === 'active')
				.map((goal) => {
					const p = progressByGoal.get(goal.id);
					return {
						id: goal.id,
						name: goal.name,
						currentAmount: p?.currentAmount ?? goal.currentAmount,
						targetAmount: goal.targetAmount,
						currency: goal.currency,
						targetDate: goal.targetDate
					};
				});
		} catch (err) {
			console.error('Error loading goals:', err);
		}
	}

	function handleTabChange(tabId: string) {
		const url = new URL($page.url);
		url.searchParams.set('tab', tabId);
		url.searchParams.delete('goalsTab');
		goto(url.toString(), { replaceState: true, noScroll: true });
	}

	function handleGoalsSubTabChange(subTabId: string) {
		goalsSubTab = subTabId;
		const url = new URL($page.url);
		url.searchParams.set('tab', 'goals');
		url.searchParams.set('goalsTab', subTabId);
		goto(url.toString(), { replaceState: true, noScroll: true });
	}

	async function handleGoalAction(action: string, goalId: string) {
		try {
			switch (action) {
				case 'refresh':
				case 'add_progress':
				case 'view_goal':
					break;
				case 'pause':
					await goalService.updateGoal(goalId, { status: 'paused' });
					break;
				case 'resume':
					await goalService.updateGoal(goalId, { status: 'active' });
					break;
				case 'complete':
					await goalService.updateGoal(goalId, { status: 'completed' });
					break;
				case 'delete': {
					const ok = typeof window !== 'undefined' ? window.confirm('Delete this goal?') : true;
					if (ok) await goalService.deleteGoal(goalId);
					break;
				}
				default:
					break;
			}
		} catch (e) {
			console.error('Goal action failed:', e);
		}
		await loadGoalsData();
	}

	async function handleDismissClassifyNudge() {
		nudgeClassifyDismissed = true;
		try {
			await userService.updateUserPreferences({ nudgeClassifyDismissed: true });
		} catch (err) {
			console.error('Error dismissing classify nudge:', err);
		}
	}
</script>

<svelte:head>
	<title>Plan | Budgic</title>
</svelte:head>

<PageLayout>
	{#snippet topBar()}
		<Header
			title="Plan"
			variant="with-tabs"
			tabRowMobileOnly
			buttonProps={[
				{ text: 'Settings', onclick: () => goto('/settings/plan'), size: 'sm', icon: Settings },
				{ text: 'Add goal', onclick: () => goto('/plan?tab=goals'), size: 'sm', icon: Plus }
			]}
		>
			<TabHeader tabs={planTabs} {activeTab} onTabChange={handleTabChange} />
		</Header>
	{/snippet}

	{#snippet children()}
		<TabContentWrapper tabs={planTabs} {activeTab} onTabChange={handleTabChange}>
			{#snippet children()}
				<TabContent tabId="allowance" isActive={activeTab === 'allowance'} tabs={planTabs}>
					<div class="space-y-5 py-5">
						{#if isPlanDataLoading}
							<div class="squircle-4xl squircle-border squircle-fill-tertiary space-y-4 p-5">
								<Skeleton class="h-6 w-48 rounded" />
								<Skeleton class="h-4 w-full rounded" />
								<Skeleton class="h-4 w-3/4 rounded" />
								<Skeleton class="h-24 w-full rounded-xl" />
								<Skeleton class="h-16 w-full rounded-xl" />
							</div>
						{:else if enhancedAllowance}
							<div class="squircle-4xl squircle-border squircle-fill-tertiary space-y-4 p-5">
								{#if showClassifyNudge}
									<div
										class="bg-muted/50 border-border flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
									>
										<div>
											<p class="text-sm font-medium">{classifyNudgeCopy.title}</p>
											<p class="text-muted-foreground text-xs">{classifyNudgeCopy.body}</p>
										</div>
										<div class="flex items-center gap-2">
											<Button
												variant="ghost"
												size="sm"
												onclick={() => goto('/insights?tab=patterns&reviewSession=1')}
												class="text-[var(--color-amber)]"
											>
												Open review session
											</Button>
											<Button variant="ghost" size="sm" onclick={handleDismissClassifyNudge}>
												Dismiss
											</Button>
										</div>
									</div>
								{/if}
								{#if debtPromptGroupId && enhancedAllowance?.projection}
									<DebtAcknowledgmentPrompt
										groupLabel={debtPromptGroupId.replace(/^debt:/, '').replace(/-/g, ' ')}
										shortfallDisplay={formatTransactionAmount(
											enhancedAllowance.projection.debtOverflowShortfall,
											enhancedAllowance.projection.currency
										)}
										onConfirm={handleDebtAckConfirm}
										onDismiss={handleDebtAckDismiss}
									/>
								{/if}
								{#if recoveryModeActive && recoveryHorizon}
									<RecoverySection horizon={recoveryHorizon} />
								{/if}
								{#if !recoveryModeActive && enhancedAllowance?.projection?.hasAcknowledgedDebtInPeriod && enhancedAllowance.projection.recoveryWeeksEstimate != null}
									<p class="text-muted-foreground text-center text-xs">
										Recovery: about {enhancedAllowance.projection.recoveryWeeksEstimate} week(s) at current
										pace after this intentional stretch.
									</p>
								{/if}
								<AllowanceVisualization
									allowance={enhancedAllowance}
									confidence={allowanceConfidence}
									projection={enhancedAllowance.projection ?? null}
									showDetails={true}
									showRecommendations={true}
									negativeStatus={negativeAllowanceStatus}
									{recoverySuggestions}
								/>
								<!-- Week view: 7 mini bars Mon–Sun (UX_SPEC §3.2) -->
								<AllowanceWeekView
									allowance={enhancedAllowance}
									currency={userCurrency}
									dayAnnotations={weekDayAnnotations}
								/>
								<PlanRulesSummary />
							</div>
							<!-- 30-day cash flow chart (UX_SPEC §3.2) -->
							<div class="squircle-4xl squircle-border squircle-fill-tertiary p-5">
								<h3
									class="mb-4 text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
								>
									30-day cash flow
								</h3>
								<BalanceProjectionChart
									daysAhead={30}
									showDetails={false}
									showTemporalBoundary={true}
								/>
							</div>
							{#if sinkingFunds.length > 0}
								<details
									class="squircle-4xl squircle-border squircle-fill-tertiary group/sink open:bg-opacity-95"
									open
								>
									<summary
										class="text-muted-foreground hover:text-foreground cursor-pointer list-none px-5 py-3 text-xs font-semibold tracking-widest uppercase [&::-webkit-details-marker]:hidden"
									>
										Sinking funds
									</summary>
									<div class="space-y-3 px-5 pb-5">
										{#each sinkingFunds as fund (fund.id)}
											{@const progress =
												fund.targetAmount > 0
													? Math.min(100, (fund.currentAmount / fund.targetAmount) * 100)
													: 0}
											<div class="space-y-1.5">
												<div class="flex items-center justify-between text-sm">
													<span>{fund.name}</span>
													<span class="text-[var(--color-text-tertiary)]">
														{formatTransactionAmount(fund.currentAmount, fund.currency)} /
														{formatTransactionAmount(fund.targetAmount, fund.currency)}
														{#if fund.targetDate}
															<span
																class="border-border ml-1 rounded border px-1.5 py-0.5 text-[10px] text-[var(--color-text-tertiary)]"
															>
																{new Date(fund.targetDate).toLocaleDateString(undefined, {
																	month: 'short',
																	day: 'numeric'
																})}
															</span>
														{/if}
													</span>
												</div>
												<div class="h-2 overflow-hidden rounded-full bg-[var(--color-bg-tertiary)]">
													<div
														class="h-full bg-[var(--color-amber)] transition-all"
														style={`width: ${progress}%`}
													></div>
												</div>
											</div>
										{/each}
									</div>
								</details>
							{/if}
							<details
								class="group/reimb border-border squircle-2xl squircle-border bg-card open:bg-card/80"
							>
								<summary
									class="text-muted-foreground hover:text-foreground cursor-pointer list-none px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden"
								>
									<span class="inline-flex items-center gap-2">
										Outstanding reimbursements
										<span class="text-[10px] tracking-wide opacity-60 group-open/reimb:hidden"
											>(expand)</span
										>
									</span>
								</summary>
								<div class="border-border border-t px-2 pb-4">
									<OutstandingReimbursementsPanel />
								</div>
							</details>
						{:else if dailyAllowance}
							<div class="squircle-4xl squircle-border squircle-fill-tertiary p-5">
								<p
									class="mb-2 text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
								>
									Daily allowance
								</p>
								<div class="text-hero-sm">
									{formatTransactionAmount(dailyAllowance.amount, userCurrency)}
								</div>
								<p class="mt-1 text-xs text-[var(--color-text-tertiary)]">
									{dailyAllowance.daysRemaining} days remaining
								</p>
							</div>
						{:else}
							<EmptyState body="No allowance data yet.">
								{#snippet children()}
									<p class="mt-1 text-xs text-[var(--color-text-tertiary)]">
										Add accounts and budget categories to see your safe-to-spend.
									</p>
								{/snippet}
							</EmptyState>
						{/if}
						<Button
							variant="ghost"
							size="sm"
							onclick={() => goto('/settings/plan')}
							class="text-[var(--color-text-tertiary)]"
						>
							<Settings class="mr-2 size-3.5" />
							Budget & allowance settings
						</Button>
					</div>
				</TabContent>

				<TabContent tabId="budget" isActive={activeTab === 'budget'} tabs={planTabs}>
					<div class="space-y-5 py-5">
						{#if isPlanDataLoading}
							<div class="squircle-4xl squircle-border squircle-fill-tertiary space-y-4 p-5">
								<Skeleton class="h-5 w-40 rounded" />
								<div class="grid grid-cols-2 gap-4">
									<Skeleton class="h-16 w-full rounded-xl" />
									<Skeleton class="h-16 w-full rounded-xl" />
								</div>
								<Skeleton class="h-12 w-full rounded-xl" />
							</div>
							<div class="squircle-4xl squircle-border squircle-fill-tertiary space-y-3 p-5">
								<Skeleton class="h-6 w-56 rounded" />
								<Skeleton class="h-24 w-full rounded-xl" />
								<Skeleton class="h-24 w-full rounded-xl" />
							</div>
						{:else}
							<!-- Financial summary -->
							<div class="squircle-4xl squircle-border squircle-fill-tertiary p-5">
								<h2
									class="mb-4 text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
								>
									Financial summary
								</h2>
								<div class="mb-4 grid grid-cols-2 gap-4">
									<div class="text-center">
										<div class="text-hero-sm text-[var(--color-sage-green)]">
											{formatTransactionAmount(totalPlannedIncome, userCurrency)}
										</div>
										<div
											class="mt-1 text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
										>
											Income
										</div>
									</div>
									<div class="text-center">
										<div class="text-hero-sm text-[var(--color-warm-coral)]">
											{formatTransactionAmount(totalPlannedExpenses, userCurrency)}
										</div>
										<div
											class="mt-1 text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
										>
											Expenses
										</div>
										<div class="mt-0.5 text-[10px] text-[var(--color-text-tertiary)]/80">
											from planned transactions
										</div>
									</div>
								</div>
								<div class="border-border border-t pt-4 text-center">
									<div class="flex items-center justify-center gap-2">
										{#if netProjectedChange >= 0}
											<TrendingUp class="size-4 text-[var(--color-amber)]" />
											<span class="text-hero-sm text-[var(--color-amber)]"
												>+{formatTransactionAmount(netProjectedChange, userCurrency)}</span
											>
										{:else}
											<TrendingDown class="size-4 text-[var(--color-warm-coral)]" />
											<span class="text-hero-sm text-[var(--color-warm-coral)]"
												>{formatTransactionAmount(netProjectedChange, userCurrency)}</span
											>
										{/if}
									</div>
									<p
										class="mt-1 text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
									>
										Net projected
									</p>
								</div>
							</div>
							{#if selectedAccountId}
								<AddPlannedTransaction
									accountId={selectedAccountId}
									variant="outline"
									class="w-full justify-start"
									onTransactionAdded={() => loadPlanData({ force: true })}
								/>
							{/if}
							<BudgetTab
								{userCurrency}
								{selectedAccountId}
								{planningData}
								onSetGoal={() => goto('/plan?tab=goals')}
							/>
							<PlanRulesSummary />
						{/if}
					</div>
				</TabContent>

				<TabContent tabId="goals" isActive={activeTab === 'goals'} tabs={planTabs}>
					<div class="py-5">
						{#if isPlanDataLoading}
							<div class="squircle-4xl squircle-border squircle-fill-tertiary mb-5 space-y-3 p-5">
								<Skeleton class="h-8 w-48 rounded" />
								<Skeleton class="h-4 w-full rounded" />
								<Skeleton class="h-32 w-full rounded-xl" />
							</div>
							<div class="squircle-4xl squircle-border squircle-fill-tertiary space-y-3 p-5">
								<Skeleton class="h-6 w-40 rounded" />
								<Skeleton class="h-20 w-full rounded-xl" />
							</div>
						{:else}
							<!-- Goals sub-tabs — pill style -->
							<div class="mb-5 flex items-center gap-1">
								{#each goalsSubTabs as t}
									<button
										type="button"
										onclick={() => handleGoalsSubTabChange(t.id)}
										class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors
											{goalsSubTab === t.id
											? 'bg-[var(--color-amber-subtle)] text-[var(--color-amber)]'
											: 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'}"
									>
										{t.label}
									</button>
								{/each}
								<div class="ml-auto">
									<Button
										variant="ghost"
										size="sm"
										onclick={() => goto('/plan?tab=goals')}
										class="gap-1.5 text-[var(--color-amber)]"
									>
										<Plus class="size-3.5" />
										Add goal
									</Button>
								</div>
							</div>
							{#if goalsSubTab === 'overview'}
								<GoalsOverviewTab
									{goalsData}
									{activeGoals}
									{completedGoals}
									{userCurrency}
									onGoalAction={handleGoalAction}
								/>
							{:else if goalsSubTab === 'active'}
								<GoalsActiveTab {activeGoals} {userCurrency} onGoalAction={handleGoalAction} />
							{:else}
								<GoalsCompletedTab
									{completedGoals}
									{userCurrency}
									onGoalAction={handleGoalAction}
								/>
							{/if}
						{/if}
					</div>
				</TabContent>
			{/snippet}
		</TabContentWrapper>
	{/snippet}
</PageLayout>
