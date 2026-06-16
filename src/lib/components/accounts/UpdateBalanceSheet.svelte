<script lang="ts">
	import { onMount } from 'svelte';
	import DialogDrawer from '$lib/components/shared/DialogDrawer.svelte';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Label } from '$lib/components/ui/label/index.ts';
	import { CalcExpressionInput } from '$lib/components/ui/calculator/index.ts';
	import type { Account } from '$lib/core/db';
	import { accountService, passiveAccountService } from '$lib/core/services';
	import {
		guessUpdateBalanceClassification,
		type UpdateBalanceClassification
	} from './update-balance-classification';
	import { formatAmount } from '$lib/utils/currency-utils';
	import { goto } from '$app/navigation';

	type SheetClassification = UpdateBalanceClassification;

	interface Props {
		open: boolean;
		account: Account | null;
		onOpenChange: (open: boolean) => void;
		onSuccess?: () => void | Promise<void>;
	}

	let { open, account, onOpenChange, onSuccess }: Props = $props();

	let enteredStr = $state('');
	let classification = $state<SheetClassification>('unclassified');
	let applyTaxWithholding = $state(true);
	let submitting = $state(false);
	let error = $state<string | null>(null);
	let wasOpen = $state(false);
	/** Mobile `DialogDrawer` uses a drawer; nested keypad avoids vaul conflicts. */
	let isMobileSheet = $state(false);

	onMount(() => {
		const mq = window.matchMedia('(max-width: 767px)');
		isMobileSheet = mq.matches;
		const fn = () => {
			isMobileSheet = mq.matches;
		};
		mq.addEventListener('change', fn);
		return () => mq.removeEventListener('change', fn);
	});

	const projected = $derived(
		account ? passiveAccountService.projectBalance(account, new Date()) : 0
	);

	const enteredNum = $derived(parseFloat(enteredStr.replace(',', '.')) || 0);

	const diffVsProjected = $derived(
		account ? enteredNum - passiveAccountService.projectBalance(account, new Date()) : 0
	);

	$effect(() => {
		if (open && !wasOpen && account) {
			const suggested = passiveAccountService.suggestedSheetOpeningBalance(
				account,
				new Date()
			);
			enteredStr = String(Math.round(suggested * 100) / 100);
			classification = guessUpdateBalanceClassification(
				account,
				suggested - passiveAccountService.projectBalance(account, new Date())
			);
			applyTaxWithholding = true;
			error = null;
		}
		wasOpen = open;
	});

	function setClass(c: SheetClassification) {
		classification = c;
	}

	async function onConfirm() {
		if (!account) return;
		error = null;
		submitting = true;
		try {
			const result = await accountService.confirmUpdateBalance({
				accountId: account.id,
				enteredBalance: enteredNum,
				classification,
				applyTaxWithholding:
					applyTaxWithholding &&
					!!account.rateProfile?.taxRate &&
					classification === 'interest-income'
			});

			if (result === 'reconciliation_required') {
				onOpenChange(false);
				await goto(
					`/data?tab=reconcile&account=${encodeURIComponent(account.id)}&statementBalance=${encodeURIComponent(String(enteredNum))}`
				);
				return;
			}

			onOpenChange(false);
			await onSuccess?.();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not update balance';
		} finally {
			submitting = false;
		}
	}

	const showTaxRow = $derived(
		account?.rateProfile?.taxRate != null &&
			(account.rateProfile.taxRate ?? 0) > 0 &&
			classification === 'interest-income' &&
			enteredNum - projected > 0.02
	);

	const taxPreview = $derived.by(() => {
		const tr = account?.rateProfile?.taxRate ?? 0;
		if (!showTaxRow || tr <= 0) return { gross: 0, tax: 0 };
		const net = enteredNum - projected;
		const gross = net / (1 - tr);
		const tax = gross * tr;
		return { gross, tax };
	});
</script>

{#if account}
	<DialogDrawer
		{open}
		{onOpenChange}
		title="Update balance"
		description={`${account.name} — enter the balance you see at your institution.`}
		sheetSideDesktop="bottom"
		sheetContentClass="rounded-t-2xl px-5 pt-4 pb-8 sm:max-w-lg"
	>
		{#snippet children()}
			<div class="space-y-4 py-2">
				<div class="space-y-2">
					<Label for="bal-in">Current balance</Label>
					<CalcExpressionInput
						id="bal-in"
						stringValue={enteredStr}
						onStringValueChange={(s) => (enteredStr = s)}
						decimalPlaces={2}
						nestedKeypad={isMobileSheet}
					/>
				</div>

				<p class="text-muted-foreground text-sm">
					Compared to projected
					<span class="text-foreground font-medium">
						{formatAmount(diffVsProjected, account.currency)}
					</span>
				</p>

				{#if showTaxRow}
					<p class="text-muted-foreground text-sm">
						Estimated withholding ({Math.round(
							(account.rateProfile?.taxRate ?? 0) * 100
						)}% of
						{formatAmount(taxPreview.gross, account.currency)}):
						<span class="text-foreground font-medium">
							~{formatAmount(taxPreview.tax, account.currency)}
						</span>
					</p>
					<label class="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							bind:checked={applyTaxWithholding}
							class="rounded border"
						/>
						Record gross interest and tax withholding
					</label>
				{/if}

				<div class="space-y-2">
					<p class="text-xs font-semibold tracking-wider uppercase">Classification</p>
					<div class="flex flex-wrap gap-2">
						{#if account.type === 'savings'}
							<Button
								type="button"
								variant={classification === 'interest-income'
									? 'default'
									: 'outline'}
								size="sm"
								onclick={() => setClass('interest-income')}>Interest income</Button
							>
							<Button
								type="button"
								variant={classification === 'transfer-fee' ? 'default' : 'outline'}
								size="sm"
								onclick={() => setClass('transfer-fee')}>Bank fee</Button
							>
						{/if}
						{#if account.type === 'credit' || account.type === 'loan'}
							<Button
								type="button"
								variant={classification === 'interest-charge'
									? 'default'
									: 'outline'}
								size="sm"
								onclick={() => setClass('interest-charge')}>Interest charge</Button
							>
						{/if}
						<Button
							type="button"
							variant={classification === 'unclassified' ? 'default' : 'outline'}
							size="sm"
							onclick={() => setClass('unclassified')}>Other</Button
						>
						<Button
							type="button"
							variant={classification === 'none' ? 'default' : 'outline'}
							size="sm"
							onclick={() => setClass('none')}>Review in full flow</Button
						>
					</div>
				</div>

				{#if error}
					<p class="text-destructive text-sm" role="alert">{error}</p>
				{/if}

				<Button type="button" class="w-full" disabled={submitting} onclick={onConfirm}>
					{submitting ? 'Saving…' : 'Confirm'}
				</Button>
			</div>
		{/snippet}
	</DialogDrawer>
{/if}
