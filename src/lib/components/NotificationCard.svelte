<script lang="ts">
	import { swipe, type SwipeDirection } from '$lib/actions/swipe';
	import { goto } from '$app/navigation';
	import { AlertCircle, CheckCircle, ChevronDown, Info, TrendingUp, X } from '@lucide/svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { formatCurrencyWithLocale } from '$lib/utils/currency-utils';
	import { insightsDeepLinkForType } from '$lib/utils/alert-tiers';
	import type { Insight } from '$lib/core/db';

	interface Props {
		/** One or more insights (grouped panel card uses same type/title/severity). */
		insights: Insight[];
		onDismiss?: (insights: Insight[]) => void;
		/** Swipe right (and underlay hint); panel only. */
		onSnooze?: (insights: Insight[]) => void;
		onClick?: (insights: Insight[]) => void;
		/** When provided, card will auto-mark as read after 1s in viewport (single insight only). */
		onMarkAsRead?: (insight: Insight) => void;
		categoryLabel?: string;
		goalLabel?: string;
		displayCurrency?: string;
		numberLocale?: string;
	}

	const {
		insights,
		onDismiss,
		onSnooze,
		onClick,
		onMarkAsRead,
		categoryLabel,
		goalLabel,
		displayCurrency,
		numberLocale = 'en-US'
	}: Props = $props();

	const primary = $derived(insights[0]);
	const groupSize = $derived(insights.length);

	const displaySeverity = $derived.by((): Insight['severity'] => {
		if (insights.some((i) => i.severity === 'alert')) return 'alert';
		if (insights.some((i) => i.severity === 'warning')) return 'warning';
		if (insights.some((i) => i.severity === 'success')) return 'success';
		return 'info';
	});

	/** Match Earlier-row severity tint language (unread: critical vs high). */
	const panelSurfaceClass = $derived(
		displaySeverity === 'alert'
			? 'border-destructive/40 bg-destructive/[0.08] dark:border-destructive/35 dark:bg-destructive/[0.12]'
			: displaySeverity === 'warning'
				? 'border-amber-500/35 bg-amber-500/[0.07] dark:border-amber-400/30 dark:bg-amber-500/[0.09]'
				: 'border-border bg-muted/30'
	);

	function panelSeverityLabel(sev: Insight['severity']): string {
		if (sev === 'alert') return 'Critical';
		if (sev === 'warning') return 'High';
		return sev;
	}

	function metadataAccountLine(metadata: string | undefined): string | null {
		if (!metadata) return null;
		try {
			const o = JSON.parse(metadata) as Record<string, unknown>;
			const id = o.accountId;
			if (typeof id === 'string' && id.length > 0) {
				return id.length > 12 ? `Account · ${id.slice(0, 8)}…` : `Account · ${id}`;
			}
		} catch {
			/* non-JSON or unexpected shape */
		}
		return null;
	}

	const detailLines = $derived.by(() => {
		const lines: string[] = [];
		const cur = displayCurrency ?? 'USD';
		const ins = primary;
		if (ins.amount != null && !Number.isNaN(ins.amount)) {
			lines.push(formatCurrencyWithLocale(ins.amount, cur, numberLocale));
		}
		if (ins.percentage != null && !Number.isNaN(ins.percentage)) {
			const p = ins.percentage;
			lines.push(`${Number.isInteger(p) ? String(p) : p.toFixed(1)}%`);
		}
		if (ins.remaining != null && !Number.isNaN(ins.remaining)) {
			lines.push(`Remaining ${formatCurrencyWithLocale(ins.remaining, cur, numberLocale)}`);
		}
		if (ins.threshold != null && !Number.isNaN(ins.threshold)) {
			lines.push(`Threshold ${formatCurrencyWithLocale(ins.threshold, cur, numberLocale)}`);
		}
		if (categoryLabel) lines.push(`Category · ${categoryLabel}`);
		if (goalLabel) lines.push(`Goal · ${goalLabel}`);
		const metaLine = metadataAccountLine(ins.metadata);
		if (metaLine) lines.push(metaLine);
		return lines;
	});

	let isExpanded = $state(false);
	let swipeOffset = $state(0);
	let isDismissing = $state(false);
	let isSwiping = $state(false);
	let dismissConfirmOpen = $state(false);
	/** Critical dismiss started via left-swipe — confirm runs the same handler as ✕. */
	let pendingCriticalSwipeDismiss = $state(false);
	let containerElement: HTMLElement;
	let cardRootElement: HTMLElement | undefined;
	let hasFiredMarkAsRead = $state(false);

	/** Finger travel before hint text starts to appear (per side). */
	const HINT_LABEL_START_PX = 6;
	/** Finger travel at which hint text reaches full opacity. */
	const HINT_LABEL_FULL_PX = 40;
	/** Must swipe past this (px) to commit snooze/dismiss; below = cancel and snap back. */
	const SWIPE_COMMIT_THRESHOLD_PX = 132;
	/** If the pointer moved this far horizontally during a swipe, swallow the following click (desktop ghost-click after cancel). */
	const SWIPE_CLICK_SUPPRESS_MIN_PX = 12;
	const isCritical = $derived(insights.some((i) => i.severity === 'alert'));

	let maxAbsSwipeDistanceThisGesture = 0;
	let suppressClickAfterSwipeGesture = $state(false);
	let suppressClickFallbackTimer: ReturnType<typeof setTimeout> | null = null;

	function clearSuppressClickFallback() {
		if (suppressClickFallbackTimer != null) {
			clearTimeout(suppressClickFallbackTimer);
			suppressClickFallbackTimer = null;
		}
	}

	function armClickSuppressionAfterSwipe() {
		if (maxAbsSwipeDistanceThisGesture < SWIPE_CLICK_SUPPRESS_MIN_PX) return;
		suppressClickAfterSwipeGesture = true;
		clearSuppressClickFallback();
		suppressClickFallbackTimer = setTimeout(() => {
			suppressClickAfterSwipeGesture = false;
			suppressClickFallbackTimer = null;
		}, 500);
	}

	/** Block synthetic click after a horizontal drag (desktop); same gesture can otherwise fire primary CTA → mark read. */
	function consumeSwipeGhostClick(e: MouseEvent): boolean {
		if (!suppressClickAfterSwipeGesture) return false;
		e.preventDefault();
		e.stopPropagation();
		suppressClickAfterSwipeGesture = false;
		clearSuppressClickFallback();
		return true;
	}

	const snoozeHintOpacity = $derived(
		swipeOffset <= HINT_LABEL_START_PX
			? 0
			: Math.min(
					1,
					(swipeOffset - HINT_LABEL_START_PX) / (HINT_LABEL_FULL_PX - HINT_LABEL_START_PX)
				)
	);
	const dismissHintOpacity = $derived(
		swipeOffset >= -HINT_LABEL_START_PX
			? 0
			: Math.min(
					1,
					(-swipeOffset - HINT_LABEL_START_PX) / (HINT_LABEL_FULL_PX - HINT_LABEL_START_PX)
				)
	);

	function getMaxSwipeTravel() {
		return containerElement?.offsetWidth ?? 400;
	}

	function handleSwipeStart() {
		isSwiping = true;
		maxAbsSwipeDistanceThisGesture = 0;
	}

	function handleSwipeMove(distance: number) {
		maxAbsSwipeDistanceThisGesture = Math.max(maxAbsSwipeDistanceThisGesture, Math.abs(distance));
		const maxTravel = getMaxSwipeTravel();
		swipeOffset = Math.max(-maxTravel, Math.min(maxTravel, distance));
	}

	function handleSwipeEnd(direction: SwipeDirection | null) {
		armClickSuppressionAfterSwipe();
		maxAbsSwipeDistanceThisGesture = 0;

		// Left = dismiss; right = snooze (panel). Matches underlay hints.
		if (direction === 'left') {
			if (!onDismiss) {
				swipeOffset = 0;
				setTimeout(() => {
					isSwiping = false;
				}, 280);
				return;
			}
			if (isCritical) {
				swipeOffset = 0;
				isSwiping = false;
				pendingCriticalSwipeDismiss = true;
				dismissConfirmOpen = true;
				return;
			}
			isDismissing = true;
			swipeOffset = -getMaxSwipeTravel();
			setTimeout(() => {
				onDismiss?.(insights);
				isSwiping = false;
			}, 300);
		} else if (direction === 'right') {
			if (!onSnooze) {
				swipeOffset = 0;
				setTimeout(() => {
					isSwiping = false;
				}, 280);
				return;
			}
			isDismissing = true;
			swipeOffset = getMaxSwipeTravel();
			setTimeout(() => {
				onSnooze?.(insights);
				isSwiping = false;
				swipeOffset = 0;
				isDismissing = false;
			}, 300);
		} else {
			swipeOffset = 0;
			setTimeout(() => {
				isSwiping = false;
			}, 280);
		}
	}

	function handleDismissClick(e: MouseEvent) {
		if (consumeSwipeGhostClick(e)) return;
		e.stopPropagation();
		e.preventDefault();
		if (isCritical) {
			dismissConfirmOpen = true;
		} else {
			onDismiss?.(insights);
		}
	}

	function handleConfirmDismiss() {
		dismissConfirmOpen = false;
		pendingCriticalSwipeDismiss = false;
		onDismiss?.(insights);
	}

	function handleCtaClick(e: MouseEvent) {
		if (consumeSwipeGhostClick(e)) return;
		e.stopPropagation();
		e.preventDefault();
		if (onClick) {
			onClick(insights);
		} else if (primary.actionUrl) {
			goto(primary.actionUrl);
		}
	}

	function handleViewSimilarClick(e: MouseEvent) {
		if (consumeSwipeGhostClick(e)) return;
		e.stopPropagation();
		e.preventDefault();
		goto(insightsDeepLinkForType(primary.type));
	}

	function getSeverityColor(severity: Insight['severity']) {
		switch (severity) {
			case 'alert':
				return 'text-destructive';
			case 'warning':
				return 'text-amber-600 dark:text-amber-400';
			case 'success':
				return 'text-green-600';
			default:
				return 'text-muted-foreground';
		}
	}

	function getSeverityIcon(severity: Insight['severity']) {
		switch (severity) {
			case 'alert':
				return AlertCircle;
			case 'warning':
				return TrendingUp;
			case 'success':
				return CheckCircle;
			default:
				return Info;
		}
	}

	function getRelativeTime(timestamp: string) {
		const date = new Date(timestamp);
		const now = new Date();
		const diff = now.getTime() - date.getTime();

		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return 'Just now';
		if (minutes < 60) return `${minutes}m ago`;
		if (hours < 24) return `${hours}h ago`;
		if (days < 7) return `${days}d ago`;

		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	const Icon = $derived(getSeverityIcon(displaySeverity));
	const iconColor = $derived(getSeverityColor(displaySeverity));
	const relativeTime = $derived(getRelativeTime(primary.createdAt));

	const hasPrimaryAction = $derived(!!primary.actionUrl || !!onClick);

	const hasExpandableContent = $derived(
		groupSize > 1 || detailLines.length > 0 || (primary.message?.trim()?.length ?? 0) > 0
	);

	const primaryActionLabel = $derived(
		primary.actionUrl ? primary.actionText || 'Take action' : 'View in Insights'
	);

	function handlePrimaryClick(e: MouseEvent) {
		if (consumeSwipeGhostClick(e)) return;
		e.stopPropagation();
		if (hasPrimaryAction) {
			handleCtaClick(e);
		} else if (hasExpandableContent) {
			e.preventDefault();
			isExpanded = !isExpanded;
		}
	}

	function handleExpandClick(e: MouseEvent) {
		if (consumeSwipeGhostClick(e)) return;
		e.stopPropagation();
		e.preventDefault();
		isExpanded = !isExpanded;
	}

	$effect(() => {
		const el = cardRootElement;
		const callback = onMarkAsRead;
		if (!el || !callback || hasFiredMarkAsRead || insights.length !== 1) return;

		let timeoutId: ReturnType<typeof setTimeout> | null = null;
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (!entry || !callback) return;
				if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
					timeoutId = setTimeout(() => {
						timeoutId = null;
						hasFiredMarkAsRead = true;
						callback(primary);
						observer.disconnect();
					}, 1000);
				} else {
					if (timeoutId) {
						clearTimeout(timeoutId);
						timeoutId = null;
					}
				}
			},
			{ threshold: 0.5, rootMargin: '0px' }
		);
		observer.observe(el);

		return () => {
			if (timeoutId) clearTimeout(timeoutId);
			observer.disconnect();
		};
	});
</script>

<div bind:this={cardRootElement} class="relative select-none">
	<div class="pointer-events-none absolute inset-0 z-0 flex">
		<div
			class="flex h-full items-center justify-start px-6 {isSwiping
				? ''
				: 'transition-opacity duration-200 ease-out'}"
			style="opacity: {snoozeHintOpacity};"
		>
			<div class="text-muted-foreground text-sm font-semibold">
				{onSnooze ? 'Swipe to snooze' : ''}
			</div>
		</div>
		<div
			class="flex h-full flex-1 items-center justify-end px-6 {isSwiping
				? ''
				: 'transition-opacity duration-200 ease-out'}"
			style="opacity: {dismissHintOpacity};"
		>
			<div class="text-destructive text-sm font-semibold">
				{onDismiss ? 'Swipe to dismiss' : ''}
			</div>
		</div>
	</div>

	<div
		bind:this={containerElement}
		use:swipe={{
			threshold: SWIPE_COMMIT_THRESHOLD_PX,
			onSwipeStart: handleSwipeStart,
			onSwipeMove: handleSwipeMove,
			onSwipeEnd: handleSwipeEnd
		}}
		class="relative z-10"
		style="touch-action: pan-y; transform: translateX({swipeOffset}px); transition: {isDismissing
			? 'transform 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94)'
			: swipeOffset === 0
				? 'transform 260ms cubic-bezier(0.25, 0.46, 0.45, 0.94)'
				: 'none'};"
	>
		<div
			class="relative overflow-hidden rounded-lg border transition-colors {panelSurfaceClass}"
			style="opacity: {Math.max(0.5, Math.min(1, 1 - Math.abs(swipeOffset) / 600))};"
		>
			<div class="flex min-w-0">
				<button
					type="button"
					class="focus-visible:ring-ring flex min-w-0 flex-1 items-start gap-2 rounded-none py-2 text-left hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:outline focus-visible:ring-inset dark:hover:bg-white/[0.05] {onDismiss ||
					hasExpandableContent
						? 'pr-2 pl-3'
						: 'px-3'}"
					onclick={handlePrimaryClick}
				>
					<span class="mt-0.5 shrink-0" aria-hidden="true">
						<Icon class="h-4 w-4 {iconColor}" />
					</span>
					<div class="min-w-0 flex-1">
						<div class="mb-0.5 flex min-w-0 items-center justify-between gap-x-2 gap-y-0.5">
							<span
								class="text-[10px] font-semibold tracking-wider uppercase {displaySeverity ===
								'alert'
									? 'text-destructive'
									: displaySeverity === 'warning'
										? 'text-amber-700 dark:text-amber-400'
										: 'text-muted-foreground'}"
							>
								{panelSeverityLabel(displaySeverity)}
							</span>
							<span class="text-muted-foreground shrink-0 text-[10px] tabular-nums">
								{relativeTime}
							</span>
						</div>
						<div class="text-foreground text-sm leading-snug font-medium">
							{primary.title}
						</div>
						{#if hasPrimaryAction}
							<span
								class="border-border bg-background/60 text-muted-foreground mt-1.5 inline-flex max-w-full items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] leading-tight font-medium"
							>
								<span class="truncate">{primaryActionLabel}</span>
								<span class="shrink-0 opacity-70" aria-hidden="true">→</span>
							</span>
						{/if}
					</div>
				</button>

				{#if onDismiss || hasExpandableContent}
					<div
						class="divide-border/50 border-border/50 flex w-11 shrink-0 flex-col divide-y self-stretch border-l"
					>
						{#if onDismiss}
							<button
								type="button"
								class="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-10 flex-1 items-center justify-center hover:bg-black/[0.06] focus-visible:ring-2 focus-visible:outline focus-visible:ring-inset dark:hover:bg-white/[0.08]"
								aria-label="Dismiss"
								onclick={handleDismissClick}
							>
								<X class="h-4 w-4" />
							</button>
						{/if}
						{#if hasExpandableContent}
							<button
								type="button"
								class="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-10 flex-1 items-center justify-center hover:bg-black/[0.06] focus-visible:ring-2 focus-visible:outline focus-visible:ring-inset dark:hover:bg-white/[0.08]"
								aria-expanded={isExpanded}
								aria-label={isExpanded ? 'Hide details' : 'Show details'}
								onclick={handleExpandClick}
							>
								<ChevronDown
									class="h-4 w-4 transition-transform duration-200 {isExpanded ? 'rotate-180' : ''}"
									aria-hidden="true"
								/>
							</button>
						{/if}
					</div>
				{/if}
			</div>

			{#if isExpanded && hasExpandableContent}
				<div class="border-border/60 space-y-2 border-t px-3 pt-2 pb-3" role="region">
					{#if groupSize > 1}
						<p class="text-muted-foreground text-xs">
							+{groupSize - 1} similar alert{groupSize - 2 === 0 ? '' : 's'}
						</p>
					{/if}
					{#if detailLines.length > 0}
						<ul
							class="text-muted-foreground list-none space-y-0.5 pl-0 text-xs"
							aria-label="Details"
						>
							{#each detailLines as line, i (i)}
								<li>{line}</li>
							{/each}
						</ul>
					{/if}
					<p class="text-muted-foreground text-xs leading-relaxed">
						{primary.message}
					</p>
					{#if groupSize > 1}
						<button
							type="button"
							class="text-primary text-left text-xs font-medium hover:underline"
							onclick={handleViewSimilarClick}
						>
							View in Insights
						</button>
					{/if}
				</div>
			{/if}
		</div>

		<AlertDialog.Root bind:open={dismissConfirmOpen}>
			<AlertDialog.Content>
				<AlertDialog.Header>
					<AlertDialog.Title
						>Dismiss {groupSize > 1 ? 'these alerts' : 'this alert'}?</AlertDialog.Title
					>
					<AlertDialog.Description>
						{groupSize > 1
							? 'These alerts will reappear if the risk persists.'
							: 'This alert will reappear if the risk persists.'}
					</AlertDialog.Description>
				</AlertDialog.Header>
				<AlertDialog.Footer>
					<AlertDialog.Cancel
						onclick={() => {
							pendingCriticalSwipeDismiss = false;
						}}>Cancel</AlertDialog.Cancel
					>
					<AlertDialog.Action onclick={handleConfirmDismiss}>Dismiss</AlertDialog.Action>
				</AlertDialog.Footer>
			</AlertDialog.Content>
		</AlertDialog.Root>
	</div>
</div>
