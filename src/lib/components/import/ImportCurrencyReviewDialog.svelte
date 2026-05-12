<script lang="ts">
	import type { Currency } from '$lib/core/db';
	import type { MmCurrencyReviewRow } from '$lib/core/services/import-export';

	interface Props {
		open: boolean;
		rows: MmCurrencyReviewRow[];
		currencies: Currency[];
		selection: Record<string, string>;
		onSelectionChange: (mmUid: string, budgicCurrencyId: string) => void;
		onConfirm: () => void;
		onCancel: () => void;
	}

	let { open, rows, currencies, selection, onSelectionChange, onConfirm, onCancel }: Props = $props();

	const canConfirm = $derived(currencies.length > 0 && rows.length > 0);
</script>

{#if open}
	<div class="fixed inset-0 z-50 bg-black/40 p-4">
		<div
			class="mx-auto mt-8 max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] p-5 shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby="mm-currency-review-title"
		>
			<div class="flex items-center justify-between">
				<p
					id="mm-currency-review-title"
					class="text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
				>
					Import · Currencies
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
				Map each Money Manager currency UID to a Budgic currency before data is written. Rows are
				from your INOUTCOME export (transfer pairs use the transfer-out row).
			</p>

			{#if currencies.length === 0}
				<p class="rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-3 text-sm text-[var(--color-text-primary)]">
					No active currencies in Budgic. Add at least one currency in Settings, then try again.
				</p>
			{:else}
				<div class="overflow-x-auto rounded-xl border border-[var(--color-border)]">
					<table class="w-full min-w-[28rem] text-left text-sm">
						<thead class="bg-[var(--color-bg-surface)] text-xs uppercase text-[var(--color-text-tertiary)]">
							<tr>
								<th class="px-3 py-2 font-semibold">MM currency UID</th>
								<th class="px-3 py-2 font-semibold">Tx count</th>
								<th class="px-3 py-2 font-semibold">Detected</th>
								<th class="px-3 py-2 font-semibold">Budgic currency</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-[var(--color-border)]">
							{#each rows as row (row.mmUid)}
								<tr class="bg-[var(--color-bg-secondary)]/40">
									<td class="px-3 py-2 font-mono text-xs text-[var(--color-text-primary)]">
										{row.mmUid}
									</td>
									<td class="px-3 py-2 text-[var(--color-text-secondary)]">{row.txCount}</td>
									<td class="px-3 py-2 text-[var(--color-text-secondary)]">
										{row.suggestedCode}
										{#if row.hasFallback}
											<span
												class="ml-1 rounded bg-[var(--color-warning)]/20 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-warning)]"
												>fallback</span
											>
										{/if}
									</td>
									<td class="px-3 py-2">
										<label class="sr-only" for={`mm-curr-${row.mmUid}`}
											>Budgic currency for {row.mmUid}</label
										>
										<select
											id={`mm-curr-${row.mmUid}`}
											class="border-border w-full max-w-[14rem] rounded-lg border bg-[var(--color-bg-primary)] px-2 py-1.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
											value={selection[row.mmUid] ?? ''}
											onchange={(e) =>
												onSelectionChange(row.mmUid, (e.currentTarget as HTMLSelectElement).value)}
										>
											{#each currencies as c (c.id)}
												<option value={c.id}>{c.code} — {c.name}</option>
											{/each}
										</select>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}

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
