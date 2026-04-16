<script lang="ts">
	import { ChevronDown, ChevronUp } from '@lucide/svelte';
	import * as Button from '$lib/components/ui/button/index.ts';

	interface Props {
		selectedCount: number;
		selectableCount?: number;
		isProcessing?: boolean;
		/** Controlled expanded state — lifted to the parent so it survives hide/show cycles */
		expanded: boolean;
		onExpandedChange: (v: boolean) => void;
		onSelectAll: () => void;
		onAccount: () => void;
		onCategory: () => void;
		onDescription: () => void;
		onDates: () => void;
		onNotes: () => void;
		onAmount: () => void;
		onCurrency: () => void;
		onStatus: () => void;
		onDelete: () => void;
		onClear: () => void;
	}

	const {
		selectedCount,
		selectableCount = 0,
		isProcessing = false,
		expanded,
		onExpandedChange,
		onSelectAll,
		onAccount,
		onCategory,
		onDescription,
		onDates,
		onNotes,
		onAmount,
		onCurrency,
		onStatus,
		onDelete,
		onClear
	}: Props = $props();
</script>

<div class="w-full">
	<div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
		<div class="min-w-0 shrink-0">
			<p class="text-sm font-medium">
				{selectedCount}{#if selectableCount > 0}
					/ {selectableCount}{/if} selected
				{#if isProcessing}
					<span
						class="text-muted-foreground ml-2 inline-flex items-center gap-1.5 text-xs font-normal"
					>
						<span
							class="border-muted-foreground/50 border-t-muted-foreground inline-block size-3 animate-spin rounded-full border"
							aria-hidden="true"
						></span>
						<span>Processing...</span>
					</span>
				{/if}
			</p>
			<p class="text-muted-foreground text-xs leading-tight">
				Group rows include all their transactions.
			</p>
		</div>

		<div class="flex min-w-0 flex-1 flex-col gap-2">
			<div class="flex flex-wrap items-center justify-end gap-1.5">
				<Button.Root
					variant="default"
					size="sm"
					class="h-8 px-2 text-xs sm:text-sm"
					onclick={onCategory}
					disabled={isProcessing}
				>
					Category
				</Button.Root>
				<Button.Root
					variant="outline"
					size="sm"
					class="h-8 px-2 text-xs sm:text-sm"
					onclick={onStatus}
					disabled={isProcessing}
				>
					Status
				</Button.Root>
				<Button.Root
					variant="destructive"
					size="sm"
					class="h-8 px-2 text-xs sm:text-sm"
					onclick={onDelete}
					disabled={isProcessing}
				>
					Delete
				</Button.Root>
				<Button.Root
					variant="ghost"
					size="sm"
					class="h-8 px-2 text-xs sm:text-sm"
					onclick={onClear}
					disabled={isProcessing}
				>
					Clear
				</Button.Root>
				<Button.Root
					variant="secondary"
					size="sm"
					class="h-8 gap-1 px-2 text-xs sm:text-sm"
					onclick={() => onExpandedChange(!expanded)}
					type="button"
					aria-expanded={expanded}
					aria-controls="bulk-action-bar-more"
				>
					{#if expanded}
						<ChevronUp class="size-3.5 shrink-0" aria-hidden="true" />
						Less
					{:else}
						<ChevronDown class="size-3.5 shrink-0" aria-hidden="true" />
						More
					{/if}
				</Button.Root>
			</div>

			{#if expanded}
				<div
					id="bulk-action-bar-more"
					class="border-border flex flex-wrap items-center justify-end gap-1.5 border-t pt-2"
				>
					<Button.Root
						variant="secondary"
						size="sm"
						class="h-8 px-2 text-xs sm:text-sm"
						onclick={onSelectAll}
						disabled={isProcessing || selectableCount === 0 || selectedCount >= selectableCount}
					>
						Select all filtered
					</Button.Root>
					<Button.Root
						variant="outline"
						size="sm"
						class="h-8 px-2 text-xs sm:text-sm"
						onclick={onAccount}
						disabled={isProcessing}
					>
						Account
					</Button.Root>
					<Button.Root
						variant="outline"
						size="sm"
						class="h-8 px-2 text-xs sm:text-sm"
						title="Find and replace text in descriptions"
						onclick={onDescription}
						disabled={isProcessing}
					>
						Description
					</Button.Root>
					<Button.Root
						variant="outline"
						size="sm"
						class="h-8 px-2 text-xs sm:text-sm"
						title="Shift cleared and/or planned dates"
						onclick={onDates}
						disabled={isProcessing}
					>
						Dates
					</Button.Root>
					<Button.Root
						variant="outline"
						size="sm"
						class="h-8 px-2 text-xs sm:text-sm"
						title="Append, prepend, or replace notes or reference"
						onclick={onNotes}
						disabled={isProcessing}
					>
						Notes
					</Button.Root>
					<Button.Root
						variant="outline"
						size="sm"
						class="h-8 px-2 text-xs sm:text-sm"
						title="Adjust amount by a fixed delta or a percent (not transfers)"
						onclick={onAmount}
						disabled={isProcessing}
					>
						Amount
					</Button.Root>
					<Button.Root
						variant="outline"
						size="sm"
						class="h-8 px-2 text-xs sm:text-sm"
						title="Set transaction currency (not transfers)"
						onclick={onCurrency}
						disabled={isProcessing}
					>
						Currency
					</Button.Root>
				</div>
			{/if}
		</div>
	</div>
</div>
