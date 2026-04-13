<script lang="ts">
	import * as Label from '$lib/components/ui/label/index.ts';
	import * as Tooltip from '$lib/components/ui/tooltip/index.ts';
	import { HelpCircle } from '@lucide/svelte';

	interface Props {
		for?: string;
		tooltip: string;
		className?: string;
		children: any;
	}

	const { for: htmlFor, tooltip, className = '', children }: Props = $props();
</script>

<div class="flex items-center justify-between gap-2 {className}">
	<Label.Root for={htmlFor}>{@render children()}</Label.Root>
	<Tooltip.Root>
		<Tooltip.Trigger>
			<HelpCircle class="text-muted-foreground h-4 w-4" />
		</Tooltip.Trigger>
		<Tooltip.Content>
			<p class="max-w-xs">{tooltip}</p>
		</Tooltip.Content>
	</Tooltip.Root>
</div>
