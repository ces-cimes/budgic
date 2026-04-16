<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { accountService, budgetService, userService } from '$lib/core/services';
	import type { Account } from '$lib/core/db';
	import { PageLayout } from '$lib/components/layouts';
	import Header from '$lib/components/Header.svelte';
	import { Switch } from '$lib/components/ui/switch/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Label } from '$lib/components/ui/label/index.ts';
	import UpdateBalanceSheet from '$lib/components/accounts/UpdateBalanceSheet.svelte';

	let isLoading = $state(true);
	let includeAccrued = $state(false);
	let balanceUpdateAutoResolveThreshold = $state(5);
	let isSaving = $state(false);
	let isSavingThreshold = $state(false);
	let passiveQueue = $state<Account[]>([]);
	let updateOpen = $state(false);
	let activeUpdateAccount = $state<Account | null>(null);

	onMount(async () => {
		try {
			const prefs = await userService.getUserPreferences();
			includeAccrued = prefs.includeAccruedInNetWorth ?? false;
			balanceUpdateAutoResolveThreshold = prefs.balanceUpdateAutoResolveThreshold ?? 5;
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

	async function startUpdateAllBalances() {
		const all = await accountService.getAccounts();
		const passive = all.filter(
			(a) =>
				(a.type === 'savings' || a.type === 'credit' || a.type === 'loan') &&
				!a.deletedAt
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
					When enabled, savings, credit, and loan accounts with a rate profile use projected balances
					in home and list totals. Otherwise totals use last confirmed or current ledger balances.
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
					<Input
						id="auto-resolve-threshold"
						type="number"
						min="0"
						max="500"
						step="any"
						class="max-w-[12rem]"
						value={balanceUpdateAutoResolveThreshold}
						disabled={isSavingThreshold}
						onblur={(e) =>
							persistAutoResolveThreshold((e.currentTarget as HTMLInputElement).value)}
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
