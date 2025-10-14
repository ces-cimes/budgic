<script lang="ts">
	import { goto } from '$app/navigation';
	import { budgetService } from '$lib/core/services/budget-service';
	import type { WaterfallCategory } from '$lib/core/services/budget-service';
	import * as Button from '$lib/components/ui/button/index.ts';
	import * as Input from '$lib/components/ui/input/index.ts';
	import * as Label from '$lib/components/ui/label/index.ts';
	import * as Select from '$lib/components/ui/select/index.ts';
	import * as Switch from '$lib/components/ui/switch/index.ts';
	import * as Alert from '$lib/components/ui/alert/index.ts';
	import * as Tabs from '$lib/components/ui/tabs/index.ts';
	import * as Card from '$lib/components/ui/card/index.ts';
	import { PageLayout, MobileNavigation } from '$lib/components/layouts';
	import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
	import Header from '$lib/components/Header.svelte';

	let isLoading = $state(false);
	let error = $state('');
	let activeTab = $state('basic');

	// Form state
	let name = $state('');
	let waterfallCategory = $state<WaterfallCategory>('lifestyle');
	let allocatedAmount = $state(0);
	let priority = $state(1);
	let recurringPeriod = $state<'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' | 'custom'>('monthly');
	let customPeriodDays = $state<number | undefined>(undefined);
	let color = $state('#6B7280');
	let description = $state('');

	// Goal settings
	let isGoalBased = $state(false);
	let goalTarget = $state<number | undefined>(undefined);

	// Advanced settings
	let maxCarryoverPercent = $state(0.2);
	let autoAdjustmentsEnabled = $state(true);

	// Sidebar context for mobile detection
	const sidebar = Sidebar.useSidebar();

	const waterfallOptions: { value: WaterfallCategory; label: string; description: string }[] = [
		{ value: 'survival', label: 'Survival', description: 'Essential needs for basic living' },
		{ value: 'security', label: 'Security', description: 'Financial safety and stability' },
		{ value: 'growth', label: 'Growth', description: 'Personal and financial development' },
		{ value: 'lifestyle', label: 'Lifestyle', description: 'Discretionary spending and enjoyment' }
	];

	const recurringPeriodOptions = [
		{ value: 'daily', label: 'Daily' },
		{ value: 'weekly', label: 'Weekly' },
		{ value: 'biweekly', label: 'Bi-weekly (every 2 weeks)' },
		{ value: 'monthly', label: 'Monthly' },
		{ value: 'yearly', label: 'Yearly' },
		{ value: 'custom', label: 'Custom' }
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
			if (allocatedAmount <= 0) {
				throw new Error('Allocated amount must be greater than 0');
			}
			if (recurringPeriod === 'custom' && (!customPeriodDays || customPeriodDays <= 0)) {
				throw new Error('Custom period days must be specified and greater than 0');
			}
			if (isGoalBased && (!goalTarget || goalTarget <= 0)) {
				throw new Error('Goal target must be specified and greater than 0');
			}

			// Create the budget category
			await budgetService.createBudgetCategory(name.trim(), waterfallCategory, allocatedAmount, {
				priority,
				recurringPeriod,
				customPeriodDays: recurringPeriod === 'custom' ? customPeriodDays : undefined,
				isGoalBased,
				goalTarget: isGoalBased ? goalTarget : undefined,
				maxCarryoverPercent,
				autoAdjustmentsEnabled,
				color,
				description: description.trim() || undefined
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
	<title>Add Budget Category - Budgic</title>
</svelte:head>

<PageLayout>
	{#snippet topBar()}
		<!-- Header -->
		<Header 
			title="Add Budget Category"
			showBackButton={true}
			backButtonLink="/categories"
			backButtonLabel="Back to Categories"
		/>
		<div class="p-4 pb-2">
			<p class="text-muted-foreground">Create a new budget category to organize your spending</p>
		</div>
	{/snippet}

	{#snippet bottomBar()}
		<!-- Action buttons for form submission -->
		<div class="p-4">
			<div class="flex justify-end space-x-4 max-w-4xl mx-auto">
				<Button.Root
					type="button"
					variant="outline"
					onclick={() => goto('/categories')}
					disabled={isLoading}
				>
					Cancel
				</Button.Root>
				<Button.Root
					type="submit"
					form="category-form"
					disabled={isLoading}
				>
					{isLoading ? 'Creating...' : 'Create Category'}
				</Button.Root>
			</div>
		</div>
		
		<!-- Mobile Navigation -->
		{#if sidebar.isMobile}
			<MobileNavigation />
		{/if}
	{/snippet}

	<div class="container mx-auto px-4 py-8 max-w-4xl">
		{#if error}
			<Alert.Root variant="destructive" class="mb-6">
				<Alert.Title>Error</Alert.Title>
				<Alert.Description>{error}</Alert.Description>
			</Alert.Root>
		{/if}

		<!-- Category Form -->
		<section class="mb-8">
			<form id="category-form" onsubmit={handleSubmit} class="space-y-6">
			<!-- Tabs for different sections -->
			<Tabs.Root bind:value={activeTab} class="w-full">
				<Tabs.List class="grid w-full grid-cols-3">
					<Tabs.Trigger value="basic">Basic Info</Tabs.Trigger>
					<Tabs.Trigger value="goals">Goals</Tabs.Trigger>
					<Tabs.Trigger value="advanced">Advanced</Tabs.Trigger>
				</Tabs.List>

				<!-- Basic Information Tab -->
				<Tabs.Content value="basic" class="space-y-6 mt-6">
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

							<!-- Waterfall Category -->
							<div class="space-y-2">
								<Label.Root for="waterfallCategory">Priority Level *</Label.Root>
								<Select.Root type="single" bind:value={waterfallCategory}>
									<Select.Trigger>
										{waterfallOptions.find(opt => opt.value === waterfallCategory)?.label || "Select priority level"}
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

							<!-- Priority within waterfall category -->
							<div class="space-y-2">
								<Label.Root for="priority">Priority (within {waterfallCategory})</Label.Root>
								<Input.Root
									id="priority"
									type="number"
									bind:value={priority}
									min="1"
									max="100"
								/>
								<p class="text-xs text-muted-foreground">Lower numbers = higher priority</p>
							</div>

							<!-- Allocated Amount -->
							<div class="space-y-2">
								<Label.Root for="allocatedAmount">Allocated Amount *</Label.Root>
								<div class="relative">
									<span class="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">$</span>
									<Input.Root
										id="allocatedAmount"
										type="number"
										bind:value={allocatedAmount}
										placeholder="0.00"
										step="0.01"
										class="pl-8"
										required
									/>
								</div>
							</div>

							<!-- Recurring Period -->
							<div class="space-y-2">
								<Label.Root for="recurringPeriod">Budget Period *</Label.Root>
								<Select.Root type="single" bind:value={recurringPeriod}>
									<Select.Trigger>
										{recurringPeriodOptions.find(opt => opt.value === recurringPeriod)?.label || "Select period"}
									</Select.Trigger>
									<Select.Content>
										{#each recurringPeriodOptions as option}
											<Select.Item value={option.value}>
												{option.label}
											</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
							</div>

							<!-- Custom Period Days -->
							{#if recurringPeriod === 'custom'}
								<div class="space-y-2">
									<Label.Root for="customPeriodDays">Custom Period (days) *</Label.Root>
									<Input.Root
										id="customPeriodDays"
										type="number"
										bind:value={customPeriodDays}
										placeholder="30"
										min="1"
										required
									/>
								</div>
							{/if}

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
						</Card.Content>
					</Card.Root>
				</Tabs.Content>

				<!-- Goals & Tracking Tab -->
				<Tabs.Content value="goals" class="space-y-6 mt-6">
					<Card.Root>
						<Card.Header>
							<Card.Title>Goal Settings</Card.Title>
							<Card.Description>Set up goals and tracking for this category</Card.Description>
						</Card.Header>
						<Card.Content class="space-y-4">
							<!-- Goal-based category -->
							<div class="space-y-4">
								<div class="flex items-center space-x-2">
									<Switch.Root bind:checked={isGoalBased} />
									<Label.Root for="goalBased">This is a goal-based category</Label.Root>
								</div>
								<p class="text-xs text-muted-foreground">
									Goal-based categories track progress toward a specific target amount
								</p>
							</div>

							{#if isGoalBased}
								<div class="space-y-2">
									<Label.Root for="goalTarget">Goal Target Amount *</Label.Root>
									<div class="relative">
										<span class="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">$</span>
										<Input.Root
											id="goalTarget"
											type="number"
											bind:value={goalTarget}
											placeholder="0.00"
											step="0.01"
											class="pl-8"
											required
										/>
									</div>
									<p class="text-xs text-muted-foreground">
										The total amount you want to save or spend toward this goal
									</p>
								</div>
							{/if}
						</Card.Content>
					</Card.Root>
				</Tabs.Content>

				<!-- Advanced Tab -->
				<Tabs.Content value="advanced" class="space-y-6 mt-6">
					<Card.Root>
						<Card.Header>
							<Card.Title>Advanced Settings</Card.Title>
							<Card.Description>Fine-tune how this category behaves</Card.Description>
						</Card.Header>
						<Card.Content class="space-y-4">
							<!-- Max Carryover Percent -->
							<div class="space-y-2">
								<Label.Root for="maxCarryoverPercent">Max Carryover Percentage</Label.Root>
								<div class="flex items-center space-x-2">
									<Input.Root
										id="maxCarryoverPercent"
										type="number"
										bind:value={maxCarryoverPercent}
										min="0"
										max="1"
										step="0.01"
										class="w-24"
									/>
									<span class="text-sm text-muted-foreground">
										({Math.round(maxCarryoverPercent * 100)}% of allocated amount)
									</span>
								</div>
								<p class="text-xs text-muted-foreground">
									Maximum percentage of allocated amount that can be borrowed from this category
								</p>
							</div>

							<!-- Auto Adjustments -->
							<div class="space-y-4">
								<div class="flex items-center space-x-2">
									<Switch.Root bind:checked={autoAdjustmentsEnabled} />
									<Label.Root for="autoAdjustments">Enable Automatic Adjustments</Label.Root>
								</div>
								<p class="text-xs text-muted-foreground">
									Allow the system to automatically borrow from this category when others are overspent
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
