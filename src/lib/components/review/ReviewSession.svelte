<script lang="ts">
	/**
	 * Phase 9.7 — guided review for unclassified cleared expenses (modal / bottom sheet).
	 */
	import { db, isAnalyticsTier, type Transaction, type Category } from '$lib/core/db';
	import { userService, merchantProfileService, transactionService } from '$lib/core/services';
	import { persistRetrospectiveWeightedSplit } from '$lib/utils/split-persist';
	import { formatTransactionAmount } from '$lib/utils/currency-utils';
	import SearchableSelect from '$lib/components/ui/SearchableSelect.svelte';
	import { Button } from '$lib/components/ui/button';
	import { normaliseMerchantKey } from '$lib/utils/transfer-utils';

	interface Props {
		open: boolean;
		userCurrency: string;
		onClose: () => void;
	}

	let { open = $bindable(false), userCurrency, onClose }: Props = $props();

	let queue = $state<string[]>([]);
	let index = $state(0);
	let categoryOptions = $state<{ value: string; label: string }[]>([]);
	let saving = $state(false);
	let message = $state<string | null>(null);
	let tx = $state<Transaction | null>(null);
	let pickCategory = $state('');

	async function loadQueue() {
		const prefs = await userService.getUserPreferences();
		const saved = prefs.reviewSessionQueueIds;
		const savedIdx = prefs.reviewSessionIndex;
		const all = await db.transactions.filter((t) => !t.deletedAt).toArray();
		const cats = await db.getActiveCategories();
		const tierById = new Map(cats.map((c) => [c.id, c.waterfallTier]));
		const unclassified = all.filter(
			(t) =>
				t.type === 'expense' &&
				t.status === 'cleared' &&
				!isAnalyticsTier(t.categoryId ? tierById.get(t.categoryId) : undefined)
		);
		const ids = unclassified.map((t) => t.id);
		if (saved?.length && savedIdx != null) {
			const filtered = saved.filter((id) => ids.includes(id));
			queue = filtered.length ? filtered : ids;
			index = Math.min(savedIdx, Math.max(0, queue.length - 1));
		} else {
			queue = ids;
			index = 0;
		}
		categoryOptions = cats
			.filter((c: Category) => c.type === 'expense' && c.waterfallTier !== undefined)
			.map((c) => ({ value: c.id, label: c.name }));
		await loadCurrentTx();
	}

	async function loadCurrentTx() {
		if (queue.length === 0 || index >= queue.length) {
			tx = null;
			return;
		}
		const t = await db.transactions.get(queue[index]!);
		tx = t ?? null;
		pickCategory = t?.categoryId ?? '';
	}

	$effect(() => {
		if (!open) return;
		void loadQueue();
	});

	async function persistProgress() {
		const prefs = await userService.getUserPreferences();
		await userService.updateUserPreferences({
			...prefs,
			reviewSessionQueueIds: queue,
			reviewSessionIndex: index
		});
	}

	async function applySuggestion() {
		if (!tx) return;
		const mk = normaliseMerchantKey(tx.description ?? '');
		const sug = await merchantProfileService.suggestWeights(mk, tx.accountId);
		if (!sug) {
			message = 'No merchant profile yet — pick a category below.';
			return;
		}
		saving = true;
		try {
			const primary = sug.weights.reduce((a, b) => (b.weight > a.weight ? b : a));
			const applied = await persistRetrospectiveWeightedSplit(
				tx.id,
				sug.weights,
				primary.categoryId
			);
			if (!applied) {
				message = 'Save failed';
				return;
			}
			await advance();
		} catch (e) {
			message = e instanceof Error ? e.message : 'Save failed';
		} finally {
			saving = false;
		}
	}

	async function applyPick() {
		if (!tx || !pickCategory) return;
		saving = true;
		try {
			await transactionService.updateTransaction(tx.id, {
				categoryId: pickCategory,
				categoryWeights: undefined,
				categoryConfidence: 'high'
			});
			await advance();
		} catch (e) {
			message = e instanceof Error ? e.message : 'Save failed';
		} finally {
			saving = false;
		}
	}

	async function skip() {
		if (queue.length < 2) return;
		const id = queue[index]!;
		const rest = queue.filter((_, i) => i !== index);
		queue = [...rest, id];
		index = 0;
		await persistProgress();
		await loadCurrentTx();
	}

	async function advance() {
		message = null;
		index += 1;
		if (index >= queue.length) {
			const prefs = await userService.getUserPreferences();
			await userService.updateUserPreferences({
				...prefs,
				reviewSessionQueueIds: undefined,
				reviewSessionIndex: undefined
			});
			open = false;
			onClose();
			return;
		}
		await persistProgress();
		await loadCurrentTx();
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 md:items-center"
		role="dialog"
		aria-modal="true"
		aria-label="Review session"
	>
		<div
			class="bg-background border-border max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border p-5 shadow-xl"
		>
			<div class="mb-4 flex items-center justify-between gap-2">
				<h2 class="text-lg font-semibold">Review unclassified</h2>
				<Button variant="ghost" size="sm" onclick={() => ((open = false), onClose())}
					>Close</Button
				>
			</div>
			{#if queue.length === 0}
				<p class="text-muted-foreground text-sm">Nothing to review right now.</p>
			{:else if tx}
				<p class="text-muted-foreground mb-2 text-xs">
					{index + 1} of {queue.length}
				</p>
				<div class="space-y-2 rounded-xl border p-4">
					<p class="font-medium">{tx.description || 'No description'}</p>
					<p class="text-muted-foreground text-sm">
						{formatTransactionAmount(tx.amount ?? 0, tx.currency ?? userCurrency)}
					</p>
				</div>
				{#if message}
					<p class="text-destructive mt-2 text-sm" role="alert">{message}</p>
				{/if}
				<div class="mt-4 flex flex-wrap gap-2">
					<Button type="button" disabled={saving} onclick={applySuggestion}
						>Use profile</Button
					>
					<Button type="button" variant="secondary" disabled={saving} onclick={skip}
						>Skip</Button
					>
				</div>
				<div class="mt-4 space-y-2">
					<p class="text-muted-foreground text-xs">Or choose a category</p>
					<SearchableSelect
						bind:value={pickCategory}
						options={categoryOptions}
						placeholder="Category"
					/>
					<Button
						type="button"
						class="w-full"
						disabled={saving || !pickCategory}
						onclick={applyPick}>Apply</Button
					>
				</div>
			{:else}
				<p class="text-muted-foreground text-sm">Loading…</p>
			{/if}
		</div>
	</div>
{/if}
