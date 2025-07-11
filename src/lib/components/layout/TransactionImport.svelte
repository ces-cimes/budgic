<script lang="ts">
	import Button from '$lib/components/primitives/Button.svelte';
	import { Upload, Download, Sparkles, AlertCircle } from '@lucide/svelte';

	interface Props {
		onImport: () => void;
		onExport: () => void;
	}

	let { onImport, onExport }: Props = $props();

	let showImportOptions = $state(false);
	let importStatus = $state<'idle' | 'importing' | 'success' | 'error'>('idle');
	let importMessage = $state('');

	const handleImport = async () => {
		importStatus = 'importing';
		importMessage = 'Importing transactions...';
		
		try {
			// Simulate import process
			await new Promise(resolve => setTimeout(resolve, 2000));
			onImport();
			importStatus = 'success';
			importMessage = 'Successfully imported 15 transactions with AI categorization';
		} catch (error) {
			importStatus = 'error';
			importMessage = 'Failed to import transactions. Please try again.';
		}
	};
</script>

<div class="relative">
	<!-- Import Button -->
	<Button
		variant="neutral"
		size="sm"
		on:click={() => showImportOptions = !showImportOptions}
		class="flex items-center gap-2"
	>
		<Upload class="size-4" />
		<span class="hidden sm:inline">Import</span>
	</Button>

	<!-- Import Options Dropdown -->
	{#if showImportOptions}
		<div class="absolute top-full right-0 mt-2 w-64 bg-surface border border-border rounded-lg shadow-lg z-50">
			<div class="p-4 space-y-3">
				<!-- Import Status -->
				{#if importStatus !== 'idle'}
					<div class="flex items-center gap-2 p-2 rounded-md {importStatus === 'success' ? 'bg-success/10 text-success' : importStatus === 'error' ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'}">
						{#if importStatus === 'importing'}
							<div class="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
						{:else if importStatus === 'success'}
							<Sparkles class="size-4" />
						{:else}
							<AlertCircle class="size-4" />
						{/if}
						<span class="text-sm">{importMessage}</span>
					</div>
				{/if}

				<!-- Import Options -->
				<div class="space-y-2">
					<button
						class="w-full flex items-center gap-3 p-2 rounded-md hover:bg-surface-hover transition-colors text-left"
						onclick={handleImport}
						disabled={importStatus === 'importing'}
					>
						<Upload class="size-4 text-primary" />
						<div>
							<div class="text-sm font-medium">Import Bank Transactions</div>
							<div class="text-xs text-text-tertiary">CSV, QFX, or direct bank connection</div>
						</div>
					</button>

					<button
						class="w-full flex items-center gap-3 p-2 rounded-md hover:bg-surface-hover transition-colors text-left"
						onclick={onExport}
					>
						<Download class="size-4 text-primary" />
						<div>
							<div class="text-sm font-medium">Export Transactions</div>
							<div class="text-xs text-text-tertiary">CSV, PDF, or Excel format</div>
						</div>
					</button>
				</div>

				<!-- AI Features -->
				<div class="pt-2 border-t border-border">
					<div class="flex items-center gap-2 text-xs text-text-tertiary">
						<Sparkles class="size-3" />
						<span>AI-powered categorization and duplicate detection</span>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Click outside to close -->
	{#if showImportOptions}
		<div
            class="fixed inset-0 z-40"
            onclick={() => showImportOptions = false}
            >
        </div>
	{/if}
</div> 