<script lang="ts">
	import type { TabContentProps } from '../types.js';

	interface Props extends TabContentProps {
		tabs: any[]; // Array of tabs to infer count from
	}

	const { tabId, isActive, className = '', children, tabs }: Props = $props();

	// Automatically infer tab count from tabs array
	const tabCount = $derived(tabs.length);
</script>

<div
	class="tab-panel min-w-0 flex-shrink-0 {isActive
		? 'tab-panel--active'
		: 'h-0 min-h-0 overflow-hidden'} {className}"
	style="width: {100 / tabCount}%"
>
	<div class="mx-auto w-full max-w-4xl px-5 sm:px-6">
		{@render children()}
	</div>
</div>

<style>
	.tab-panel {
		contain: layout style paint; /* Optimize rendering */
		transition: opacity 120ms ease-out;
	}
	.tab-panel:not(.tab-panel--active) {
		opacity: 0;
		pointer-events: none;
	}
</style>
