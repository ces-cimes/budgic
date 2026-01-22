<script lang="ts">
	import { onMount } from 'svelte';
	import { recurringTransactionIntelligenceService } from '$lib/core/services/analytics/recurring-transaction-intelligence-service';
	import type { RecurringPattern, RecurringPrediction, RecurringConflict } from '$lib/core/services/analytics/recurring-transaction-intelligence-service';
	import { transactionService } from '$lib/core/services';
	import { formatAmount } from '$lib/utils/currency-utils';
	import { format, parseISO } from 'date-fns';
	import * as Card from '$lib/components/ui/card';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Alert from '$lib/components/ui/alert';
	import { RefreshCw, TrendingUp, TrendingDown, Calendar, AlertTriangle, CheckCircle2, XCircle, Sparkles, BarChart3, AlertCircle } from '@lucide/svelte';

	interface Props {
		className?: string;
		onPatternSelected?: (patternId: string) => void;
	}

	const { className = '', onPatternSelected }: Props = $props();

	let patterns = $state<RecurringPattern[]>([]);
	let predictions = $state<Map<string, RecurringPrediction>>(new Map());
	let conflicts = $state<RecurringConflict[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let activeTab = $state('patterns');
	let selectedPattern = $state<RecurringPattern | null>(null);
	let showPatternDetails = $state(false);
	let daysToAnalyze = $state(365);
	let minOccurrences = $state(3);
	let showInactivePatterns = $state(false);

	// Load patterns
	async function loadPatterns() {
		try {
			isLoading = true;
			error = null;
			patterns = await recurringTransactionIntelligenceService.detectPatterns(daysToAnalyze, minOccurrences);
			
			// Load predictions only for active patterns
			const activePatterns = patterns.filter(p => p.isActive);
			const predictionPromises = activePatterns.map(async (pattern) => {
				const prediction = await recurringTransactionIntelligenceService.predictNextOccurrence(pattern.id);
				if (prediction) {
					predictions.set(pattern.id, prediction);
				}
			});
			await Promise.all(predictionPromises);

			// Load conflicts
			conflicts = await recurringTransactionIntelligenceService.detectConflicts();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load recurring patterns';
			console.error('Error loading patterns:', err);
		} finally {
			isLoading = false;
		}
	}

	// Track variability for a pattern
	async function trackVariability(patternId: string) {
		try {
			await recurringTransactionIntelligenceService.trackVariability(patternId);
			await loadPatterns(); // Reload to get updated pattern
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to track variability';
		}
	}

	// Learn category for a pattern
	async function learnCategory(patternId: string) {
		try {
			await recurringTransactionIntelligenceService.learnCategory(patternId);
			await loadPatterns(); // Reload to get updated pattern
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to learn category';
		}
	}

	// Resolve conflict
	async function resolveConflict(conflictId: string, resolution: 'merge' | 'split' | 'ignore' | 'update' | 'create') {
		try {
			await recurringTransactionIntelligenceService.resolveConflict(conflictId, resolution);
			await loadPatterns(); // Reload to refresh conflicts
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to resolve conflict';
		}
	}

	// View pattern details
	function viewPatternDetails(pattern: RecurringPattern) {
		selectedPattern = pattern;
		showPatternDetails = true;
		onPatternSelected?.(pattern.id);
	}

	// Get frequency badge color
	function getFrequencyColor(frequency: RecurringPattern['frequency']): string {
		const colorMap: Record<string, string> = {
			daily: 'bg-blue-500/10 text-blue-500',
			weekly: 'bg-green-500/10 text-green-500',
			biweekly: 'bg-purple-500/10 text-purple-500',
			monthly: 'bg-orange-500/10 text-orange-500',
			quarterly: 'bg-pink-500/10 text-pink-500',
			yearly: 'bg-red-500/10 text-red-500',
			irregular: 'bg-gray-500/10 text-gray-500'
		};
		return colorMap[frequency] || 'bg-gray-500/10 text-gray-500';
	}

	// Get confidence color
	function getConfidenceColor(confidence: number): string {
		if (confidence >= 80) return 'text-green-500';
		if (confidence >= 60) return 'text-yellow-500';
		return 'text-red-500';
	}

	// Get conflict severity color
	function getSeverityColor(severity: RecurringConflict['severity']): string {
		const colorMap: Record<string, string> = {
			high: 'bg-red-500/10 text-red-500 border-red-500/20',
			medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
			low: 'bg-blue-500/10 text-blue-500 border-blue-500/20'
		};
		return colorMap[severity] || 'bg-gray-500/10 text-gray-500';
	}

	onMount(() => {
		loadPatterns();
	});
</script>

<div class="recurring-transaction-manager {className}">
	<Card.Root>
		<Card.Header>
			<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
				<div class="flex items-center gap-2">
					<Sparkles class="text-primary h-5 w-5" />
					<Card.Title class="text-lg sm:text-xl">Recurring Transaction Intelligence</Card.Title>
				</div>
				<Button size="sm" variant="outline" onclick={loadPatterns} disabled={isLoading} class="w-full sm:w-auto">
					<RefreshCw class="mr-2 h-4 w-4 {isLoading ? 'animate-spin' : ''}" />
					Refresh
				</Button>
			</div>
			<Card.Description class="text-sm">
				Intelligent detection and management of recurring transactions
			</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if error}
				<Alert.Root variant="destructive" class="mb-4">
					<AlertCircle class="h-4 w-4" />
					<Alert.Title>Error</Alert.Title>
					<Alert.Description>{error}</Alert.Description>
				</Alert.Root>
			{/if}

			<Tabs.Root bind:value={activeTab} class="w-full">
				<Tabs.List class="grid w-full grid-cols-3 gap-1 sm:gap-0">
					<Tabs.Trigger value="patterns" class="text-xs sm:text-sm px-2 sm:px-4">
						<BarChart3 class="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
						<span class="hidden sm:inline">Patterns</span>
						<span class="sm:hidden">Patterns</span>
						<span class="ml-1">({patterns.length})</span>
					</Tabs.Trigger>
					<Tabs.Trigger value="predictions" class="text-xs sm:text-sm px-2 sm:px-4">
						<Calendar class="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
						<span class="hidden sm:inline">Predictions</span>
						<span class="sm:hidden">Pred</span>
						<span class="ml-1">({predictions.size})</span>
					</Tabs.Trigger>
					<Tabs.Trigger value="conflicts" class="text-xs sm:text-sm px-2 sm:px-4">
						<AlertTriangle class="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
						<span class="hidden sm:inline">Conflicts</span>
						<span class="sm:hidden">Conf</span>
						<span class="ml-1">({conflicts.length})</span>
					</Tabs.Trigger>
				</Tabs.List>

				<!-- Patterns Tab -->
				<Tabs.Content value="patterns" class="mt-4">
					{#if isLoading}
						<div class="flex items-center justify-center py-8">
							<RefreshCw class="h-6 w-6 animate-spin text-muted-foreground" />
						</div>
					{:else if patterns.length === 0}
						<div class="text-center py-8 text-muted-foreground">
							<p>No recurring patterns detected yet.</p>
							<p class="text-sm mt-2">Add more transactions to enable pattern detection.</p>
						</div>
					{:else}
						<div class="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
							<div class="text-xs sm:text-sm text-muted-foreground">
								{patterns.filter(p => p.isActive).length} active, {patterns.filter(p => !p.isActive).length} inactive
							</div>
							<Button
								size="sm"
								variant="outline"
								onclick={() => (showInactivePatterns = !showInactivePatterns)}
								class="w-full sm:w-auto text-xs sm:text-sm"
							>
								{showInactivePatterns ? 'Hide' : 'Show'} Inactive
							</Button>
						</div>
						<div class="space-y-3 sm:space-y-4">
							{#each patterns.filter(p => showInactivePatterns || p.isActive) as pattern (pattern.id)}
								<Card.Root class="py-2 sm:py-3 hover:bg-accent/50 transition-colors cursor-pointer {!pattern.isActive ? 'opacity-60' : ''}" onclick={() => viewPatternDetails(pattern)} role="button" tabindex={0}>
									<Card.Content class="px-2 sm:px-3">
										<div class="flex flex-col sm:flex-row items-start justify-between gap-3">
											<div class="flex-1 min-w-0 w-full sm:w-auto">
												<div class="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-2">
													<h3 class="font-semibold text-sm sm:text-base truncate">
														{pattern.descriptionPattern || 'Recurring Transaction'}
													</h3>
													{#if !pattern.isActive}
														<Badge variant="outline" class="bg-muted text-muted-foreground text-xs">
															Inactive
														</Badge>
													{/if}
													<Badge variant={pattern.metadata.type === 'income' ? 'default' : 'secondary'} class="text-xs">
														{pattern.metadata.type || 'expense'}
													</Badge>
													<Badge class="{getFrequencyColor(pattern.frequency)} text-xs">
														{pattern.frequency}
													</Badge>
													<Badge variant="outline" class="{getConfidenceColor(pattern.confidence)} text-xs">
														{pattern.confidence}%
													</Badge>
												</div>
												<div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
													<div class="flex items-center gap-1">
														<span class="font-medium">
															{pattern.metadata.type === 'income' ? '+' : ''}
															{formatAmount(pattern.averageAmount, pattern.metadata.currency || 'USD')}
														</span>
													</div>
													<div class="flex items-center gap-1">
														<Calendar class="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
														<span>{pattern.occurrences} {pattern.occurrences === 1 ? 'occurrence' : 'occurrences'}</span>
													</div>
													<div class="text-xs sm:text-sm">
														{format(parseISO(pattern.firstObserved), 'MMM d, yyyy')} - {format(parseISO(pattern.lastObserved), 'MMM d, yyyy')}
													</div>
												</div>
												{#if pattern.trend}
													<div class="mt-2 flex items-center gap-1 text-xs sm:text-sm">
														{#if pattern.trend.direction === 'increasing'}
															<TrendingUp class="h-3 w-3 sm:h-4 sm:w-4 text-green-500 flex-shrink-0" />
															<span class="text-green-500">Trending up</span>
														{:else if pattern.trend.direction === 'decreasing'}
															<TrendingDown class="h-3 w-3 sm:h-4 sm:w-4 text-red-500 flex-shrink-0" />
															<span class="text-red-500">Trending down</span>
														{:else}
															<span class="text-muted-foreground">Stable</span>
														{/if}
													</div>
												{/if}
											</div>
											<div class="flex gap-2 w-full sm:w-auto self-start sm:self-center">
												{#if !pattern.seasonalVariation || pattern.seasonalVariation.length === 0}
													<Button
														size="sm"
														variant="outline"
														onclick={(e) => { e.stopPropagation(); trackVariability(pattern.id); }}
														title="Track variability"
														class="h-8 flex-1"
													>
														<BarChart3 class="h-4 w-4" />
													</Button>
												{/if}
												{#if !pattern.learnedCategoryId}
													<Button
														size="sm"
														variant="outline"
														onclick={(e) => { e.stopPropagation(); learnCategory(pattern.id); }}
														title="Learn category"
														class="h-8 flex-1"
													>
														<Sparkles class="h-4 w-4" />
													</Button>
												{/if}
											</div>
										</div>
									</Card.Content>
								</Card.Root>
							{/each}
						</div>
					{/if}
				</Tabs.Content>

				<!-- Predictions Tab -->
				<Tabs.Content value="predictions" class="mt-4">
					{@const activePredictions = Array.from(predictions.entries()).filter(([patternId]) => {
						const pattern = patterns.find(p => p.id === patternId);
						return pattern && pattern.isActive;
					})}
					{#if activePredictions.length === 0}
						<div class="text-center py-8 text-muted-foreground">
							<p>No predictions available.</p>
							<p class="text-sm mt-2">Active patterns need at least 3 occurrences to generate predictions.</p>
						</div>
					{:else}
						<div class="space-y-3 sm:space-y-4">
							{#each activePredictions as [patternId, prediction] (patternId)}
								{@const pattern = patterns.find(p => p.id === patternId)}
								{#if pattern}
									<Card.Root>
										<Card.Content class="p-4 sm:p-6">
											<div class="flex flex-col gap-3">
												<h3 class="font-semibold text-sm sm:text-base">
													{pattern.descriptionPattern || 'Recurring Transaction'}
												</h3>
												<div class="space-y-2 text-xs sm:text-sm">
													<div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
														<div class="flex items-center gap-1.5 sm:gap-2">
															<Calendar class="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
															<span class="font-medium">Next Occurrence:</span>
														</div>
														<span>{format(parseISO(prediction.nextOccurrenceDate), 'MMM d, yyyy')}</span>
													</div>
													<div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
														<div class="flex items-center gap-1.5 sm:gap-2">
															<span class="font-medium">Predicted Amount:</span>
														</div>
														<div class="flex flex-wrap items-center gap-1 sm:gap-2">
															<span class="font-medium">
																{pattern.metadata.type === 'income' ? '+' : ''}
																{formatAmount(prediction.predictedAmount, pattern.metadata.currency || 'USD')}
															</span>
															<span class="text-muted-foreground text-xs">
																({pattern.metadata.type === 'income' ? '+' : ''}{formatAmount(prediction.variabilityRange.min, pattern.metadata.currency || 'USD')} - {pattern.metadata.type === 'income' ? '+' : ''}{formatAmount(prediction.variabilityRange.max, pattern.metadata.currency || 'USD')})
															</span>
														</div>
													</div>
													<div class="flex items-center gap-2">
														<Badge variant="outline" class="{getConfidenceColor(prediction.confidence)} text-xs">
															{prediction.confidence}% confidence
														</Badge>
													</div>
													{#if prediction.notes}
														<p class="text-xs text-muted-foreground mt-2">{prediction.notes}</p>
													{/if}
												</div>
											</div>
										</Card.Content>
									</Card.Root>
								{/if}
							{/each}
						</div>
					{/if}
				</Tabs.Content>

				<!-- Conflicts Tab -->
				<Tabs.Content value="conflicts" class="mt-4">
					{#if conflicts.length === 0}
						<div class="text-center py-8 text-muted-foreground">
							<CheckCircle2 class="h-12 w-12 mx-auto mb-2 text-green-500" />
							<p>No conflicts detected.</p>
							<p class="text-sm mt-2">All recurring patterns are consistent.</p>
						</div>
					{:else}
						<div class="space-y-3 sm:space-y-4">
							{#each conflicts as conflict (conflict.id)}
								{@const pattern = patterns.find(p => p.id === conflict.patternId)}
								<Card.Root>
									<Card.Content class="p-4 sm:p-6">
										<div class="flex flex-col gap-3">
											<div class="flex flex-wrap items-center gap-2">
												<Badge class="{getSeverityColor(conflict.severity)} text-xs">
													{conflict.severity} severity
												</Badge>
												<Badge variant="outline" class="text-xs">{conflict.type}</Badge>
											</div>
											<h3 class="font-semibold text-sm sm:text-base">
												{pattern?.descriptionPattern || 'Unknown Pattern'}
											</h3>
											<p class="text-xs sm:text-sm text-muted-foreground">{conflict.description}</p>
											{#if conflict.suggestedResolution}
												<div class="bg-accent p-3 rounded-md">
													<p class="text-xs sm:text-sm font-medium mb-1">Suggested Resolution:</p>
													<p class="text-xs text-muted-foreground mb-2">{conflict.suggestedResolution.details}</p>
													<div class="flex flex-col sm:flex-row gap-2">
														<Button
															size="sm"
															variant="outline"
															onclick={() => resolveConflict(conflict.id, conflict.suggestedResolution!.action)}
															class="w-full sm:w-auto text-xs sm:text-sm"
														>
															{conflict.suggestedResolution.action}
														</Button>
														<Button
															size="sm"
															variant="ghost"
															onclick={() => resolveConflict(conflict.id, 'ignore')}
															class="w-full sm:w-auto text-xs sm:text-sm"
														>
															Ignore
														</Button>
													</div>
												</div>
											{/if}
										</div>
									</Card.Content>
								</Card.Root>
							{/each}
						</div>
					{/if}
				</Tabs.Content>
			</Tabs.Root>
		</Card.Content>
	</Card.Root>

	<!-- Pattern Details Dialog -->
	{#if selectedPattern}
		<Dialog.Root bind:open={showPatternDetails}>
			<Dialog.Content class="max-w-2xl max-h-[90vh] overflow-y-auto">
				<Dialog.Header>
					<Dialog.Title class="text-lg sm:text-xl">Pattern Details</Dialog.Title>
					<Dialog.Description class="text-sm">
						Detailed information about the recurring pattern
					</Dialog.Description>
				</Dialog.Header>

				<div class="space-y-4">
					<!-- Basic Info -->
					<div>
						<h3 class="font-semibold mb-2 text-sm sm:text-base">Basic Information</h3>
						<div class="space-y-2 text-xs sm:text-sm">
							<div class="flex justify-between items-center gap-2">
								<span class="text-muted-foreground">Frequency:</span>
								<Badge class="{getFrequencyColor(selectedPattern.frequency)} text-xs">
									{selectedPattern.frequency}
								</Badge>
							</div>
							<div class="flex justify-between items-center gap-2">
								<span class="text-muted-foreground">Confidence:</span>
								<span class="{getConfidenceColor(selectedPattern.confidence)}">
									{selectedPattern.confidence}%
								</span>
							</div>
							<div class="flex justify-between items-center gap-2">
								<span class="text-muted-foreground">Occurrences:</span>
								<span>{selectedPattern.occurrences}</span>
							</div>
							<div class="flex justify-between items-center gap-2">
								<span class="text-muted-foreground">Average Amount:</span>
								<span class="font-medium">{formatAmount(selectedPattern.averageAmount, selectedPattern.metadata.currency || 'USD')}</span>
							</div>
							<div class="flex justify-between items-center gap-2">
								<span class="text-muted-foreground">Amount Variability:</span>
								<span>{selectedPattern.amountVariability.toFixed(1)}%</span>
							</div>
						</div>
					</div>

					<!-- Timing Info -->
					{#if selectedPattern.typicalDayOfMonth || selectedPattern.typicalDayOfWeek}
						<div>
							<h3 class="font-semibold mb-2 text-sm sm:text-base">Timing Pattern</h3>
							<div class="space-y-2 text-xs sm:text-sm">
								{#if selectedPattern.typicalDayOfMonth}
									<div class="flex justify-between items-center gap-2">
										<span class="text-muted-foreground">Typical Day of Month:</span>
										<span>{selectedPattern.typicalDayOfMonth}</span>
									</div>
								{/if}
								{#if selectedPattern.typicalDayOfWeek}
									<div class="flex justify-between items-center gap-2">
										<span class="text-muted-foreground">Typical Day of Week:</span>
										<span>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][selectedPattern.typicalDayOfWeek]}</span>
									</div>
								{/if}
								{#if selectedPattern.typicalWeekOfMonth}
									<div class="flex justify-between items-center gap-2">
										<span class="text-muted-foreground">Typical Week of Month:</span>
										<span>Week {selectedPattern.typicalWeekOfMonth}</span>
									</div>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Trend Info -->
					{#if selectedPattern.trend}
						<div>
							<h3 class="font-semibold mb-2 text-sm sm:text-base">Trend Analysis</h3>
							<div class="space-y-2 text-xs sm:text-sm">
								<div class="flex justify-between items-center gap-2">
									<span class="text-muted-foreground">Direction:</span>
									<span class="flex items-center gap-1">
										{#if selectedPattern.trend.direction === 'increasing'}
											<TrendingUp class="h-3 w-3 sm:h-4 sm:w-4 text-green-500" />
											<span class="text-green-500">Increasing</span>
										{:else if selectedPattern.trend.direction === 'decreasing'}
											<TrendingDown class="h-3 w-3 sm:h-4 sm:w-4 text-red-500" />
											<span class="text-red-500">Decreasing</span>
										{:else}
											<span>Stable</span>
										{/if}
									</span>
								</div>
								<div class="flex justify-between items-center gap-2">
									<span class="text-muted-foreground">Rate:</span>
									<span>{(selectedPattern.trend.rate * 100).toFixed(2)}% per period</span>
								</div>
								<div class="flex justify-between items-center gap-2">
									<span class="text-muted-foreground">Confidence:</span>
									<span>{selectedPattern.trend.confidence.toFixed(0)}%</span>
								</div>
							</div>
						</div>
					{/if}

					<!-- Seasonal Variation -->
					{#if selectedPattern.seasonalVariation && selectedPattern.seasonalVariation.length > 0}
						<div>
							<h3 class="font-semibold mb-2 text-sm sm:text-base">Seasonal Variation</h3>
							<div class="space-y-1 text-xs sm:text-sm">
								{#each selectedPattern.seasonalVariation as variation}
									<div class="flex justify-between items-center gap-2">
										<span class="text-muted-foreground">
											{['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][variation.month - 1]}:
										</span>
										<span class="font-medium">
											{variation.adjustment > 0 ? '+' : ''}
											{formatAmount(variation.adjustment, selectedPattern.metadata.currency || 'USD')}
										</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Category Learning -->
					{#if selectedPattern.learnedCategoryId}
						<div>
							<h3 class="font-semibold mb-2 text-sm sm:text-base">Learned Category</h3>
							<div class="text-xs sm:text-sm">
								<div class="flex justify-between items-center gap-2">
									<span class="text-muted-foreground">Category:</span>
									<Badge variant="outline" class="text-xs">{selectedPattern.learnedCategoryId}</Badge>
								</div>
								<div class="flex justify-between items-center gap-2 mt-2">
									<span class="text-muted-foreground">Confidence:</span>
									<span>{selectedPattern.categoryConfidence.toFixed(0)}%</span>
								</div>
							</div>
						</div>
					{/if}
				</div>

				<Dialog.Footer>
					<Button variant="outline" onclick={() => (showPatternDetails = false)} class="w-full sm:w-auto">Close</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	{/if}
</div>
