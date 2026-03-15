<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	interface Props {
		/** Current unread count. Badge is hidden when 0. */
		count: number;
		/** Visual variant: red for critical, amber for warnings. */
		variant?: 'destructive' | 'warning';
		/** Optional extra class for the badge container (e.g. positioning). */
		class?: string;
		/** Optional: smaller badge for mobile. */
		compact?: boolean;
	}

	let { count = 0, variant = 'destructive', class: className = '', compact = false }: Props = $props();

	let bump = $state(false);
	let prevCount = $state(0);

	$effect(() => {
		if (count > 0 && prevCount > 0 && count !== prevCount) {
			bump = true;
			const t = setTimeout(() => {
				bump = false;
			}, 320);
			prevCount = count;
			return () => clearTimeout(t);
		}
		prevCount = count;
	});

	const showBadge = $derived(count > 0);
	const displayCount = $derived(count > 99 ? '99+' : String(count));
	const badgeClass = $derived(
		`${variant === 'warning' ? 'bg-amber-500 text-white hover:bg-amber-600' : ''} ${compact ? 'h-4 min-w-4 px-1 text-[10px]' : 'h-5 min-w-5 px-1.5 text-xs'}`.trim()
	);
</script>

{#if showBadge}
	<span
		class="inline-flex items-center justify-center {className}"
		in:scale={{ duration: 220, start: 0.4, easing: cubicOut }}
		out:scale={{ duration: 180, start: 0.4, easing: cubicOut }}
		role="status"
		aria-label="{count} unread alerts"
	>
		<Badge
			variant={variant === 'warning' ? 'secondary' : 'destructive'}
			class="flex items-center justify-center font-semibold transition-transform duration-200 {badgeClass} {bump ? 'animate-alert-badge-bump' : ''}"
		>
			{displayCount}
		</Badge>
	</span>
{/if}
