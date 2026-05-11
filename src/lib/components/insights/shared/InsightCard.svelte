<script lang="ts">
	import { AlertCircle, CheckCircle, Info, AlertTriangle, Sparkles } from '@lucide/svelte';
	import type { InsightCardProps, UnifiedInsight } from '../types';
	import { formatDistanceToNow } from 'date-fns';

	interface Props {
		insight: UnifiedInsight;
		showTimestamp?: boolean;
		showActions?: boolean;
		onDismiss?: (insightId: string) => void;
		onAction?: (insightId: string) => void;
		className?: string;
		descriptionClass?: string;
	}

	const {
		insight,
		showTimestamp = true,
		showActions = true,
		onDismiss,
		onAction,
		className = '',
		descriptionClass = 'text-muted-foreground mt-1 text-sm leading-relaxed'
	}: Props = $props();

	// Severity styling
	const severityConfig = {
		info: {
			icon: Info,
			bgColor: 'bg-blue-50 dark:bg-blue-950/20',
			borderColor: 'border-blue-200 dark:border-blue-800',
			textColor: 'text-blue-800 dark:text-blue-200',
			iconColor: 'text-blue-600 dark:text-blue-400'
		},
		warning: {
			icon: AlertTriangle,
			bgColor: 'bg-yellow-50 dark:bg-yellow-950/20',
			borderColor: 'border-yellow-200 dark:border-yellow-800',
			textColor: 'text-yellow-800 dark:text-yellow-200',
			iconColor: 'text-yellow-600 dark:text-yellow-400'
		},
		alert: {
			icon: AlertCircle,
			bgColor: 'bg-red-50 dark:bg-red-950/20',
			borderColor: 'border-red-200 dark:border-red-800',
			textColor: 'text-red-800 dark:text-red-200',
			iconColor: 'text-red-600 dark:text-red-400'
		},
		success: {
			icon: CheckCircle,
			bgColor: 'bg-green-50 dark:bg-green-950/20',
			borderColor: 'border-green-200 dark:border-green-800',
			textColor: 'text-green-800 dark:text-green-200',
			iconColor: 'text-green-600 dark:text-green-400'
		},
		celebration: {
			icon: Sparkles,
			bgColor: 'bg-purple-50 dark:bg-purple-950/20',
			borderColor: 'border-purple-200 dark:border-purple-800',
			textColor: 'text-purple-800 dark:text-purple-200',
			iconColor: 'text-purple-600 dark:text-purple-400'
		}
	};

	const config = $derived(
		severityConfig[insight.severity as keyof typeof severityConfig] ?? severityConfig.info
	);
	const IconComponent = $derived(config.icon);

	function handleDismiss() {
		if (onDismiss) {
			onDismiss(insight.id);
		}
	}

	function handleAction() {
		if (onAction) {
			onAction(insight.id);
		}
	}

	function formatTimeAgo(dateString: string): string {
		try {
			return formatDistanceToNow(new Date(dateString), { addSuffix: true });
		} catch {
			return 'Recently';
		}
	}
</script>

<div class="insight-card {config.bgColor} {config.borderColor} rounded-lg border p-4 {className}">
	<div class="flex items-start gap-3">
		<!-- Icon -->
		<div class="mt-0.5 flex-shrink-0">
			<IconComponent class="h-5 w-5 {config.iconColor}" />
		</div>

		<!-- Content -->
		<div class="min-w-0 flex-1">
			<div class="flex items-start justify-between gap-2">
				<div class="flex-1">
					<h3 class="font-semibold {config.textColor} text-sm leading-tight">
						{insight.title}
					</h3>
					<p class={descriptionClass}>
						{insight.description}
					</p>
				</div>

				<!-- Dismiss button -->
				{#if showActions && onDismiss}
					<button
						onclick={handleDismiss}
						class="flex-shrink-0 rounded p-1 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
						title="Dismiss insight"
						aria-label="Dismiss insight"
					>
						<svg
							class="text-muted-foreground h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				{/if}
			</div>

			<!-- Metadata -->
			<div class="text-muted-foreground mt-3 flex items-center gap-4 text-xs">
				{#if insight.category}
					<span class="bg-secondary/50 rounded-full px-2 py-1 capitalize">
						{insight.category}
					</span>
				{/if}

				{#if insight.metadata?.confidence}
					<span class="flex items-center gap-1">
						<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						{insight.metadata.confidence}% confidence
					</span>
				{/if}

				{#if showTimestamp}
					<span>{formatTimeAgo(insight.createdAt)}</span>
				{/if}
			</div>

			<!-- Action button -->
			{#if showActions && insight.actionable && insight.actionText && onAction}
				<div class="mt-3">
					<button
						onclick={handleAction}
						class="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium {config.textColor} rounded-md border bg-white/50 transition-colors hover:bg-white/70 dark:bg-black/20 dark:hover:bg-black/40 {config.borderColor}"
					>
						{insight.actionText}
						<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 5l7 7-7 7"
							/>
						</svg>
					</button>
				</div>
			{/if}
		</div>
	</div>
</div>
