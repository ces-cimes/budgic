<script lang="ts">
	import ImportSummaryScreen from './ImportSummaryScreen.svelte';
	import EssentialCandidatesScreen from './EssentialCandidatesScreen.svelte';
	import type { CandidateRow } from './EssentialCandidatesScreen.svelte';
	import ImportPayoffScreen from './ImportPayoffScreen.svelte';
	import type { ImportResult } from '$lib/core/services/import-export';

	type TierChoice = 'survival' | 'security' | 'growth' | 'lifestyle' | 'unclassified';

	interface Props {
		open: boolean;
		importResult: ImportResult;
		beforeRatio: number;
		categoriesByTransactionId: Record<string, string | undefined>;
		onApplyTier: (transactionIds: string[], tier: TierChoice) => Promise<void>;
		personAccountCandidates?: string[];
		onMigratePersonAccounts?: () => Promise<void> | void;
		onClose: () => void;
		onGoPatterns: () => void;
	}

	let {
		open,
		importResult,
		beforeRatio,
		categoriesByTransactionId,
		onApplyTier,
		personAccountCandidates = [],
		onMigratePersonAccounts,
		onClose,
		onGoPatterns
	}: Props = $props();

	// Live after-ratio: recomputes each time a candidate is approved
	const liveAfterRatio = $derived.by(() => {
		const entries = Object.values(categoriesByTransactionId);
		const total = entries.length;
		if (total === 0) return beforeRatio;
		const classified = entries.filter((t) => t && t !== 'unclassified').length;
		return classified / total;
	});

	let step = $state(1);
	let dismissedCandidates = $state<Set<string>>(new Set());
	const batch = $derived(importResult.importBatch);
	const candidates = $derived(
		(batch?.essentialCandidates ?? []).filter((c) => !dismissedCandidates.has(c.patternKey))
	);

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
			class="mx-auto mt-12 w-full max-w-2xl space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-5 shadow-2xl"
		>
			<div class="flex items-center justify-between">
				<p
					class="text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
				>
					Import wizard · Step {step}/3
				</p>
				<button class="text-sm text-[var(--color-text-tertiary)] hover:underline" onclick={onClose}>
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
					{onMigratePersonAccounts}
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
			{:else}
				<ImportPayoffScreen
					{beforeRatio}
					afterRatio={liveAfterRatio}
					{remainingUnclassified}
					{onGoPatterns}
					onDone={onClose}
				/>
			{/if}
		</div>
	</div>
{/if}
