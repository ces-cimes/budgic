<script lang="ts">
	import Header from '$lib/components/Header.svelte';
	import { PageLayout } from '$lib/components/layouts';
	import { Button } from '$lib/components/ui/button';
	import * as Select from '$lib/components/ui/select/index.ts';
	import { db, generateUUID } from '$lib/core/db';
	import type { Account, RoundUpRule } from '$lib/core/db';
	import { onMount } from 'svelte';

	let rules = $state<RoundUpRule[]>([]);
	let accounts = $state<Account[]>([]);
	let sourceAccountId = $state('');
	let targetAccountId = $state('');
	let method = $state<RoundUpRule['method']>('nearest-1');
	let methodParam = $state<number | undefined>(undefined);
	let batchMode = $state<RoundUpRule['batchMode']>('daily');

	async function load(): Promise<void> {
		accounts = await db.getActiveAccounts();
		rules = await db.roundUpRules.toArray();
	}

	onMount(load);

	async function addRule(): Promise<void> {
		if (!sourceAccountId || !targetAccountId) return;
		await db.roundUpRules.add({
			id: generateUUID(),
			sourceAccountId,
			targetAccountId,
			method,
			methodParam,
			minimumTransferAmount: 0.01,
			batchMode,
			isActive: true,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			deletedAt: null
		});
		await load();
	}

	async function toggleRule(rule: RoundUpRule): Promise<void> {
		await db.roundUpRules.update(rule.id, {
			isActive: !rule.isActive,
			updatedAt: new Date().toISOString()
		});
		await load();
	}
</script>

<PageLayout>
	{#snippet topBar()}
		<Header title="Round-up rules" />
	{/snippet}

	<div class="mx-auto max-w-2xl space-y-5 px-4 py-6">
		<div class="space-y-3 rounded-2xl border border-[var(--color-border)] p-4">
			<h2 class="text-sm font-medium">Add rule</h2>
			<Select.Root type="single" bind:value={sourceAccountId}>
				<Select.Trigger class="w-full"
					>{accounts.find((a) => a.id === sourceAccountId)?.name ||
						'Source account'}</Select.Trigger
				>
				<Select.Content>
					{#each accounts as account (account.id)}
						<Select.Item value={account.id}>{account.name}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
			<Select.Root type="single" bind:value={targetAccountId}>
				<Select.Trigger class="w-full"
					>{accounts.find((a) => a.id === targetAccountId)?.name ||
						'Target account'}</Select.Trigger
				>
				<Select.Content>
					{#each accounts as account (account.id)}
						<Select.Item value={account.id}>{account.name}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
			<Select.Root type="single" bind:value={method}>
				<Select.Trigger class="w-full">{method}</Select.Trigger>
				<Select.Content>
					{#each ['nearest-1', 'nearest-10', 'nearest-100', 'fixed', 'percentage', 'multiplier'] as m (m)}
						<Select.Item value={m}>{m}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
			{#if method === 'fixed' || method === 'percentage' || method === 'multiplier'}
				<input
					type="number"
					bind:value={methodParam}
					placeholder="Method parameter"
					class="w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
				/>
			{/if}
			<Select.Root type="single" bind:value={batchMode}>
				<Select.Trigger class="w-full">{batchMode}</Select.Trigger>
				<Select.Content>
					{#each ['per-transaction', 'daily', 'weekly'] as mode (mode)}
						<Select.Item value={mode}>{mode}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
			<Button onclick={addRule}>Add rule</Button>
		</div>

		<div class="space-y-2">
			{#each rules as rule (rule.id)}
				<div
					class="flex items-center justify-between rounded-xl border border-[var(--color-border)] p-3"
				>
					<div>
						<p class="text-sm">{rule.method} · {rule.batchMode}</p>
						<p class="text-xs text-[var(--color-text-tertiary)]">
							{accounts.find((a) => a.id === rule.sourceAccountId)?.name} →
							{accounts.find((a) => a.id === rule.targetAccountId)?.name}
						</p>
					</div>
					<Button size="sm" variant="ghost" onclick={() => toggleRule(rule)}>
						{rule.isActive ? 'Disable' : 'Enable'}
					</Button>
				</div>
			{/each}
		</div>
	</div>
</PageLayout>
