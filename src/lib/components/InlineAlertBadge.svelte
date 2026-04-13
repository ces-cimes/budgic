<script lang="ts">
	import { X } from '@lucide/svelte';
	import type { Insight } from '$lib/core/db';

	type InlineAlertTone = 'low' | 'caution' | 'critical';

	interface Props {
		/** Low-tier (success/info) or account-scoped insights. Dismissible. */
		insights: Insight[];
		onDismiss: (insightId: string) => void;
		/** Optional short label override (e.g. "rising", "at risk"). Defaults to first insight title. */
		label?: string;
		/** Visual emphasis from max severity in `insights` when omitted. */
		tone?: InlineAlertTone;
	}

	const { insights, onDismiss, label, tone: toneProp }: Props = $props();

	const derivedTone = $derived.by((): InlineAlertTone => {
		if (insights.some((i) => i.severity === 'alert')) return 'critical';
		if (insights.some((i) => i.severity === 'warning')) return 'caution';
		return 'low';
	});

	const tone = $derived(toneProp ?? derivedTone);

	const toneClass = $derived(
		tone === 'critical'
			? 'bg-destructive/15 text-destructive border-destructive/35'
			: tone === 'caution'
				? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30'
				: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30'
	);

	const dotClass = $derived(
		tone === 'critical' ? 'bg-destructive' : 'bg-amber-500'
	);

	const countAccentClass = $derived(
		tone === 'critical'
			? 'text-destructive dark:text-red-400'
			: 'text-amber-600 dark:text-amber-500'
	);

	const displayLabel = $derived(label ?? insights[0]?.title ?? '');
	const count = $derived(insights.length);
</script>

{#if insights.length > 0}
	<div
		class="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs border {toneClass}"
		role="status"
	>
		<span class="shrink-0 w-1.5 h-1.5 rounded-full {dotClass}" aria-hidden="true"></span>
		<span class="truncate max-w-[140px]">{displayLabel}</span>
		{#if count > 1}
			<span class="{countAccentClass} font-medium">+{count - 1}</span>
		{/if}
		<button
			type="button"
			class="shrink-0 p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 focus-visible:outline focus-visible:ring-2 focus-visible:ring-ring"
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
