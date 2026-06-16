<script lang="ts">
	import type { ImportSplitReviewGroup } from '$lib/core/services/core/data-quality-service';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Checkbox } from '$lib/components/ui/checkbox/index.ts';
	import { formatAmount, formatPercentage } from '$lib/utils/currency-utils';

	interface Props {
		group: ImportSplitReviewGroup;
		accountName?: string;
		busy?: boolean;
		onconfirm: (selectedIds: string[]) => void;
		ondismiss: () => void;
	}

	let { group, accountName, busy = false, onconfirm, ondismiss }: Props = $props();

	const detectedIds = $derived(new Set(group.transactions.map((t) => t.id)));

	let selectedIds = $state<string[]>([]);

	$effect(() => {
		selectedIds = group.transactions.map((t) => t.id);
	});

	const selectedTransactions = $derived(
		group.pickerTransactions.filter((t) => selectedIds.includes(t.id))
	);

	const totalAbs = $derived(
		selectedTransactions.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0)
	);

	function toggleId(id: string, checked: boolean) {
		if (checked) {
			if (!selectedIds.includes(id)) selectedIds = [...selectedIds, id];
		} else {
			selectedIds = selectedIds.filter((x) => x !== id);
		}
	}

	function sharePercent(tx: { amount?: number }): number {
		if (totalAbs <= 0) return 0;
		return Math.abs(tx.amount || 0) / totalAbs;
	}

	function formatTime(tx: {
		clearedDate?: string;
		plannedDate?: string;
		createdAt?: string;
	}): string {
		const raw = tx.clearedDate ?? tx.plannedDate ?? tx.createdAt;
		if (!raw) return '—';
		return new Date(raw).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	const timeSpan = $derived.by(() => {
		const times = group.transactions
			.map((t) => t.clearedDate ?? t.plannedDate ?? t.createdAt)
			.filter(Boolean)
			.map((d) => new Date(d!).getTime())
			.filter(Number.isFinite);
		if (times.length === 0) return '';
		const min = Math.min(...times);
		const max = Math.max(...times);
		if (min === max) return formatTime(group.transactions[0]!);
		return `${new Date(min).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} – ${new Date(max).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
	});
</script>

<li class="border-border rounded-xl border bg-[var(--color-bg-tertiary)] px-4 py-3">
	<div>
		<p class="text-sm font-medium text-[var(--color-text-primary)]">Possible split</p>
		<p class="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
			{accountName ?? 'Account'} · {timeSpan} · {group.transactions.length} detected
		</p>
	</div>

	<p class="mt-2 text-xs text-[var(--color-text-secondary)]">
		Select transactions from the same window that belong to one receipt. Percentages use
		absolute amounts.
	</p>

	<ul class="mt-3 space-y-2">
		{#each group.pickerTransactions as tx (tx.id)}
			{@const checked = selectedIds.includes(tx.id)}
			{@const pct = sharePercent(tx)}
			<li
				class="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2"
			>
				<Checkbox
					{checked}
					onCheckedChange={(v) => toggleId(tx.id, v === true)}
					disabled={busy}
					aria-label="Include {tx.description || 'transaction'}"
				/>
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm text-[var(--color-text-primary)]">
						{tx.description || 'No description'}
						{#if detectedIds.has(tx.id)}
							<span
								class="ml-1 rounded bg-[var(--color-amber)]/15 px-1 text-xs text-[var(--color-amber)]"
								>detected</span
							>
						{/if}
					</p>
					<p class="text-xs text-[var(--color-text-tertiary)]">{formatTime(tx)}</p>
				</div>
				<div class="text-right text-sm tabular-nums">
					<p class="font-medium text-[var(--color-text-primary)]">
						{formatAmount(Math.abs(tx.amount || 0), tx.currency)}
					</p>
					{#if checked && selectedIds.length >= 2}
						<p class="text-xs text-[var(--color-text-tertiary)]">
							{formatPercentage(pct)}
						</p>
					{/if}
				</div>
			</li>
		{/each}
	</ul>

	{#if selectedIds.length >= 2}
		<p class="mt-3 text-sm font-medium text-[var(--color-text-primary)]">
			Total: {formatAmount(totalAbs, selectedTransactions[0]?.currency ?? 'USD')}
		</p>
	{/if}

	<div class="mt-3 flex flex-wrap gap-2">
		<Button
			variant="secondary"
			size="sm"
			disabled={busy || selectedIds.length < 2}
			onclick={() => onconfirm(selectedIds)}
		>
			Create split
		</Button>
		<Button variant="ghost" size="sm" disabled={busy} onclick={ondismiss}>Dismiss</Button>
	</div>
</li>
