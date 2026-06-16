<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	let isOnline = $state(true);
	let showIndicator = $state(false);

	onMount(() => {
		if (!browser) return;

		// Set initial online status
		isOnline = navigator.onLine;
		showIndicator = !isOnline;

		// Listen for online/offline events
		const handleOnline = () => {
			isOnline = true;
			showIndicator = false;
		};

		const handleOffline = () => {
			isOnline = false;
			showIndicator = true;
		};

		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);

		// Auto-hide indicator after 3 seconds when coming back online
		let hideTimeout: ReturnType<typeof setTimeout>;
		const handleOnlineWithDelay = () => {
			isOnline = true;
			showIndicator = true;

			clearTimeout(hideTimeout);
			hideTimeout = setTimeout(() => {
				showIndicator = false;
			}, 3000);
		};

		window.addEventListener('online', handleOnlineWithDelay);

		return () => {
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
			window.removeEventListener('online', handleOnlineWithDelay);
			clearTimeout(hideTimeout);
		};
	});
</script>

{#if showIndicator}
	<div
		class="fixed top-4 left-1/2 z-50 -translate-x-1/2 transform rounded-lg px-4 py-2 shadow-lg transition-all duration-300 {isOnline
			? 'bg-green-500 text-white'
			: 'bg-red-500 text-white'}"
		role="status"
		aria-live="polite"
	>
		<div class="flex items-center space-x-2">
			<div
				class="h-2 w-2 rounded-full {isOnline ? 'bg-white' : 'bg-white'} animate-pulse"
			></div>
			<span class="text-sm font-medium">
				{isOnline ? 'Back Online' : "You're Offline"}
			</span>
			{#if !isOnline}
				<span class="text-xs opacity-90">Data will sync when connection is restored</span>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* Custom animation for the indicator */
	@keyframes slideDown {
		from {
			transform: translate(-50%, -100%);
			opacity: 0;
		}
		to {
			transform: translate(-50%, 0);
			opacity: 1;
		}
	}

	div {
		animation: slideDown 0.3s ease-out;
	}
</style>
