<script lang="ts">
	import { onMount } from 'svelte';
	import { budgetService } from '$lib/core/services/core/budget-service';
	import type { CategoryUsage } from '$lib/core/services/core/budget-service';
	import type { Category } from '$lib/core/db';
	import { formatMainCurrencyAmount } from '$lib/utils/currency-utils';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { BarChart3, AlertCircle, ArrowRight } from '@lucide/svelte';
	import { goto } from '$app/navigation';

	interface Props {
		userCurrency?: string;
	}

	const { userCurrency = 'USD' }: Props = $props();

	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let categoryUsage = $state<Map<string, CategoryUsage> | null>(null);
	let categories = $state<Map<string, string>>(new Map());

	onMount(async () => {
		try {
			const usage = await budgetService.getCategoryUsage();
			categoryUsage = usage;
			// Build a category name map from budget categories
			const allCategories: Category[] = await budgetService.getBudgetCategories();
			const nameMap = new Map<string, string>();
			for (const cat of allCategories) {
				nameMap.set(cat.id, cat.name);
			}
			categories = nameMap;
		} catch (err) {
			console.error('Failed to load spending vs budget:', err);
			error = err instanceof Error ? err.message : 'Failed to load budget data';
		} finally {
			isLoading = false;
		}
	});

	function getCategoriesWithRoom(): Array<{ id: string; name: string; usage: CategoryUsage }> {
		if (!categoryUsage) return [];
		const result: Array<{ id: string; name: string; usage: CategoryUsage }> = [];
		for (const [id, usage] of categoryUsage) {
			if (
				usage.budget !== null &&
				usage.budget > 0 &&
				usage.usageRatio !== null &&
				usage.usageRatio < 0.85
			) {
				result.push({ id, name: categories.get(id) || id, usage });
			}
		}
		return result
			.sort((a, b) => (a.usage.usageRatio ?? 0) - (b.usage.usageRatio ?? 0))
			.slice(0, 5);
	}

	// Categories over budget: spent > budget
	function getCategoriesOverBudget(): Array<{ id: string; name: string; usage: CategoryUsage }> {
		if (!categoryUsage) return [];
		const result: Array<{ id: string; name: string; usage: CategoryUsage }> = [];
		for (const [id, usage] of categoryUsage) {
			if (
				usage.budget !== null &&
				usage.budget > 0 &&
				usage.usageRatio !== null &&
				usage.usageRatio > 1.0
			) {
				result.push({ id, name: categories.get(id) || id, usage });
			}
		}
		return result
			.sort((a, b) => (b.usage.usageRatio ?? 0) - (a.usage.usageRatio ?? 0))
			.slice(0, 5);
	}

	function formatAmount(amount: number): string {
		return formatMainCurrencyAmount(amount, userCurrency);
	}
</script>

<Card.Root>
	<Card.Header>
		<div class="flex items-center gap-2">
			<BarChart3 class="text-primary h-5 w-5" />
			<Card.Title class="text-base">Spending vs budget</Card.Title>
		</div>
	</Card.Header>
	<Card.Content class="flex flex-col">
		{#if isLoading}
			<div class="space-y-3">
				<Skeleton class="h-4 w-40" />
				<Skeleton class="h-12 w-full rounded-lg" />
				<Skeleton class="h-12 w-full rounded-lg" />
			</div>
		{:else if error}
			<p class="text-destructive flex items-center gap-2 text-sm">
				<AlertCircle class="h-4 w-4" />
				{error}
			</p>
		{:else if !categoryUsage || categoryUsage.size === 0}
			<p class="text-muted-foreground text-sm">
				No budget data yet. Set up category budgets in Plan.
			</p>
		{:else}
			{#if getCategoriesOverBudget().length > 0}
				<div class="mb-3">
					<p
						class="text-muted-foreground mb-1.5 text-xs font-medium tracking-wider uppercase"
					>
						Over budget
					</p>
					<div class="space-y-1.5">
						{#each getCategoriesOverBudget() as item}
							<div
								class="flex items-center justify-between rounded-lg bg-red-500/10 px-3 py-2 text-sm"
							>
								<span class="truncate font-medium">{item.name}</span>
								<div class="shrink-0 text-right">
									<span class="font-medium text-red-500"
										>{formatAmount(item.usage.spent)}</span
									>
									<span class="text-muted-foreground ml-1 text-xs">
										/ {formatAmount(item.usage.budget!)}
									</span>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			{#if getCategoriesWithRoom().length > 0}
				<div>
					<p
						class="text-muted-foreground mb-1.5 text-xs font-medium tracking-wider uppercase"
					>
						Room to redirect
					</p>
					<div class="space-y-1.5">
						{#each getCategoriesWithRoom() as item}
							<div
								class="flex items-center justify-between rounded-lg bg-green-500/10 px-3 py-2 text-sm"
							>
								<span class="truncate font-medium">{item.name}</span>
								<div class="shrink-0 text-right">
									<span class="font-medium text-green-500"
										>{formatAmount(item.usage.spent)}</span
									>
									<span class="text-muted-foreground ml-1 text-xs">
										/ {formatAmount(item.usage.budget!)}
									</span>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			{#if getCategoriesOverBudget().length === 0 && getCategoriesWithRoom().length === 0}
				<p class="text-muted-foreground text-sm">All budgeted categories are on track.</p>
			{/if}

			<div class="mt-auto border-t pt-4">
				<Button variant="outline" size="sm" onclick={() => goto('/plan?tab=budget')}>
					View budget details
					<ArrowRight class="ml-1 h-3 w-3" />
				</Button>
			</div>
		{/if}
	</Card.Content>
</Card.Root>
