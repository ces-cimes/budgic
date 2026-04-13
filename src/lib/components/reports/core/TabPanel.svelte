<script lang="ts">
	import type { TabPanelProps } from '../types.js';

	interface Props extends TabPanelProps {
		children: any;
	}

	const { tabId, isActive, className = '', children }: Props = $props();
</script>

<div class="tab-panel h-full flex-shrink-0 overflow-y-auto {className}" style="width: {100 / 5}%">
	{@render children()}
</div>
