<script lang="ts">
	import * as Button from '$lib/components/ui/button/index.ts';
	import { Separator } from '$lib/components/ui/separator/index.ts';
	import SearchableSelect from '$lib/components/ui/SearchableSelect.svelte';
	import { Plus, Minus, X } from '@lucide/svelte';
	import { formatAmount } from '$lib/utils/currency-utils';
	import {
		buildSplitResultFromForm,
		normalizeAndClampSplitExtras,
		validSplitExtras,
		SPLIT_MAX_EXTRAS,
		SPLIT_MIN_SLICE,
		SPLIT_WEIGHT_STEP,
		type SplitExtra
	} from '$lib/utils/soft-split-extras';
	import type { SplitPersistMode, SplitSource } from '$lib/utils/split-persist';

	type CategoryOption = { value: string; label: string };

	interface Props {
		transactionType: 'expense' | 'income' | 'transfer';
		amount: number;
		currency: string | null;
		status: string;
		accountId: string;
		categoryOptions: CategoryOption[];
		primaryCategoryId: string;
		mode: SplitPersistMode;
		extras: SplitExtra[];
		exactAmounts: { categoryId: string; amount: number }[];
		showSection: boolean;
		source: SplitSource;
		merchantSplitNote: string | null;
		exactOnly?: boolean;
		groupName?: string;
		suggestedPillClass: string;
		onPrimaryCategoryIdChange?: (id: string) => void;
		/** Edit of an existing partitioned group — Approximate switch needs parent confirm */
		partitionedGroupActive?: boolean;
		onRequestModeChange?: (next: SplitPersistMode) => boolean | Promise<boolean>;
	}

	let {
		transactionType,
		amount,
		currency,
		status,
		accountId,
		categoryOptions,
		primaryCategoryId = $bindable(''),
		mode = $bindable('weighted' as SplitPersistMode),
		extras = $bindable([] as SplitExtra[]),
		exactAmounts = $bindable([] as { categoryId: string; amount: number }[]),
		showSection = $bindable(false),
		source = $bindable('none' as SplitSource),
		merchantSplitNote = null,
		exactOnly = false,
		groupName = $bindable(''),
		suggestedPillClass,
		onPrimaryCategoryIdChange,
		partitionedGroupActive = false,
		onRequestModeChange
	}: Props = $props();

	const splittableType = $derived(transactionType === 'expense' || transactionType === 'income');

	function splitExtrasEqual(a: SplitExtra[], b: SplitExtra[]): boolean {
		if (a.length !== b.length) return false;
		return a.every(
			(x, i) => x.categoryId === b[i]?.categoryId && Math.abs(x.weight - (b[i]?.weight ?? 0)) < 1e-9
		);
	}

	function syncSplitExtrasClamp(): void {
		const p = primaryCategoryId;
		const ve = validSplitExtras(extras);
		if (ve.length === 0) return;
		const clamped = normalizeAndClampSplitExtras(p, ve);
		const map = new Map(clamped.map((c) => [c.categoryId, c.weight]));
		const next = extras.map((row) => {
			const id = row.categoryId?.trim() ?? '';
			if (!id) return row;
			const w = map.get(id);
			return w !== undefined ? { categoryId: id, weight: w } : row;
		});
		if (!splitExtrasEqual(next, extras)) extras = next;
	}

	function clearSplit(): void {
		extras = [];
		exactAmounts = [];
		showSection = false;
		source = 'none';
	}

	function openSplitSection(): void {
		showSection = true;
		if (exactOnly) {
			mode = 'partitioned';
			if (exactAmounts.length < 2) {
				exactAmounts = [
					{ categoryId: '', amount: 0 },
					{ categoryId: '', amount: 0 }
				];
			}
		} else {
			extras = [{ categoryId: '', weight: 0.5 }];
		}
	}

	function addSplitRow(): void {
		if (mode === 'partitioned') {
			if (exactAmounts.length >= SPLIT_MAX_EXTRAS + 1) return;
			exactAmounts = [...exactAmounts, { categoryId: '', amount: 0 }];
		} else {
			if (extras.length >= SPLIT_MAX_EXTRAS) return;
			if (validSplitExtras(extras).length >= SPLIT_MAX_EXTRAS) return;
			extras = [...extras, { categoryId: '', weight: SPLIT_WEIGHT_STEP }];
		}
	}

	function removeSplitRow(index: number): void {
		if (mode === 'partitioned') {
			exactAmounts = exactAmounts.filter((_, j) => j !== index);
			if (exactAmounts.length < 2) clearSplit();
		} else {
			extras = extras.filter((_, j) => j !== index);
			if (extras.length === 0) clearSplit();
		}
	}

	function splitCategoryOptionsForRow(rowIndex: number) {
		const other = new Set(
			extras
				.map((e, j) => (j !== rowIndex ? e.categoryId?.trim() : ''))
				.filter((id): id is string => Boolean(id))
		);
		const exactOther = new Set(
			exactAmounts
				.map((e, j) => (j !== rowIndex ? e.categoryId?.trim() : ''))
				.filter((id): id is string => Boolean(id))
		);
		return categoryOptions.filter(
			(o) => o.value !== primaryCategoryId && !other.has(o.value) && !exactOther.has(o.value)
		);
	}

	function onSoftSplitSliderInput(percentPrimary: number): void {
		const v = validSplitExtras(extras);
		if (v.length !== 1) return;
		const idx = extras.findIndex((e) => (e.categoryId?.trim() ?? '').length > 0);
		if (idx < 0) return;
		const primaryShare = Math.min(0.95, Math.max(0.05, percentPrimary / 100));
		extras = extras.map((e, i) => (i === idx ? { ...e, weight: 1 - primaryShare } : e));
		source = 'manual';
		syncSplitExtrasClamp();
	}

	function nudgeSplitExtraWeight(rowIndex: number, delta: number): void {
		const row = extras[rowIndex];
		if (!row?.categoryId?.trim()) return;
		const w = Math.min(0.95, Math.max(SPLIT_WEIGHT_STEP, row.weight + delta));
		extras = extras.map((e, i) => (i === rowIndex ? { ...e, weight: w } : e));
		source = 'manual';
		syncSplitExtrasClamp();
	}

	function splitRowWeightAfterClamp(rowIndex: number, delta: number): number | null {
		const row = extras[rowIndex];
		if (!row?.categoryId?.trim()) return null;
		const trial = extras.map((e, idx) =>
			idx === rowIndex ? { ...e, weight: e.weight + delta } : { ...e }
		);
		const ve = validSplitExtras(trial);
		const clamped = normalizeAndClampSplitExtras(primaryCategoryId, ve);
		const out = clamped.find((c) => c.categoryId === row.categoryId);
		return out?.weight ?? null;
	}

	function splitRowCanDecrease(rowIndex: number): boolean {
		const row = extras[rowIndex];
		if (!row?.categoryId?.trim()) return false;
		const next = splitRowWeightAfterClamp(rowIndex, -SPLIT_WEIGHT_STEP);
		return next != null && next < row.weight - 1e-9;
	}

	function splitRowCanIncrease(rowIndex: number): boolean {
		const row = extras[rowIndex];
		if (!row?.categoryId?.trim()) return false;
		const next = splitRowWeightAfterClamp(rowIndex, SPLIT_WEIGHT_STEP);
		return next != null && next > row.weight + 1e-9;
	}

	function seedExactFromWeights(): void {
		const built = buildSplitResultFromForm(primaryCategoryId, extras);
		if (!built || !amount) {
			exactAmounts = [
				{ categoryId: primaryCategoryId, amount: 0 },
				{ categoryId: '', amount: 0 }
			];
			return;
		}
		const totalAbs = Math.abs(amount);
		exactAmounts = built.weights.map((w) => ({
			categoryId: w.categoryId,
			amount: Math.round(totalAbs * w.weight * 100) / 100
		}));
	}

	async function setMode(next: SplitPersistMode): Promise<void> {
		if (exactOnly) return;
		if (
			next === 'weighted' &&
			mode === 'partitioned' &&
			partitionedGroupActive &&
			onRequestModeChange
		) {
			const ok = await onRequestModeChange(next);
			if (!ok) return;
		}
		mode = next;
		if (next === 'partitioned') {
			seedExactFromWeights();
		}
	}

	const useSplitSlider = $derived(validSplitExtras(extras).length === 1 && mode === 'weighted');
	const useSplitSteppers = $derived(validSplitExtras(extras).length >= 2 && mode === 'weighted');
	const validSplitExtrasList = $derived(validSplitExtras(extras));
	const splitCategoryWeightsBuilt = $derived.by(() =>
		mode === 'weighted' && primaryCategoryId
			? buildSplitResultFromForm(primaryCategoryId, extras)
			: undefined
	);

	const primaryLabel = $derived(
		categoryOptions.find((o) => o.value === primaryCategoryId)?.label ?? ''
	);

	const exactSum = $derived(exactAmounts.reduce((s, r) => s + (r.amount > 0 ? r.amount : 0), 0));
	const exactTotalOk = $derived(
		Math.abs(exactSum - Math.abs(amount)) < 0.02 || Math.abs(amount) < 1e-9
	);

	$effect(() => {
		if (exactOnly) mode = 'partitioned';
	});

	$effect(() => {
		const filtered = extras.filter(
			(e) => !e.categoryId?.trim() || e.categoryId !== primaryCategoryId
		);
		if (!splitExtrasEqual(filtered, extras)) extras = filtered;
	});

	$effect(() => {
		const _wt = extras.map((r) => `${r.categoryId}:${r.weight}`).join('|');
		void primaryCategoryId;
		void _wt;
		if (mode === 'weighted') syncSplitExtrasClamp();
	});
</script>

{#if splittableType && primaryCategoryId}
	<div class="mt-3 space-y-3">
		{#snippet splitCategoryAddDividerButton(handleClick: () => void)}
			<div class="flex w-full items-center gap-3 py-0.5">
				<div class="bg-border h-px min-h-px flex-1" aria-hidden="true"></div>
				<Button.Root
					type="button"
					variant="ghost"
					class="text-muted-foreground hover:text-foreground h-9 max-w-full shrink-0 px-2 text-sm font-normal whitespace-nowrap"
					onclick={handleClick}
				>
					+ Add split category
				</Button.Root>
				<div class="bg-border h-px min-h-px flex-1" aria-hidden="true"></div>
			</div>
		{/snippet}

		{#if !showSection && validSplitExtrasList.length === 0 && exactAmounts.length < 2}
			{@render splitCategoryAddDividerButton(openSplitSection)}
		{:else}
			<div class="flex flex-wrap items-center justify-between gap-2">
				<p class="text-muted-foreground text-sm font-medium">Split across categories</p>
				{#if !exactOnly}
					<div
						class="border-border flex rounded-lg border p-0.5 text-xs"
						role="group"
						aria-label="Split mode"
					>
						<button
							type="button"
							class="rounded-md px-2.5 py-1 {mode === 'weighted'
								? 'bg-[var(--color-amber-subtle)] font-medium text-[var(--color-amber)]'
								: 'text-muted-foreground'}"
							onclick={() => void setMode('weighted')}
						>
							Approximate
						</button>
						<button
							type="button"
							class="rounded-md px-2.5 py-1 {mode === 'partitioned'
								? 'bg-[var(--color-amber-subtle)] font-medium text-[var(--color-amber)]'
								: 'text-muted-foreground'}"
							onclick={() => void setMode('partitioned')}
						>
							Exact
						</button>
					</div>
				{/if}
			</div>
			<Separator />

			{#if mode === 'weighted'}
				<div class="space-y-4 pt-0.5">
					{#each extras as row, i (i)}
						<div
							class="max-sm:grid max-sm:w-full max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:items-center max-sm:gap-x-2 max-sm:gap-y-2 sm:flex sm:w-full sm:flex-row sm:flex-wrap sm:items-center sm:gap-2"
						>
							<div
								class="min-w-0 max-sm:col-start-1 max-sm:row-start-1 sm:order-1 sm:min-w-0 sm:flex-1 sm:basis-0"
							>
								<SearchableSelect
									bind:value={extras[i].categoryId}
									options={splitCategoryOptionsForRow(i)}
									placeholder="Additional category…"
									allowClear={false}
									fieldKey="transaction.category.split"
									selectionContext={{ transactionType, status, accountId: accountId || undefined }}
									onValueChange={() => {
										extras = extras.map((e) => ({ ...e }));
										source = 'manual';
									}}
								/>
							</div>
							<Button.Root
								type="button"
								variant="destructive"
								size="icon"
								class="shrink-0 max-sm:col-start-2 max-sm:row-start-1 sm:order-3"
								aria-label="Remove this category from split"
								onclick={() => removeSplitRow(i)}
							>
								<X class="size-4" aria-hidden="true" />
							</Button.Root>
							{#if useSplitSteppers && (row.categoryId?.trim() ?? '').length > 0}
								<div
									class="flex w-full max-w-full items-center justify-between gap-3 max-sm:col-span-2 max-sm:row-start-2 sm:order-2 sm:flex sm:h-9 sm:w-[7rem] sm:shrink-0 sm:items-center sm:justify-center sm:gap-1"
								>
									<Button.Root
										type="button"
										variant="outline"
										size="icon"
										class="shrink-0"
										disabled={!splitRowCanDecrease(i)}
										aria-label="Decrease category share by 5%"
										onclick={() => nudgeSplitExtraWeight(i, -SPLIT_WEIGHT_STEP)}
									>
										<Minus class="size-4" aria-hidden="true" />
									</Button.Root>
									<span
										class="text-muted-foreground min-w-[2.75rem] flex-1 text-center text-xs font-medium tabular-nums sm:w-10 sm:min-w-0 sm:flex-none"
										>{Math.round(row.weight * 100)}%</span
									>
									<Button.Root
										type="button"
										variant="outline"
										size="icon"
										class="shrink-0"
										disabled={!splitRowCanIncrease(i)}
										aria-label="Increase category share by 5%"
										onclick={() => nudgeSplitExtraWeight(i, SPLIT_WEIGHT_STEP)}
									>
										<Plus class="size-4" aria-hidden="true" />
									</Button.Root>
								</div>
							{/if}
						</div>
					{/each}

					{#if useSplitSlider && validSplitExtrasList.length === 1}
						{@const lone = validSplitExtrasList[0]}
						{@const extraLabel =
							categoryOptions.find((o) => o.value === lone?.categoryId)?.label ?? ''}
						{#if lone?.categoryId}
							<div class="space-y-1.5">
								<div class="flex justify-between gap-2 text-xs">
									<span class="text-foreground min-w-0 truncate font-medium">{primaryLabel}</span>
									<span class="text-muted-foreground shrink-0 tabular-nums"
										>{Math.round((1 - lone.weight) * 100)}% · {Math.round(lone.weight * 100)}%</span
									>
									<span class="text-foreground min-w-0 truncate text-right font-medium"
										>{extraLabel}</span
									>
								</div>
								<input
									type="range"
									min="5"
									max="95"
									step="5"
									class="w-full accent-[var(--color-amber)]"
									value={Math.round((1 - lone.weight) * 100)}
									oninput={(e) => {
										onSoftSplitSliderInput(parseInt((e.target as HTMLInputElement).value, 10));
									}}
								/>
								{#if amount}
									<p class="text-muted-foreground text-xs tabular-nums">
										{formatAmount(Math.abs(amount) * (1 - lone.weight), currency || 'USD')}
										·
										{formatAmount(Math.abs(amount) * lone.weight, currency || 'USD')}
									</p>
								{/if}
							</div>
						{/if}
					{/if}

					{#if useSplitSteppers && splitCategoryWeightsBuilt?.weights && amount}
						<ul class="text-muted-foreground space-y-0.5 text-xs tabular-nums">
							{#each splitCategoryWeightsBuilt.weights as w}
								<li class="flex justify-between gap-2">
									<span class="min-w-0 truncate"
										>{categoryOptions.find((o) => o.value === w.categoryId)?.label ??
											w.categoryId}</span
									>
									<span class="shrink-0"
										>{Math.round(w.weight * 100)}% · {formatAmount(
											Math.abs(amount) * w.weight,
											currency || 'USD'
										)}</span
									>
								</li>
							{/each}
						</ul>
					{/if}

					{#if extras.length < SPLIT_MAX_EXTRAS}
						{@render splitCategoryAddDividerButton(addSplitRow)}
					{/if}
				</div>
			{:else}
				<div class="space-y-3 pt-0.5">
					<div class="flex items-center gap-2">
						<span class="text-muted-foreground min-w-0 flex-1 truncate text-sm">{primaryLabel}</span
						>
						<input
							type="number"
							min="0"
							step="0.01"
							class="border-input h-9 w-28 rounded-md border px-2 text-sm tabular-nums"
							value={exactAmounts.find((r) => r.categoryId === primaryCategoryId)?.amount ??
								(exactAmounts[0]?.categoryId === primaryCategoryId ? exactAmounts[0]?.amount : '')}
							oninput={(e) => {
								const v = parseFloat((e.target as HTMLInputElement).value);
								const amt = Number.isFinite(v) ? v : 0;
								const idx = exactAmounts.findIndex((r) => r.categoryId === primaryCategoryId);
								if (idx >= 0) {
									exactAmounts = exactAmounts.map((r, i) =>
										i === idx ? { ...r, amount: amt } : r
									);
								} else {
									exactAmounts = [
										{ categoryId: primaryCategoryId, amount: amt },
										...exactAmounts.filter((r) => r.categoryId !== primaryCategoryId)
									];
								}
								source = 'manual';
							}}
						/>
					</div>
					{#each exactAmounts as row, i (i)}
						{#if row.categoryId !== primaryCategoryId}
							<div class="flex items-center gap-2">
								<div class="min-w-0 flex-1">
									<SearchableSelect
										bind:value={exactAmounts[i].categoryId}
										options={splitCategoryOptionsForRow(i)}
										placeholder="Category…"
										allowClear={false}
										fieldKey="transaction.category.split"
										selectionContext={{
											transactionType,
											status,
											accountId: accountId || undefined
										}}
										onValueChange={() => {
											exactAmounts = exactAmounts.map((e) => ({ ...e }));
											source = 'manual';
										}}
									/>
								</div>
								<input
									type="number"
									min="0"
									step="0.01"
									class="border-input h-9 w-28 rounded-md border px-2 text-sm tabular-nums"
									value={row.amount}
									oninput={(e) => {
										const v = parseFloat((e.target as HTMLInputElement).value);
										const amt = Number.isFinite(v) ? v : 0;
										exactAmounts = exactAmounts.map((r, j) =>
											j === i ? { ...r, amount: amt } : r
										);
										source = 'manual';
									}}
								/>
								<Button.Root
									type="button"
									variant="destructive"
									size="icon"
									class="shrink-0"
									aria-label="Remove category"
									onclick={() => {
										exactAmounts = exactAmounts.filter((_, j) => j !== i);
										if (exactAmounts.length < 2) clearSplit();
									}}
								>
									<X class="size-4" aria-hidden="true" />
								</Button.Root>
							</div>
						{/if}
					{/each}
					{#if exactAmounts.filter((r) => r.categoryId && r.categoryId !== primaryCategoryId).length < SPLIT_MAX_EXTRAS}
						{@render splitCategoryAddDividerButton(addSplitRow)}
					{/if}
					{#if amount}
						<p
							class="text-xs tabular-nums {exactTotalOk
								? 'text-muted-foreground'
								: 'text-destructive'}"
						>
							Total: {formatAmount(exactSum, currency || 'USD')} / {formatAmount(
								Math.abs(amount),
								currency || 'USD'
							)}
						</p>
					{/if}
				</div>
			{/if}

			{#if merchantSplitNote}
				<div class="flex items-center gap-2">
					<span class={suggestedPillClass}>Suggested</span>
					<p class="text-muted-foreground text-xs">{merchantSplitNote}</p>
				</div>
			{/if}
		{/if}
	</div>
{/if}
