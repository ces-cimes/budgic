<script lang="ts">
	import ImportSummaryScreen from './ImportSummaryScreen.svelte';
	import EssentialCandidatesScreen from './EssentialCandidatesScreen.svelte';
	import type { CandidateRow } from './EssentialCandidatesScreen.svelte';
	import UncertainPatternsScreen from './UncertainPatternsScreen.svelte';
	import ImportPayoffScreen from './ImportPayoffScreen.svelte';
	import PersonLedgerMigrationWizard from '$lib/components/person-ledger/PersonLedgerMigrationWizard.svelte';
	import type {
		ImportResult,
		PersonLedgerCloseQueueEntry,
		PersonLedgerDirectRouteEntry
	} from '$lib/core/services/import-export';
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
		personLedgerDirectRoute?: PersonLedgerDirectRouteEntry[];
		personLedgerCloseQueue?: PersonLedgerCloseQueueEntry[];
		showClassificationFlow?: boolean;
		startStep?: number;
		onPersonLedgerCloseApplied?: () => void | Promise<void>;
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
		personLedgerDirectRoute = [],
		personLedgerCloseQueue = [],
		showClassificationFlow = true,
		startStep = 1,
		onPersonLedgerCloseApplied,
		onClose,
		onGoPatterns
	}: Props = $props();

	const liveAfterClassifiedExpenseShare = $derived.by(() =>
		classifiedExpenseShareFromTiers(expenseTxIds, expenseAbsByTxId, categoriesByTransactionId)
	);

	const hasPersonLedgerStep = $derived(personLedgerCloseQueue.length > 0);
	const closeStepNumber = $derived(showClassificationFlow ? 5 : 2);
	const totalSteps = $derived((showClassificationFlow ? 4 : 1) + (hasPersonLedgerStep ? 1 : 0));
	const summaryNextLabel = $derived.by(() => {
		if (showClassificationFlow) return 'Classify the big ones';
		if (hasPersonLedgerStep) return 'Review fallback ledgers';
		return 'Finish';
	});

	let step = $state(1);
	let dismissedCandidates = $state<Set<string>>(new Set());
	let personCloseIndex = $state(0);
	let personCloseWizardOpen = $state(true);

	const batch = $derived(importResult.importBatch);
	const candidates = $derived(
		(batch?.essentialCandidates ?? []).filter((c) => !dismissedCandidates.has(c.patternKey))
	);
	const patternHints = $derived(batch?.patternHints ?? []);

	const currentPersonClose = $derived(personLedgerCloseQueue[personCloseIndex] ?? null);

	$effect(() => {
		if (open) {
			step = startStep;
			personCloseIndex = 0;
			personCloseWizardOpen = true;
		}
	});

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

	function finishPayoffStep() {
		if (hasPersonLedgerStep) {
			step = closeStepNumber;
			personCloseIndex = 0;
			personCloseWizardOpen = true;
		} else {
			onClose();
		}
	}

	function advanceFromSummary() {
		if (showClassificationFlow) {
			step = 2;
			return;
		}
		if (hasPersonLedgerStep) {
			step = closeStepNumber;
			personCloseIndex = 0;
			personCloseWizardOpen = true;
			return;
		}
		onClose();
	}

	async function onPersonLedgerApplied() {
		await onPersonLedgerCloseApplied?.();
		if (personCloseIndex + 1 < personLedgerCloseQueue.length) {
			personCloseIndex += 1;
			personCloseWizardOpen = true;
		} else {
			onClose();
		}
	}
</script>

{#if open && batch && (batch.transactionIds.length > 0 || personLedgerCloseQueue.length > 0 || personLedgerDirectRoute.length > 0)}
	<div class="fixed inset-0 z-50 bg-black/40 p-4">
		<div
			class="mx-auto mt-8 max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-5 shadow-2xl"
		>
			<div class="flex items-center justify-between">
				<p
					class="text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
				>
					Import wizard · Step {step}/{totalSteps}
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
					{personLedgerDirectRoute}
					hasPersonLedgerCloseStep={hasPersonLedgerStep}
					nextLabel={summaryNextLabel}
					{onTagPersonTxGift}
					{onTagPersonTxReimbursement}
					onNext={advanceFromSummary}
					onSkip={onClose}
				/>
			{:else if showClassificationFlow && step === 2}
				<EssentialCandidatesScreen
					{candidates}
					onApproveAll={approveAllEssentials}
					onApproveRow={approveCandidate}
					onSkipRow={(c) => dismissedCandidates.add(c.patternKey)}
					onNext={() => (step = 3)}
				/>
			{:else if showClassificationFlow && step === 3}
				<UncertainPatternsScreen
					{patternHints}
					{onGoPatterns}
					onNext={() => (step = 4)}
					onSkip={() => (step = 4)}
				/>
			{:else if showClassificationFlow && step === 4}
				<ImportPayoffScreen
					{beforeClassifiedExpenseShare}
					afterClassifiedExpenseShare={liveAfterClassifiedExpenseShare}
					{remainingUnclassified}
					{onGoPatterns}
					onDone={finishPayoffStep}
				/>
			{:else if step === closeStepNumber && currentPersonClose}
				<div class="space-y-3">
					<h3 class="text-lg font-semibold text-[var(--color-text-primary)]">
						{personLedgerDirectRoute.length > 0
							? 'Close fallback person ledger'
							: 'Close person ledger'}
					</h3>
					<p class="text-sm text-[var(--color-text-secondary)]">
						{#if personLedgerDirectRoute.length > 0}
							{personCloseIndex + 1} of {personLedgerCloseQueue.length}: migrate fallback ledger
							<strong>{currentPersonClose.name}</strong> to reimbursements on a real wallet. Direct-routed
							ledgers already went straight to their anchor wallet and do not need this step. Choose single
							total, forgive & archive, guided, or automatic — same as on the account page.
						{:else}
							{personCloseIndex + 1} of {personLedgerCloseQueue.length}: migrate
							<strong>{currentPersonClose.name}</strong> to reimbursements on a real wallet. Choose single
							total, forgive & archive, guided, or automatic — same as on the account page.
						{/if}
					</p>
					<PersonLedgerMigrationWizard
						ledgerAccountId={currentPersonClose.accountId}
						externalKeys={currentPersonClose.externalKeys}
						open={personCloseWizardOpen}
						onOpenChange={(v) => {
							personCloseWizardOpen = v;
							if (!v && personCloseIndex + 1 >= personLedgerCloseQueue.length) {
								onClose();
							}
						}}
						onApplied={onPersonLedgerApplied}
					/>
				</div>
			{/if}
		</div>
	</div>
{/if}
