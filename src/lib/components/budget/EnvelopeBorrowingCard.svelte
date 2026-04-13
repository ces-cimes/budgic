<script lang="ts">
	import { envelopeBorrowingService } from '$lib/core/services';
	import type { PaybackSuggestion } from '$lib/core/services/core/envelope-borrowing-service';
	import type { EnhancedAllowance } from '$lib/utils/allowance-utils';
	import type { NegativeAllowanceStatus } from '$lib/core/services/core/negative-allowance-service';
	import { formatTransactionAmount } from '$lib/utils/currency-utils';
	import { ArrowRightLeft, Calendar, AlertCircle } from '@lucide/svelte';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';

	interface Props {
		accountId?: string;
		allowance: EnhancedAllowance | null;
		negativeStatus: NegativeAllowanceStatus | null;
		/** Called after a borrow is created so parent can refresh allowance/status */
		onBorrowCreated?: () => void;
	}

	const { accountId, allowance, negativeStatus, onBorrowCreated }: Props = $props();

	const isBorrowMode = $derived(
		negativeStatus?.isNegative && negativeStatus.handlingMode === 'borrow_from_other_categories'
	);

	let activeBorrows = $state<Awaited<ReturnType<typeof envelopeBorrowingService.getActiveBorrows>>>(
		[]
	);
	let paybackSuggestions = $state<PaybackSuggestion[]>([]);
	let chronicSummary = $state<Awaited<
		ReturnType<typeof envelopeBorrowingService.getChronicBorrowingSummary>
	> | null>(null);
	let loading = $state(true);
	let selectedFromCategory = $state<'essential' | 'discretionary' | 'buffer'>('discretionary');
	let borrowAmount = $state(0);
	let creating = $state(false);
	let error = $state<string | null>(null);

	const lenderCandidates = $derived(
		allowance ? envelopeBorrowingService.getLenderCandidates(allowance) : []
	);

	const overByAndCategory = $derived.by(() => {
		if (!negativeStatus?.isNegative || !negativeStatus.negativeCategories?.length) return null;
		const first = negativeStatus.negativeCategories[0];
		const toCategory =
			first.category === 'total'
				? 'discretionary'
				: (first.category as 'essential' | 'discretionary' | 'buffer');
		return { overBy: first.overBy, toCategory, currency: first.currency };
	});

	async function load() {
		loading = true;
		try {
			activeBorrows = await envelopeBorrowingService.getActiveBorrows(accountId);
			paybackSuggestions = await envelopeBorrowingService.getPaybackSuggestions(accountId);
			chronicSummary = await envelopeBorrowingService.getChronicBorrowingSummary(accountId);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		load();
	});

	async function createBorrow() {
		if (!allowance || !overByAndCategory) return;
		const over = overByAndCategory;
		const amount = borrowAmount > 0 ? borrowAmount : over.overBy;
		creating = true;
		error = null;
		try {
			await envelopeBorrowingService.createBorrow({
				accountId,
				fromCategory: selectedFromCategory,
				toCategory: over.toCategory,
				amount,
				currency: over.currency,
				periodStart:
					allowance.periodStart instanceof Date
						? allowance.periodStart
						: new Date(allowance.periodStart),
				periodEnd:
					allowance.periodEnd instanceof Date ? allowance.periodEnd : new Date(allowance.periodEnd),
				userConfirmedRepeated: chronicSummary?.shouldRequireConfirmation ? true : undefined
			});
			borrowAmount = 0;
			onBorrowCreated?.();
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to create borrow';
		} finally {
			creating = false;
		}
	}

	async function repayBorrow(borrowId: string, amount: number) {
		await envelopeBorrowingService.repayBorrow(borrowId, amount);
		await load();
	}

	// When in borrow mode, init default amount and lender from first candidate
	$effect(() => {
		if (isBorrowMode && overByAndCategory && lenderCandidates.length > 0 && borrowAmount === 0) {
			borrowAmount = overByAndCategory.overBy;
			selectedFromCategory = lenderCandidates[0].category;
		}
	});
</script>

<Card class="border-border">
	<CardHeader>
		<CardTitle class="flex items-center gap-2">
			<ArrowRightLeft class="h-5 w-5" />
			Envelope borrowing
		</CardTitle>
		<CardDescription>Borrow between allowance categories and track repayments</CardDescription>
	</CardHeader>
	<CardContent class="space-y-4">
		{#if chronicSummary?.isChronic && chronicSummary.suggestion}
			<div class="border-warning/50 bg-warning/5 text-warning rounded-lg border p-3 text-sm">
				<AlertCircle class="mr-1 inline h-4 w-4" />
				{chronicSummary.suggestion}
			</div>
		{/if}

		<!-- Active borrows -->
		{#if activeBorrows.length > 0}
			<div class="space-y-2">
				<div class="text-sm font-medium">Active borrows</div>
				<ul class="space-y-2">
					{#each activeBorrows as borrow}
						{@const outstanding = borrow.amount - borrow.repaidAmount}
						<li class="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
							<div>
								<span class="font-medium">{borrow.fromCategory}</span>
								<span class="text-muted-foreground"> → </span>
								<span class="font-medium">{borrow.toCategory}</span>
								<span class="text-muted-foreground ml-1">
									{formatTransactionAmount(outstanding, borrow.currency)} due by {new Date(
										borrow.dueRepayBy
									).toLocaleDateString()}
								</span>
							</div>
							<Button
								size="sm"
								variant="outline"
								onclick={() => repayBorrow(borrow.id, outstanding)}
							>
								Repay {formatTransactionAmount(outstanding, borrow.currency)}
							</Button>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		<!-- Payback suggestions -->
		{#if paybackSuggestions.length > 0}
			<div class="space-y-2">
				<div class="flex items-center gap-1 text-sm font-medium">
					<Calendar class="h-4 w-4" />
					Suggested payback
				</div>
				<ul class="text-muted-foreground space-y-1 text-sm">
					{#each paybackSuggestions as suggestion}
						<li>
							Repay {formatTransactionAmount(suggestion.suggestedAmount, suggestion.currency)} from {suggestion.fromCategory}
							to {suggestion.toCategory} (due {new Date(
								suggestion.dueRepayBy
							).toLocaleDateString()})
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		<!-- Borrow from another category (when over and mode is borrow_from_other_categories) -->
		{#if isBorrowMode && allowance && overByAndCategory}
			<div class="border-primary/30 bg-muted/30 space-y-3 rounded-lg border p-4">
				<div class="text-sm font-medium">Borrow from another category</div>
				{#if lenderCandidates.length === 0}
					<p class="text-muted-foreground text-sm">
						No category has surplus to borrow from this period. Reduce spending or use another
						negative allowance option.
					</p>
				{:else}
					<div class="grid gap-3">
						<div>
							<Label for="from-category">From category</Label>
							<Select
								type="single"
								value={selectedFromCategory}
								onValueChange={(v) =>
									v && (selectedFromCategory = v as 'essential' | 'discretionary' | 'buffer')}
							>
								<SelectTrigger id="from-category" class="mt-1 w-full">
									{(() => {
										const c = lenderCandidates.find((x) => x.category === selectedFromCategory);
										return c
											? `${c.category}: ${formatTransactionAmount(c.available, c.currency)} available`
											: selectedFromCategory;
									})()}
								</SelectTrigger>
								<SelectContent>
									{#each lenderCandidates as c}
										<SelectItem value={c.category}>
											{c.category}: {formatTransactionAmount(c.available, c.currency)} available
										</SelectItem>
									{/each}
								</SelectContent>
							</Select>
						</div>
						<div>
							<Label for="borrow-amount">Amount ({overByAndCategory?.currency})</Label>
							<Input
								id="borrow-amount"
								type="number"
								min="0.01"
								step="0.01"
								bind:value={borrowAmount}
								class="mt-1"
							/>
							{#if overByAndCategory}
								<p class="text-muted-foreground mt-1 text-xs">
									Over by {formatTransactionAmount(
										overByAndCategory.overBy,
										overByAndCategory.currency
									)}
								</p>
							{/if}
						</div>
						{#if error}
							<p class="text-destructive text-sm">{error}</p>
						{/if}
						<Button onclick={createBorrow} disabled={creating}>
							{creating ? 'Creating…' : 'Create borrow'}
						</Button>
					</div>
				{/if}
			</div>
		{/if}

		{#if !loading && activeBorrows.length === 0 && paybackSuggestions.length === 0 && !isBorrowMode}
			<p class="text-muted-foreground text-sm">
				No active borrows. When you're over allowance and use "Borrow from other categories", you
				can create one here.
			</p>
		{/if}
	</CardContent>
</Card>
