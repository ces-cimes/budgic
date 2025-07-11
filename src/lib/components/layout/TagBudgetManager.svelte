<script lang="ts">
	import { budgetService, type TagBudget, type TagBudgetSuggestion, type CategoryBudget } from '$lib/core/services/budget-service';
	import Button from '$lib/components/primitives/Button.svelte';
	import { Plus, Target, CheckCircle, TrendingUp, TrendingDown, Edit, Save, DollarSign } from '@lucide/svelte';

	const { onSave = () => {} } = $props<{
		onSave?: () => void;
	}>();

	let categoryBudgets = $state<CategoryBudget[]>([]);
	let tagBudgetSuggestions = $state<TagBudgetSuggestion[]>([]);
	let isLoading = $state(true);
	let isEditing = $state(false);
	let availableIncome = $state(0);
	let editingTagBudget = $state<TagBudget | null>(null);
	let showIncomeInput = $state(false);

	function formatCurrency(amount: number) {
		return new Intl.NumberFormat('en-US', { 
			style: 'currency', 
			currency: 'USD',
			minimumFractionDigits: 0
		}).format(amount);
	}

	function calculateProgress(spent: number, allocated: number) {
		return Math.min((spent / allocated) * 100, 100);
	}

	function calculateGoalProgress(progress: number, target: number) {
		return Math.min((progress / target) * 100, 100);
	}

	const loadTagBudgets = async () => {
		try {
			isLoading = true;
			
			// Get category budgets (which include tag budgets)
			categoryBudgets = await budgetService.calculateCategoryBudgets();
			
			// Only generate suggestions if there's available income
			if (availableIncome > 0) {
				const allTagBudgets = categoryBudgets.flatMap(cb => cb.tagBudgets);
				tagBudgetSuggestions = await budgetService.generateTagBudgetSuggestions(availableIncome, allTagBudgets);
			} else {
				tagBudgetSuggestions = [];
			}
			
		} catch (error) {
			console.error('Error loading tag budgets:', error);
		} finally {
			isLoading = false;
		}
	};

	const startEditing = (tagBudget: TagBudget) => {
		editingTagBudget = { ...tagBudget };
		isEditing = true;
	};

	const saveTagBudget = async () => {
		if (editingTagBudget) {
			try {
				await budgetService.updateTagBudget(editingTagBudget.tagId, editingTagBudget);
				await loadTagBudgets(); // Reload data
				onSave();
			} catch (error) {
				console.error('Error saving tag budget:', error);
			}
		}
		editingTagBudget = null;
		isEditing = false;
	};

	const cancelEditing = () => {
		editingTagBudget = null;
		isEditing = false;
	};

	const applySuggestion = async (suggestion: TagBudgetSuggestion) => {
		try {
			const tagBudget = categoryBudgets
				.flatMap(cb => cb.tagBudgets)
				.find(tb => tb.tagId === suggestion.tagId);
			
			if (tagBudget) {
				const newAmount = tagBudget.allocatedAmount + suggestion.suggestedAmount;
				await budgetService.updateTagBudget(tagBudget.tagId, { allocatedAmount: newAmount });
				await loadTagBudgets(); // Reload data
				onSave();
			}
		} catch (error) {
			console.error('Error applying suggestion:', error);
		}
	};

	const createNewTagBudget = async () => {
		// TODO: Implement new tag budget creation
		console.log('Create new tag budget');
	};

	const generateSuggestions = async () => {
		if (availableIncome > 0) {
			const allTagBudgets = categoryBudgets.flatMap(cb => cb.tagBudgets);
			tagBudgetSuggestions = await budgetService.generateTagBudgetSuggestions(availableIncome, allTagBudgets);
		}
	};

	$effect(() => {
		loadTagBudgets();
	});

	$effect(() => {
		if (availableIncome > 0) {
			generateSuggestions();
		}
	});
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-xl font-bold text-text-primary">Tag-Level Budgets</h2>
			<p class="text-text-secondary text-sm">Manage individual tag budgets with dynamic category rollups</p>
		</div>
		<Button 
			variant="primary" 
			size="sm"
			onclick={createNewTagBudget}
		>
			<Plus size={16} class="mr-2" />
			Add Tag Budget
		</Button>
	</div>

	<!-- Available Income Input -->
	<div class="bg-bg-secondary rounded-2xl p-4 border border-primary">
		<div class="flex items-center justify-between">
			<div class="flex-1">
				<label class="block text-sm font-medium text-text-secondary mb-2">Available Income to Allocate</label>
				<div class="flex items-center gap-3">
					<input
						type="number"
						bind:value={availableIncome}
						class="flex-1 p-3 bg-bg-tertiary border border-bg-surface/50 rounded-lg text-text-primary"
						placeholder="Enter amount to allocate"
						min="0"
						step="50"
					/>
					<Button 
						variant="secondary" 
						size="sm"
						onclick={generateSuggestions}
						disabled={availableIncome <= 0}
					>
						<DollarSign size={16} class="mr-2" />
						Get Suggestions
					</Button>
				</div>
			</div>
			{#if availableIncome > 0}
				<div class="text-right">
					<div class="text-2xl font-bold text-text-primary">{formatCurrency(availableIncome)}</div>
					<div class="text-sm text-text-tertiary">to allocate</div>
				</div>
			{/if}
		</div>
	</div>

	{#if isLoading}
		<div class="flex items-center justify-center py-8">
			<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
		</div>
	{:else}
		<!-- Tag Budget Suggestions -->
		{#if tagBudgetSuggestions.length > 0}
			<div class="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-2xl p-4 border border-blue-200 dark:border-blue-800">
				<h3 class="font-semibold text-text-primary mb-3">Budget Suggestions for {formatCurrency(availableIncome)}</h3>
				<div class="space-y-2">
					{#each tagBudgetSuggestions as suggestion}
						<div class="flex items-center justify-between p-3 bg-white dark:bg-bg-secondary rounded-lg">
							<div class="flex-1">
								<div class="flex items-center gap-2">
									<span class="font-medium text-text-primary">{suggestion.tagName}</span>
									<span class="text-xs px-2 py-1 rounded-full" 
										  class:text-bg-red-100={suggestion.priority === 'high'}
										  class:text-bg-yellow-100={suggestion.priority === 'medium'}
										  class:text-bg-green-100={suggestion.priority === 'low'}
										  class:text-red-700={suggestion.priority === 'high'}
										  class:text-yellow-700={suggestion.priority === 'medium'}
										  class:text-green-700={suggestion.priority === 'low'}>
										{suggestion.priority}
									</span>
								</div>
								<p class="text-sm text-text-secondary">{suggestion.reason}</p>
							</div>
							<div class="text-right">
								<div class="font-bold text-text-primary">{formatCurrency(suggestion.suggestedAmount)}</div>
								<Button 
									variant="secondary" 
									size="sm"
									onclick={() => applySuggestion(suggestion)}
								>
									Apply
								</Button>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{:else if availableIncome > 0}
			<div class="bg-bg-secondary rounded-2xl p-4 border border-primary">
				<div class="text-center py-4">
					<CheckCircle size={48} class="mx-auto text-green-500 mb-4" />
					<h3 class="text-lg font-semibold text-text-primary mb-2">All Budgets Complete!</h3>
					<p class="text-text-secondary">All your tag budgets are fully funded. Consider creating new goals or increasing existing allocations.</p>
				</div>
			</div>
		{/if}

		<!-- Category Budgets with Tag Details -->
		<div class="space-y-4">
			{#each categoryBudgets as categoryBudget}
				<div class="bg-bg-secondary rounded-2xl p-4 border border-primary">
					<!-- Category Header -->
					<div class="flex items-center justify-between mb-4">
						<div class="flex items-center gap-2">
							<span class="text-lg font-bold text-text-primary capitalize">{categoryBudget.waterfallCategory}</span>
							{#if categoryBudget.isComplete}
								<CheckCircle size={20} class="text-green-500" />
							{/if}
						</div>
						<div class="text-right">
							<div class="font-bold text-text-primary">{formatCurrency(categoryBudget.totalAllocated)}</div>
							<div class="text-xs text-text-tertiary">Target: {formatCurrency(categoryBudget.targetAmount)}</div>
						</div>
					</div>

					<!-- Category Progress -->
					<div class="mb-4">
						<div class="flex justify-between text-sm mb-1">
							<span class="text-text-secondary">Used: {formatCurrency(categoryBudget.spent)}</span>
							<span class="text-text-secondary">Remaining: {formatCurrency(categoryBudget.remaining)}</span>
						</div>
						<div class="w-full bg-bg-tertiary rounded-full h-2">
							<div 
								class="h-2 rounded-full transition-all duration-300"
								style="width: {calculateProgress(categoryBudget.spent, categoryBudget.totalAllocated)}%; background-color: {categoryBudget.waterfallCategory === 'survival' ? '#4A7C59' : categoryBudget.waterfallCategory === 'security' ? '#E8B86D' : categoryBudget.waterfallCategory === 'growth' ? '#FF8A80' : '#9C27B0'};"
							></div>
						</div>
					</div>

					<!-- Tag Budgets -->
					<div class="space-y-3">
						{#each categoryBudget.tagBudgets as tagBudget}
							<div class="p-3 bg-bg-tertiary rounded-lg">
								<!-- Tag Header -->
								<div class="flex items-center justify-between mb-2">
									<div class="flex items-center gap-2">
										<span class="font-medium text-text-primary">{tagBudget.tagName}</span>
										{#if tagBudget.isGoalBased}
											<Target size={16} class="text-text-tertiary" />
										{/if}
										{#if tagBudget.isComplete}
											<CheckCircle size={16} class="text-green-500" />
										{/if}
									</div>
									<div class="flex items-center gap-2">
										<div class="text-right">
											<div class="font-medium text-text-primary">{formatCurrency(tagBudget.allocatedAmount)}</div>
											<div class="text-xs text-text-tertiary">Used: {formatCurrency(tagBudget.spent)}</div>
										</div>
										{#if !isEditing || editingTagBudget?.tagId !== tagBudget.tagId}
											<Button 
												variant="secondary" 
												size="sm"
												onclick={() => startEditing(tagBudget)}
											>
												<Edit size={14} />
											</Button>
										{/if}
									</div>
								</div>

								<!-- Tag Progress -->
								<div class="mb-2">
									<div class="w-full bg-bg-surface rounded-full h-1.5">
										<div 
											class="h-1.5 rounded-full transition-all duration-300"
											style="width: {calculateProgress(tagBudget.spent, tagBudget.allocatedAmount)}%; background-color: {categoryBudget.waterfallCategory === 'survival' ? '#4A7C59' : categoryBudget.waterfallCategory === 'security' ? '#E8B86D' : categoryBudget.waterfallCategory === 'growth' ? '#FF8A80' : '#9C27B0'};"
										></div>
									</div>
								</div>

								<!-- Goal Progress (if applicable) -->
								{#if tagBudget.isGoalBased && tagBudget.goalTarget}
									<div class="flex items-center justify-between text-xs text-text-tertiary">
										<span>Goal Progress:</span>
										<span>{formatCurrency(tagBudget.goalProgress || 0)} / {formatCurrency(tagBudget.goalTarget)}</span>
									</div>
									<div class="w-full bg-bg-surface rounded-full h-1 mt-1">
										<div 
											class="h-1 rounded-full transition-all duration-300 bg-blue-500"
											style="width: {calculateGoalProgress(tagBudget.goalProgress || 0, tagBudget.goalTarget)}%;"
										></div>
									</div>
								{/if}

								<!-- Edit Mode -->
								{#if isEditing && editingTagBudget?.tagId === tagBudget.tagId}
									<div class="mt-3 p-3 bg-bg-surface rounded-lg">
										<div class="space-y-3">
											<div>
												<label class="text-sm text-text-secondary">Budget Amount</label>
												<input
													type="number"
													bind:value={editingTagBudget.allocatedAmount}
													class="w-full p-2 bg-bg-tertiary border border-bg-surface/50 rounded-lg text-text-primary"
													placeholder="Enter amount"
												/>
											</div>
											{#if editingTagBudget.isGoalBased}
												<div>
													<label class="text-sm text-text-secondary">Goal Target</label>
													<input
														type="number"
														bind:value={editingTagBudget.goalTarget}
														class="w-full p-2 bg-bg-tertiary border border-bg-surface/50 rounded-lg text-text-primary"
														placeholder="Enter goal target"
													/>
												</div>
											{/if}
											<div class="flex gap-2">
												<Button 
													variant="primary" 
													size="sm"
													onclick={saveTagBudget}
												>
													<Save size={14} class="mr-1" />
													Save
												</Button>
												<Button 
													variant="secondary" 
													size="sm"
													onclick={cancelEditing}
												>
													Cancel
												</Button>
											</div>
										</div>
									</div>
								{/if}

								<!-- Rollover/Borrowed Indicators -->
								{#if tagBudget.rolloverAmount > 0 || tagBudget.borrowedAmount > 0}
									<div class="mt-2 pt-2 border-t border-bg-surface/50">
										{#if tagBudget.rolloverAmount > 0}
											<div class="flex items-center gap-1 text-xs text-green-600">
												<TrendingUp size={12} />
												<span>Rollover: {formatCurrency(tagBudget.rolloverAmount)}</span>
											</div>
										{/if}
										{#if tagBudget.borrowedAmount > 0}
											<div class="flex items-center gap-1 text-xs text-red-600">
												<TrendingDown size={12} />
												<span>Borrowed: {formatCurrency(tagBudget.borrowedAmount)}</span>
											</div>
										{/if}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div> 