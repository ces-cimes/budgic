<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { occasionService } from '$lib/core/services';
	import type { Occasion } from '$lib/core/db';
	import { PageLayout } from '$lib/components/layouts';
	import * as Card from '$lib/components/ui/card/index.ts';
	import * as Button from '$lib/components/ui/button/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { Label } from '$lib/components/ui/label/index.ts';
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
	<div class="container mx-auto max-w-3xl space-y-6 p-4">
		<div class="flex items-center gap-4 mb-4">
			<Button.Root variant="ghost" size="sm" onclick={() => goto('/settings')}>
				← Back to Settings
			</Button.Root>
		</div>
		<div>
			<h1 class="text-2xl font-semibold">Occasion awareness</h1>
			<p class="text-muted-foreground text-sm mt-1">
				Recurring spending events (e.g. Friday nights, first weekend, holidays) are used to adjust your allowance so you can plan ahead.
			</p>
		</div>

		{#if error}
			<div class="rounded-lg bg-destructive/10 text-destructive px-4 py-2 text-sm">{error}</div>
		{/if}
		{#if success}
			<div class="rounded-lg bg-success/10 text-success px-4 py-2 text-sm">{success}</div>
		{/if}

		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<CalendarDays class="w-5 h-5" />
					Occasions
				</Card.Title>
				<Card.Description>
					Detect from transaction history or add your own. Inactive occasions do not affect your allowance.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="flex flex-wrap gap-2">
					<Button.Root onclick={detectFromHistory} disabled={detecting}>
						<RefreshCw class="w-4 h-4 mr-2" />
						{detecting ? 'Detecting…' : 'Detect from history'}
					</Button.Root>
					<Button.Root variant="outline" onclick={() => (showAddForm = !showAddForm)}>
						<Plus class="w-4 h-4 mr-2" />
						Add occasion
					</Button.Root>
				</div>

				{#if showAddForm}
					<div class="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
						<Label for="add-title">Title</Label>
						<Input id="add-title" bind:value={addTitle} placeholder="e.g. Friday nights" class="max-w-xs" />
						<div class="flex gap-4">
							<div>
								<Label>Type</Label>
								<Select type="single" value={addType} onValueChange={(v) => v && (addType = v as typeof addType)}>
									<SelectTrigger class="w-[140px] mt-1">
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
								<div>
									<Label>Day of week</Label>
									<Select type="single" value={String(addDayOfWeek)} onValueChange={(v) => v && (addDayOfWeek = parseInt(v, 10))}>
										<SelectTrigger class="w-[120px] mt-1">
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
							<div>
								<Label>Expected change ({addCurrency})</Label>
								<Input type="number" bind:value={addExpectedDelta} class="w-24 mt-1" placeholder="0" />
							</div>
						</div>
						<Button.Root onclick={addOccasion}>Add</Button.Root>
					</div>
				{/if}

				{#if loading}
					<p class="text-sm text-muted-foreground">Loading…</p>
				{:else if occasions.length === 0}
					<p class="text-sm text-muted-foreground">No occasions yet. Use &quot;Detect from history&quot; or &quot;Add occasion&quot;.</p>
				{:else}
					<ul class="space-y-2">
						{#each occasions as o}
							<li class="flex items-center justify-between rounded-lg border border-border px-3 py-2">
								<div class="flex items-center gap-3">
									<Switch checked={o.isActive} onCheckedChange={() => toggleActive(o)} />
									<div>
										<div class="font-medium">{o.title}</div>
										<div class="text-xs text-muted-foreground">
											{getPatternLabel(o)} · {o.source === 'detected' ? `Detected (${o.confidence}%)` : 'User-defined'}
											· {formatTransactionAmount(o.expectedAmountDelta, o.currency)}/occurrence
										</div>
									</div>
								</div>
								<div class="flex gap-1">
									<Button.Root variant="ghost" size="sm" onclick={() => deleteOccasion(o.id)} title="Delete">
										<Trash2 class="w-4 h-4 text-destructive" />
									</Button.Root>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>
</PageLayout>
