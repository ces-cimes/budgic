const CACHE_NAME = 'budgic-v2';
const STATIC_CACHE = 'budgic-static-v2';
const DYNAMIC_CACHE = 'budgic-dynamic-v2';

// Core app files that should always be cached
const STATIC_ASSETS = [
	'/',
	'/app.css',
	'/manifest.json',
	'/icon-192.png',
	'/icon-512.png',
	'/favicon.png'
];

// App routes that should be cached
const APP_ROUTES = [
	'/accounts',
	'/transactions',
	'/budget',
	'/goals',
	'/insights',
	'/settings',
	'/onboarding'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
	console.log('Service Worker: Installing...');

	event.waitUntil(
		Promise.all([
			// Cache static assets
			caches.open(STATIC_CACHE).then((cache) => {
				console.log('Service Worker: Caching static assets');
				return cache.addAll(STATIC_ASSETS);
			}),

			// Cache app routes
			caches.open(DYNAMIC_CACHE).then((cache) => {
				console.log('Service Worker: Caching app routes');
				return cache.addAll(APP_ROUTES);
			})
		]).then(() => {
			console.log('Service Worker: Installation complete');
			return self.skipWaiting();
		})
	);
});

// Activate event - clean up old caches and take control
self.addEventListener('activate', (event) => {
	console.log('Service Worker: Activating...');

	event.waitUntil(
		caches
			.keys()
			.then((cacheNames) => {
				return Promise.all(
					cacheNames.map((cacheName) => {
						if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
							console.log('Service Worker: Deleting old cache:', cacheName);
							return caches.delete(cacheName);
						}
					})
				);
			})
			.then(() => {
				console.log('Service Worker: Activation complete');
				return self.clients.claim();
			})
	);
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
	const { request } = event;
	const url = new URL(request.url);

	// Skip non-GET requests
	if (request.method !== 'GET') {
		return;
	}

	// Skip external requests
	if (url.origin !== self.location.origin) {
		return;
	}

	// Handle different types of requests
	if (isStaticAsset(request)) {
		// Static assets: cache first, then network
		event.respondWith(cacheFirst(request, STATIC_CACHE));
	} else if (isAppRoute(request)) {
		// App routes: network first, then cache
		event.respondWith(networkFirst(request, DYNAMIC_CACHE));
	} else {
		// Other requests: network first, then cache
		event.respondWith(networkFirst(request, DYNAMIC_CACHE));
	}
});

// Cache first strategy for static assets
async function cacheFirst(request, cacheName) {
	try {
		const cachedResponse = await caches.match(request);
		if (cachedResponse) {
			return cachedResponse;
		}

		const networkResponse = await fetch(request);
		if (networkResponse.ok) {
			const cache = await caches.open(cacheName);
			cache.put(request, networkResponse.clone());
		}

		return networkResponse;
	} catch (error) {
		console.log('Cache first failed:', error);
		return new Response('Offline - Static asset not available', { status: 503 });
	}
}

// Network first strategy for dynamic content
async function networkFirst(request, cacheName) {
	try {
		const networkResponse = await fetch(request);
		if (networkResponse.ok) {
			const cache = await caches.open(cacheName);
			cache.put(request, networkResponse.clone());
		}
		return networkResponse;
	} catch (error) {
		console.log('Network first failed, trying cache:', error);

		const cachedResponse = await caches.match(request);
		if (cachedResponse) {
			return cachedResponse;
		}

		// Return offline page for navigation requests
		if (request.destination === 'document') {
			return caches.match('/');
		}

		return new Response('Offline - Content not available', { status: 503 });
	}
}

// Check if request is for a static asset
function isStaticAsset(request) {
	const url = new URL(request.url);
	return (
		STATIC_ASSETS.includes(url.pathname) ||
		url.pathname.startsWith('/static/') ||
		url.pathname.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)
	);
}

// Check if request is for an app route
function isAppRoute(request) {
	const url = new URL(request.url);
	return (
		APP_ROUTES.includes(url.pathname) ||
		url.pathname.startsWith('/accounts/') ||
		url.pathname.startsWith('/transactions/') ||
		url.pathname.startsWith('/budget/') ||
		url.pathname.startsWith('/goals/') ||
		url.pathname.startsWith('/insights/') ||
		url.pathname.startsWith('/settings/')
	);
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
	console.log('Service Worker: Background sync triggered:', event.tag);

	if (event.tag === 'background-sync') {
		event.waitUntil(doBackgroundSync());
	}
});

async function doBackgroundSync() {
	try {
		// Get any pending offline actions from IndexedDB
		// This would be implemented based on your app's offline action queue
		console.log('Service Worker: Processing background sync');

		// Example: sync pending transactions, settings changes, etc.
		// const pendingActions = await getPendingActions();
		// await processPendingActions(pendingActions);
	} catch (error) {
		console.error('Background sync failed:', error);
	}
}

// Push notifications (if needed)
self.addEventListener('push', (event) => {
	console.log('Service Worker: Push notification received');

	const options = {
		body: event.data ? event.data.text() : 'New notification from Budgic',
		icon: '/icon-192.png',
		badge: '/icon-192.png',
		vibrate: [100, 50, 100],
		data: {
			dateOfArrival: Date.now(),
			primaryKey: 1
		},
		actions: [
			{
				action: 'explore',
				title: 'View Details',
				icon: '/icon-192.png'
			},
			{
				action: 'close',
				title: 'Close',
				icon: '/icon-192.png'
			}
		]
	};

	event.waitUntil(self.registration.showNotification('Budgic', options));
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
	console.log('Service Worker: Notification clicked');

	event.notification.close();

	if (event.action === 'explore') {
		event.waitUntil(clients.openWindow('/'));
	}
});
