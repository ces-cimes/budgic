<script lang="ts">
	import { swipe, type SwipeDirection } from '$lib/actions/swipe';
	import { goto } from '$app/navigation';
	import { AlertCircle, CheckCircle, ChevronDown, ChevronUp, Info, TrendingUp, X } from '@lucide/svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Button } from '$lib/components/ui/button';
	import type { Insight } from '$lib/core/db';

	interface Props {
		insight: Insight;
		onDismiss?: (insight: Insight) => void;
		onClick?: (insight: Insight) => void;
		/** When provided, card will auto-mark as read after 1s in viewport (IntersectionObserver). */
		onMarkAsRead?: (insight: Insight) => void;
	}

	const { insight, onDismiss, onClick, onMarkAsRead }: Props = $props();

	let isExpanded = $state(false);
	let swipeOffset = $state(0);
	let isDismissing = $state(false);
	let isSwiping = $state(false);
	let dismissConfirmOpen = $state(false);
	let containerElement: HTMLElement;
	let cardRootElement: HTMLElement | undefined;
	let hasFiredMarkAsRead = $state(false);

	const SWIPE_THRESHOLD = 80;
	const isCritical = $derived(insight.severity === 'alert');
	
	function handleSwipeStart() {
		isSwiping = true;
	}
	
	function handleSwipeMove(distance: number) {
		// If we've already swiped past threshold, allow movement in any direction
		// Otherwise, only allow left swipe and show visual feedback after threshold
		if (Math.abs(swipeOffset) > SWIPE_THRESHOLD || (distance < 0 && Math.abs(distance) > SWIPE_THRESHOLD)) {
			// Restrict to only left swipe direction (prevent swiping right from rest position)
			swipeOffset = Math.min(distance, 0);
		}
	}
	
	function handleSwipeEnd(direction: SwipeDirection | null) {
		if (direction === 'left') {
			// Animate out and dismiss
			isDismissing = true;
			swipeOffset = -containerElement?.offsetWidth || -400;
			setTimeout(() => {
				onDismiss?.(insight);
				isSwiping = false;
			}, 300);
		} else {
			// Snap back
			swipeOffset = 0;
			// Small delay to prevent drawer closing
			setTimeout(() => {
				isSwiping = false;
			}, 100);
		}
	}
	
	function handleClick(e: MouseEvent | KeyboardEvent) {
		// Don't trigger click if we're swiping
		if (isSwiping || Math.abs(swipeOffset) > 10) {
			e.preventDefault();
			e.stopPropagation();
			return;
		}
		onClick?.(insight);
	}
	
	function toggleExpanded(e: MouseEvent) {
		e.stopPropagation();
		isExpanded = !isExpanded;
	}

	function handleDismissClick(e: MouseEvent) {
		e.stopPropagation();
		e.preventDefault();
		if (isCritical) {
			dismissConfirmOpen = true;
		} else {
			onDismiss?.(insight);
		}
	}

	function handleConfirmDismiss() {
		dismissConfirmOpen = false;
		onDismiss?.(insight);
	}

	function handleCtaClick(e: MouseEvent) {
		e.stopPropagation();
		e.preventDefault();
		if (insight.actionUrl) {
			goto(insight.actionUrl);
		} else {
			onClick?.(insight);
		}
	}
	
	function getSeverityColor(severity: Insight['severity']) {
		switch (severity) {
			case 'alert':
				return 'text-destructive';
			case 'warning':
				return 'text-warning';
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
	
	const Icon = $derived(getSeverityIcon(insight.severity));
	const iconColor = $derived(getSeverityColor(insight.severity));
	const relativeTime = $derived(getRelativeTime(insight.createdAt));

	// Auto-mark as read after 1s in viewport (IntersectionObserver). Badge updates in real time.
	$effect(() => {
		const el = cardRootElement;
		const callback = onMarkAsRead;
		if (!el || !callback || hasFiredMarkAsRead) return;

		let timeoutId: ReturnType<typeof setTimeout> | null = null;
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (!entry || !callback) return;
				if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
					timeoutId = setTimeout(() => {
						timeoutId = null;
						hasFiredMarkAsRead = true;
						callback(insight);
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

<div bind:this={cardRootElement} class="relative select-none overflow-hidden rounded-lg">
	<!-- Swipe indicator background (stays in place behind the card) -->
	<div class="absolute inset-0 pointer-events-none z-0" style="background: oklch(from var(--destructive) l c h / 0.2);">
		<div class="flex items-center justify-end h-full px-6 transition-opacity duration-150 ease-out" style="opacity: {Math.abs(swipeOffset) > SWIPE_THRESHOLD ? 1 : 0};">
			<div class="text-destructive font-semibold text-sm">Swipe to dismiss</div>
		</div>
	</div>

	<!-- Card that moves over the background -->
	<div
		bind:this={containerElement}
		use:swipe={{
			threshold: 100,
			onSwipeStart: handleSwipeStart,
			onSwipeMove: handleSwipeMove,
			onSwipeEnd: handleSwipeEnd
		}}
		class="relative z-10"
		style="touch-action: pan-y; transform: translateX({swipeOffset}px); transition: {isDismissing ? 'transform 300ms ease-out' : swipeOffset === 0 ? 'transform 200ms ease-out' : 'none'};"
	>
		<div
			role="button"
			tabindex="0"
			class="relative w-full text-left bg-secondary border border-border rounded-lg overflow-hidden cursor-pointer transition-all duration-100 ease-out active:bg-accent active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
			style="-webkit-tap-highlight-color: transparent; opacity: {Math.max(0.5, Math.min(1, 1 + swipeOffset / 600))};"
			onclick={handleClick}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					handleClick(e);
				}
			}}
		>
			<!-- Header: icon + content + dismiss -->
			<div class="px-4 py-3 flex items-start gap-3">
				<div class="mt-0.5 shrink-0">
					<Icon class="w-5 h-5 {iconColor}" />
				</div>
				<div class="flex-1 min-w-0">
					<div class="flex items-start justify-between gap-2 mb-1">
						<h4 class="text-sm font-semibold leading-tight text-primary flex-1">
							{insight.title}
						</h4>
						<span class="text-xs text-muted-foreground shrink-0">
							{relativeTime}
						</span>
						{#if onDismiss}
							<button
								type="button"
								class="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:outline focus-visible:ring-2 focus-visible:ring-ring"
								aria-label="Dismiss"
								onclick={handleDismissClick}
							>
								<X class="w-4 h-4" />
							</button>
						{/if}
					</div>
					<p class="text-xs text-muted-foreground leading-relaxed {isExpanded ? '' : 'line-clamp-2'}">
						{insight.message}
					</p>
					{#if insight.message.length > 80}
						<button
							class="mt-1 flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors"
							onclick={toggleExpanded}
						>
							{#if isExpanded}
								<ChevronUp class="w-3 h-3" />
								<span>Show less</span>
							{:else}
								<ChevronDown class="w-3 h-3" />
								<span>Show more</span>
							{/if}
						</button>
					{/if}
					{#if insight.actionUrl}
						<Button
							variant="outline"
							size="sm"
							class="mt-2 w-full sm:w-auto"
							onclick={handleCtaClick}
						>
							{insight.actionText || 'Take action'}
							<span class="ml-1">→</span>
						</Button>
					{/if}
				</div>
			</div>
		</div>

		<!-- Critical: dismiss confirmation -->
		<AlertDialog.Root bind:open={dismissConfirmOpen}>
			<AlertDialog.Content>
				<AlertDialog.Header>
					<AlertDialog.Title>Dismiss this alert?</AlertDialog.Title>
					<AlertDialog.Description>
						This alert will reappear if the risk persists.
					</AlertDialog.Description>
				</AlertDialog.Header>
				<AlertDialog.Footer>
					<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
					<AlertDialog.Action onclick={handleConfirmDismiss}>
						Dismiss
					</AlertDialog.Action>
				</AlertDialog.Footer>
			</AlertDialog.Content>
		</AlertDialog.Root>
	</div>
</div>
