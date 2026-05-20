<script lang="ts">
	import DialogDrawer from '$lib/components/shared/DialogDrawer.svelte';
	import ImportSplitReviewCard from '$lib/components/import/ImportSplitReviewCard.svelte';
	import type { ImportSplitReviewGroup } from '$lib/core/services/core/data-quality-service';

	interface Props {
		open: boolean;
		group: ImportSplitReviewGroup | null;
		accountName?: string;
		busy?: boolean;
		onOpenChange: (open: boolean) => void;
		onconfirm: (selectedIds: string[]) => void;
		ondismiss: () => void;
	}

	let {
		open,
		group,
		accountName,
		busy = false,
		onOpenChange,
		onconfirm,
		ondismiss
	}: Props = $props();
</script>

<DialogDrawer
	{open}
	{onOpenChange}
	title="Link as split?"
	description="Other transactions on this account look like the same receipt."
>
	{#snippet children()}
		{#if group}
			<ul class="m-0 list-none p-0">
				<ImportSplitReviewCard
					{group}
					{accountName}
					{busy}
					{onconfirm}
					{ondismiss}
				/>
			</ul>
		{/if}
	{/snippet}
</DialogDrawer>
