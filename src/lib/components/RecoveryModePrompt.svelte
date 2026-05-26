<script lang="ts">
	import type { FinancialStateResult } from '$lib/core/services';
	import { Checkbox } from '$lib/components/ui/checkbox/index.ts';

	interface Props {
		/** Result from `classifyFinancialState()` — drives enter/exit visibility. */
		financialState: FinancialStateResult | null;
		/** Current value of `userPreferences.recoveryModeActive`. */
		recoveryModeActive: boolean;
		/** Current value of `userPreferences.recoveryModeDeclined`. */
		recoveryModeDeclined: boolean;
		/** When true, hide the optional income-deduction opt-in (already enabled). */
		debtRecoveryActive?: boolean;
		/** Called with the pref patch to apply. Parent owns the DB write. */
		onAction: (patch: {
			recoveryModeActive?: boolean;
			recoveryModeDeclined?: boolean;
			debtRecoveryActive?: boolean;
		}) => void;
	}

	const {
		financialState,
		recoveryModeActive,
		recoveryModeDeclined,
		debtRecoveryActive = false,
		onAction
	}: Props = $props();

	/**
	 * Enter banner: classifier says recovery, user has NOT accepted and NOT declined.
	 * Exit banner: user is in recovery mode and signals have cleared (state !== 'recovery').
	 */
	const showEnter = $derived(
		financialState?.state === 'recovery' && !recoveryModeActive && !recoveryModeDeclined
	);

	const showExit = $derived(
		recoveryModeActive && financialState !== null && financialState.state !== 'recovery'
	);

	const showDeductionOptIn = $derived(showEnter && !debtRecoveryActive);

	let alsoApplyDeduction = $state(false);

	function handleEnterAccept() {
		onAction({
			recoveryModeActive: true,
			...(alsoApplyDeduction ? { debtRecoveryActive: true } : {})
		});
		alsoApplyDeduction = false;
	}

	function handleEnterDismiss() {
		onAction({ recoveryModeDeclined: true });
		alsoApplyDeduction = false;
	}

	function handleExitAccept() {
		onAction({ recoveryModeActive: false });
	}

	// Exit dismiss — hide banner only; recoveryModeActive stays true until Settings toggle
	function handleExitDismiss() {
		onAction({});
	}

	let exitDismissed = $state(false);

	$effect(() => {
		if (financialState?.state === 'recovery') exitDismissed = false;
		if (!showEnter) alsoApplyDeduction = false;
	});
</script>

{#if showEnter}
	<div class="flex flex-col gap-3 rounded-2xl bg-[var(--color-amber)]/10 px-4 py-3" role="alert">
		<div class="flex items-start justify-between gap-3">
			<p class="text-sm text-[var(--color-text-primary)]">
				Your finances look tight right now. Switch to a recovery-focused view?
			</p>
			<div class="flex shrink-0 gap-2">
				<button
					type="button"
					class="rounded-lg bg-[var(--color-amber)] px-3 py-1 text-xs font-semibold text-[var(--color-bg-primary)] transition-opacity hover:opacity-80"
					onclick={handleEnterAccept}
				>
					Switch
				</button>
				<button
					type="button"
					class="rounded-lg px-3 py-1 text-xs text-[var(--color-text-tertiary)] transition-opacity hover:opacity-80"
					onclick={handleEnterDismiss}
				>
					Dismiss
				</button>
			</div>
		</div>
		{#if showDeductionOptIn}
			<label
				class="flex cursor-pointer items-center gap-2 text-xs text-[var(--color-text-secondary)]"
			>
				<Checkbox bind:checked={alsoApplyDeduction} />
				Also apply income recovery deduction to allowance projection
			</label>
		{/if}
	</div>
{:else if showExit && !exitDismissed}
	<div
		class="flex items-start justify-between gap-3 rounded-2xl bg-[var(--color-teal)]/10 px-4 py-3"
		role="alert"
	>
		<p class="text-sm text-[var(--color-text-primary)]">
			Things look steadier. Switch back to normal view?
		</p>
		<div class="flex shrink-0 gap-2">
			<button
				type="button"
				class="rounded-lg bg-[var(--color-teal)] px-3 py-1 text-xs font-semibold text-[var(--color-bg-primary)] transition-opacity hover:opacity-80"
				onclick={handleExitAccept}
			>
				Switch back
			</button>
			<button
				type="button"
				class="rounded-lg px-3 py-1 text-xs text-[var(--color-text-tertiary)] transition-opacity hover:opacity-80"
				onclick={() => {
					exitDismissed = true;
					handleExitDismiss();
				}}
			>
				Keep recovery view
			</button>
		</div>
	</div>
{/if}
