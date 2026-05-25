<script lang="ts">
	import type { Transaction } from '$lib/core/db';
	import type { PersonLedgerDirectRouteEntry } from '$lib/core/services/import-export';

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
		personAccountPreFlagged?: string[];
		personAccountPanels?: PersonAccountTxPanel[];
		personLedgerDirectRoute?: PersonLedgerDirectRouteEntry[];
		onTagPersonTxGift?: (transactionId: string) => void;
		onTagPersonTxReimbursement?: (transactionId: string, personName: string) => void;
		/** Whether a later person-ledger close step is present */
		hasPersonLedgerCloseStep?: boolean;
		nextLabel?: string;
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
		personAccountPreFlagged = [],
		personAccountPanels = [],
		personLedgerDirectRoute = [],
		onTagPersonTxGift,
		onTagPersonTxReimbursement,
		hasPersonLedgerCloseStep = false,
		nextLabel = 'Classify the big ones',
		onNext,
		onSkip
	}: Props = $props();

	const directRouteNames = $derived(personLedgerDirectRoute.map((entry) => entry.name));
	const directRouteNameSet = $derived.by(() => new Set(directRouteNames));
	const fallbackPersonAccountCandidates = $derived(
		personAccountCandidates.filter((name) => !directRouteNameSet.has(name))
	);
	const fallbackPersonAccountPreFlagged = $derived(
		personAccountPreFlagged.filter((name) => !directRouteNameSet.has(name))
	);
	const fallbackPersonAccountPanels = $derived(
		personAccountPanels.filter((panel) => !directRouteNameSet.has(panel.name))
	);
	const hasFallbackPersonLedgers = $derived(
		fallbackPersonAccountCandidates.length > 0 ||
			fallbackPersonAccountPreFlagged.length > 0 ||
			fallbackPersonAccountPanels.length > 0
	);

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
			{#each passiveBalanceHints as h (h.accountId)}
				<p class="text-xs text-[var(--color-text-secondary)]">
					<span class="font-medium">{h.accountName}:</span>
					{h.message}
				</p>
			{/each}
		</div>
	{/if}
	{#if personLedgerDirectRoute.length > 0}
		<div
			class="space-y-2 rounded-xl border border-[var(--color-sage-green)]/30 bg-[var(--color-sage-green)]/8 p-4"
		>
			<p class="text-sm font-medium text-[var(--color-text-primary)]">
				Direct-routed person ledgers
			</p>
			<p class="text-xs text-[var(--color-text-secondary)]">
				{directRouteNames.join(', ')}. Those movements were routed straight to the anchor wallet,
				and no temporary wallet was created.
			</p>
			{#if hasPersonLedgerCloseStep}
				<p class="text-xs text-[var(--color-text-tertiary)]">
					The later close step is only for fallback person ledgers that still opened a temporary
					wallet.
				</p>
			{/if}
		</div>
	{/if}
	{#if hasFallbackPersonLedgers}
		{@const detectedOnly = fallbackPersonAccountCandidates.filter(
			(n) => !fallbackPersonAccountPreFlagged.includes(n)
		)}
		<div
			class="space-y-2 rounded-xl border border-[var(--color-amber)]/30 bg-[var(--color-amber-subtle)] p-4"
		>
			<p class="text-sm font-medium text-[var(--color-text-primary)]">Person ledgers</p>
			<p class="text-xs text-[var(--color-text-secondary)]">
				{#if fallbackPersonAccountPreFlagged.length > 0}
					Marked at import: {fallbackPersonAccountPreFlagged.join(', ')}.
				{/if}
				{#if detectedOnly.length > 0}
					{fallbackPersonAccountPreFlagged.length > 0 ? ' ' : ''}Detected from activity:
					{detectedOnly.join(', ')}.
				{/if}
			</p>
			<p class="text-xs text-[var(--color-text-tertiary)]">
				Tag recent activity as gift (lifestyle) or reimbursement.
				{#if hasPersonLedgerCloseStep}
					A later wizard step will close fallback person ledgers that still opened a temporary
					wallet.
				{:else}
					Close these from the account page when you are ready.
				{/if}
			</p>
			{#each fallbackPersonAccountPanels as panel (panel.accountId)}
				<div
					class="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-2"
				>
					<p class="text-xs font-medium text-[var(--color-text-primary)]">
						{panel.name}
						{#if fallbackPersonAccountPreFlagged.includes(panel.name)}
							<span class="ml-1 font-normal text-[var(--color-text-tertiary)]"
								>(marked at import)</span
							>
						{:else}
							<span class="ml-1 font-normal text-[var(--color-text-tertiary)]"
								>(detected from activity)</span
							>
						{/if}
					</p>
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
			{nextLabel}
		</button>
	</div>
</div>
