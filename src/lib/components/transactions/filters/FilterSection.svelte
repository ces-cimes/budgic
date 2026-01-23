<script lang="ts">
	interface Props {
		title: string;
		children?: any;
		description?: string;
	}

	let { title, children, description }: Props = $props();
</script>

<div class="space-y-3">
	<div>
		<h4 class="text-sm font-semibold text-primary">{title}</h4>
		{#if description}
			<p class="text-xs text-muted-foreground mt-1">{description}</p>
		{/if}
	</div>
	<div class="space-y-2">
		{@render children?.()}
	</div>
</div>
