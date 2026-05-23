<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { accountService, budgetService, userService } from '$lib/core/services';
	import type { Account } from '$lib/core/db';
	import { PageLayout } from '$lib/components/layouts';
	import Header from '$lib/components/Header.svelte';
	import { Switch } from '$lib/components/ui/switch/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { CalcExpressionInput } from '$lib/components/ui/calculator/index.ts';
	import { Label } from '$lib/components/ui/label/index.ts';
	import UpdateBalanceSheet from '$lib/components/accounts/UpdateBalanceSheet.svelte';

	let isLoading = $state(true);
	let includeAccrued = $state(false);
	let balanceUpdateAutoResolveThreshold = $state(5);
	let reconciliationCheckupIntervalDays = $state(30);
	let isSaving = $state(false);
	let isSavingThreshold = $state(false);
	let isSavingCheckupInterval = $state(false);
	let passiveQueue = $state<Account[]>([]);
	let updateOpen = $state(false);
	let activeUpdateAccount = $state<Account | null>(null);

	onMount(async () => {
		try {
			const prefs = await userService.getUserPreferences();
			includeAccrued = prefs.includeAccruedInNetWorth ?? false;
			balanceUpdateAutoResolveThreshold = prefs.balanceUpdateAutoResolveThreshold ?? 5;
			reconciliationCheckupIntervalDays = prefs.reconciliationCheckupIntervalDays ?? 30;
		} finally {
			isLoading = false;
		}
	});

	async function persistIncludeAccrued(value: boolean) {
		isSaving = true;
		try {
			const cur = await userService.getUserPreferences();
			await userService.updateUserPreferences({ ...cur, includeAccruedInNetWorth: value });
			includeAccrued = value;
			budgetService.invalidateProjectionCache();
		} finally {
			isSaving = false;
		}
	}

	async function persistAutoResolveThreshold(raw: string) {
		const n = Number(raw);
		if (!Number.isFinite(n)) return;
		const clamped = Math.min(500, Math.max(0, n));
		isSavingThreshold = true;
		try {
			const cur = await userService.getUserPreferences();
			await userService.updateUserPreferences({
				...cur,
				balanceUpdateAutoResolveThreshold: clamped
			});
			balanceUpdateAutoResolveThreshold = clamped;
		} finally {
			isSavingThreshold = false;
		}
	}

	async function persistCheckupInterval(raw: string) {
		const n = Number(raw);
		if (!Number.isFinite(n)) return;
		const clamped = Math.min(365, Math.max(7, Math.round(n)));
		isSavingCheckupInterval = true;
		try {
			const cur = await userService.getUserPreferences();
			await userService.updateUserPreferences({
				...cur,
				reconciliationCheckupIntervalDays: clamped
			});
			reconciliationCheckupIntervalDays = clamped;
		} finally {
			isSavingCheckupInterval = false;
		}
	}

	async function startUpdateAllBalances() {
		const all = await accountService.getAccounts();
		const passive = all.filter(
			(a) => (a.type === 'savings' || a.type === 'credit' || a.type === 'loan') && !a.deletedAt
		);
		if (passive.length === 0) return;
		passiveQueue = passive;
		activeUpdateAccount = passiveQueue[0] ?? null;
		updateOpen = true;
	}

	function onSheetOpenChange(open: boolean) {
		updateOpen = open;
	}

	/** Advance batch only after a successful confirm (see `UpdateBalanceSheet` calling `onSuccess` after close). */
	async function afterBatchBalanceConfirm() {
		if (passiveQueue.length === 0) return;
		passiveQueue = passiveQueue.slice(1);
		if (passiveQueue.length > 0) {
			activeUpdateAccount = passiveQueue[0] ?? null;
			await tick();
			updateOpen = true;
		} else {
			activeUpdateAccount = null;
		}
	}
</script>

<svelte:head>
	<title>Accounts | Settings | Budgic</title>
</svelte:head>

<PageLayout>
	{#snippet topBar()}
		<Header title="Accounts" backButtonLabel="Back to settings" backButtonLink="/settings" />
	{/snippet}

	<div class="mx-auto max-w-2xl space-y-6 px-4 py-6">
		{#if isLoading}
			<div class="h-24 animate-pulse rounded-2xl bg-[var(--color-bg-tertiary)]"></div>
		{:else}
			<section
				class="squircle-2xl squircle-border space-y-3 bg-[var(--color-bg-tertiary)] px-5 py-4"
			>
				<h2 class="text-sm font-semibold text-[var(--color-text-primary)]">Net worth</h2>
				<p class="text-xs text-[var(--color-text-secondary)]">
					When enabled, savings, credit, and loan accounts with a rate profile use projected
					balances in home and list totals. Otherwise totals use last confirmed or current ledger
					balances.
				</p>
				<div class="flex items-center justify-between gap-3">
					<span class="text-sm text-[var(--color-text-primary)]"
						>Include projected accrual in net worth</span
					>
					<Switch
						checked={includeAccrued}
						onCheckedChange={(v: boolean) => persistIncludeAccrued(v)}
						disabled={isSaving}
					/>
				</div>
			</section>

			<section
				class="squircle-2xl squircle-border space-y-3 bg-[var(--color-bg-tertiary)] px-5 py-4"
			>
				<h2 class="text-sm font-semibold text-[var(--color-text-primary)]">Update balance</h2>
				<p class="text-xs text-[var(--color-text-secondary)]">
					If the number you enter is within this amount of the cleared-transaction total, Budgic
					adjusts the account quietly without creating a transaction. Larger gaps ask for a category
					or open full review.
				</p>
				<div class="space-y-2">
					<Label for="auto-resolve-threshold" class="text-sm text-[var(--color-text-primary)]">
						Auto-resolve within (same currency as the account)
					</Label>
					<CalcExpressionInput
						id="auto-resolve-threshold"
						class="max-w-[12rem]"
						value={balanceUpdateAutoResolveThreshold}
						onValueChange={(n) => (balanceUpdateAutoResolveThreshold = n)}
						decimalPlaces={2}
						min={0}
						max={500}
						disabled={isSavingThreshold}
						onblur={() => persistAutoResolveThreshold(String(balanceUpdateAutoResolveThreshold))}
					/>
				</div>
			</section>

			<section
				class="squircle-2xl squircle-border space-y-3 bg-[var(--color-bg-tertiary)] px-5 py-4"
			>
				<h2 class="text-sm font-semibold text-[var(--color-text-primary)]">Reconciliation</h2>
				<p class="text-xs text-[var(--color-text-secondary)]">
					After this many days without a reconciliation session, Budgic shows a medium-priority bell
					alert (not a persistent Data badge). Open issues still appear on the Data tab.
				</p>
				<div class="space-y-2">
					<Label for="checkup-interval" class="text-sm text-[var(--color-text-primary)]">
						Reconciliation check-up interval (days)
					</Label>
					<CalcExpressionInput
						id="checkup-interval"
						class="max-w-[12rem]"
						value={reconciliationCheckupIntervalDays}
						onValueChange={(n) => (reconciliationCheckupIntervalDays = n)}
						decimalPlaces={0}
						min={7}
						max={365}
						disabled={isSavingCheckupInterval}
						onblur={() => persistCheckupInterval(String(reconciliationCheckupIntervalDays))}
					/>
				</div>
			</section>

			<section
				class="squircle-2xl squircle-border space-y-3 bg-[var(--color-bg-tertiary)] px-5 py-4"
			>
				<h2 class="text-sm font-semibold text-[var(--color-text-primary)]">Balances</h2>
				<p class="text-xs text-[var(--color-text-secondary)]">
					Walk through each savings, credit, or loan account with the same update flow used on the
					account screens.
				</p>
				<Button variant="outline" class="w-full sm:w-auto" onclick={startUpdateAllBalances}>
					Update all balances
				</Button>
			</section>
		{/if}
	</div>

	<UpdateBalanceSheet
		open={updateOpen}
		account={activeUpdateAccount}
		onOpenChange={onSheetOpenChange}
		onSuccess={afterBatchBalanceConfirm}
	/>
</PageLayout>
