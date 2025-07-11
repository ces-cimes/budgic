<script lang="ts">
	import Card from '$lib/components/primitives/Card.svelte';
	import Button from '$lib/components/primitives/Button.svelte';
	import Input from '$lib/components/primitives/Input.svelte';
	import { Tag, Edit, Trash2, Download, Merge, Sparkles, CheckCircle } from '@lucide/svelte';

	interface Props {
		selectedTransactions: Set<string>;
		onBulkCategorize: () => void;
		onBulkDelete: () => void;
		onBulkExport: () => void;
		onBulkMerge: () => void;
		onClearSelection: () => void;
	}

	let { 
		selectedTransactions, 
		onBulkCategorize, 
		onBulkDelete, 
		onBulkExport, 
		onBulkMerge, 
		onClearSelection 
	}: Props = $props();

	let showBulkCategorize = $state(false);
	let selectedTag = $state('');
	let showConfirmDelete = $state(false);

	const availableTags = ['Food', 'Transport', 'Housing', 'Entertainment', 'Shopping', 'Healthcare', 'Income'];

	const handleBulkCategorize = () => {
		if (selectedTag) {
			onBulkCategorize();
			showBulkCategorize = false;
			selectedTag = '';
		}
	};

	const handleBulkDelete = () => {
		onBulkDelete();
		showConfirmDelete = false;
	};
</script>

<div class="space-y-4">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<CheckCircle class="size-5 text-primary" />
			<h3 class="text-lg font-semibold">Bulk Operations</h3>
		</div>
		<button
			class="text-sm text-text-tertiary hover:text-text-secondary transition-colors"
			on:click={onClearSelection}
		>
			Clear Selection
		</button>
	</div>

	<!-- Selection Summary -->
	<Card class="p-4 bg-primary/5 border-primary/20">
		<div class="text-center">
			<div class="text-lg font-semibold text-primary">{selectedTransactions.size}</div>
			<div class="text-sm text-text-secondary">transactions selected</div>
		</div>
	</Card>

	<!-- Bulk Operations -->
	<div class="grid grid-cols-2 gap-3">
		<!-- Bulk Categorize -->
		<button
			class="p-4 border border-border rounded-lg hover:bg-surface-hover transition-colors text-left"
			on:click={() => showBulkCategorize = true}
		>
			<div class="flex items-center gap-2 mb-2">
				<Tag class="size-4 text-primary" />
				<span class="font-medium">Categorize</span>
			</div>
			<div class="text-sm text-text-tertiary">Apply tags to all selected</div>
		</button>

		<!-- Bulk Delete -->
		<button
			class="p-4 border border-border rounded-lg hover:bg-surface-hover transition-colors text-left"
			on:click={() => showConfirmDelete = true}
		>
			<div class="flex items-center gap-2 mb-2">
				<Trash2 class="size-4 text-error" />
				<span class="font-medium text-error">Delete</span>
			</div>
			<div class="text-sm text-text-tertiary">Remove all selected</div>
		</button>

		<!-- Bulk Export -->
		<button
			class="p-4 border border-border rounded-lg hover:bg-surface-hover transition-colors text-left"
			on:click={onBulkExport}
		>
			<div class="flex items-center gap-2 mb-2">
				<Download class="size-4 text-primary" />
				<span class="font-medium">Export</span>
			</div>
			<div class="text-sm text-text-tertiary">Download as CSV/PDF</div>
		</button>

		<!-- Bulk Merge -->
		<button
			class="p-4 border border-border rounded-lg hover:bg-surface-hover transition-colors text-left"
			on:click={onBulkMerge}
		>
			<div class="flex items-center gap-2 mb-2">
				<Merge class="size-4 text-primary" />
				<span class="font-medium">Merge</span>
			</div>
			<div class="text-sm text-text-tertiary">Combine transactions</div>
		</button>
	</div>

	<!-- AI Suggestions -->
	<Card class="p-4 bg-surface-secondary">
		<div class="flex items-center gap-2 mb-2">
			<Sparkles class="size-4 text-primary" />
			<span class="font-medium">AI Suggestions</span>
		</div>
		<div class="text-sm text-text-secondary">
			Based on your selection, we suggest categorizing these as "Food & Dining" 
			and marking 3 transactions as recurring payments.
		</div>
		<div class="flex gap-2 mt-3">
			<Button size="sm" variant="neutral">Apply Suggestion</Button>
			<Button size="sm" variant="neutral">Review Details</Button>
		</div>
	</Card>

	<!-- Bulk Categorize Modal -->
	{#if showBulkCategorize}
		<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
			<div class="bg-surface p-6 rounded-lg w-96 max-w-full mx-4">
				<h4 class="text-lg font-semibold mb-4">Bulk Categorize</h4>
				<div class="space-y-4">
					<div>
						<label class="block text-sm font-medium mb-2">Select Category</label>
						<select
							bind:value={selectedTag}
							class="w-full p-2 border border-border rounded-md bg-surface"
						>
							<option value="">Choose a category...</option>
							{#each availableTags as tag}
								<option value={tag}>{tag}</option>
							{/each}
						</select>
					</div>
					<div class="flex gap-2">
						<Button on:click={handleBulkCategorize} disabled={!selectedTag} class="flex-1">
							Apply to {selectedTransactions.size} transactions
						</Button>
						<Button variant="neutral" on:click={() => showBulkCategorize = false} class="flex-1">
							Cancel
						</Button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Confirm Delete Modal -->
	{#if showConfirmDelete}
		<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
			<div class="bg-surface p-6 rounded-lg w-96 max-w-full mx-4">
				<div class="flex items-center gap-2 mb-4">
					<Trash2 class="size-5 text-error" />
					<h4 class="text-lg font-semibold text-error">Confirm Delete</h4>
				</div>
				<p class="text-text-secondary mb-4">
					Are you sure you want to delete {selectedTransactions.size} transactions? 
					This action cannot be undone.
				</p>
				<div class="flex gap-2">
					<Button variant="danger" on:click={handleBulkDelete} class="flex-1">
						Delete {selectedTransactions.size} transactions
					</Button>
					<Button variant="neutral" on:click={() => showConfirmDelete = false} class="flex-1">
						Cancel
					</Button>
				</div>
			</div>
		</div>
	{/if}
</div> 