<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.ts';
	import * as Button from '$lib/components/ui/button/index.ts';
	import { Trash2 } from '@lucide/svelte';

	interface Props {
		open: boolean;
		entityName: string;
		entityDetails?: {
			name?: string;
			amount?: number;
			currency?: string;
			[key: string]: any;
		};
		isDeleting: boolean;
		onConfirm: () => void;
		onCancel: () => void;
	}

	let {
		open = $bindable(),
		entityName,
		entityDetails,
		isDeleting,
		onConfirm,
		onCancel
	}: Props = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Delete {entityName}</Dialog.Title>
			<Dialog.Description>
				Are you sure you want to delete this {entityName.toLowerCase()}? This action cannot be
				undone.
				{#if entityDetails}
					<br />
					<br />
					{#if entityDetails.name}
						<strong>{entityName}:</strong> {entityDetails.name}
					{/if}
					{#if entityDetails.amount !== undefined && entityDetails.currency}
						<br />
						<strong>Amount:</strong>
						{entityDetails.currency}{Math.abs(entityDetails.amount).toFixed(2)}
					{/if}
				{/if}
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer class="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
			<Button.Root variant="outline" onclick={onCancel} disabled={isDeleting}>Cancel</Button.Root>
			<Button.Root
				variant="destructive"
				onclick={onConfirm}
				disabled={isDeleting}
				class="flex items-center gap-2"
			>
				{#if isDeleting}
					<span>Deleting...</span>
				{:else}
					<Trash2 size={16} />
					<span>Delete {entityName}</span>
				{/if}
			</Button.Root>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
