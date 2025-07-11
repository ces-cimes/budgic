<script lang="ts">
	interface Win {
		id: string;
		title: string;
		savings: number;
		icon: string;
		category: string;
	}

	export let wins: Win[] = [];
	export let showPlaceholder = false;

	function formatCurrency(amount: number) {
		return new Intl.NumberFormat('en-US', { 
			style: 'currency', 
			currency: 'USD',
			minimumFractionDigits: 2
		}).format(amount);
	}
</script>

<div class="rounded-2xl p-4 border border-primary bg-bg-secondary">
	<div class="flex items-center gap-2 mb-3">
		<span class="text-xl">🎯</span>
		<h3 class="text-lg font-semibold text-text-primary">Today's Wins</h3>
	</div>

	{#if showPlaceholder}
		<div class="space-y-3">
			<div class="flex items-center gap-3 p-3 bg-bg-tertiary rounded-lg border border-primary/20">
				<span class="text-sage-green">✅</span>
				<div class="flex-1">
					<p class="text-sm text-text-primary">Stayed under coffee budget</p>
					<p class="text-xs text-text-secondary">Saved $4.50 today</p>
				</div>
				<span class="text-sage-green font-semibold text-sm">+$4.50</span>
			</div>
			<div class="flex items-center gap-3 p-3 bg-bg-tertiary rounded-lg border border-primary/20">
				<span class="text-sage-green">✅</span>
				<div class="flex-1">
					<p class="text-sm text-text-primary">Chose home lunch over takeout</p>
					<p class="text-xs text-text-secondary">Saved $12.00 today</p>
				</div>
				<span class="text-sage-green font-semibold text-sm">+$12.00</span>
			</div>
		</div>
		<div class="mt-3 p-2 bg-bg-tertiary rounded-lg border border-primary/20">
			<p class="text-xs text-text-secondary text-center italic">
				💡 Placeholder: Win detection logic not implemented
			</p>
		</div>
	{:else if wins.length > 0}
		<div class="space-y-3">
			{#each wins as win}
				<div class="flex items-center gap-3 p-3 bg-bg-tertiary rounded-lg border border-primary/20">
					<span class="text-sage-green">{win.icon}</span>
					<div class="flex-1">
						<p class="text-sm text-text-primary">{win.title}</p>
						<p class="text-xs text-text-secondary">Saved {formatCurrency(win.savings)} today</p>
					</div>
					<span class="text-sage-green font-semibold text-sm">+{formatCurrency(win.savings)}</span>
				</div>
			{/each}
		</div>
	{:else}
		<div class="text-center py-6">
			<p class="text-text-secondary text-sm">No wins recorded yet today</p>
			<p class="text-text-secondary text-xs mt-1">Make smart choices to see your wins here!</p>
		</div>
	{/if}
</div> 