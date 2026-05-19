// Offline status detection (service worker handled by @vite-pwa/sveltekit when BUILD_TARGET is pwa)

export function handleOfflineStatus(): void {
	const updateOnlineStatus = () => {
		if (navigator.onLine) {
			// online
		} else {
			// offline
		}
	};

	window.addEventListener('online', updateOnlineStatus);
	window.addEventListener('offline', updateOnlineStatus);
	updateOnlineStatus();
}
