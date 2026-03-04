<script lang="ts">
	import { goto } from '$app/navigation';
	import { budgetService } from '$lib/core/services';
	import type { Category } from '$lib/core/db';
	import * as Select from '$lib/components/ui/select/index.ts';
	import { Switch } from '$lib/components/ui/switch/index.ts';
	import { PageLayout } from '$lib/components/layouts';
	import Header from '$lib/components/Header.svelte';

	let isLoading = $state(false);
	let error = $state('');
	let activeTab = $state('basic');

	// Form state
	let name = $state('');
	let type = $state<Category['type']>('expense');
	let waterfallTier = $state<Category['waterfallTier']>('lifestyle');
	let budgetAmount = $state<number | undefined>(undefined);
	let priority = $state(1);
	let color = $state('#6B7280');
	let description = $state('');
	let isActive = $state(true);


	const waterfallOptions: { value: Category['waterfallTier']; label: string; description: string }[] = [
		{ value: 'survival', label: 'Survival', description: 'Essential needs for basic living' },
		{ value: 'security', label: 'Security', description: 'Financial safety and stability' },
		{ value: 'growth', label: 'Growth', description: 'Personal and financial development' },
		{ value: 'lifestyle', label: 'Lifestyle', description: 'Discretionary spending and enjoyment' }
	];

	const typeOptions: { value: Category['type']; label: string; description: string }[] = [
		{ value: 'expense', label: 'Expense', description: 'Categories for spending money' },
		{ value: 'income', label: 'Income', description: 'Categories for earning money' }
	];

	const colorOptions = [
		{ value: '#EF4444', label: 'Red' },
		{ value: '#F97316', label: 'Orange' },
		{ value: '#EAB308', label: 'Yellow' },
		{ value: '#84CC16', label: 'Lime' },
		{ value: '#22C55E', label: 'Green' },
		{ value: '#06B6D4', label: 'Cyan' },
		{ value: '#3B82F6', label: 'Blue' },
		{ value: '#8B5CF6', label: 'Purple' },
		{ value: '#EC4899', label: 'Pink' },
		{ value: '#6B7280', label: 'Gray' }
	];

	async function handleSubmit(event: Event) {
		event.preventDefault();
		isLoading = true;
		error = '';

		try {
			// Validate required fields
			if (!name.trim()) {
				throw new Error('Category name is required');
			}
			if (budgetAmount !== undefined && budgetAmount < 0) {
				throw new Error('Budget amount cannot be negative');
			}

			// Create the category
			await budgetService.createCategory({
				name: name.trim(),
				type,
				waterfallTier,
				priority,
				budgetAmount,
				color,
				description: description.trim() || undefined,
				isActive
			});

			// Redirect to Plan > Categories tab
			goto('/plan?tab=categories');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create category';
			console.error(err);
		} finally {
			isLoading = false;
		}
	}

</script>

<svelte:head>
	<title>New category | Budgic</title>
</svelte:head>

<PageLayout>
	{#snippet topBar()}
		<Header
			title="New category"
			backButtonLabel="Back to categories"
			backButtonLink="/plan?tab=categories"
		/>
	{/snippet}

	{#snippet bottomBar()}
		<div class="bg-[var(--color-bg-secondary)]/90 backdrop-blur-sm border-t border-border px-4 py-3 flex gap-3">
			<button
				type="button"
				onclick={() => goto('/plan?tab=categories')}
				disabled={isLoading}
				class="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-surface)] disabled:opacity-50"
			>
				Cancel
			</button>
			<button
				type="submit"
				form="category-form"
				disabled={isLoading}
				class="flex-1 rounded-xl bg-[var(--color-amber)] px-4 py-2.5 text-sm font-semibold text-[var(--color-bg-primary)] transition-opacity disabled:opacity-60"
			>
				{isLoading ? 'Creating…' : 'Create category'}
			</button>
		</div>
	{/snippet}

	<div class="mx-auto max-w-2xl px-4 py-6">
		{#if error}
			<div class="mb-5 squircle-2xl squircle-border px-5 py-3" style="--squircle-border-color: color-mix(in oklch, var(--color-warm-coral) 30%, transparent); --squircle-fill: color-mix(in oklch, var(--color-warm-coral) 8%, transparent);">
				<p class="text-sm text-[var(--color-warm-coral)]">{error}</p>
			</div>
		{/if}

		<form id="category-form" onsubmit={handleSubmit} class="space-y-6">
			<div class="squircle-4xl squircle-border squircle-fill-tertiary divide-y divide-border overflow-hidden">
				<div class="px-5 py-2.5">
					<h2 class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Category details</h2>
				</div>

				<div class="px-5 py-4 space-y-1.5">
					<label for="name" class="text-sm font-medium text-[var(--color-text-primary)]">Name</label>
					<input
						id="name"
						bind:value={name}
						placeholder="e.g., Groceries, Entertainment"
						required
						class="w-full rounded-xl border border-border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
					/>
				</div>

				<div class="px-5 py-4 space-y-2">
					<p class="text-sm font-medium text-[var(--color-text-primary)]">Type</p>
					<div class="grid grid-cols-2 gap-2">
						{#each typeOptions as option}
							<button
								type="button"
								onclick={() => type = option.value}
								class="rounded-xl border p-3 text-left transition-colors {type === option.value
									? 'border-[var(--color-amber)] bg-[var(--color-amber-subtle)]'
									: 'border-border bg-[var(--color-bg-surface)] hover:border-[var(--color-amber)]/40'}"
							>
								<p class="text-sm font-medium {type === option.value ? 'text-[var(--color-amber)]' : 'text-[var(--color-text-primary)]'}">{option.label}</p>
								<p class="text-xs text-[var(--color-text-tertiary)] mt-0.5">{option.description}</p>
							</button>
						{/each}
					</div>
				</div>

				<div class="px-5 py-4 space-y-2">
					<p class="text-sm font-medium text-[var(--color-text-primary)]">Priority tier</p>
					<div class="grid grid-cols-2 gap-2">
						{#each waterfallOptions as option}
							<button
								type="button"
								onclick={() => waterfallTier = option.value}
								class="rounded-xl border p-3 text-left transition-colors {waterfallTier === option.value
									? 'border-[var(--color-amber)] bg-[var(--color-amber-subtle)]'
									: 'border-border bg-[var(--color-bg-surface)] hover:border-[var(--color-amber)]/40'}"
							>
								<p class="text-sm font-medium {waterfallTier === option.value ? 'text-[var(--color-amber)]' : 'text-[var(--color-text-primary)]'}">{option.label}</p>
								<p class="text-xs text-[var(--color-text-tertiary)] mt-0.5">{option.description}</p>
							</button>
						{/each}
					</div>
				</div>

				<div class="px-5 py-4 space-y-1.5">
					<label for="budgetAmount" class="text-sm font-medium text-[var(--color-text-primary)]">Budget amount <span class="text-[var(--color-text-tertiary)]">(optional)</span></label>
					<input
						id="budgetAmount"
						type="number"
						bind:value={budgetAmount}
						placeholder="0.00"
						step="0.01"
						class="w-36 rounded-xl border border-border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
					/>
				</div>

				<div class="px-5 py-4 space-y-1.5">
					<label for="color" class="text-sm font-medium text-[var(--color-text-primary)]">Color</label>
					<div class="flex flex-wrap gap-2">
						{#each colorOptions as option}
							<button
								type="button"
								onclick={() => color = option.value}
								class="size-8 rounded-full transition-all {color === option.value ? 'ring-2 ring-offset-2 ring-[var(--color-amber)]' : 'opacity-70 hover:opacity-100'}"
								style="background-color: {option.value}"
								title={option.label}
							></button>
						{/each}
					</div>
				</div>

				<div class="px-5 py-4 space-y-1.5">
					<label for="description" class="text-sm font-medium text-[var(--color-text-primary)]">Description <span class="text-[var(--color-text-tertiary)]">(optional)</span></label>
					<textarea
						id="description"
						bind:value={description}
						placeholder="Optional description…"
						rows="2"
						class="w-full rounded-xl border border-border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] resize-none outline-none focus:border-[var(--color-amber)]"
					></textarea>
				</div>

				<div class="flex items-center justify-between px-5 py-4">
					<div>
						<p class="text-sm font-medium text-[var(--color-text-primary)]">Active</p>
						<p class="text-xs text-[var(--color-text-tertiary)]">Inactive categories are hidden in forms</p>
					</div>
					<Switch bind:checked={isActive} />
				</div>
			</div>
		</form>
	</div>
</PageLayout>
