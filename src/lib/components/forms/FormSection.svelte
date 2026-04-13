<script lang="ts">
	interface Props {
		title?: string;
		showBorder?: boolean;
		children: any;
		className?: string;
	}

	const { title, showBorder = false, children, className = '' }: Props = $props();
</script>

<section class="mb-6 {showBorder ? 'border-border mt-6 border-t pt-6' : ''} {className}">
	{#if title}
		<div class="mb-4">
			<h3 class="text-muted-foreground text-sm font-medium tracking-wide uppercase">{title}</h3>
		</div>
	{/if}
	{@render children()}
</section>
