<script lang="ts">
	import { onMount } from 'svelte';
	import { learningAdaptationService } from '$lib/core/services';
	import type {
		PatternDetectionResult,
		AllowanceAdjustmentSuggestion,
		BufferAdjustmentSuggestion,
		FlexibilityLearningResult,
		DataQualityIssue
	} from '$lib/core/services/analytics/learning-adaptation-service';
	import { db } from '$lib/core/db';
	import { formatMainCurrencyAmount } from '$lib/utils/currency-utils';
	import { userService } from '$lib/core/services';
	import * as Card from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { EmptyState } from '$lib/components/ui/empty-state';
	import {
		Brain,
		TrendingUp,
		TrendingDown,
		AlertTriangle,
		CheckCircle2,
		X,
		RefreshCw,
		Settings,
		BarChart3,
		Shield,
		Info,
		ChevronDown,
		ChevronUp,
		ArrowRight
	} from '@lucide/svelte';

	interface Props {
		className?: string;
	}

	const { className = '' }: Props = $props();

	let patterns = $state<PatternDetectionResult[]>([]);
	let allowanceSuggestions = $state<AllowanceAdjustmentSuggestion[]>([]);
	let bufferSuggestions = $state<BufferAdjustmentSuggestion[]>([]);
	let flexibilityResults = $state<FlexibilityLearningResult[]>([]);
	let dataQualityIssues = $state<DataQualityIssue[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let userCurrency = $state<string>('USD');

	// UI state
	let showPatterns = $state(true);
	let showAllowanceSuggestions = $state(true);
	let showBufferSuggestions = $state(true);
	let showFlexibility = $state(true);
	let showDataQuality = $state(true);

	onMount(async () => {
		await loadData();
	});

	async function loadData() {
		isLoading = true;
		error = null;
		try {
			const preferences = await userService.getUserPreferences();
			userCurrency = preferences?.currency || 'USD';

			// Load all data in parallel
			[patterns, allowanceSuggestions, bufferSuggestions, flexibilityResults, dataQualityIssues] =
				await Promise.all([
					learningAdaptationService.detectAllPatterns(180),
					learningAdaptationService.reviewAllowanceAdjustments(),
					learningAdaptationService.reviewBufferAdjustments(),
					learningAdaptationService.learnFlexibilityFromFeedback(),
					learningAdaptationService.checkDataQuality(90)
				]);
		} catch (err) {
			console.error('Error loading learning data:', err);
			error = err instanceof Error ? err.message : 'Failed to load learning data';
		} finally {
			isLoading = false;
		}
	}

	async function handleAllowanceSuggestion(
		suggestion: AllowanceAdjustmentSuggestion,
		accept: boolean
	) {
		if (!accept) {
			// Remove from suggestions
			allowanceSuggestions = allowanceSuggestions.filter(
				(s) => s.categoryId !== suggestion.categoryId
			);
			return;
		}

		try {
			// Update category budget
			const category = await db.categories.get(suggestion.categoryId);
			if (category) {
				await db.categories.update(suggestion.categoryId, {
					budgetAmount: suggestion.suggestedAllowance,
					updatedAt: new Date().toISOString()
				});

				// Record feedback
				await learningAdaptationService.recordFeedback({
					feedbackType: 'budget_adjustment',
					action: 'accepted',
					details: {
						categoryId: suggestion.categoryId,
						oldAmount: suggestion.currentAllowance,
						newAmount: suggestion.suggestedAllowance
					}
				});

				// Remove from suggestions
				allowanceSuggestions = allowanceSuggestions.filter(
					(s) => s.categoryId !== suggestion.categoryId
				);
			}
		} catch (err) {
			console.error('Error applying allowance adjustment:', err);
			error = err instanceof Error ? err.message : 'Failed to apply adjustment';
		}
	}

	async function handleBufferSuggestion(suggestion: BufferAdjustmentSuggestion, accept: boolean) {
		if (!accept) {
			bufferSuggestions = bufferSuggestions.filter((s) => s.accountId !== suggestion.accountId);
			return;
		}

		try {
			// Update account buffer
			const account = await db.accounts.get(suggestion.accountId);
			if (account) {
				const metadata = account.metadata || {};
				await db.accounts.update(suggestion.accountId, {
					metadata: {
						...metadata,
						bufferAmount: suggestion.suggestedBuffer
					},
					updatedAt: new Date().toISOString()
				});

				// Record feedback
				await learningAdaptationService.recordFeedback({
					feedbackType: 'budget_adjustment',
					action: 'accepted',
					details: {
						accountId: suggestion.accountId,
						oldBuffer: suggestion.currentBuffer,
						newBuffer: suggestion.suggestedBuffer,
						type: 'buffer'
					}
				});

				bufferSuggestions = bufferSuggestions.filter((s) => s.accountId !== suggestion.accountId);
			}
		} catch (err) {
			console.error('Error applying buffer adjustment:', err);
			error = err instanceof Error ? err.message : 'Failed to apply adjustment';
		}
	}

	function getPatternTypeIcon(type: string) {
		switch (type) {
			case 'day_of_week':
			case 'weekly':
			case 'monthly':
			case 'seasonal':
				return TrendingUp;
			case 'income_frequency':
			case 'income_amount':
				return BarChart3;
			default:
				return Brain;
		}
	}

	function getPatternTypeLabel(type: string): string {
		switch (type) {
			case 'day_of_week':
				return 'Day of Week';
			case 'weekly':
				return 'Weekly';
			case 'monthly':
				return 'Monthly';
			case 'seasonal':
				return 'Seasonal';
			case 'income_frequency':
				return 'Income Frequency';
			case 'income_amount':
				return 'Income Amount';
			default:
				return type;
		}
	}
</script>

<div class="space-y-6 {className}">
	<div class="mb-4 flex items-center justify-between">
		<div class="flex items-center gap-2">
			<Brain class="text-primary h-5 w-5" />
			<h2 class="text-lg font-semibold">Learning & Adaptation</h2>
		</div>
		<Button variant="ghost" size="sm" onclick={loadData} disabled={isLoading}>
			<RefreshCw class="mr-2 h-4 w-4 {isLoading ? 'animate-spin' : ''}" />
			Refresh
		</Button>
	</div>

	{#if isLoading}
		<div class="py-12 text-center">
			<div class="bg-muted mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
				<RefreshCw class="text-muted-foreground h-8 w-8 animate-spin" />
			</div>
			<p class="text-muted-foreground">Analyzing patterns and learning preferences...</p>
		</div>
	{:else if error}
		<Card.Root>
			<Card.Content class="p-6">
				<div class="text-center">
					<AlertTriangle class="text-destructive mx-auto mb-4 h-12 w-12" />
					<h3 class="mb-2 text-lg font-semibold">Error</h3>
					<p class="text-muted-foreground mb-4">{error}</p>
					<Button onclick={loadData}>Retry</Button>
				</div>
			</Card.Content>
		</Card.Root>
	{:else}
		<div class="space-y-6">
			<!-- Detected Patterns -->
			<Card.Root>
				<Card.Header>
					<button
						class="flex w-full items-center justify-between"
						onclick={() => (showPatterns = !showPatterns)}
					>
						<div class="flex items-center gap-2">
							<TrendingUp class="h-5 w-5" />
							<Card.Title>Detected Patterns ({patterns.length})</Card.Title>
						</div>
						{#if showPatterns}
							<ChevronUp class="h-4 w-4" />
						{:else}
							<ChevronDown class="h-4 w-4" />
						{/if}
					</button>
				</Card.Header>
				{#if showPatterns}
					<Card.Content>
						{#if patterns.length === 0}
							<EmptyState
								icon={Info}
								body="No patterns detected yet. More data needed."
								iconClass="opacity-50"
								class="text-muted-foreground py-8"
							/>
						{:else}
							<div class="space-y-3">
								{#each patterns as pattern}
									{@const Icon = getPatternTypeIcon(pattern.pattern.patternType)}
									<div class="rounded-lg border p-3">
										<div class="flex items-start gap-3">
											<Icon class="text-primary mt-0.5 h-5 w-5" />
											<div class="flex-1">
												<div class="mb-1 flex items-center gap-2">
													<span class="font-medium">{pattern.pattern.title}</span>
													<Badge variant="outline"
														>{getPatternTypeLabel(pattern.pattern.patternType)}</Badge
													>
													<Badge variant={pattern.confidence >= 80 ? 'default' : 'secondary'}>
														{pattern.confidence}% confidence
													</Badge>
												</div>
												<p class="text-muted-foreground mb-2 text-sm">
													{pattern.pattern.description}
												</p>
												<div class="text-muted-foreground text-xs">
													{pattern.metadata.occurrences} occurrences over {pattern.metadata
														.timeframe}
												</div>
											</div>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</Card.Content>
				{/if}
			</Card.Root>

			<!-- Allowance Adjustments -->
			{#if allowanceSuggestions.length > 0}
				<Card.Root>
					<Card.Header>
						<button
							class="flex w-full items-center justify-between"
							onclick={() => (showAllowanceSuggestions = !showAllowanceSuggestions)}
						>
							<div class="flex items-center gap-2">
								<Settings class="h-5 w-5" />
								<Card.Title>Allowance Adjustments ({allowanceSuggestions.length})</Card.Title>
							</div>
							{#if showAllowanceSuggestions}
								<ChevronUp class="h-4 w-4" />
							{:else}
								<ChevronDown class="h-4 w-4" />
							{/if}
						</button>
					</Card.Header>
					{#if showAllowanceSuggestions}
						<Card.Content>
							<div class="space-y-4">
								{#each allowanceSuggestions as suggestion}
									<div class="rounded-lg border p-4">
										<div class="mb-3 flex items-start justify-between">
											<div class="flex-1">
												<div class="mb-1 font-medium">{suggestion.categoryName}</div>
												<div class="text-muted-foreground mb-2 text-sm">
													Actual spending differs from budget by {Math.round(
														suggestion.variance * 100
													)}% for{' '}
													{suggestion.consecutiveMonths} months
												</div>
												<div class="flex items-center gap-4 text-sm">
													<div>
														<span class="text-muted-foreground">Current: </span>
														<span class="font-medium">
															{formatMainCurrencyAmount(suggestion.currentAllowance, userCurrency)}
														</span>
													</div>
													<ArrowRight class="h-4 w-4" />
													<div>
														<span class="text-muted-foreground">Suggested: </span>
														<span class="text-primary font-medium">
															{formatMainCurrencyAmount(
																suggestion.suggestedAllowance,
																userCurrency
															)}
														</span>
													</div>
												</div>
											</div>
										</div>
										<div class="flex gap-2">
											<Button size="sm" onclick={() => handleAllowanceSuggestion(suggestion, true)}>
												<CheckCircle2 class="mr-1 h-4 w-4" />
												Accept
											</Button>
											<Button
												size="sm"
												variant="outline"
												onclick={() => handleAllowanceSuggestion(suggestion, false)}
											>
												<X class="mr-1 h-4 w-4" />
												Dismiss
											</Button>
										</div>
									</div>
								{/each}
							</div>
						</Card.Content>
					{/if}
				</Card.Root>
			{/if}

			<!-- Buffer Adjustments -->
			{#if bufferSuggestions.length > 0}
				<Card.Root>
					<Card.Header>
						<button
							class="flex w-full items-center justify-between"
							onclick={() => (showBufferSuggestions = !showBufferSuggestions)}
						>
							<div class="flex items-center gap-2">
								<Shield class="h-5 w-5" />
								<Card.Title>Buffer Adjustments ({bufferSuggestions.length})</Card.Title>
							</div>
							{#if showBufferSuggestions}
								<ChevronUp class="h-4 w-4" />
							{:else}
								<ChevronDown class="h-4 w-4" />
							{/if}
						</button>
					</Card.Header>
					{#if showBufferSuggestions}
						<Card.Content>
							<div class="space-y-4">
								{#each bufferSuggestions as suggestion}
									<div class="rounded-lg border p-4">
										<div class="mb-3 flex items-start justify-between">
											<div class="flex-1">
												<div class="mb-1 font-medium">{suggestion.accountName}</div>
												<div class="text-muted-foreground mb-2 text-sm">
													{suggestion.reason === 'over_buffering'
														? 'Buffer may be higher than needed'
														: 'Buffer may be too low'}
												</div>
												<div class="flex items-center gap-4 text-sm">
													<div>
														<span class="text-muted-foreground">Current: </span>
														<span class="font-medium">
															{formatMainCurrencyAmount(suggestion.currentBuffer, userCurrency)}
														</span>
													</div>
													<ArrowRight class="h-4 w-4" />
													<div>
														<span class="text-muted-foreground">Suggested: </span>
														<span class="text-primary font-medium">
															{formatMainCurrencyAmount(suggestion.suggestedBuffer, userCurrency)}
														</span>
													</div>
												</div>
											</div>
										</div>
										<div class="flex gap-2">
											<Button size="sm" onclick={() => handleBufferSuggestion(suggestion, true)}>
												<CheckCircle2 class="mr-1 h-4 w-4" />
												Accept
											</Button>
											<Button
												size="sm"
												variant="outline"
												onclick={() => handleBufferSuggestion(suggestion, false)}
											>
												<X class="mr-1 h-4 w-4" />
												Dismiss
											</Button>
										</div>
									</div>
								{/each}
							</div>
						</Card.Content>
					{/if}
				</Card.Root>
			{/if}

			<!-- Learned Flexibility -->
			{#if flexibilityResults.length > 0}
				<Card.Root>
					<Card.Header>
						<button
							class="flex w-full items-center justify-between"
							onclick={() => (showFlexibility = !showFlexibility)}
						>
							<div class="flex items-center gap-2">
								<Brain class="h-5 w-5" />
								<Card.Title>Learned Flexibility ({flexibilityResults.length})</Card.Title>
							</div>
							{#if showFlexibility}
								<ChevronUp class="h-4 w-4" />
							{:else}
								<ChevronDown class="h-4 w-4" />
							{/if}
						</button>
					</Card.Header>
					{#if showFlexibility}
						<Card.Content>
							<div class="space-y-3">
								{#each flexibilityResults as result}
									<div class="rounded-lg border p-3">
										<div class="flex items-center justify-between">
											<div>
												<div class="font-medium">{result.categoryName}</div>
												<div class="text-muted-foreground text-sm">
													Acceptance rate: {Math.round(result.acceptanceRate * 100)}% ({result.suggestionCount}{' '}
													suggestions)
												</div>
											</div>
											<Badge
												variant={result.learnedFlexibility > 0.7
													? 'default'
													: result.learnedFlexibility > 0.4
														? 'secondary'
														: 'outline'}
											>
												{Math.round(result.learnedFlexibility * 100)}% flexible
											</Badge>
										</div>
									</div>
								{/each}
							</div>
						</Card.Content>
					{/if}
				</Card.Root>
			{/if}

			<!-- Data Quality Issues -->
			{#if dataQualityIssues.length > 0}
				<Card.Root>
					<Card.Header>
						<button
							class="flex w-full items-center justify-between"
							onclick={() => (showDataQuality = !showDataQuality)}
						>
							<div class="flex items-center gap-2">
								<AlertTriangle class="text-warning h-5 w-5" />
								<Card.Title>Data Quality Issues ({dataQualityIssues.length})</Card.Title>
							</div>
							{#if showDataQuality}
								<ChevronUp class="h-4 w-4" />
							{:else}
								<ChevronDown class="h-4 w-4" />
							{/if}
						</button>
					</Card.Header>
					{#if showDataQuality}
						<Card.Content>
							<div class="space-y-3">
								{#each dataQualityIssues as issue}
									<div class="border-warning/50 bg-warning/10 rounded-lg border p-3">
										<div class="flex items-start gap-3">
											<AlertTriangle
												class="mt-0.5 h-5 w-5 {issue.severity === 'high'
													? 'text-destructive'
													: issue.severity === 'medium'
														? 'text-warning'
														: 'text-muted-foreground'}"
											/>
											<div class="flex-1">
												<div class="mb-1 flex items-center gap-2">
													<span class="font-medium">{issue.type.replace('_', ' ')}</span>
													<Badge
														variant={issue.severity === 'high'
															? 'destructive'
															: issue.severity === 'medium'
																? 'default'
																: 'secondary'}
													>
														{issue.severity}
													</Badge>
												</div>
												<p class="text-muted-foreground text-sm">{issue.description}</p>
												{#if issue.suggestedAction}
													<p class="text-muted-foreground mt-1 text-xs">{issue.suggestedAction}</p>
												{/if}
											</div>
										</div>
									</div>
								{/each}
							</div>
						</Card.Content>
					{/if}
				</Card.Root>
			{/if}

			<!-- Empty State -->
			{#if patterns.length === 0 && allowanceSuggestions.length === 0 && bufferSuggestions.length === 0 && flexibilityResults.length === 0 && dataQualityIssues.length === 0}
				<EmptyState
					icon={Brain}
					iconVariant="circle"
					heading="No Learning Data Yet"
					body="The system needs more transaction history to detect patterns and learn your preferences."
					iconClass="opacity-50"
					bodyClass="text-muted-foreground mb-4"
					class="p-12"
				>
					{#snippet children()}
						<p class="text-muted-foreground text-sm">
							Check back after you've added more transactions and used the optimization features.
						</p>
					{/snippet}
				</EmptyState>
			{/if}
		</div>
	{/if}
</div>
