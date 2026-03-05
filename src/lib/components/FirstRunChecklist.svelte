<script lang="ts">
	import { goto } from '$app/navigation';
	import { Check } from '@lucide/svelte';

	interface Props {
		/** Step 1: user has at least one account */
		hasAccount: boolean;
		/** Step 2: user has at least one transaction (or has imported) */
		hasTransaction: boolean;
		/** Step 3: at least one category has a budget amount set */
		hasBudgetCategory: boolean;
	}

	const { hasAccount, hasTransaction, hasBudgetCategory }: Props = $props();

	const steps = $derived([
		{ id: 1, done: hasAccount, label: 'Add your first account', href: '/accounts', cta: 'Add account' },
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
			label: 'Set a budget amount for at least one category',
			href: '/plan?tab=budget',
			cta: 'Set budget'
		}
	]);
</script>

<section
	class="animate-card-enter squircle-4xl squircle-border bg-card px-4 py-4"
	style="animation-delay: 200ms"
	aria-label="First-run checklist"
>
	<h2 class="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
		Get started
	</h2>
	<ul class="space-y-2">
		{#each steps as step (step.id)}
			<li>
				{#if step.done}
					<div class="flex items-center gap-2 py-1.5 text-muted-foreground">
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
						class="flex items-center justify-between gap-2 py-1.5 rounded-lg transition-colors hover:bg-[var(--color-bg-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-amber)]"
					>
						<span class="text-sm text-[var(--color-text-primary)]">{step.label}</span>
						<span class="text-xs font-medium text-[var(--color-amber)] shrink-0">{step.cta} →</span>
					</a>
				{/if}
			</li>
		{/each}
	</ul>
</section>
