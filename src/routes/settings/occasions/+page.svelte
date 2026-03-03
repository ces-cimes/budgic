<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { occasionService } from '$lib/core/services';
	import type { Occasion } from '$lib/core/db';
	import { PageLayout } from '$lib/components/layouts';
	import Header from '$lib/components/Header.svelte';
	import { Switch } from '$lib/components/ui/switch/index.ts';
	import {
		Select,
		SelectContent,
		SelectItem,
		SelectTrigger
	} from '$lib/components/ui/select/index.ts';
	import { formatTransactionAmount } from '$lib/utils/currency-utils';
	import { CalendarDays, Plus, RefreshCw, Trash2 } from '@lucide/svelte';

	let occasions = $state<Occasion[]>([]);
	let loading = $state(true);
	let detecting = $state(false);
	let error = $state<string | null>(null);
	let success = $state<string | null>(null);
	let showAddForm = $state(false);
	let addTitle = $state('');
	let addType = $state<'weekly' | 'monthly' | 'annual'>('weekly');
	let addDayOfWeek = $state(5);
	let addExpectedDelta = $state(0);
	let addCurrency = $state('USD');

	onMount(load);

	async function load() {
		loading = true;
		try {
			occasions = await occasionService.getOccasions(undefined, { includeInactive: true });
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load occasions';
		} finally {
			loading = false;
		}
	}

	async function detectFromHistory() {
		detecting = true;
		error = null;
		success = null;
		try {
			const created = await occasionService.detectOccasionsFromTransactions(undefined, {
				daysLookback: 180,
				minConfidence: 65
			});
			await load();
			success = created.length > 0 ? `Detected ${created.length} occasion(s) from your transaction history.` : 'No new occasions detected. Try again with more transaction history.';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Detection failed';
		} finally {
			detecting = false;
		}
	}

	async function addOccasion() {
		if (!addTitle.trim()) return;
		error = null;
		try {
			let pattern: string;
			if (addType === 'weekly') {
				pattern = JSON.stringify({ type: 'weekly', dayOfWeek: addDayOfWeek });
			} else if (addType === 'monthly') {
				pattern = JSON.stringify({ type: 'monthly', weekOfMonth: 1, dayOfWeek: addDayOfWeek });
			} else {
				pattern = JSON.stringify({ type: 'annual', month: 12, dayOfMonth: 25 });
			}
			await occasionService.createOccasion({
				title: addTitle.trim(),
				occasionType: addType,
				pattern,
				expectedAmountDelta: addExpectedDelta,
				currency: addCurrency,
				source: 'user_defined'
			});
			showAddForm = false;
			addTitle = '';
			addExpectedDelta = 0;
			await load();
			success = 'Occasion added.';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to add';
		}
	}

	async function toggleActive(o: Occasion) {
		await occasionService.updateOccasion(o.id, { isActive: !o.isActive });
		await load();
	}

	async function deleteOccasion(id: string) {
		await occasionService.deleteOccasion(id);
		await load();
	}

	function getPatternLabel(o: Occasion): string {
		try {
			const p = JSON.parse(o.pattern);
			if (p.type === 'weekly' && p.dayOfWeek != null) {
				const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
				return days[p.dayOfWeek];
			}
			if (p.type === 'monthly') return 'Monthly';
			if (p.type === 'annual') return `Annual (${p.month}/${p.dayOfMonth ?? 1})`;
		} catch {}
		return o.occasionType;
	}
</script>

<svelte:head>
	<title>Occasion awareness | Settings | Budgic</title>
</svelte:head>

<PageLayout>
	{#snippet topBar()}
		<Header title="Occasions" backButtonLabel="Back to plan settings" backButtonLink="/settings/plan" />
	{/snippet}

	<div class="mx-auto max-w-2xl px-4 py-6 space-y-4">
		{#if error}
			<div class="squircle-2xl squircle-border px-4 py-3" style="--squircle-border-color: color-mix(in oklch, var(--color-warm-coral) 30%, transparent); --squircle-fill: color-mix(in oklch, var(--color-warm-coral) 8%, transparent);">
				<p class="text-sm text-[var(--color-warm-coral)]">{error}</p>
			</div>
		{/if}
		{#if success}
			<div class="squircle-2xl squircle-border px-4 py-3" style="--squircle-border-color: color-mix(in oklch, var(--color-sage-green) 30%, transparent); --squircle-fill: color-mix(in oklch, var(--color-sage-green) 8%, transparent);">
				<p class="text-sm text-[var(--color-sage-green)]">{success}</p>
			</div>
		{/if}

		<p class="text-xs text-[var(--color-text-tertiary)] px-1">
			Recurring spending events adjust your allowance so you can plan ahead.
		</p>

		<div class="flex gap-2">
			<button
				onclick={detectFromHistory}
				disabled={detecting}
				class="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-surface)] disabled:opacity-50"
			>
				<RefreshCw class="size-3.5" />
				{detecting ? 'Detecting…' : 'Detect from history'}
			</button>
			<button
				onclick={() => (showAddForm = !showAddForm)}
				class="flex items-center gap-1.5 rounded-xl border border-[var(--color-amber)]/30 bg-[var(--color-amber-subtle)] px-4 py-2 text-sm font-medium text-[var(--color-amber)] transition-colors"
			>
				<Plus class="size-3.5" />
				Add occasion
			</button>
		</div>

		{#if showAddForm}
			<div class="squircle-4xl squircle-border squircle-fill-tertiary overflow-hidden">
				<div class="px-5 py-2.5 border-b border-border">
					<h2 class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">New occasion</h2>
				</div>
				<div class="px-5 py-4 space-y-4">
					<div class="space-y-1.5">
						<label for="add-title" class="text-sm font-medium text-[var(--color-text-primary)]">Title</label>
						<input
							id="add-title"
							bind:value={addTitle}
							placeholder="e.g. Friday nights"
							class="w-full max-w-xs rounded-xl border border-border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
						/>
					</div>
					<div class="flex flex-wrap gap-3">
						<div class="space-y-1.5">
							<p class="text-xs font-medium text-[var(--color-text-secondary)]">Type</p>
							<Select type="single" value={addType} onValueChange={(v) => v && (addType = v as typeof addType)}>
								<SelectTrigger class="w-36">
									{addType === 'weekly' ? 'Weekly' : addType === 'monthly' ? 'Monthly' : 'Annual'}
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="weekly">Weekly</SelectItem>
									<SelectItem value="monthly">Monthly</SelectItem>
									<SelectItem value="annual">Annual</SelectItem>
								</SelectContent>
							</Select>
						</div>
						{#if addType === 'weekly'}
							<div class="space-y-1.5">
								<p class="text-xs font-medium text-[var(--color-text-secondary)]">Day</p>
								<Select type="single" value={String(addDayOfWeek)} onValueChange={(v) => v && (addDayOfWeek = parseInt(v, 10))}>
									<SelectTrigger class="w-32">
										{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][addDayOfWeek]}
									</SelectTrigger>
									<SelectContent>
										{#each [0,1,2,3,4,5,6] as d}
											<SelectItem value={String(d)}>{['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d]}</SelectItem>
										{/each}
									</SelectContent>
								</Select>
							</div>
						{/if}
						<div class="space-y-1.5">
							<label for="add-delta" class="text-xs font-medium text-[var(--color-text-secondary)]">Expected change ({addCurrency})</label>
							<input
								id="add-delta"
								type="number"
								bind:value={addExpectedDelta}
								placeholder="0"
								class="w-24 rounded-xl border border-border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
							/>
						</div>
					</div>
					<button
						onclick={addOccasion}
						class="rounded-xl bg-[var(--color-amber)] px-5 py-2 text-sm font-semibold text-[var(--color-bg-primary)]"
					>
						Add
					</button>
				</div>
			</div>
		{/if}

		<!-- Occasions list -->
		{#if loading}
			<div class="space-y-2">
				{#each [1,2,3] as _}
					<div class="h-14 animate-pulse squircle-2xl bg-[var(--color-bg-tertiary)]"></div>
				{/each}
			</div>
		{:else if occasions.length === 0}
			<div class="rounded-2xl border border-border bg-[var(--color-bg-tertiary)] p-10 text-center">
				<CalendarDays class="mx-auto mb-3 size-8 text-[var(--color-text-tertiary)]" />
				<p class="text-sm text-[var(--color-text-secondary)]">No occasions yet.</p>
				<p class="text-xs text-[var(--color-text-tertiary)] mt-1">Detect from history or add your own.</p>
			</div>
		{:else}
			<div class="squircle-4xl squircle-border squircle-fill-tertiary divide-y divide-border overflow-hidden">
				{#each occasions as o}
					<div class="flex items-center gap-3 px-4 py-3">
						<Switch checked={o.isActive} onCheckedChange={() => toggleActive(o)} />
						<div class="min-w-0 flex-1">
							<p class="text-sm font-medium text-[var(--color-text-primary)]">{o.title}</p>
							<p class="text-xs text-[var(--color-text-tertiary)]">
								{getPatternLabel(o)} · {o.source === 'detected' ? `Detected (${o.confidence}%)` : 'User-defined'}
								· {formatTransactionAmount(o.expectedAmountDelta, o.currency)}/occurrence
							</p>
						</div>
						<button
							onclick={() => deleteOccasion(o.id)}
							class="shrink-0 p-1.5 text-[var(--color-warm-coral)] hover:bg-[var(--color-warm-coral)]/10 rounded-lg transition-colors"
							title="Delete"
						>
							<Trash2 class="size-4" />
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</PageLayout>

