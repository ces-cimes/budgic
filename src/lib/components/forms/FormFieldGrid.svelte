<script lang="ts">
	interface Props {
		sectionLabel?: string;
		children: any;
		className?: string;
	}

	const {
		sectionLabel,
		children,
		className = ''
	}: Props = $props();
</script>

<div class="{className}">
	{#if sectionLabel}
		<div class="mb-4">
			<h3 class="text-sm font-medium text-muted-foreground uppercase tracking-wide">{sectionLabel}</h3>
		</div>
	{/if}
	<div class="grid grid-cols-[auto_1fr] gap-4">
		{@render children()}
	</div>
</div>

