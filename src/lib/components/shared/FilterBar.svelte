<script lang="ts">
	import * as Select from '$lib/components/ui/select/index.ts';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.ts';
	import { Badge } from '$lib/components/ui/badge/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { ChevronDown, Filter } from '@lucide/svelte';
	import * as Drawer from '$lib/components/ui/drawer/index.ts';

	interface FilterOption {
		value: string;
		label: string;
		description?: string;
	}

	interface ToggleOption {
		value: string;
		label: string;
		icon?: any;
	}

	interface BadgeInfo {
		label: string;
		count: number;
		variant?: 'default' | 'secondary' | 'destructive' | 'outline';
	}

	interface Props {
		// Filter controls
		selectValue: string;
		selectOptions: FilterOption[];
		selectPlaceholder?: string;
		onSelectChange: (value: string) => void;

		toggleValue: string;
		toggleOptions: ToggleOption[];
		onToggleChange: (value: string) => void;

		// Badge information
		badges: BadgeInfo[];
		showBadges?: boolean;

		// Layout options
		className?: string;
		sticky?: boolean;
	}

	const {
		selectValue,
		selectOptions,
		selectPlaceholder = 'Filter by category',
		onSelectChange,
		toggleValue,
		toggleOptions,
		onToggleChange,
		badges = [],
		showBadges = true,
		className = '',
		sticky = true
	}: Props = $props();

	let showMobileFilters = $state(false);
	let localSelectValue = $state('');
	let localToggleValue = $state('');

	$effect.pre(() => {
		localSelectValue = selectValue;
		localToggleValue = toggleValue;
	});

	function handleSelectChange(value: string) {
		localSelectValue = value;
		onSelectChange(value);
		showMobileFilters = false;
	}

	function handleToggleChange(value: string) {
		localToggleValue = value;
		onToggleChange(value);
		showMobileFilters = false;
	}
</script>

<div class="bg-background mb-4 {sticky ? 'sticky top-0 z-10' : ''} {className}">
	<!-- Desktop Layout -->
	<div class="hidden items-center gap-3 md:flex">
		<!-- Primary Filter Controls -->
		<div class="flex flex-1 items-center gap-3">
			<!-- Category Select -->
			<div class="max-w-xs min-w-0 flex-1">
				<Select.Root type="single" value={localSelectValue} onValueChange={handleSelectChange}>
					<Select.Trigger class="w-full">
						<span class="truncate">
							{selectOptions.find((opt) => opt.value === localSelectValue)?.label ||
								selectPlaceholder}
						</span>
					</Select.Trigger>
					<Select.Content>
						{#each selectOptions as option}
							<Select.Item value={option.value}>
								<div class="flex flex-col">
									<span>{option.label}</span>
									{#if option.description}
										<span class="text-muted-foreground text-xs">{option.description}</span>
									{/if}
								</div>
							</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			<!-- Toggle Group -->
			<div class="flex-shrink-0">
				<ToggleGroup.Root
					type="single"
					variant="outline"
					value={localToggleValue}
					onValueChange={handleToggleChange}
				>
					{#each toggleOptions as option}
						<ToggleGroup.Item value={option.value} size="sm" class="min-w-0">
							{#if option.icon}
								{@const IconComponent = option.icon}
								<IconComponent size={14} class="mr-1" />
							{/if}
							<span class="hidden sm:inline">{option.label}</span>
							<span class="sm:hidden">{option.label.charAt(0)}</span>
						</ToggleGroup.Item>
					{/each}
				</ToggleGroup.Root>
			</div>
		</div>

		<!-- Badges (Desktop) -->
		{#if showBadges && badges.length > 0}
			<div class="flex flex-shrink-0 items-center gap-2">
				{#each badges as badge}
					<Badge variant={badge.variant || 'secondary'} class="text-xs">
						{badge.label}: {badge.count}
					</Badge>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Mobile Layout -->
	<div class="md:hidden">
		<!-- Mobile Filter Trigger -->
		<div class="flex items-center justify-between gap-2">
			<!-- Quick Filter Display -->
			<div class="flex min-w-0 flex-1 items-center gap-2">
				<div class="min-w-0 flex-1">
					<div class="truncate text-sm font-medium">
						{selectOptions.find((opt) => opt.value === localSelectValue)?.label ||
							selectPlaceholder}
					</div>
					<div class="text-muted-foreground text-xs">
						{toggleOptions.find((opt) => opt.value === localToggleValue)?.label}
					</div>
				</div>
			</div>

			<!-- Filter Button -->
			<Button
				variant="outline"
				size="sm"
				onclick={() => (showMobileFilters = true)}
				class="flex-shrink-0"
			>
				<Filter size={16} class="mr-1" />
				Filters
			</Button>

			<!-- Quick Badge Summary -->
			{#if showBadges && badges.length > 0}
				<div class="flex-shrink-0">
					<Badge variant="outline" class="text-xs">
						{badges.reduce((sum, badge) => sum + badge.count, 0)} total
					</Badge>
				</div>
			{/if}
		</div>

		<!-- Mobile Filter Drawer -->
		<Drawer.Root bind:open={showMobileFilters}>
			<Drawer.Content>
				<Drawer.Header>
					<Drawer.Title>Filter Options</Drawer.Title>
					<Drawer.Description>
						Adjust your filters to find what you're looking for
					</Drawer.Description>
				</Drawer.Header>

				<div class="space-y-6 p-4">
					<!-- Category Filter -->
					<div class="space-y-2">
						<label for="mobile-category-select" class="text-sm font-medium">Category</label>
						<Select.Root type="single" value={localSelectValue} onValueChange={handleSelectChange}>
							<Select.Trigger class="w-full">
								<span class="truncate">
									{selectOptions.find((opt) => opt.value === localSelectValue)?.label ||
										selectPlaceholder}
								</span>
							</Select.Trigger>
							<Select.Content>
								{#each selectOptions as option}
									<Select.Item value={option.value}>
										<div class="flex flex-col">
											<span>{option.label}</span>
											{#if option.description}
												<span class="text-muted-foreground text-xs">{option.description}</span>
											{/if}
										</div>
									</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>

					<!-- Toggle Options -->
					<div class="space-y-2">
						<label for="mobile-status-toggle" class="text-sm font-medium">Status</label>
						<ToggleGroup.Root
							type="single"
							variant="outline"
							value={localToggleValue}
							onValueChange={handleToggleChange}
							class="w-full"
						>
							{#each toggleOptions as option}
								<ToggleGroup.Item value={option.value} size="sm" class="flex-1">
									{#if option.icon}
										{@const IconComponent = option.icon}
										<IconComponent size={16} class="mr-2" />
									{/if}
									{option.label}
								</ToggleGroup.Item>
							{/each}
						</ToggleGroup.Root>
					</div>

					<!-- Badge Summary -->
					{#if showBadges && badges.length > 0}
						<div class="space-y-2">
							<h3 class="text-sm font-medium">Summary</h3>
							<div class="grid grid-cols-2 gap-2">
								{#each badges as badge}
									<div class="bg-muted flex items-center justify-between rounded-lg p-3">
										<span class="text-sm">{badge.label}</span>
										<Badge variant={badge.variant || 'secondary'}>{badge.count}</Badge>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>

				<Drawer.Footer class="flex gap-2">
					<Button variant="outline" onclick={() => (showMobileFilters = false)} class="flex-1">
						Close
					</Button>
				</Drawer.Footer>
			</Drawer.Content>
		</Drawer.Root>
	</div>
</div>
