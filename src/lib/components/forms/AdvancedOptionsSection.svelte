<script lang="ts">
	import FormFieldGrid from './FormFieldGrid.svelte';

	interface Props {
		title?: string;
		children: any;
	}

	const { title = 'Advanced Options', children }: Props = $props();
</script>

<div class="border-border mt-6 border-t pt-6">
	<div class="mb-4">
		<h3 class="text-muted-foreground text-sm font-medium tracking-wide uppercase">{title}</h3>
	</div>
	<FormFieldGrid>
		{@render children()}
	</FormFieldGrid>
</div>
