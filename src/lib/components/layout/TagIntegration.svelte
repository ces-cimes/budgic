<script lang="ts">
	import Button from '$lib/components/primitives/Button.svelte';
	import { Plus, Tag, Target } from '@lucide/svelte';

	interface WhatTag {
		id: string;
		name: string;
		category: string;
		amount: number;
		icon: string;
	}

	interface WhyTag {
		id: string;
		name: string;
		waterfallCategory: 'survival' | 'security' | 'growth' | 'lifestyle';
		amount: number;
		icon: string;
	}

	const { whatTags = [], whyTags = [], showPlaceholder = false, onTagEdit = () => {} } = $props<{
		whatTags?: WhatTag[];
		whyTags?: WhyTag[];
		showPlaceholder?: boolean;
		onTagEdit?: () => void;
	}>();

	// Placeholder data
	const placeholderWhatTags: WhatTag[] = [
		{ id: '1', name: 'Groceries', category: 'Food', amount: 400, icon: '🛒' },
		{ id: '2', name: 'Rent', category: 'Housing', amount: 1200, icon: '🏠' },
		{ id: '3', name: 'Gas', category: 'Transport', amount: 150, icon: '⛽' },
		{ id: '4', name: 'Netflix', category: 'Entertainment', amount: 15, icon: '📺' }
	];

	const placeholderWhyTags: WhyTag[] = [
		{ id: '1', name: 'Emergency Fund', waterfallCategory: 'security', amount: 300, icon: '🚨' },
		{ id: '2', name: 'Retirement', waterfallCategory: 'growth', amount: 500, icon: '📈' },
		{ id: '3', name: 'Vacation', waterfallCategory: 'lifestyle', amount: 200, icon: '✈️' },
		{ id: '4', name: 'Health Insurance', waterfallCategory: 'security', amount: 150, icon: '🏥' }
	];

	function formatCurrency(amount: number) {
		return new Intl.NumberFormat('en-US', { 
			style: 'currency', 
			currency: 'USD',
			minimumFractionDigits: 0
		}).format(amount);
	}

	const getWaterfallColor = (category: string) => {
		switch (category) {
			case 'survival': return 'text-sage-green';
			case 'security': return 'text-warning-amber';
			case 'growth': return 'text-warm-coral';
			case 'lifestyle': return 'text-purple-400';
			default: return 'text-text-secondary';
		}
	};

	const getWaterfallBgColor = (category: string) => {
		switch (category) {
			case 'survival': return 'bg-sage-green/10 border-sage-green/20';
			case 'security': return 'bg-warning-amber/10 border-warning-amber/20';
			case 'growth': return 'bg-warm-coral/10 border-warm-coral/20';
			case 'lifestyle': return 'bg-purple-400/10 border-purple-400/20';
			default: return 'bg-bg-tertiary border-primary/20';
		}
	};
</script>

<div class="space-y-6">
	<!-- What Tags Section -->
	<div>
		<div class="flex items-center justify-between mb-4">
			<div class="flex items-center gap-2">
				<Tag size={20} class="text-text-primary" />
				<h2 class="text-xl font-semibold text-text-primary">What Tags</h2>
			</div>
			<Button 
				variant="secondary" 
				size="sm"
				onclick={onTagEdit}
			>
				<Plus size={16} class="mr-2" />
				Add
			</Button>
		</div>
		
		<p class="text-sm text-text-secondary mb-4">Categorize transactions by what you're spending on</p>
		
		{#if showPlaceholder}
			<div class="grid grid-cols-2 gap-3">
				{#each placeholderWhatTags as tag}
					<div class="bg-bg-secondary rounded-xl p-3 border border-primary">
						<div class="flex items-center gap-2 mb-2">
							<span class="text-lg">{tag.icon}</span>
							<span class="font-medium text-text-primary text-sm">{tag.name}</span>
						</div>
						<div class="text-xs text-text-secondary mb-1">{tag.category}</div>
						<div class="font-semibold text-text-primary">{formatCurrency(tag.amount)}</div>
					</div>
				{/each}
			</div>
		{:else if whatTags.length > 0}
			<div class="grid grid-cols-2 gap-3">
				{#each whatTags as tag}
					<div class="bg-bg-secondary rounded-xl p-3 border border-primary">
						<div class="flex items-center gap-2 mb-2">
							<span class="text-lg">{tag.icon}</span>
							<span class="font-medium text-text-primary text-sm">{tag.name}</span>
						</div>
						<div class="text-xs text-text-secondary mb-1">{tag.category}</div>
						<div class="font-semibold text-text-primary">{formatCurrency(tag.amount)}</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="text-center py-6 bg-bg-secondary rounded-xl border border-primary">
				<div class="text-2xl mb-2">🏷️</div>
				<p class="text-text-secondary text-sm">No what tags configured</p>
			</div>
		{/if}
	</div>

	<!-- Why Tags Section -->
	<div>
		<div class="flex items-center justify-between mb-4">
			<div class="flex items-center gap-2">
				<Target size={20} class="text-text-primary" />
				<h2 class="text-xl font-semibold text-text-primary">Why Tags</h2>
			</div>
			<Button 
				variant="secondary" 
				size="sm"
				onclick={onTagEdit}
			>
				<Plus size={16} class="mr-2" />
				Add
			</Button>
		</div>
		
		<p class="text-sm text-text-secondary mb-4">Categorize by why you're spending (waterfall methodology)</p>
		
		{#if showPlaceholder}
			<div class="space-y-3">
				{#each placeholderWhyTags as tag}
					<div class="bg-bg-secondary rounded-xl p-3 border border-primary">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3">
								<span class="text-lg">{tag.icon}</span>
								<div>
									<div class="font-medium text-text-primary">{tag.name}</div>
									<div class="text-xs text-text-secondary">{tag.waterfallCategory}</div>
								</div>
							</div>
							<div class="text-right">
								<div class="font-semibold text-text-primary">{formatCurrency(tag.amount)}</div>
								<div class="text-xs px-2 py-1 rounded-full {getWaterfallBgColor(tag.waterfallCategory)} {getWaterfallColor(tag.waterfallCategory)}">
									{tag.waterfallCategory.toUpperCase()}
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{:else if whyTags.length > 0}
			<div class="space-y-3">
				{#each whyTags as tag}
					<div class="bg-bg-secondary rounded-xl p-3 border border-primary">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3">
								<span class="text-lg">{tag.icon}</span>
								<div>
									<div class="font-medium text-text-primary">{tag.name}</div>
									<div class="text-xs text-text-secondary">{tag.waterfallCategory}</div>
								</div>
							</div>
							<div class="text-right">
								<div class="font-semibold text-text-primary">{formatCurrency(tag.amount)}</div>
								<div class="text-xs px-2 py-1 rounded-full {getWaterfallBgColor(tag.waterfallCategory)} {getWaterfallColor(tag.waterfallCategory)}">
									{tag.waterfallCategory.toUpperCase()}
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="text-center py-6 bg-bg-secondary rounded-xl border border-primary">
				<div class="text-2xl mb-2">🎯</div>
				<p class="text-text-secondary text-sm">No why tags configured</p>
			</div>
		{/if}
	</div>

	{#if showPlaceholder}
		<!-- Placeholder Indicator -->
		<div class="p-3 bg-bg-tertiary rounded-lg border border-primary/20">
			<p class="text-xs text-text-secondary text-center italic">
				💡 Placeholder: Tag integration logic not implemented
			</p>
		</div>
	{/if}
</div> 