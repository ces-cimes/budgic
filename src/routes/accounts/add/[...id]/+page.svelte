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

	let account = $state<Account | null>(null);
	let isLoading = $state(true);
	let isSubmitting = $state(false);
	let isDeleting = $state(false);
	let showDeleteDialog = $state(false);
	let error = $state('');

	const accountId = $derived($page.params.id);

	// Computed properties
	let isEditMode = $derived(!!account && !!accountId);
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
				// Create new account
				const newAccount = await accountService.createAccount({
					name: accountData.name,
					type: accountData.type,
					currency: accountData.currency,
					initialBalance: accountData.initialBalance
				});
				// Redirect to account detail page after successful creation
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
					<div class="h-12 animate-pulse rounded-xl bg-[var(--color-bg-tertiary)]"></div>
				{/each}
			</div>
		{:else if !isEditMode || account}
			<!-- Account Form -->
			<AccountForm
				account={account || undefined}
				onSubmit={handleSubmit}
				onCancel={handleCancel}
				submitLabel={submitButtonText}
				cancelLabel="Cancel"
				isLoading={isSubmitting}
			/>
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
