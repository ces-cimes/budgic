<script lang="ts">
	import ImportSummaryScreen from './ImportSummaryScreen.svelte';
	import EssentialCandidatesScreen from './EssentialCandidatesScreen.svelte';
	import type { CandidateRow } from './EssentialCandidatesScreen.svelte';
	import UncertainPatternsScreen from './UncertainPatternsScreen.svelte';
	import ImportPayoffScreen from './ImportPayoffScreen.svelte';
	import type { ImportResult } from '$lib/core/services/import-export';
	import { classifiedExpenseShareFromTiers } from '$lib/utils/import-wizard-batch-metrics';
	import type { Transaction } from '$lib/core/db';

	type TierChoice = 'survival' | 'security' | 'growth' | 'lifestyle' | 'unclassified';

	interface PersonTxPanel {
		accountId: string;
		name: string;
		txs: Transaction[];
	}

	interface Props {
		open: boolean;
		importResult: ImportResult;
		beforeClassifiedExpenseShare: number;
		expenseTxIds: string[];
		expenseAbsByTxId: Record<string, number>;
		categoriesByTransactionId: Record<string, string | undefined>;
		onApplyTier: (transactionIds: string[], tier: TierChoice) => Promise<void>;
		personAccountCandidates?: string[];
		personAccountPreFlagged?: string[];
		personAccountPanels?: PersonTxPanel[];
		onTagPersonTxGift?: (transactionId: string) => Promise<void> | void;
		onTagPersonTxReimbursement?: (
			transactionId: string,
			personName: string
		) => Promise<void> | void;
		onClose: () => void;
		onGoPatterns: () => void;
	}

	let {
		open,
		importResult,
		beforeClassifiedExpenseShare,
		expenseTxIds,
		expenseAbsByTxId,
		categoriesByTransactionId,
		onApplyTier,
		personAccountCandidates = [],
		personAccountPreFlagged = [],
		personAccountPanels = [],
		onTagPersonTxGift,
		onTagPersonTxReimbursement,
		onClose,
		onGoPatterns
	}: Props = $props();

	const liveAfterClassifiedExpenseShare = $derived.by(() =>
		classifiedExpenseShareFromTiers(expenseTxIds, expenseAbsByTxId, categoriesByTransactionId)
	);

	let step = $state(1);
	let dismissedCandidates = $state<Set<string>>(new Set());
	const batch = $derived(importResult.importBatch);
	const candidates = $derived(
		(batch?.essentialCandidates ?? []).filter((c) => !dismissedCandidates.has(c.patternKey))
	);
	const patternHints = $derived(batch?.patternHints ?? []);

	async function approveCandidate(candidate: CandidateRow, tier: TierChoice) {
		await onApplyTier(candidate.matchedTransactionIds, tier);
		dismissedCandidates.add(candidate.patternKey);
	}

	async function approveAllEssentials() {
		for (const c of candidates) {
			if (c.suggestedTier === 'survival' || c.suggestedTier === 'security') {
				await onApplyTier(c.matchedTransactionIds, c.suggestedTier);
				dismissedCandidates.add(c.patternKey);
			}
		}
	}

	const remainingUnclassified = $derived(
		Object.entries(categoriesByTransactionId).filter(([, tier]) => !tier || tier === 'unclassified')
			.length
	);
</script>

{#if open && batch}
	<div class="fixed inset-0 z-50 bg-black/40 p-4">
		<div
			class="mx-auto mt-8 max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-5 shadow-2xl"
		>
			<div class="flex items-center justify-between">
				<p
					class="text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
				>
					Import wizard · Step {step}/4
				</p>
				<button
					type="button"
					class="text-sm text-[var(--color-text-tertiary)] hover:underline"
					onclick={onClose}
				>
					Close
				</button>
			</div>

			{#if step === 1}
				<ImportSummaryScreen
					transactionCount={batch.transactionIds.length}
					dateRange={batch.dateRange}
					accountCount={batch.accountIdsAffected.length}
					roundUpAmount={batch.automationSummary?.roundUpAmount ?? 0}
					roundUpCount={batch.automationSummary?.roundUpCount ?? 0}
					interestCount={batch.automationSummary?.interestCount ?? 0}
					passiveBalanceHints={batch.passiveBalanceTrackingHints ?? []}
					{personAccountCandidates}
					{personAccountPreFlagged}
					{personAccountPanels}
					{onTagPersonTxGift}
					{onTagPersonTxReimbursement}
					onNext={() => (step = 2)}
					onSkip={onClose}
				/>
			{:else if step === 2}
				<EssentialCandidatesScreen
					{candidates}
					onApproveAll={approveAllEssentials}
					onApproveRow={approveCandidate}
					onSkipRow={(c) => dismissedCandidates.add(c.patternKey)}
					onNext={() => (step = 3)}
				/>
			{:else if step === 3}
				<UncertainPatternsScreen
					{patternHints}
					{onGoPatterns}
					onNext={() => (step = 4)}
					onSkip={() => (step = 4)}
				/>
			{:else}
				<ImportPayoffScreen
					{beforeClassifiedExpenseShare}
					afterClassifiedExpenseShare={liveAfterClassifiedExpenseShare}
					{remainingUnclassified}
					{onGoPatterns}
					onDone={onClose}
				/>
			{/if}
		</div>
	</div>
{/if}
