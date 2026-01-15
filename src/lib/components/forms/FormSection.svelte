<script lang="ts">
	interface Props {
		title?: string;
		showBorder?: boolean;
		children: any;
		className?: string;
	}

	const {
		title,
		showBorder = false,
		children,
		className = ''
	}: Props = $props();
</script>

<section class="mb-6 {showBorder ? 'border-t border-border pt-6 mt-6' : ''} {className}">
	{#if title}
		<div class="mb-4">
			<h3 class="text-sm font-medium text-muted-foreground uppercase tracking-wide">{title}</h3>
		</div>
	{/if}
	{@render children()}
</section>

