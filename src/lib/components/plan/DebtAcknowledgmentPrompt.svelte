<script lang="ts">
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';

	interface Props {
		groupLabel: string;
		shortfallDisplay: string;
		onConfirm: () => void;
		onDismiss: () => void;
	}

	const { groupLabel, shortfallDisplay, onConfirm, onDismiss }: Props = $props();
</script>

<Card class="border-amber-500/30 bg-amber-500/5">
	<CardHeader class="pb-2">
		<CardTitle class="text-base">Intentional overspend?</CardTitle>
		<CardDescription class="text-sm">
			You are planning more than your income this period by about <strong
				>{shortfallDisplay}</strong
			>, possibly for <strong>{groupLabel}</strong>. Is this intentional?
		</CardDescription>
	</CardHeader>
	<CardContent class="flex flex-wrap justify-end gap-2 border-t border-amber-500/20 pt-4">
		<Button variant="outline" size="sm" type="button" onclick={onDismiss}>Not now</Button>
		<Button variant="default" size="sm" type="button" onclick={onConfirm}
			>Yes, intentional</Button
		>
	</CardContent>
</Card>
