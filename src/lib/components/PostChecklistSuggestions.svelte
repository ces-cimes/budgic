<script lang="ts">
	import { X } from '@lucide/svelte';
	import type { ResolvedPostChecklistSuggestion } from '$lib/utils/post-checklist-suggestions';

	interface Props {
		suggestions: ResolvedPostChecklistSuggestion[];
		onDismiss: (id: string) => void;
	}

	const { suggestions, onDismiss }: Props = $props();
</script>

<section
	class="animate-card-enter squircle-4xl squircle-border bg-card px-4 py-4"
	style="animation-delay: 200ms"
	aria-label="Suggested next steps"
>
	<h2 class="text-muted-foreground mb-1 text-xs font-semibold tracking-widest uppercase">
		Suggested next steps
	</h2>
	<p class="text-muted-foreground mb-3 text-xs">Optional — dismiss anytime</p>
	<ul class="space-y-2">
		{#each suggestions as suggestion (suggestion.id)}
			<li
				class="border-border flex flex-col gap-2 rounded-xl border bg-[var(--color-bg-surface)] px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
			>
				<div class="min-w-0 flex-1">
					<p class="text-sm font-medium text-[var(--color-text-primary)]">
						{suggestion.title}
					</p>
					<p class="text-muted-foreground mt-0.5 text-xs">{suggestion.helper}</p>
				</div>
				<div class="flex shrink-0 items-center gap-2">
					<a
						href={suggestion.href}
						class="text-xs font-medium text-[var(--color-amber)] hover:underline"
					>
						Open →
					</a>
					<button
						type="button"
						class="text-muted-foreground rounded p-1 transition-colors hover:text-[var(--color-text-primary)]"
						aria-label="Dismiss {suggestion.title}"
						onclick={() => onDismiss(suggestion.id)}
					>
						<X class="h-3.5 w-3.5" />
					</button>
				</div>
			</li>
		{/each}
	</ul>
</section>
