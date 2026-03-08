<script lang="ts">
	import { X } from '@lucide/svelte';
	import type { Insight } from '$lib/core/db';

	interface Props {
		/** Low-tier (success/info) insight(s) to show inline. Dismissible. */
		insights: Insight[];
		onDismiss: (insightId: string) => void;
		/** Optional short label override (e.g. "rising", "at risk"). Defaults to first insight title. */
		label?: string;
	}

	const { insights, onDismiss, label }: Props = $props();

	const displayLabel = $derived(label ?? insights[0]?.title ?? '');
	const count = $derived(insights.length);
</script>

{#if insights.length > 0}
	<div
		class="inline-flex items-center gap-1.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-xs border border-amber-500/30"
		role="status"
	>
		<span class="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true"></span>
		<span class="truncate max-w-[140px]">{displayLabel}</span>
		{#if count > 1}
			<span class="text-amber-600 dark:text-amber-500 font-medium">+{count - 1}</span>
		{/if}
		<button
			type="button"
			class="shrink-0 p-0.5 rounded hover:bg-amber-500/20 focus-visible:outline focus-visible:ring-2 focus-visible:ring-ring"
			aria-label="Dismiss"
			onclick={(e) => {
				e.stopPropagation();
				onDismiss(insights[0].id);
			}}
		>
			<X class="w-3 h-3" />
		</button>
	</div>
{/if}
