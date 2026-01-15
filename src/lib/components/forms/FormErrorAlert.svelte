<script lang="ts">
	import * as Alert from '$lib/components/ui/alert/index.ts';

	interface Props {
		error: string | null;
		title?: string;
		className?: string;
	}

	const {
		error,
		title = 'Error',
		className = ''
	}: Props = $props();
</script>

{#if error}
	<Alert.Root variant="destructive" class="mb-6 {className}" role="alert">
		<Alert.Title>{title}</Alert.Title>
		<Alert.Description>{error}</Alert.Description>
	</Alert.Root>
{/if}

