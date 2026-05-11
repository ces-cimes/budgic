<script lang="ts">
	import type { Transaction } from '$lib/core/db';

	export interface PersonAccountTxPanel {
		accountId: string;
		name: string;
		txs: Transaction[];
	}

	interface Props {
		transactionCount: number;
		dateRange?: { start: string; end: string };
		accountCount: number;
		roundUpAmount: number;
		roundUpCount: number;
		interestCount: number;
		passiveBalanceHints?: Array<{ accountId: string; accountName: string; message: string }>;
		personAccountCandidates?: string[];
		personAccountPanels?: PersonAccountTxPanel[];
		onMigratePersonAccounts?: () => void;
		onTagPersonTxGift?: (transactionId: string) => void;
		onTagPersonTxReimbursement?: (transactionId: string, personName: string) => void;
		onNext: () => void;
		onSkip: () => void;
	}

	let {
		transactionCount,
		dateRange,
		accountCount,
		roundUpAmount,
		roundUpCount,
		interestCount,
		passiveBalanceHints = [],
		personAccountCandidates = [],
		personAccountPanels = [],
		onMigratePersonAccounts,
		onTagPersonTxGift,
		onTagPersonTxReimbursement,
		onNext,
		onSkip
	}: Props = $props();

	function fmtDate(value?: string): string {
		if (!value) return '—';
		return new Date(value).toLocaleDateString();
	}

	function fmtTxLine(tx: Transaction): string {
		const d = fmtDate(tx.clearedDate || tx.plannedDate || tx.createdAt);
		const amt = Math.abs(tx.amount || 0).toFixed(2);
		const desc = (tx.description || '—').slice(0, 48);
		return `${d} · ${amt} · ${desc}`;
	}
</script>

<div class="space-y-4">
	<h3 class="text-lg font-semibold text-[var(--color-text-primary)]">Import summary</h3>
	<div class="space-y-2 rounded-xl bg-[var(--color-bg-surface)] p-4 text-sm">
		<p><span class="text-[var(--color-text-tertiary)]">Transactions:</span> {transactionCount}</p>
		<p><span class="text-[var(--color-text-tertiary)]">Accounts affected:</span> {accountCount}</p>
		<p>
			<span class="text-[var(--color-text-tertiary)]">Date range:</span>
			{fmtDate(dateRange?.start)} - {fmtDate(dateRange?.end)}
		</p>
		<p class="pt-1 text-[var(--color-text-secondary)]">
			Detected automation noise: {roundUpCount} round-up entries ({roundUpAmount.toFixed(2)}) and
			{interestCount} micro-interest entries.
		</p>
	</div>
	{#if passiveBalanceHints.length > 0}
		<div
			class="space-y-2 rounded-xl border border-[var(--color-info)]/30 bg-[var(--color-info)]/10 p-4"
		>
			<p class="text-sm font-medium text-[var(--color-text-primary)]">Balance-based tracking</p>
			{#each passiveBalanceHints as h}
				<p class="text-xs text-[var(--color-text-secondary)]">
					<span class="font-medium">{h.accountName}:</span>
					{h.message}
				</p>
			{/each}
		</div>
	{/if}
	{#if personAccountCandidates.length > 0}
		<div
			class="space-y-2 rounded-xl border border-[var(--color-amber)]/30 bg-[var(--color-amber-subtle)] p-4"
		>
			<p class="text-sm font-medium text-[var(--color-text-primary)]">Possible person accounts</p>
			<p class="text-xs text-[var(--color-text-secondary)]">
				Detected: {personAccountCandidates.join(', ')}.
			</p>
			<p class="text-xs text-[var(--color-text-tertiary)]">
				Tag recent activity as gift (lifestyle) or reimbursement, or run balance migration to close
				the ledger on those accounts.
			</p>
			{#each personAccountPanels as panel (panel.accountId)}
				<div
					class="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-2"
				>
					<p class="text-xs font-medium text-[var(--color-text-primary)]">{panel.name}</p>
					<ul
						class="mt-1 max-h-32 space-y-1 overflow-y-auto text-[10px] text-[var(--color-text-tertiary)]"
					>
						{#each panel.txs as tx (tx.id)}
							<li
								class="flex flex-wrap items-center gap-1 border-b border-[var(--color-border)]/40 py-1 last:border-0"
							>
								<span class="min-w-0 flex-1 truncate">{fmtTxLine(tx)}</span>
								{#if onTagPersonTxGift}
									<button
										type="button"
										class="shrink-0 rounded border border-[var(--color-border)] px-1.5 py-0.5 hover:bg-[var(--color-bg-surface)]"
										onclick={() => onTagPersonTxGift(tx.id)}
									>
										Gift
									</button>
								{/if}
								{#if onTagPersonTxReimbursement}
									<button
										type="button"
										class="shrink-0 rounded border border-[var(--color-border)] px-1.5 py-0.5 hover:bg-[var(--color-bg-surface)]"
										onclick={() => onTagPersonTxReimbursement(tx.id, panel.name)}
									>
										Reimburse
									</button>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/each}
			{#if onMigratePersonAccounts}
				<button
					type="button"
					class="rounded-md border border-[var(--color-border)] px-3 py-1 text-xs hover:bg-[var(--color-bg-surface)]"
					onclick={onMigratePersonAccounts}
				>
					Run person-account migration
				</button>
			{/if}
		</div>
	{/if}
	<div class="flex items-center justify-between">
		<button
			type="button"
			class="text-sm text-[var(--color-text-tertiary)] hover:underline"
			onclick={onSkip}
		>
			Skip
		</button>
		<button
			type="button"
			class="rounded-xl bg-[var(--color-amber)] px-4 py-2 text-sm font-semibold text-[var(--color-bg-primary)]"
			onclick={onNext}
		>
			Classify the big ones
		</button>
	</div>
</div>
