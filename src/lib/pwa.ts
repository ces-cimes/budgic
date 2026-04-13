// PWA Service Worker Registration
export function registerServiceWorker() {
	if ('serviceWorker' in navigator) {
		window.addEventListener('load', () => {
			navigator.serviceWorker
				.register('/sw.js')
				.then((registration) => {
					console.log('SW registered: ', registration);
				})
				.catch((registrationError) => {
					console.log('SW registration failed: ', registrationError);
				});
		});
	}
}

// Install prompt handling
export function handleInstallPrompt() {
	let deferredPrompt: any;

	window.addEventListener('beforeinstallprompt', (e) => {
		// Prevent Chrome 67 and earlier from automatically showing the prompt
		e.preventDefault();
		// Stash the event so it can be triggered later
		deferredPrompt = e;

		// Show install button or notification
		showInstallPrompt();
	});

	function showInstallPrompt() {
		// You can show a custom install button here
		console.log('App can be installed');
	}

	return {
		installApp: () => {
			if (deferredPrompt) {
				deferredPrompt.prompt();
				deferredPrompt.userChoice.then((choiceResult: any) => {
					if (choiceResult.outcome === 'accepted') {
						console.log('User accepted the install prompt');
					} else {
						console.log('User dismissed the install prompt');
					}
					deferredPrompt = null;
				});
			}
		}
	};
}

// Offline status detection
export function handleOfflineStatus() {
	const updateOnlineStatus = () => {
		if (navigator.onLine) {
			console.log('App is online');
			// Handle online status
		} else {
			console.log('App is offline');
			// Handle offline status
		}
	};

	window.addEventListener('online', updateOnlineStatus);
	window.addEventListener('offline', updateOnlineStatus);

	// Initial check
	updateOnlineStatus();
}
