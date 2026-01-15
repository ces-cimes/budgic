<script lang="ts">
	import FormFieldGrid from './FormFieldGrid.svelte';

	interface Props {
		title?: string;
		children: any;
	}

	const {
		title = 'Advanced Options',
		children
	}: Props = $props();
</script>

<div class="border-t border-border pt-6 mt-6">
	<div class="mb-4">
		<h3 class="text-sm font-medium text-muted-foreground uppercase tracking-wide">{title}</h3>
	</div>
	<FormFieldGrid>
		{@render children()}
	</FormFieldGrid>
</div>

