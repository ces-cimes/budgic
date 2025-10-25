<script lang="ts">
	import { goto } from '$app/navigation';
	import { budgetService } from '$lib/core/services/budget-service';
	import type { Category } from '$lib/core/db';
	import { Button } from '$lib/components/ui/button/index.ts';
	import * as Input from '$lib/components/ui/input/index.ts';
	import * as Label from '$lib/components/ui/label/index.ts';
	import * as Select from '$lib/components/ui/select/index.ts';
	import * as Switch from '$lib/components/ui/switch/index.ts';
	import * as Alert from '$lib/components/ui/alert/index.ts';
	import * as Tabs from '$lib/components/ui/tabs/index.ts';
	import * as Card from '$lib/components/ui/card/index.ts';
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
		{ value: 'income', label: 'Income', description: 'Categories for earning money' },
		{ value: 'transfer', label: 'Transfer', description: 'Categories for moving money between accounts' }
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

			// Redirect to categories list
			goto('/categories');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create category';
			console.error(err);
		} finally {
			isLoading = false;
		}
	}

	function formatCurrency(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD'
		}).format(amount);
	}
</script>

<svelte:head>
	<title>Add Spending Category - Budgic</title>
</svelte:head>

<PageLayout>
	{#snippet topBar()}
		<!-- Header -->
		<Header 
			title="Add Spending Category"
			showBackButton={true}
			backButtonLink="/categories"
			backButtonLabel="Back to Categories"
		>
		<p class="text-muted-foreground text-sm">
			Create a new spending category to organize your expenses
		</p>
		</Header>
	{/snippet}

	{#snippet bottomBar()}
		<!-- Action buttons for form submission -->
		<div class="flex justify-end space-x-4 max-w-4xl mx-auto">
			<Button
				type="button"
				variant="outline"
				onclick={() => goto('/categories')}
				disabled={isLoading}
				class="grow"
			>
				Cancel
			</Button>
			<Button
				type="submit"
				form="category-form"
				disabled={isLoading}
				class="grow"
			>
				{isLoading ? 'Creating...' : 'Create Category'}
			</Button>
		</div>
	{/snippet}

	<div class="container mx-auto p-4 max-w-4xl space-y-4">
		{#if error}
			<Alert.Root variant="destructive">
				<Alert.Title>Error</Alert.Title>
				<Alert.Description>{error}</Alert.Description>
			</Alert.Root>
		{/if}

		<!-- Category Form -->
		<section>
			<form id="category-form" onsubmit={handleSubmit} class="space-y-4">
			<!-- Tabs for different sections -->
			<Tabs.Root bind:value={activeTab} class="w-full">
				<Tabs.List class="grid w-full grid-cols-1">
					<Tabs.Trigger value="basic">Category Information</Tabs.Trigger>
				</Tabs.List>

				<!-- Basic Information Tab -->
				<Tabs.Content value="basic" class="space-y-4">
					<Card.Root>
						<Card.Header>
							<Card.Title>Category Details</Card.Title>
							<Card.Description>Basic information about your budget category</Card.Description>
						</Card.Header>
						<Card.Content class="space-y-4">
							<!-- Category Name -->
							<div class="space-y-2">
								<Label.Root for="name">Category Name *</Label.Root>
								<Input.Root
									id="name"
									bind:value={name}
									placeholder="e.g., Groceries, Entertainment, Emergency Fund"
									required
								/>
							</div>

							<!-- Category Type -->
							<div class="space-y-2">
								<Label.Root for="type">Category Type *</Label.Root>
								<Select.Root type="single" bind:value={type}>
									<Select.Trigger>
										{typeOptions.find(opt => opt.value === type)?.label || "Select category type"}
									</Select.Trigger>
									<Select.Content>
										{#each typeOptions as option}
											<Select.Item value={option.value}>
												<div>
													<div class="font-medium">{option.label}</div>
													<div class="text-sm text-muted-foreground">{option.description}</div>
												</div>
											</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
							</div>

							<!-- Waterfall Tier -->
							<div class="space-y-2">
								<Label.Root for="waterfallTier">Priority Level *</Label.Root>
								<Select.Root type="single" bind:value={waterfallTier}>
									<Select.Trigger>
										{waterfallOptions.find(opt => opt.value === waterfallTier)?.label || "Select priority level"}
									</Select.Trigger>
									<Select.Content>
										{#each waterfallOptions as option}
											<Select.Item value={option.value}>
												<div>
													<div class="font-medium">{option.label}</div>
													<div class="text-sm text-muted-foreground">{option.description}</div>
												</div>
											</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
							</div>

							<!-- Priority within waterfall tier -->
							<div class="space-y-2">
								<Label.Root for="priority">Priority (within {waterfallTier})</Label.Root>
								<Input.Root
									id="priority"
									type="number"
									bind:value={priority}
									min="1"
									max="100"
								/>
								<p class="text-xs text-muted-foreground">Lower numbers = higher priority</p>
							</div>

							<!-- Budget Amount -->
							<div class="space-y-2">
								<Label.Root for="budgetAmount">Budget Amount (Optional)</Label.Root>
								<div class="relative">
									<span class="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">$</span>
									<Input.Root
										id="budgetAmount"
										type="number"
										bind:value={budgetAmount}
										placeholder="0.00"
										step="0.01"
										class="pl-8"
									/>
								</div>
								<p class="text-xs text-muted-foreground">
									Leave empty if you don't want to set a budget for this category
								</p>
							</div>

							<!-- Color -->
							<div class="space-y-2">
								<Label.Root for="color">Color</Label.Root>
								<Select.Root type="single" bind:value={color}>
									<Select.Trigger>
										<div class="flex items-center space-x-2">
											<div class="w-4 h-4 rounded-full" style="background-color: {color}"></div>
											<span>{colorOptions.find(opt => opt.value === color)?.label || 'Custom'}</span>
										</div>
									</Select.Trigger>
									<Select.Content>
										{#each colorOptions as option}
											<Select.Item value={option.value}>
												<div class="flex items-center space-x-2">
													<div class="w-4 h-4 rounded-full" style="background-color: {option.value}"></div>
													<span>{option.label}</span>
												</div>
											</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
							</div>

							<!-- Description -->
							<div class="space-y-2">
								<Label.Root for="description">Description</Label.Root>
								<textarea
									id="description"
									bind:value={description}
									placeholder="Optional description for this category..."
									rows="3"
									class="w-full px-3 py-2 border border-input rounded-md bg-background text-primary resize-none focus:ring-2 focus:ring-ring focus:border-transparent"
								></textarea>
							</div>

							<!-- Active Status -->
							<div class="space-y-2">
								<div class="flex items-center space-x-2">
									<Switch.Root bind:checked={isActive} />
									<Label.Root for="isActive">Category is active</Label.Root>
								</div>
								<p class="text-xs text-muted-foreground">
									Inactive categories won't appear in transaction forms but will be preserved for historical data
								</p>
							</div>
						</Card.Content>
					</Card.Root>
				</Tabs.Content>
			</Tabs.Root>
			</form>
		</section>
	</div>
</PageLayout>
