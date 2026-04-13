<script lang="ts">
	import { onMount } from 'svelte';
	import { Plus, Calendar, DollarSign, Type } from '@lucide/svelte';
	import { transactionService, accountService, userService } from '$lib/core/services';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Label } from '$lib/components/ui/label/index.ts';
	import { Select, SelectContent, SelectItem, SelectTrigger, Root } from '$lib/components/ui/select/index.ts';
	import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '$lib/components/ui/dialog/index.ts';
	import type { Account, Transaction } from '$lib/core/db';
	import { formatAmount } from '$lib/utils/currency-utils';

	interface Props {
		onTransactionAdded?: () => void;
		accountId: string;
	}

	const { onTransactionAdded, accountId }: Props = $props();

	let isOpen = $state(false);
	let isLoading = $state(false);
	let accounts = $state<Account[]>([]);
	let userCurrency = $state<string>('USD');

	let amount = $state('');
	let description = $state('');
	let transactionType = $state('expense');
	let toAccountId = $state('');
	let plannedDate = $state('');
	let confidence = $state('confirmed');
	let formError = $state('');

	const destinationAccounts = $derived(accounts.filter((a) => a.id !== accountId));

	$effect(() => {
		if (transactionType !== 'transfer') {
			toAccountId = '';
		}
	});

	$effect(() => {
		if (!isOpen) {
			formError = '';
		}
	});

	onMount(async () => {
		const preferences = await userService.getUserPreferences();
		userCurrency = preferences?.currency || 'USD';

		accounts = await accountService.getAccounts();
		const tomorrow = new Date();
		tomorrow.setDate(tomorrow.getDate() + 1);
		plannedDate = tomorrow.toISOString().split('T')[0];
	});

	function resetForm() {
		amount = '';
		description = '';
		transactionType = 'expense';
		toAccountId = '';
		confidence = 'confirmed';
		formError = '';
		const tomorrow = new Date();
		tomorrow.setDate(tomorrow.getDate() + 1);
		plannedDate = tomorrow.toISOString().split('T')[0];
	}

	async function handleSubmit() {
		formError = '';
		if (!amount?.trim() || !plannedDate) {
			formError = 'Amount and planned date are required.';
			return;
		}

		const num = parseFloat(amount);
		if (!Number.isFinite(num)) {
			formError = 'Enter a valid amount.';
			return;
		}

		if (transactionType === 'transfer') {
			const mag = Math.abs(num);
			if (mag === 0) {
				formError = 'Enter a transfer amount.';
				return;
			}
			if (!toAccountId) {
				formError = 'Select a destination account.';
				return;
			}
			if (toAccountId === accountId) {
				formError = 'Destination must be a different account.';
				return;
			}
		}

		try {
			isLoading = true;

			const plannedDateIso = `${plannedDate}T12:00:00.000Z`;
			const desc = description.trim() || undefined;

			if (transactionType === 'transfer') {
				const transferMagnitude = Math.abs(num);
				await transactionService.createTransaction({
					accountId,
					type: 'transfer',
					amount: -transferMagnitude,
					description: desc,
					plannedDate: plannedDateIso,
					confidence: confidence as 'confirmed' | 'expected' | 'estimated',
					status: 'planned',
					currency: userCurrency,
					toAccountId,
					transferDetails: {
						toAccountId,
						transferAmount: transferMagnitude,
						feeAmount: 0
					}
				});
			} else {
				await transactionService.createTransaction({
					accountId,
					type: transactionType as Transaction['type'],
					amount: num,
					description: desc,
					plannedDate: plannedDateIso,
					confidence: confidence as 'confirmed' | 'expected' | 'estimated',
					status: 'planned',
					currency: userCurrency
				});
			}

			resetForm();
			isOpen = false;
			onTransactionAdded?.();
		} catch (error) {
			console.error('Failed to create planned transaction:', error);
			formError = error instanceof Error ? error.message : 'Failed to add transaction.';
		} finally {
			isLoading = false;
		}
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	const submitDisabled = $derived(
		isLoading ||
			!amount?.trim() ||
			!plannedDate ||
			(transactionType === 'transfer' && !toAccountId)
	);

	const previewAmountNum = $derived(parseFloat(amount));
	const showPreview = $derived(
		!!amount?.trim() && !!plannedDate && Number.isFinite(previewAmountNum)
	);
</script>

<Dialog bind:open={isOpen}>
	<DialogTrigger>
		<Button class="w-full">
			<Plus size={16} class="mr-2" />
			Add Planned Transaction
		</Button>
	</DialogTrigger>

	<DialogContent class="sm:max-w-md">
		<DialogHeader>
			<DialogTitle>Add Planned Transaction</DialogTitle>
		</DialogHeader>

		<form
			onsubmit={(e) => {
				e.preventDefault();
				handleSubmit();
			}}
			class="space-y-4"
		>
			{#if formError}
				<p class="text-destructive text-sm" role="alert">{formError}</p>
			{/if}

			<!-- Amount -->
			<div class="space-y-2">
				<Label for="amount">Amount</Label>
				<div class="relative">
					<DollarSign class="text-muted-foreground absolute top-3 left-3 h-4 w-4" />
					<Input
						id="amount"
						type="number"
						step="0.01"
						placeholder="0.00"
						bind:value={amount}
						class="pl-10"
						required
					/>
				</div>
			</div>

			<!-- Description -->
			<div class="space-y-2">
				<Label for="description">Description</Label>
				<div class="relative">
					<Type class="text-muted-foreground absolute top-3 left-3 h-4 w-4" />
					<Input
						id="description"
						placeholder="e.g., Groceries, Salary"
						bind:value={description}
						class="pl-10"
					/>
				</div>
			</div>

			<!-- Transaction Type -->
			<div class="space-y-2">
				<Label for="type">Type</Label>
				<Root type="single" bind:value={transactionType}>
					<SelectTrigger>
						<span class="text-muted-foreground">Select type</span>
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="income">Income</SelectItem>
						<SelectItem value="expense">Expense</SelectItem>
						<SelectItem value="transfer">Transfer</SelectItem>
					</SelectContent>
				</Root>
			</div>

			{#if transactionType === 'transfer'}
				<div class="space-y-2">
					<Label for="toAccount">Destination account</Label>
					<Root type="single" bind:value={toAccountId}>
						<SelectTrigger id="toAccount">
							<span class="text-muted-foreground">
								{toAccountId
									? destinationAccounts.find((a) => a.id === toAccountId)?.name
									: 'Select destination'}
							</span>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="">Select destination</SelectItem>
							{#each destinationAccounts as account}
								<SelectItem value={account.id}>
									{account.name} ({formatAmount(account.currentBalance, account.currency)})
								</SelectItem>
							{/each}
						</SelectContent>
					</Root>
				</div>
			{/if}

			<!-- Planned Date -->
			<div class="space-y-2">
				<Label for="date">Planned Date</Label>
				<div class="relative">
					<Calendar class="text-muted-foreground absolute top-3 left-3 h-4 w-4" />
					<Input id="date" type="date" bind:value={plannedDate} class="pl-10" required />
				</div>
			</div>

			<!-- Confidence Level -->
			<div class="space-y-2">
				<Label for="confidence">Confidence</Label>
				<Root type="single" bind:value={confidence}>
					<SelectTrigger>
						<span class="text-muted-foreground">Select confidence</span>
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="confirmed">Confirmed</SelectItem>
						<SelectItem value="expected">Expected</SelectItem>
						<SelectItem value="estimated">Estimated</SelectItem>
					</SelectContent>
				</Root>
			</div>

			<!-- Preview -->
			{#if showPreview}
				<div class="bg-muted/50 rounded-lg p-3 text-sm">
					<div class="mb-1 font-medium">Preview:</div>
					<div class="text-muted-foreground">
						{#if transactionType === 'transfer'}
							{formatAmount(Math.abs(previewAmountNum), userCurrency)} transfer → {toAccountId
								? destinationAccounts.find((a) => a.id === toAccountId)?.name ?? '…'
								: '…'}{#if description.trim()}
								{' • '}{description.trim()}{/if}
							{' • '}{formatDate(plannedDate)}
						{:else}
							{transactionType === 'income' ? '+' : '-'}{formatAmount(
								previewAmountNum,
								userCurrency
							)}{#if description.trim()}
								{' • '}{description.trim()}{/if}
							{' • '}{formatDate(plannedDate)}
						{/if}
					</div>
				</div>
			{/if}

			<!-- Actions -->
			<div class="flex gap-3 pt-4">
				<Button type="button" variant="outline" class="flex-1" onclick={() => (isOpen = false)}>
					Cancel
				</Button>
				<Button type="submit" class="flex-1" disabled={submitDisabled}>
					{isLoading ? 'Adding...' : 'Add Transaction'}
				</Button>
			</div>
		</form>
	</DialogContent>
</Dialog>
