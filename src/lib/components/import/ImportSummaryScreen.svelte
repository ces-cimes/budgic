<script lang="ts">
	interface Props {
		transactionCount: number;
		dateRange?: { start: string; end: string };
		accountCount: number;
		roundUpAmount: number;
		roundUpCount: number;
		interestCount: number;
		passiveBalanceHints?: Array<{ accountId: string; accountName: string; message: string }>;
		personAccountCandidates?: string[];
		onMigratePersonAccounts?: () => void;
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
		onMigratePersonAccounts,
		onNext,
		onSkip
	}: Props = $props();

	function fmtDate(value?: string): string {
		if (!value) return '—';
		return new Date(value).toLocaleDateString();
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
		<div class="space-y-2 rounded-xl border border-[var(--color-amber)]/30 bg-[var(--color-amber-subtle)] p-4">
			<p class="text-sm font-medium text-[var(--color-text-primary)]">Possible person accounts</p>
			<p class="text-xs text-[var(--color-text-secondary)]">
				Detected: {personAccountCandidates.join(', ')}.
			</p>
			<p class="text-xs text-[var(--color-text-tertiary)]">
				Migrate remaining balances to reimbursement tracking and keep account history intact.
			</p>
			{#if onMigratePersonAccounts}
				<button
					class="rounded-md border border-[var(--color-border)] px-3 py-1 text-xs hover:bg-[var(--color-bg-surface)]"
					onclick={onMigratePersonAccounts}
				>
					Run person-account migration
				</button>
			{/if}
		</div>
	{/if}
	<div class="flex items-center justify-between">
		<button class="text-sm text-[var(--color-text-tertiary)] hover:underline" onclick={onSkip}>
			Skip
		</button>
		<button
			class="rounded-xl bg-[var(--color-amber)] px-4 py-2 text-sm font-semibold text-[var(--color-bg-primary)]"
			onclick={onNext}
		>
			Classify the big ones
		</button>
	</div>
</div>
