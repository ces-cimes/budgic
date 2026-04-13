<script lang="ts">
	import * as Button from '$lib/components/ui/button/index.ts';
	import { Trash2 } from '@lucide/svelte';

	interface Props {
		formId: string;
		isEditMode?: boolean;
		isLoading?: boolean;
		isDeleting?: boolean;
		submitLabel?: string;
		cancelLabel?: string;
		onCancel: () => void;
		onDelete?: () => void;
		deleteLabel?: string;
		maxWidth?: string;
	}

	const {
		formId,
		isEditMode = false,
		isLoading = false,
		isDeleting = false,
		submitLabel = 'Submit',
		cancelLabel = 'Cancel',
		onCancel,
		onDelete,
		deleteLabel = 'Delete',
		maxWidth = 'max-w-2xl'
	}: Props = $props();
</script>

<div class="flex justify-between {maxWidth} mx-auto">
	<!-- Delete Button (only in edit mode) -->
	{#if isEditMode && onDelete}
		<Button.Root
			type="button"
			variant="destructive"
			onclick={onDelete}
			disabled={isLoading || isDeleting}
			class="flex items-center gap-2"
		>
			<Trash2 size={16} />
			{deleteLabel}
		</Button.Root>
	{:else}
		<div></div>
	{/if}

	<div class="flex space-x-4">
		<Button.Root
			type="button"
			variant="outline"
			onclick={onCancel}
			disabled={isLoading || isDeleting}
		>
			{cancelLabel}
		</Button.Root>
		<Button.Root type="submit" form={formId} disabled={isLoading || isDeleting}>
			{submitLabel}
		</Button.Root>
	</div>
</div>
