<script lang="ts">
	import { Check } from '@lucide/svelte';

	interface Props {
		hasAccount: boolean;
		hasTransaction: boolean;
		hasBudgetCategory: boolean;
		allowanceTabReviewed: boolean;
	}

	const { hasAccount, hasTransaction, hasBudgetCategory, allowanceTabReviewed }: Props = $props();

	const steps = $derived([
		{
			id: 1,
			done: hasAccount,
			label: 'Add your first account',
			href: '/accounts',
			cta: 'Add account'
		},
		{
			id: 2,
			done: hasTransaction,
			label: 'Add a transaction or import data',
			href: '/transactions/add',
			cta: 'Add transaction'
		},
		{
			id: 3,
			done: hasBudgetCategory,
			label: 'Set a budget on a category',
			href: '/plan?tab=budget',
			cta: 'Set budget'
		},
		{
			id: 4,
			done: allowanceTabReviewed,
			label: 'Review your allowance on Plan',
			href: '/plan?tab=allowance',
			cta: 'Review allowance'
		}
	]);
</script>

<section
	class="animate-card-enter squircle-4xl squircle-border bg-card px-4 py-4"
	style="animation-delay: 200ms"
	aria-label="First-run checklist"
>
	<h2 class="text-muted-foreground mb-3 text-xs font-semibold tracking-widest uppercase">
		Get started
	</h2>
	<ul class="space-y-2">
		{#each steps as step (step.id)}
			<li>
				{#if step.done}
					<div class="text-muted-foreground flex items-center gap-2 py-1.5">
						<span
							class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-sage-green)] text-[10px] text-white"
							aria-hidden="true"
						>
							<Check class="h-2.5 w-2.5" />
						</span>
						<span class="text-sm">{step.label}</span>
					</div>
				{:else}
					<a
						href={step.href}
						class="flex items-center justify-between gap-2 rounded-lg py-1.5 transition-colors hover:bg-[var(--color-bg-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-amber)]"
					>
						<span class="text-sm text-[var(--color-text-primary)]">{step.label}</span>
						<span class="shrink-0 text-xs font-medium text-[var(--color-amber)]"
							>{step.cta} →</span
						>
					</a>
				{/if}
			</li>
		{/each}
	</ul>
</section>
