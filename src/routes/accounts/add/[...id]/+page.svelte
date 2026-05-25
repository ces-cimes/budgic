<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { accountService } from '$lib/core/services';
	import AccountForm from '$lib/components/AccountForm.svelte';
	import { FormActionBar, DeleteConfirmationDialog } from '$lib/components/forms';
	import type { Account } from '$lib/core/db';
	import Header from '$lib/components/Header.svelte';
	import { PageLayout } from '$lib/components/layouts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Label } from '$lib/components/ui/label/index.ts';
	import type { AccountCompounding } from '$lib/core/db';
	import PersonLedgerMigrationWizard from '$lib/components/person-ledger/PersonLedgerMigrationWizard.svelte';
	import { isPersonLedgerNameCandidate } from '$lib/utils/person-ledger-heuristics';
	import { Skeleton } from '$lib/components/ui/skeleton';

	let account = $state<Account | null>(null);
	let postCreateAccount = $state<Account | null>(null);
	let passiveAprPercent = $state('');
	let passiveCompounding = $state<AccountCompounding>('monthly');
	let passiveTaxPercent = $state('');
	let isLoading = $state(true);
	let isSubmitting = $state(false);
	let isDeleting = $state(false);
	let showDeleteDialog = $state(false);
	let personLedgerWizardOpen = $state(false);
	let error = $state('');

	const accountId = $derived($page.params.id);

	// Computed properties
	let isEditMode = $derived(!!account && !!accountId);

	const showPersonLedgerClose = $derived(
		isEditMode &&
			account != null &&
			account.ledgerRole !== 'archived_person' &&
			(account.ledgerRole === 'person' || isPersonLedgerNameCandidate(account.name))
	);
	let pageTitle = $derived(isEditMode ? 'Edit account' : 'New account');
	let submitButtonText = $derived(
		isLoading ? (isEditMode ? 'Updating…' : 'Creating…') : isEditMode ? 'Update' : 'Create'
	);

	onMount(async () => {
		try {
			// Check if we have an ID parameter (edit mode)
			if (accountId) {
				const accountData = await accountService.getAccount(accountId);
				if (accountData) {
					account = accountData;
				} else {
					error = 'Account not found';
					// Redirect to accounts list if account not found
					setTimeout(() => goto('/accounts'), 2000);
				}
			}
		} catch (err) {
			error = 'Failed to load account';
			console.error(err);
		} finally {
			isLoading = false;
		}
	});

	async function handleSubmit(accountData: Partial<Account>) {
		// Validate required fields
		if (!accountData.name || !accountData.type || !accountData.currency) {
			error = 'Missing required fields';
			return;
		}

		isSubmitting = true;
		error = '';

		try {
			if (isEditMode && account) {
				// Update existing account
				await accountService.updateAccount(account.id, accountData);
				// Redirect to account detail page after successful update
				goto(`/accounts/${account.id}`);
			} else {
				const newAccount = await accountService.createAccount({
					name: accountData.name,
					type: accountData.type,
					currency: accountData.currency,
					initialBalance: accountData.initialBalance
				});
				if (
					(newAccount.type === 'savings' || newAccount.type === 'loan') &&
					!newAccount.passiveRatePromptDismissed
				) {
					postCreateAccount = newAccount;
					return;
				}
				goto(`/accounts/${newAccount.id}`);
			}
		} catch (err) {
			error =
				err instanceof Error
					? err.message
					: isEditMode
						? 'Failed to update account'
						: 'Failed to create account';
			console.error(err);
			throw err; // Let AccountForm handle the error
		} finally {
			isSubmitting = false;
		}
	}

	function handleCancel() {
		if (isEditMode && account) {
			// Go back to account detail page
			goto(`/accounts/${account.id}`);
		} else {
			// Go back to accounts list
			goto('/accounts');
		}
	}

	async function savePassiveRateAndContinue() {
		if (!postCreateAccount) return;
		const pct = parseFloat(passiveAprPercent.replace(',', '.'));
		if (!Number.isFinite(pct)) {
			error = 'Enter a valid APR percentage';
			return;
		}
		const apr = pct / 100;
		const taxPct = parseFloat(passiveTaxPercent.replace(',', '.'));
		const taxRate =
			Number.isFinite(taxPct) && taxPct > 0 ? Math.min(1, Math.max(0, taxPct / 100)) : undefined;
		await accountService.updateAccount(postCreateAccount.id, {
			rateProfile: {
				apr,
				compounding: passiveCompounding,
				rateType: 'fixed',
				effectiveFrom: new Date().toISOString(),
				...(taxRate != null ? { taxRate } : {})
			},
			lastConfirmedBalance: postCreateAccount.currentBalance,
			lastConfirmedAt: new Date().toISOString()
		});
		const id = postCreateAccount.id;
		postCreateAccount = null;
		goto(`/accounts/${id}`);
	}

	async function skipPassiveRatePrompt() {
		if (!postCreateAccount) return;
		const id = postCreateAccount.id;
		await accountService.updateAccount(id, { passiveRatePromptDismissed: true });
		postCreateAccount = null;
		goto(`/accounts/${id}`);
	}

	async function handleDelete() {
		if (!account) return;

		isDeleting = true;
		error = '';

		try {
			await accountService.deleteAccount(account.id);
			// Redirect to accounts list after successful deletion
			goto('/accounts');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete account';
			console.error(err);
			showDeleteDialog = false;
		} finally {
			isDeleting = false;
		}
	}
</script>

<svelte:head>
	<title>{pageTitle} - Budgic</title>
</svelte:head>

<PageLayout>
	{#snippet topBar()}
		<Header
			title={pageTitle}
			showBackButton={true}
			backButtonLink={isEditMode && account ? `/accounts/${account.id}` : '/accounts'}
			backButtonLabel={isEditMode && account ? 'Back to account' : 'Back to accounts'}
		/>
	{/snippet}

	<div class="mx-auto max-w-2xl px-4 py-6">
		{#if error && !isLoading}
			<div
				class="mb-6 rounded-xl border border-[var(--color-warm-coral)]/30 bg-[var(--color-warm-coral)]/8 px-5 py-4"
			>
				<p class="text-sm text-[var(--color-warm-coral)]">{error}</p>
			</div>
		{/if}

		{#if isLoading}
			<div class="space-y-4 pt-4">
				{#each [1, 2, 3] as _}
					<Skeleton class="h-12 w-full rounded-xl bg-[var(--color-bg-tertiary)]" />
				{/each}
			</div>
		{:else if !isEditMode || account}
			{#if showPersonLedgerClose && account}
				<div
					class="mb-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-5 py-4"
				>
					<p class="text-sm text-[var(--color-text-primary)]">
						This looks like a person ledger account. Close it to track reimbursements on a real
						wallet instead.
					</p>
					<Button
						variant="outline"
						size="sm"
						class="mt-3"
						onclick={() => (personLedgerWizardOpen = true)}
					>
						Close person account
					</Button>
				</div>
			{/if}
			<!-- Account Form -->
			<AccountForm
				account={account || undefined}
				onSubmit={handleSubmit}
				onCancel={handleCancel}
				submitLabel={submitButtonText}
				cancelLabel="Cancel"
				isLoading={isSubmitting}
			/>

			{#if postCreateAccount}
				<div
					class="mt-6 space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-5"
				>
					<p class="text-sm font-medium text-[var(--color-text-primary)]">
						Does this account earn or charge interest?
					</p>
					<p class="text-xs text-[var(--color-text-tertiary)]">
						Optional: set an APR for balance-based tracking and projections.
					</p>
					<div class="grid gap-3 sm:grid-cols-2">
						<div class="space-y-1">
							<Label for="apr-pct">APR (%)</Label>
							<Input id="apr-pct" type="text" inputmode="decimal" bind:value={passiveAprPercent} />
						</div>
						<div class="space-y-1">
							<Label for="cmp">Compounding</Label>
							<select
								id="cmp"
								class="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
								bind:value={passiveCompounding}
							>
								<option value="daily">Daily</option>
								<option value="monthly">Monthly</option>
								<option value="annual">Annual</option>
							</select>
						</div>
						<div class="space-y-1 sm:col-span-2">
							<Label for="tax-pct">Withholding tax % (optional)</Label>
							<Input id="tax-pct" type="text" inputmode="decimal" bind:value={passiveTaxPercent} />
						</div>
					</div>
					<div class="flex flex-wrap gap-2">
						<Button type="button" onclick={savePassiveRateAndContinue}>Set rate</Button>
						<Button type="button" variant="ghost" onclick={skipPassiveRatePrompt}>Skip</Button>
					</div>
				</div>
			{/if}
		{/if}
	</div>

	{#snippet bottomBar()}
		<FormActionBar
			formId="account-form"
			{isEditMode}
			isLoading={isSubmitting}
			{isDeleting}
			submitLabel={submitButtonText}
			cancelLabel="Cancel"
			onCancel={handleCancel}
			onDelete={isEditMode ? () => (showDeleteDialog = true) : undefined}
		/>
	{/snippet}

	{#if account && isEditMode && showPersonLedgerClose}
		<PersonLedgerMigrationWizard
			ledgerAccountId={account.id}
			open={personLedgerWizardOpen}
			onOpenChange={(v) => (personLedgerWizardOpen = v)}
			onApplied={async () => {
				if (!account) return;
				const refreshed = await accountService.getAccount(account.id);
				if (refreshed) account = refreshed;
			}}
		/>
	{/if}
	{#if account && isEditMode}
		<DeleteConfirmationDialog
			open={showDeleteDialog}
			entityName="Account"
			entityDetails={{
				name: account.name,
				amount: account.currentBalance,
				currency: account.currency
			}}
			{isDeleting}
			onConfirm={handleDelete}
			onCancel={() => (showDeleteDialog = false)}
		/>
	{/if}
</PageLayout>
