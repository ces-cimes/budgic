<script lang="ts">
	/**
	 * Phase 8 — month-to-date automation totals for one account (pre-aggregated by parent).
	 */
	import * as Sheet from '$lib/components/ui/sheet';
	import type { AutomationTag, Transaction } from '$lib/core/db';
	import { formatTransactionAmount } from '$lib/utils/currency-utils';
	import { Button } from '$lib/components/ui/button/index.ts';

	interface AutomationMonthLine {
		tag: AutomationTag;
		label: string;
		total: number;
		count: number;
		entries: Transaction[];
	}

	interface Props {
		currency: string;
		lines: AutomationMonthLine[];
	}

	const { currency, lines = [] }: Props = $props();

	let sheetOpen = $state(false);
	let sheetTitle = $state('');
	let sheetEntries = $state<Transaction[]>([]);

	function openLine(line: AutomationMonthLine) {
		sheetTitle = line.label;
		sheetEntries = line.entries;
		sheetOpen = true;
	}

	function formatRow(tx: Transaction): string {
		const d = tx.clearedDate || tx.plannedDate || tx.createdAt || '';
		const dateStr = d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
		const amt = formatTransactionAmount(tx.amount ?? 0, tx.currency || currency, true);
		return `${dateStr} · ${tx.description || '—'} · ${amt}`;
	}
</script>

{#if lines.length > 0}
	<div class="border-border bg-card/40 rounded-xl border px-4 py-3">
		<h3
			class="text-text-tertiary mb-3 text-xs font-semibold tracking-widest uppercase"
		>
			Automation this month
		</h3>
		<ul class="space-y-2">
			{#each lines as line (line.tag)}
				<li>
					<button
						type="button"
						class="hover:bg-muted/40 flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors"
						onclick={() => openLine(line)}
					>
						<span class="text-text-primary">{line.label}</span>
						<span class="text-text-secondary shrink-0">
							{formatTransactionAmount(line.total, currency, true)}
							{#if line.count > 1}
								<span class="text-text-tertiary ml-1 text-xs">({line.count})</span>
							{/if}
						</span>
					</button>
				</li>
			{/each}
		</ul>
	</div>

	<Sheet.Root bind:open={sheetOpen}>
		<Sheet.Content side="bottom" class="max-h-[70vh] overflow-y-auto">
			<Sheet.Header>
				<Sheet.Title>{sheetTitle}</Sheet.Title>
				<Sheet.Description class="sr-only">Individual entries</Sheet.Description>
			</Sheet.Header>
			<ul class="mt-4 space-y-2 px-1 pb-2">
				{#each sheetEntries as tx (tx.id)}
					<li class="text-text-secondary border-border border-b pb-2 text-sm last:border-0">
						{formatRow(tx)}
					</li>
				{/each}
			</ul>
			<Sheet.Footer class="border-t pt-4">
				<Button variant="secondary" class="w-full" onclick={() => (sheetOpen = false)}>Close</Button>
			</Sheet.Footer>
		</Sheet.Content>
	</Sheet.Root>
{/if}
