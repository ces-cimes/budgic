<script lang="ts">
	import Input from '$lib/components/primitives/Input.svelte';
	import Label from '$lib/components/primitives/Label.svelte';
	import { Search, X, MapPin, ShoppingBag, Heart } from '@lucide/svelte';

	const { 
		whatTags = [],
		whyTags = [],
		whereTags = [],
		selectedWhatTag = '',
		selectedWhyTag = '',
		selectedWhereTag = '',
		onTagChange = () => {}
	} = $props<{
		whatTags?: string[];
		whyTags?: string[];
		whereTags?: string[];
		selectedWhatTag?: string;
		selectedWhyTag?: string;
		selectedWhereTag?: string;
		onTagChange?: (dimension: 'what' | 'why' | 'where', tag: string) => void;
	}>();

	// Search states
	let whatSearch = $state('');
	let whySearch = $state('');
	let whereSearch = $state('');

	// Filtered tags based on search
	const filteredWhatTags = $derived(
		whatTags.filter((tag: string) => tag.toLowerCase().includes(whatSearch.toLowerCase()))
	);
	const filteredWhyTags = $derived(
		whyTags.filter((tag: string) => tag.toLowerCase().includes(whySearch.toLowerCase()))
	);
	const filteredWhereTags = $derived(
		whereTags.filter((tag: string) => tag.toLowerCase().includes(whereSearch.toLowerCase()))
	);

	// Remove tag
	const removeTag = (dimension: 'what' | 'why' | 'where') => {
		onTagChange(dimension, '');
	};
</script>

<div class="space-y-4">
	<!-- What Tags -->
	<div>
		<Label class="text-text-secondary font-medium text-sm">What</Label>
		<div class="relative mt-1">
			<Input
				icon={ShoppingBag}
				value={whatSearch}
				on:input={(e) => whatSearch = e.currentTarget.value}
				placeholder="What did you buy?"
				class="pl-8 bg-bg-tertiary/50 border-bg-surface/50 focus:border-sage-green/50 focus:ring-sage-green/20"
			/>
		</div>
		
		<!-- Selected tag chip -->
		{#if selectedWhatTag}
			<div class="flex items-center gap-2 mt-2">
				<span class="px-2 py-1 bg-sage-green/20 text-sage-green text-xs rounded-full">
					{selectedWhatTag}
				</span>
				<button
					onclick={() => removeTag('what')}
					class="text-text-tertiary hover:text-alert"
				>
					<X class="w-3 h-3" />
				</button>
			</div>
		{/if}
		
		<!-- Tag suggestions -->
		{#if whatSearch && filteredWhatTags.length > 0}
			<div class="mt-2 space-y-1">
				{#each filteredWhatTags as tag}
					<button
						onclick={() => {
							onTagChange('what', tag);
							whatSearch = '';
						}}
						class="w-full text-left px-2 py-1 text-sm text-text-secondary hover:bg-bg-secondary/50 rounded"
					>
						{tag}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Why Tags -->
	<div>
		<Label class="text-text-secondary font-medium text-sm">Why</Label>
		<div class="relative mt-1">
			<Input
				icon={Heart}
				value={whySearch}
				on:input={(e) => whySearch = e.currentTarget.value}
				placeholder="Why this purchase?"
				class="pl-8 bg-bg-tertiary/50 border-bg-surface/50 focus:border-warm-coral/50 focus:ring-warm-coral/20"
			/>
		</div>
		
		<!-- Selected tag chip -->
		{#if selectedWhyTag}
			<div class="flex items-center gap-2 mt-2">
				<span class="px-2 py-1 bg-warm-coral/20 text-warm-coral text-xs rounded-full">
					{selectedWhyTag}
				</span>
				<button
					onclick={() => removeTag('why')}
					class="text-text-tertiary hover:text-alert"
				>
					<X class="w-3 h-3" />
				</button>
			</div>
		{/if}
		
		<!-- Tag suggestions -->
		{#if whySearch && filteredWhyTags.length > 0}
			<div class="mt-2 space-y-1">
				{#each filteredWhyTags as tag}
					<button
						onclick={() => {
							onTagChange('why', tag);
							whySearch = '';
						}}
						class="w-full text-left px-2 py-1 text-sm text-text-secondary hover:bg-bg-secondary/50 rounded"
					>
						{tag}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Where Tags -->
	<div>
		<Label class="text-text-secondary font-medium text-sm">Where</Label>
		<div class="relative mt-1">
			<Input
				icon={MapPin}
				value={whereSearch}
				on:input={(e) => whereSearch = e.currentTarget.value}
				placeholder="Where did this happen?"
				class="pl-8 bg-bg-tertiary/50 border-bg-surface/50 focus:border-info/50 focus:ring-info/20"
			/>
		</div>
		
		<!-- Selected tag chip -->
		{#if selectedWhereTag}
			<div class="flex items-center gap-2 mt-2">
				<span class="px-2 py-1 bg-info/20 text-info text-xs rounded-full">
					{selectedWhereTag}
				</span>
				<button
					onclick={() => removeTag('where')}
					class="text-text-tertiary hover:text-alert"
				>
					<X class="w-3 h-3" />
				</button>
			</div>
		{/if}
		
		<!-- Tag suggestions -->
		{#if whereSearch && filteredWhereTags.length > 0}
			<div class="mt-2 space-y-1">
				{#each filteredWhereTags as tag}
					<button
						onclick={() => {
							onTagChange('where', tag);
							whereSearch = '';
						}}
						class="w-full text-left px-2 py-1 text-sm text-text-secondary hover:bg-bg-secondary/50 rounded"
					>
						{tag}
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div> 