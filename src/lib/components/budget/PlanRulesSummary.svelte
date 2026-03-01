<script lang="ts">
	import { goto } from '$app/navigation';
	import { Settings } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.ts';
	import * as Card from '$lib/components/ui/card/index.ts';
</script>

<Card.Root class="border-border">
	<Card.Header class="pb-2">
		<Card.Title class="text-base">Plan rules</Card.Title>
		<Card.Description class="text-sm">
			Envelope borrowing, rollover, and occasions. Configure in Settings.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<ul class="text-muted-foreground mb-4 list-inside list-disc text-sm">
			<li>Envelope borrowing limits and repayment</li>
			<li>Surplus and deficit rollover at period end</li>
			<li>Occasion-aware allowance adjustments</li>
		</ul>
		<Button variant="outline" size="sm" onclick={() => goto('/settings/plan')}>
			<Settings class="mr-2 h-4 w-4" />
			Edit in Settings
		</Button>
	</Card.Content>
</Card.Root>
