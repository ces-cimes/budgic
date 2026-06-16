<script lang="ts">
	/**
	 * Phase 8 — top upcoming projected outflows for one account (cached data from parent).
	 */
	interface NextOutflowRow {
		id: string;
		dateLabel: string;
		description: string;
		amountDisplay: string;
	}

	interface Props {
		items: NextOutflowRow[];
	}

	const { items = [] }: Props = $props();
</script>

{#if items.length > 0}
	<details
		class="border-border bg-card/40 open:bg-card/60 rounded-xl border px-4 py-3 [&_summary::-webkit-details-marker]:hidden"
	>
		<summary
			class="text-text-secondary hover:text-text-primary flex cursor-pointer list-none items-center justify-between text-sm font-medium select-none"
		>
			<span>Upcoming outflows (14 days)</span>
			<span class="text-text-tertiary text-xs">Top {items.length}</span>
		</summary>
		<ul class="border-border mt-3 space-y-2 border-t pt-3" role="list">
			{#each items as row (row.id)}
				<li class="flex items-start justify-between gap-3 text-sm">
					<div class="min-w-0">
						<p class="text-text-primary truncate font-medium">{row.description}</p>
						<p class="text-text-tertiary text-xs">{row.dateLabel}</p>
					</div>
					<span class="text-amount text-text-secondary shrink-0">{row.amountDisplay}</span
					>
				</li>
			{/each}
		</ul>
	</details>
{/if}
