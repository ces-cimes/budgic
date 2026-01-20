<script lang="ts">
	import { reconciliationService } from '$lib/core/services';
	import { accountService } from '$lib/core/services';
	import type { Account, ReconciliationRecord, ReconciliationDiscrepancy } from '$lib/core/db';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Badge } from '$lib/components/ui/badge';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { AlertCircle, CheckCircle2, Clock, TrendingUp } from '@lucide/svelte';
	import { CurrencyUtils } from '$lib/core/db';
	import { onMount } from 'svelte';
	import { z } from 'zod';

	// Props interface
	interface Props {
		selectedAccountId?: string;
		onReconciliationComplete?: (result: ReconciliationRecord) => void;
		onCancel?: () => void;
		className?: string;
	}

	const {
		selectedAccountId = '',
		onReconciliationComplete = () => {},
		onCancel = () => {},
		className = ''
	}: Props = $props();

	// Form validation schema
	const ReconciliationFormSchema = z.object({
		accountId: z.string().min(1, 'Please select an account'),
		statementBalance: z.number().finite('Please enter a valid statement balance'),
		tolerance: z.number().positive().default(0.01),
		includePendingTransactions: z.boolean().default(false),
		autoResolveSmallDiscrepancies: z.boolean().default(true),
		autoResolveThreshold: z.number().positive().default(0.01),
		notes: z.string().optional()
	});

	type ReconciliationFormData = z.infer<typeof ReconciliationFormSchema>;

	// State variables
	let accounts = $state<Account[]>([]);
	let selectedAccount = $state<Account | null>(null);
	let calculatedBalance = $state<number>(0);
	let isLoading = $state(false);
	let isLoadingBalance = $state(false);
	let error = $state<string | null>(null);
	let validationErrors = $state<Record<string, string>>({});
	let reconciliationResult = $state<ReconciliationRecord | null>(null);
	let discrepancies = $state<ReconciliationDiscrepancy[]>([]);

	// Form data
	let formData = $state<ReconciliationFormData>({
		accountId: selectedAccountId,
		statementBalance: 0,
		tolerance: 0.01,
		includePendingTransactions: false,
		autoResolveSmallDiscrepancies: true,
		autoResolveThreshold: 0.01,
		notes: ''
	});

	// Computed values
	let discrepancy = $derived(() => {
		if (!selectedAccount) return 0;
		return formData.statementBalance - calculatedBalance;
	});

	let discrepancySeverity = $derived(() => {
		const absDiscrepancy = Math.abs(discrepancy());
		if (absDiscrepancy <= formData.tolerance) return 'good';
		if (absDiscrepancy <= 10) return 'warning';
		return 'critical';
	});

	let isFormValid = $derived(() => {
		return (
			formData.accountId &&
			!isNaN(formData.statementBalance) &&
			formData.statementBalance !== 0 &&
			Object.keys(validationErrors).length === 0
		);
	});

	// Load accounts on mount
	onMount(async () => {
		try {
			accounts = await accountService.getAccounts();
			if (selectedAccountId) {
				const account = accounts.find((a) => a.id === selectedAccountId);
				if (account) {
					await selectAccount(account);
				}
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load accounts';
		}
	});

	// Account selection handler
	async function selectAccount(account: Account) {
		selectedAccount = account;
		formData.accountId = account.id;
		await loadCalculatedBalance(account.id);
	}

	// Load calculated balance for selected account
	async function loadCalculatedBalance(accountId: string) {
		isLoadingBalance = true;
		try {
			if (formData.includePendingTransactions) {
				calculatedBalance = await accountService.recalculateAccountBalance(accountId);
			} else {
				// Calculate balance with only cleared transactions
				const account = await accountService.getAccount(accountId);
				if (!account) return;

				const transactions = await accountService.getAccount(accountId);
				// This would need a more specific method in the service, but for now use recalculate
				calculatedBalance = await accountService.recalculateAccountBalance(accountId);
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to calculate balance';
		} finally {
			isLoadingBalance = false;
		}
	}

	// Form validation
	function validateForm(): boolean {
		validationErrors = {};

		try {
			ReconciliationFormSchema.parse(formData);
			return true;
		} catch (err) {
			if (err instanceof z.ZodError) {
				err.errors.forEach((error) => {
					if (error.path.length > 0) {
						validationErrors[error.path[0].toString()] = error.message;
					}
				});
			}
			return false;
		}
	}

	// Form submission handler
	async function handleSubmit() {
		if (!validateForm()) return;

		isLoading = true;
		error = null;

		try {
			const options = {
				tolerance: formData.tolerance,
				includePendingTransactions: formData.includePendingTransactions,
				autoResolveSmallDiscrepancies: formData.autoResolveSmallDiscrepancies,
				autoResolveThreshold: formData.autoResolveThreshold
			};

			const result = await reconciliationService.performReconciliation(
				formData.accountId,
				formData.statementBalance,
				options
			);

			reconciliationResult = result;

			// Load discrepancies if any
			if (Math.abs(result.discrepancy) > formData.tolerance) {
				discrepancies = await reconciliationService.getAccountDiscrepancies(formData.accountId);
			}

			onReconciliationComplete(result);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Reconciliation failed';
		} finally {
			isLoading = false;
		}
	}

	// Handle option changes that affect balance calculation
	async function handleIncludePendingChange(checked: boolean) {
		formData.includePendingTransactions = checked;
		if (selectedAccount) {
			await loadCalculatedBalance(selectedAccount.id);
		}
	}

	// Reset form
	function resetForm() {
		formData = {
			accountId: selectedAccountId,
			statementBalance: 0,
			tolerance: 0.01,
			includePendingTransactions: false,
			autoResolveSmallDiscrepancies: true,
			autoResolveThreshold: 0.01,
			notes: ''
		};
		reconciliationResult = null;
		discrepancies = [];
		error = null;
		validationErrors = {};
	}
</script>

<div class="space-y-6 {className}">
	<Card>
		<CardHeader>
			<CardTitle class="flex items-center gap-2">
				<TrendingUp class="text-primary h-5 w-5" />
				Balance Reconciliation
			</CardTitle>
		</CardHeader>
		<CardContent>
			{#if !reconciliationResult}
				<!-- Reconciliation Form -->
				<form
					onsubmit={(e) => {
						e.preventDefault();
						handleSubmit();
					}}
					class="space-y-4"
				>
					<!-- Account Selection -->
					<div class="space-y-2">
						<Label for="account-select">Account</Label>
						<Select
							onValueChange={(value: string) => {
								const account = accounts.find((a) => a.id === value);
								if (account) selectAccount(account);
							}}
							value={formData.accountId}
						>
							<SelectTrigger id="account-select" aria-describedby="account-error">
								<span
									>{selectedAccount ? selectedAccount.name : 'Select an account to reconcile'}</span
								>
							</SelectTrigger>
							<SelectContent>
								{#each accounts as account (account.id)}
									<SelectItem value={account.id}>
										{account.name} ({CurrencyUtils.formatAmount(
											account.currentBalance,
											account.currency
										)})
									</SelectItem>
								{/each}
							</SelectContent>
						</Select>
						{#if validationErrors.accountId}
							<p id="account-error" class="text-destructive text-sm" role="alert">
								{validationErrors.accountId}
							</p>
						{/if}
					</div>

					{#if selectedAccount}
						<!-- Current Balance Display -->
						<div class="bg-muted grid grid-cols-2 gap-4 rounded-lg p-4">
							<div>
								<Label class="text-muted-foreground text-sm">Calculated Balance</Label>
								<div class="flex items-center gap-2">
									{#if isLoadingBalance}
										<div class="bg-muted-foreground/20 h-6 w-20 animate-pulse rounded"></div>
									{:else}
										<span class="text-lg font-semibold">
											{CurrencyUtils.formatAmount(calculatedBalance, selectedAccount.currency)}
										</span>
									{/if}
								</div>
							</div>
							<div>
								<Label class="text-muted-foreground text-sm">Account Balance</Label>
								<span class="text-lg font-semibold">
									{CurrencyUtils.formatAmount(
										selectedAccount.currentBalance,
										selectedAccount.currency
									)}
								</span>
							</div>
						</div>

						<!-- Statement Balance Input -->
						<div class="space-y-2">
							<Label for="statement-balance">Statement Balance</Label>
							<Input
								id="statement-balance"
								type="number"
								step="0.01"
								bind:value={formData.statementBalance}
								placeholder="Enter balance from your statement"
								aria-describedby="statement-error"
								class={validationErrors.statementBalance ? 'border-destructive' : ''}
								oninput={() => validateForm()}
							/>
							{#if validationErrors.statementBalance}
								<p id="statement-error" class="text-destructive text-sm" role="alert">
									{validationErrors.statementBalance}
								</p>
							{/if}
						</div>

						<!-- Discrepancy Preview -->
						{#if formData.statementBalance !== 0}
							<div
								class="rounded-lg border p-4 {discrepancySeverity() === 'good'
									? 'border-green-200 bg-green-50'
									: discrepancySeverity() === 'warning'
										? 'border-yellow-200 bg-yellow-50'
										: 'border-red-200 bg-red-50'}"
							>
								<div class="flex items-center gap-2">
									{#if discrepancySeverity() === 'good'}
										<CheckCircle2 class="h-5 w-5 text-green-600" />
									{:else if discrepancySeverity() === 'warning'}
										<Clock class="h-5 w-5 text-yellow-600" />
									{:else}
										<AlertCircle class="h-5 w-5 text-red-600" />
									{/if}
									<span class="font-medium">
										Discrepancy: {CurrencyUtils.formatAmount(
											discrepancy(),
											selectedAccount.currency
										)}
									</span>
								</div>
								{#if Math.abs(discrepancy()) <= formData.tolerance}
									<p class="text-muted-foreground mt-1 text-sm">
										Within acceptable tolerance ({CurrencyUtils.formatAmount(
											formData.tolerance,
											selectedAccount.currency
										)})
									</p>
								{/if}
							</div>
						{/if}

						<!-- Options -->
						<div class="space-y-4 rounded-lg border p-4">
							<h4 class="font-medium">Reconciliation Options</h4>

							<!-- Tolerance -->
							<div class="space-y-2">
								<Label for="tolerance">Tolerance ({selectedAccount.currency})</Label>
								<Input
									id="tolerance"
									type="number"
									step="0.01"
									min="0"
									bind:value={formData.tolerance}
									class="max-w-32"
								/>
								<p class="text-muted-foreground text-xs">Acceptable difference between balances</p>
							</div>

							<!-- Include Pending Transactions -->
							<div class="flex items-center justify-between">
								<div class="space-y-1">
									<Label>Include Pending Transactions</Label>
									<p class="text-muted-foreground text-xs">
										Include pending transactions in balance calculation
									</p>
								</div>
								<Switch
									checked={formData.includePendingTransactions}
									onCheckedChange={handleIncludePendingChange}
								/>
							</div>

							<!-- Auto-resolve Small Discrepancies -->
							<div class="flex items-center justify-between">
								<div class="space-y-1">
									<Label>Auto-resolve Small Discrepancies</Label>
									<p class="text-muted-foreground text-xs">
										Automatically create adjustment transactions for small discrepancies
									</p>
								</div>
								<Switch bind:checked={formData.autoResolveSmallDiscrepancies} />
							</div>

							{#if formData.autoResolveSmallDiscrepancies}
								<div class="ml-4 space-y-2">
									<Label for="auto-resolve-threshold"
										>Auto-resolve Threshold ({selectedAccount.currency})</Label
									>
									<Input
										id="auto-resolve-threshold"
										type="number"
										step="0.01"
										min="0"
										bind:value={formData.autoResolveThreshold}
										class="max-w-32"
									/>
								</div>
							{/if}
						</div>

						<!-- Notes -->
						<div class="space-y-2">
							<Label for="notes">Notes (Optional)</Label>
							<Textarea
								id="notes"
								bind:value={formData.notes}
								placeholder="Add any notes about this reconciliation..."
								rows={3}
							/>
						</div>

						<!-- Actions -->
						<div class="flex gap-2 pt-4">
							<Button type="submit" disabled={!isFormValid || isLoading} class="flex-1">
								{#if isLoading}
									<div
										class="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
									></div>
									Reconciling...
								{:else}
									Perform Reconciliation
								{/if}
							</Button>

							{#if onCancel}
								<Button type="button" variant="outline" onclick={onCancel} disabled={isLoading}>
									Cancel
								</Button>
							{/if}
						</div>
					{/if}
				</form>
			{:else}
				<!-- Reconciliation Results -->
				<div class="space-y-4">
					<div class="flex items-center justify-between">
						<h3 class="text-lg font-semibold">Reconciliation Complete</h3>
						<Badge
							variant={Math.abs(reconciliationResult.discrepancy) <= formData.tolerance
								? 'default'
								: 'destructive'}
						>
							{Math.abs(reconciliationResult.discrepancy) <= formData.tolerance
								? 'Balanced'
								: 'Discrepancy Found'}
						</Badge>
					</div>

					<!-- Results Summary -->
					<div class="grid grid-cols-2 gap-4 rounded-lg border p-4">
						<div>
							<Label class="text-muted-foreground text-sm">Statement Balance</Label>
							<p class="text-lg font-semibold">
								{CurrencyUtils.formatAmount(
									reconciliationResult.statementBalance,
									selectedAccount?.currency || 'USD'
								)}
							</p>
						</div>
						<div>
							<Label class="text-muted-foreground text-sm">Calculated Balance</Label>
							<p class="text-lg font-semibold">
								{CurrencyUtils.formatAmount(
									reconciliationResult.calculatedBalance,
									selectedAccount?.currency || 'USD'
								)}
							</p>
						</div>
						<div class="col-span-2">
							<Label class="text-muted-foreground text-sm">Discrepancy</Label>
							<p
								class="text-lg font-semibold {Math.abs(reconciliationResult.discrepancy) >
								formData.tolerance
									? 'text-destructive'
									: 'text-green-600'}"
							>
								{CurrencyUtils.formatAmount(
									reconciliationResult.discrepancy,
									selectedAccount?.currency || 'USD'
								)}
							</p>
						</div>
					</div>

					<!-- Discrepancies -->
					{#if discrepancies.length > 0}
						<div class="space-y-2">
							<h4 class="font-medium">Detected Issues</h4>
							<div class="space-y-2">
								{#each discrepancies as discrepancy (discrepancy.id)}
									<Alert>
										<AlertCircle class="h-4 w-4" />
										<AlertDescription>
											<div class="flex items-center justify-between">
												<span>{discrepancy.description}</span>
												<Badge variant="outline">
													{discrepancy.severity}
												</Badge>
											</div>
											<p class="text-muted-foreground mt-1 text-xs">
												Suggested: {discrepancy.suggestedAction.replace('_', ' ')}
											</p>
										</AlertDescription>
									</Alert>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Actions -->
					<div class="flex gap-2">
						<Button onclick={resetForm} variant="outline">Reconcile Another Account</Button>
					</div>
				</div>
			{/if}

			<!-- Error Display -->
			{#if error}
				<Alert variant="destructive">
					<AlertCircle class="h-4 w-4" />
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			{/if}
		</CardContent>
	</Card>
</div>
