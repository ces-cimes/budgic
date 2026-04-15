<script lang="ts">
	interface Props {
		children: any;
		topBar?: any;
		bottomBar?: any;
		className?: string;
		contentClassName?: string;
	}

	const {
		children,
		topBar = null,
		bottomBar = null,
		className = '',
		contentClassName = ''
	}: Props = $props();
</script>

<article class="flex h-full min-h-0 flex-col overflow-hidden {className}">
	<!-- Top Bar (if provided) -->
	{#if topBar}
		<header
			data-page-top-bar
			class="sticky top-0
        right-0 left-0 z-40
      "
		>
			{@render topBar()}
		</header>
	{/if}

	<!-- Main Content Area -->
	<section
		class="relative top-0 h-full min-h-0 flex-1 overflow-visible bg-[var(--color-bg-primary)] {contentClassName}"
	>
		<div class="h-full min-h-0 w-full overflow-auto">
			{@render children()}
		</div>
	</section>

	<!-- Bottom Bar (if provided) — flex sibling below the scroll region; no extra scroll padding needed -->
	{#if bottomBar}
		<footer data-page-bottom-bar class="sticky right-0 bottom-0 left-0 z-40 w-full shrink-0">
			{@render bottomBar()}
		</footer>
	{/if}
</article>
