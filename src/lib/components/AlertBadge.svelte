<script lang="ts">
	import { browser } from '$app/environment';
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
	let prevCountBump = $state(0);

	$effect(() => {
		if (count > 0 && prevCountBump > 0 && count !== prevCountBump) {
			bump = true;
			const t = setTimeout(() => {
				bump = false;
			}, 320);
			prevCountBump = count;
			return () => clearTimeout(t);
		}
		prevCountBump = count;
	});

	/** Skip first reactive tick so we do not announce the initial badge state on mount. */
	let prevCountAnnounce = $state<number | null>(null);
	let prevHadCriticalAnnounce = $state(false);
	let liveMessage = $state('');
	let livePoliteness = $state<'polite' | 'assertive'>('polite');

	$effect(() => {
		if (!browser) return;
		const hasCritical = variant === 'destructive';
		if (prevCountAnnounce === null) {
			prevCountAnnounce = count;
			prevHadCriticalAnnounce = hasCritical;
			return;
		}
		const increased = count > prevCountAnnounce;
		const appearedFromZero = prevCountAnnounce === 0 && count > 0;
		if (increased || appearedFromZero) {
			const priority = hasCritical ? 'critical priority' : 'high priority';
			liveMessage = `${count} unread alert${count === 1 ? '' : 's'}, ${priority}`;
			livePoliteness = !prevHadCriticalAnnounce && hasCritical ? 'assertive' : 'polite';
		}
		prevCountAnnounce = count;
		prevHadCriticalAnnounce = hasCritical;
	});

	const showBadge = $derived(count > 0);
	const displayCount = $derived(count > 99 ? '99+' : String(count));
	const badgeClass = $derived(
		`${variant === 'warning' ? 'bg-amber-500 text-white hover:bg-amber-600' : ''} ${compact ? 'h-4 min-w-4 px-1 text-[10px]' : 'h-5 min-w-5 px-1.5 text-xs'}`.trim()
	);
</script>

<span class="inline-flex items-center justify-center {className}">
	<span class="sr-only" aria-live={livePoliteness} aria-atomic="true">{liveMessage}</span>
	{#if showBadge}
		<span
			class="inline-flex items-center justify-center"
			in:scale={{ duration: 220, start: 0.4, easing: cubicOut }}
			out:scale={{ duration: 180, start: 0.4, easing: cubicOut }}
			aria-hidden="true"
		>
			<Badge
				variant={variant === 'warning' ? 'secondary' : 'destructive'}
				class="flex items-center justify-center font-semibold transition-transform duration-200 {badgeClass} {bump ? 'animate-alert-badge-bump' : ''}"
			>
				{displayCount}
			</Badge>
		</span>
	{/if}
</span>
