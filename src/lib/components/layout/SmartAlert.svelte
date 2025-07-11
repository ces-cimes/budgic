<script lang="ts">
	interface SmartAlert {
		id: string;
		type: 'success' | 'warning' | 'info' | 'achievement';
		title: string;
		message: string;
		icon: string;
		action?: {
			text: string;
			onClick: () => void;
		};
	}

	export let alert: SmartAlert | null = null;
	export let showPlaceholder = false;

	$: alertConfig = {
		success: { bgColor: 'bg-sage-green/10', borderColor: 'border-sage-green/30', textColor: 'text-sage-green' },
		warning: { bgColor: 'bg-warning-amber/10', borderColor: 'border-warning-amber/30', textColor: 'text-warning-amber' },
		info: { bgColor: 'bg-bg-tertiary', borderColor: 'border-primary/30', textColor: 'text-text-primary' },
		achievement: { bgColor: 'bg-warm-coral/10', borderColor: 'border-warm-coral/30', textColor: 'text-warm-coral' }
	};
</script>

{#if showPlaceholder}
	<div class="rounded-2xl p-4 border border-warning-amber/30 bg-warning-amber/10">
		<div class="flex items-start gap-3">
			<span class="text-2xl">🔥</span>
			<div class="flex-1">
				<h3 class="text-lg font-semibold text-warning-amber mb-1">You're on track for your best month yet!</h3>
				<p class="text-sm text-text-secondary mb-3">Continue this pace to save $340 extra this month</p>
				<button class="text-xs text-warning-amber underline hover:no-underline">
					View progress details
				</button>
			</div>
		</div>
		<div class="mt-3 p-2 bg-bg-tertiary rounded-lg border border-primary/20">
			<p class="text-xs text-text-secondary text-center italic">
				💡 Placeholder: Smart alert logic not implemented
			</p>
		</div>
	</div>
{:else if alert}
	{@const config = alertConfig[alert.type]}
	<div class="rounded-2xl p-4 border {config.borderColor} {config.bgColor}">
		<div class="flex items-start gap-3">
			<span class="text-2xl">{alert.icon}</span>
			<div class="flex-1">
				<h3 class="text-lg font-semibold {config.textColor} mb-1">{alert.title}</h3>
				<p class="text-sm text-text-secondary mb-3">{alert.message}</p>
				{#if alert.action}
					<button 
						class="text-xs {config.textColor} underline hover:no-underline"
						onclick={alert.action.onClick}
					>
						{alert.action.text}
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if} 