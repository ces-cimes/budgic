<script lang="ts">
	import type { Account } from '$lib/core/db';
	import {
		MM_ACCOUNT_REVIEW_TYPE_LABELS,
		REVIEW_ACCOUNT_TYPES,
		type MmAccountReviewRow,
		type MmAccountTypeSource
	} from '$lib/core/services/import-export';
	import * as Select from '$lib/components/ui/select/index.ts';
	import { Checkbox } from '$lib/components/ui/checkbox/index.ts';

	interface Props {
		open: boolean;
		rows: MmAccountReviewRow[];
		typeSelection: Record<string, Account['type']>;
		personSelection: Record<string, boolean>;
		onTypeChange: (mmUid: string, type: Account['type']) => void;
		onPersonChange: (mmUid: string, checked: boolean) => void;
		onConfirm: () => void;
		onCancel: () => void;
	}

	let {
		open,
		rows,
		typeSelection,
		personSelection,
		onTypeChange,
		onPersonChange,
		onConfirm,
		onCancel
	}: Props = $props();

	const canConfirm = $derived(rows.length > 0 && rows.every((r) => typeSelection[r.mmUid] != null));

	function sourceLabel(source: MmAccountTypeSource): string {
		switch (source) {
			case 'account_type':
				return 'account_type';
			case 'zdata':
				return 'ZDATA';
			case 'name_heuristic':
				return 'name';
		}
	}

	function typeLabel(type: Account['type'] | undefined): string {
		if (!type) return 'Select type';
		return (
			MM_ACCOUNT_REVIEW_TYPE_LABELS[type as keyof typeof MM_ACCOUNT_REVIEW_TYPE_LABELS] ?? type
		);
	}
</script>

{#if open}
	<div class="fixed inset-0 z-50 bg-black/40 p-4">
		<div
			class="mx-auto mt-8 max-h-[90vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-5 shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby="mm-accounts-review-title"
		>
			<div class="flex items-center justify-between">
				<p
					id="mm-accounts-review-title"
					class="text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
				>
					Import · Accounts
				</p>
				<button
					type="button"
					class="text-sm text-[var(--color-text-tertiary)] hover:underline"
					onclick={onCancel}
				>
					Cancel
				</button>
			</div>

			<p class="text-sm text-[var(--color-text-secondary)]">
				Confirm type and optional person tracking for each new account before import. Types are
				suggested from Money Manager fields and account names—you can change either.
			</p>

			<div class="overflow-x-auto rounded-xl border border-[var(--color-border)]">
				<table class="w-full min-w-[32rem] text-left text-sm">
					<thead
						class="bg-[var(--color-bg-surface)] text-xs text-[var(--color-text-tertiary)] uppercase"
					>
						<tr>
							<th class="px-3 py-2 font-semibold">Account</th>
							<th class="px-3 py-2 font-semibold">Inferred</th>
							<th class="px-3 py-2 font-semibold">Budgic type</th>
							<th class="px-3 py-2 font-semibold">Person ledger</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-[var(--color-border)]">
						{#each rows as row (row.mmUid)}
							<tr class="bg-[var(--color-bg-secondary)]/40">
								<td class="px-3 py-2">
									<p class="font-medium text-[var(--color-text-primary)]">{row.displayName}</p>
									<p class="font-mono text-[10px] text-[var(--color-text-tertiary)]">{row.mmUid}</p>
								</td>
								<td class="px-3 py-2">
									<div class="flex flex-wrap gap-1">
										{#each row.sources as source (source)}
											<span
												class="rounded bg-[var(--color-bg-surface)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-text-tertiary)]"
												>{sourceLabel(source)}</span
											>
										{/each}
									</div>
								</td>
								<td class="px-3 py-2">
									<Select.Root
										type="single"
										value={typeSelection[row.mmUid]}
										onValueChange={(v) => {
											if (v) onTypeChange(row.mmUid, v as Account['type']);
										}}
									>
										<Select.Trigger class="w-full max-w-[12rem] min-w-[9rem]">
											{typeLabel(typeSelection[row.mmUid])}
										</Select.Trigger>
										<Select.Content>
											{#each REVIEW_ACCOUNT_TYPES as accountType (accountType)}
												<Select.Item value={accountType}>
													{MM_ACCOUNT_REVIEW_TYPE_LABELS[accountType]}
												</Select.Item>
											{/each}
										</Select.Content>
									</Select.Root>
								</td>
								<td class="px-3 py-2">
									<label
										class="flex cursor-pointer items-center gap-2 text-xs text-[var(--color-text-secondary)]"
									>
										<Checkbox
											checked={personSelection[row.mmUid] ?? false}
											onCheckedChange={(v) => onPersonChange(row.mmUid, v === true)}
										/>
										<span>Person ledger</span>
									</label>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<div class="flex flex-wrap justify-end gap-2 pt-1">
				<button
					type="button"
					class="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)]"
					onclick={onCancel}
				>
					Cancel import
				</button>
				<button
					type="button"
					class="rounded-xl bg-[var(--color-amber)] px-4 py-2 text-sm font-medium text-[var(--color-bg-primary)] disabled:cursor-not-allowed disabled:opacity-50"
					disabled={!canConfirm}
					onclick={onConfirm}
				>
					Continue import
				</button>
			</div>
		</div>
	</div>
{/if}
