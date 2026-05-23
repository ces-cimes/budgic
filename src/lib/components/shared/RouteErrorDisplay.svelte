<script lang="ts">
	import { goto } from '$app/navigation';
	import { AlertTriangle, ArrowLeft, Home } from '@lucide/svelte';
	import * as Button from '$lib/components/ui/button/index.ts';

	interface Props {
		message?: string;
		status?: number;
		className?: string;
	}

	const {
		message = "Something went wrong. We couldn't load this page.",
		status,
		className = ''
	}: Props = $props();

	function handleBack() {
		if (typeof history !== 'undefined' && history.length > 1) {
			history.back();
			return;
		}
		goto('/');
	}

	function handleHome() {
		goto('/');
	}
</script>

<div
	class="flex min-h-[50vh] flex-col items-center justify-center px-4 py-12 text-center {className}"
	role="alert"
>
	<div
		class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20"
	>
		<AlertTriangle class="h-8 w-8 text-red-600 dark:text-red-400" aria-hidden="true" />
	</div>
	<h1 class="text-foreground mb-2 text-lg font-semibold">
		{#if status === 404}
			Page not found
		{:else}
			Something went wrong
		{/if}
	</h1>
	<p class="text-muted-foreground mb-6 max-w-md text-sm">{message}</p>
	<div class="flex flex-wrap items-center justify-center gap-3">
		<Button.Root variant="outline" onclick={handleBack}>
			<ArrowLeft class="mr-2 h-4 w-4" aria-hidden="true" />
			Go back
		</Button.Root>
		<Button.Root onclick={handleHome}>
			<Home class="mr-2 h-4 w-4" aria-hidden="true" />
			Home
		</Button.Root>
	</div>
</div>
