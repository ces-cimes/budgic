<script lang="ts">
	import { onMount } from 'svelte';
	import type { Transaction } from '$lib/core/db';
	import { dependencyTrackingService, transactionService } from '$lib/core/services';
	import type { DependencyRelationship } from '$lib/core/services/core/dependency-tracking-service';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import { Button } from '$lib/components/ui/button';
	import { EmptyState } from '$lib/components/ui/empty-state';
	import { Badge } from '$lib/components/ui/badge';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Alert from '$lib/components/ui/alert';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Trash2, Plus, AlertCircle, GitBranch, Search, X } from '@lucide/svelte';

	interface Props {
		transactionId: string;
		onDependenciesChange?: () => void;
		className?: string;
	}

	const { transactionId, onDependenciesChange, className = '' }: Props = $props();

	let dependencies = $state<DependencyRelationship[]>([]);
	let availableTransactions = $state<Transaction[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let showAddDialog = $state(false);
	let searchQuery = $state('');
	let selectedTransactionId = $state('');
	let selectedDependencyType = $state<DependencyRelationship['type']>('required');
	let validationError = $state<string | null>(null);
	let isAddingDependency = $state(false);

	// Dependency type options
	const dependencyTypes: Array<{
		value: DependencyRelationship['type'];
		label: string;
		description: string;
	}> = [
		{
			value: 'required',
			label: 'Required',
			description: 'Transaction must occur after dependency completes'
		},
		{
			value: 'suggested',
			label: 'Suggested',
			description: 'Transaction should ideally occur after dependency'
		},
		{
			value: 'blocking',
			label: 'Blocking',
			description: 'Transaction blocks the dependent transaction'
		},
		{
			value: 'sequential',
			label: 'Sequential',
			description: 'Transactions must occur in strict sequence'
		},
		{
			value: 'conditional',
			label: 'Conditional',
			description: 'Transaction depends on outcome/status of dependency'
		}
	];

	// Filtered transactions based on search
	let filteredTransactions = $derived.by(() => {
		if (!searchQuery) return availableTransactions;
		const query = searchQuery.toLowerCase();
		return availableTransactions.filter(
			(tx) =>
				tx.description?.toLowerCase().includes(query) ||
				tx.id.toLowerCase().includes(query) ||
				tx.amount?.toString().includes(query)
		);
	});

	// Load dependencies
	async function loadDependencies() {
		try {
			isLoading = true;
			error = null;

			// Get existing dependencies
			dependencies = await dependencyTrackingService.getDependencies(transactionId);

			// Get all transactions except current one and its dependencies
			const allTransactions = await transactionService.getAllTransactions();
			const dependencyIds = dependencies.map((d) => d.dependsOnId);
			availableTransactions = allTransactions.filter(
				(tx) => tx.id !== transactionId && !dependencyIds.includes(tx.id) && !tx.deletedAt
			);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load dependencies';
		} finally {
			isLoading = false;
		}
	}

	// Get transaction details
	async function getTransactionDetails(txId: string): Promise<Transaction | null> {
		try {
			return await transactionService.getTransaction(txId);
		} catch {
			return null;
		}
	}

	// Add dependency
	async function addDependency() {
		if (!selectedTransactionId) {
			validationError = 'Please select a transaction';
			return;
		}

		try {
			isAddingDependency = true;
			validationError = null;

			// Check if dependency can be added
			const canAdd = await dependencyTrackingService.canAddDependency(
				transactionId,
				selectedTransactionId
			);

			if (!canAdd.canAdd) {
				validationError = canAdd.reason || 'Cannot add dependency';
				return;
			}

			// Add the dependency
			await dependencyTrackingService.addDependency(
				transactionId,
				selectedTransactionId,
				selectedDependencyType
			);

			// Reload dependencies
			await loadDependencies();

			// Reset form
			selectedTransactionId = '';
			selectedDependencyType = 'required';
			showAddDialog = false;
			searchQuery = '';

			// Notify parent
			onDependenciesChange?.();
		} catch (err) {
			validationError = err instanceof Error ? err.message : 'Failed to add dependency';
		} finally {
			isAddingDependency = false;
		}
	}

	// Remove dependency
	async function removeDependency(dependsOnId: string) {
		try {
			await dependencyTrackingService.removeDependency(transactionId, dependsOnId);
			await loadDependencies();
			onDependenciesChange?.();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to remove dependency';
		}
	}

	// Format amount
	function formatAmount(amount: number, currency: string): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency,
			minimumFractionDigits: 2
		}).format(Math.abs(amount));
	}

	// Format date
	function formatDate(dateStr: string | undefined): string {
		if (!dateStr) return 'No date';
		const date = new Date(dateStr);
		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	// Get badge variant for dependency type
	function getDependencyTypeBadgeVariant(
		type: string
	): 'default' | 'secondary' | 'destructive' | 'outline' {
		const variantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
			required: 'destructive',
			blocking: 'destructive',
			sequential: 'default',
			suggested: 'secondary',
			conditional: 'outline'
		};
		return variantMap[type] || 'default';
	}

	onMount(() => {
		loadDependencies();
	});
</script>

<Card.Root class={className}>
	<Card.Header>
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-2">
				<GitBranch class="text-primary h-5 w-5" />
				<Card.Title>Transaction Dependencies</Card.Title>
			</div>
			<Button size="sm" onclick={() => (showAddDialog = true)}>
				<Plus class="mr-2 h-4 w-4" />
				Add Dependency
			</Button>
		</div>
		<Card.Description
			>Manage dependencies between transactions for optimization</Card.Description
		>
	</Card.Header>
	<Card.Content>
		{#if isLoading}
			<div class="flex items-center justify-center py-8">
				<div class="text-muted-foreground">Loading dependencies...</div>
			</div>
		{:else if error}
			<Alert.Root variant="destructive">
				<AlertCircle class="h-4 w-4" />
				<Alert.Title>Error</Alert.Title>
				<Alert.Description>{error}</Alert.Description>
			</Alert.Root>
		{:else if dependencies.length === 0}
			<EmptyState
				icon={GitBranch}
				body="No dependencies configured"
				iconClass="mx-auto mb-2 h-12 w-12 text-muted-foreground"
				class="py-8"
			>
				{#snippet children()}
					<p class="text-muted-foreground mt-1 text-xs">
						Add dependencies to control transaction scheduling
					</p>
				{/snippet}
			</EmptyState>
		{:else}
			<div class="space-y-2">
				{#each dependencies as dependency}
					{#await getTransactionDetails(dependency.dependsOnId)}
						<div class="flex items-center justify-between rounded-md border p-3">
							<div class="text-muted-foreground text-sm">Loading...</div>
						</div>
					{:then transaction}
						{#if transaction}
							<div
								class="hover:bg-muted/50 flex items-center justify-between rounded-md border p-3 transition-colors"
							>
								<div class="flex-1">
									<div class="mb-1 flex items-center gap-2">
										<span class="text-sm font-medium">
											{transaction.description || 'Untitled Transaction'}
										</span>
										<Badge
											variant={getDependencyTypeBadgeVariant(dependency.type)}
										>
											{dependency.type}
										</Badge>
									</div>
									<div
										class="text-muted-foreground flex items-center gap-4 text-xs"
									>
										<span>
											{formatAmount(
												transaction.amount || 0,
												transaction.currency
											)}
										</span>
										<span>•</span>
										<span
											>{formatDate(
												transaction.plannedDate || transaction.clearedDate
											)}</span
										>
										<span>•</span>
										<Badge variant="outline" class="text-xs">
											{transaction.status}
										</Badge>
									</div>
								</div>
								<Button
									variant="ghost"
									size="icon"
									onclick={() => removeDependency(dependency.dependsOnId)}
								>
									<Trash2 class="text-destructive h-4 w-4" />
								</Button>
							</div>
						{/if}
					{/await}
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>

<!-- Add Dependency Dialog -->
<Dialog.Root bind:open={showAddDialog}>
	<Dialog.Content class="max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>Add Transaction Dependency</Dialog.Title>
			<Dialog.Description
				>Select a transaction that this transaction depends on</Dialog.Description
			>
		</Dialog.Header>

		<div class="space-y-4">
			<!-- Search -->
			<div class="relative">
				<Search
					class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
				/>
				<Input
					type="text"
					placeholder="Search transactions..."
					bind:value={searchQuery}
					class="pr-9 pl-9"
				/>
				{#if searchQuery}
					<button
						onclick={() => (searchQuery = '')}
						class="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
					>
						<X class="h-4 w-4" />
					</button>
				{/if}
			</div>

			<!-- Dependency Type -->
			<div class="space-y-2">
				<Label>Dependency Type</Label>
				<Select.Root type="single" bind:value={selectedDependencyType}>
					<Select.Trigger>
						{selectedDependencyType
							? dependencyTypes.find((t) => t.value === selectedDependencyType)
									?.label || 'Select dependency type'
							: 'Select dependency type'}
					</Select.Trigger>
					<Select.Content>
						{#each dependencyTypes as type}
							<Select.Item value={type.value} label={type.label}>
								<div>
									<div class="font-medium">{type.label}</div>
									<div class="text-muted-foreground text-xs">
										{type.description}
									</div>
								</div>
							</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			<!-- Transaction List -->
			<div class="max-h-96 space-y-2 overflow-y-auto">
				{#if filteredTransactions.length === 0}
					<EmptyState
						body={searchQuery ? 'No matches.' : 'Nothing here yet.'}
						class="text-muted-foreground py-8"
					/>
				{:else}
					{#each filteredTransactions as transaction}
						<button
							onclick={() => (selectedTransactionId = transaction.id)}
							class="hover:bg-muted/50 w-full rounded-md border p-3 text-left transition-colors {selectedTransactionId ===
							transaction.id
								? 'border-primary bg-primary/5'
								: ''}"
						>
							<div class="mb-1 flex items-center justify-between">
								<span class="text-sm font-medium">
									{transaction.description || 'Untitled Transaction'}
								</span>
								<Badge variant="outline">
									{transaction.status}
								</Badge>
							</div>
							<div class="text-muted-foreground flex items-center gap-4 text-xs">
								<span>
									{formatAmount(transaction.amount || 0, transaction.currency)}
								</span>
								<span>•</span>
								<span
									>{formatDate(
										transaction.plannedDate || transaction.clearedDate
									)}</span
								>
							</div>
						</button>
					{/each}
				{/if}
			</div>

			<!-- Validation Error -->
			{#if validationError}
				<Alert.Root variant="destructive">
					<AlertCircle class="h-4 w-4" />
					<Alert.Description>{validationError}</Alert.Description>
				</Alert.Root>
			{/if}
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (showAddDialog = false)}>Cancel</Button>
			<Button onclick={addDependency} disabled={!selectedTransactionId || isAddingDependency}>
				{#if isAddingDependency}
					Adding...
				{:else}
					Add Dependency
				{/if}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
