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

	let bottomBarHeight = $state(0);

	$effect(() => {
		let bottomObserver: ResizeObserver | null = null;

		if (bottomBar) {
			requestAnimationFrame(() => {
				const bottomBarElement = document.querySelector('[data-page-bottom-bar]') as HTMLElement;
				if (bottomBarElement) {
					bottomBarHeight = bottomBarElement.offsetHeight;

					bottomObserver = new ResizeObserver(() => {
						bottomBarHeight = bottomBarElement.offsetHeight;
					});
					bottomObserver.observe(bottomBarElement);
				}
			});
		} else {
			bottomBarHeight = 0;
		}

		return () => {
			bottomObserver?.disconnect();
		};
	});
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
		<div class="h-full min-h-0 w-full overflow-auto" style="padding-bottom: {bottomBarHeight}px;">
			{@render children()}
		</div>
	</section>

	<!-- Bottom Bar (if provided) -->
	{#if bottomBar}
		<footer
			data-page-bottom-bar
			class="border-border squircle-2xl sticky right-0
        bottom-0 left-0 z-40
        mx-auto w-full border-t bg-gradient-to-b
        from-(--color-bg-primary)/50 to-(--color-bg-primary) p-2 backdrop-blur-sm
      "
		>
			{@render bottomBar()}
		</footer>
	{/if}
</article>
