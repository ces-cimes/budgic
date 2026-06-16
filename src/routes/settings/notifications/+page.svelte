<script lang="ts">
	import { goto } from '$app/navigation';
	import { PageLayout } from '$lib/components/layouts';
	import Header from '$lib/components/Header.svelte';
	import { Bell } from '@lucide/svelte';
</script>

<svelte:head>
	<title>Notifications | Budgic</title>
</svelte:head>

<PageLayout>
	{#snippet topBar()}
		<Header
			title="Notifications"
			backButtonLabel="Back to settings"
			backButtonLink="/settings"
		/>
	{/snippet}

	<div class="mx-auto max-w-2xl px-4 py-6">
		<div
			class="border-border rounded-2xl border bg-[var(--color-bg-tertiary)] p-12 text-center"
		>
			<div
				class="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-[var(--color-amber-subtle)]"
			>
				<Bell class="size-6 text-[var(--color-amber)]" />
			</div>
			<p class="mb-1 text-sm font-medium text-[var(--color-text-primary)]">Coming soon</p>
			<p class="text-xs text-[var(--color-text-tertiary)]">
				Notification preferences will be configurable in a future update.
			</p>
		</div>
	</div>
</PageLayout>
