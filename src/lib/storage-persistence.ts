export type StoragePersistenceState = {
	persisted: boolean;
	isStandalone: boolean;
};

export function isStandaloneDisplayMode(): boolean {
	if (typeof window === 'undefined') {
		return false;
	}
	const iosStandalone =
		'standalone' in navigator &&
		(navigator as Navigator & { standalone?: boolean }).standalone === true;
	return window.matchMedia('(display-mode: standalone)').matches || iosStandalone;
}

/** Request durable IndexedDB storage where the browser supports it. */
export async function requestStoragePersistence(): Promise<StoragePersistenceState> {
	const isStandalone = isStandaloneDisplayMode();
	let persisted = false;

	if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
		try {
			persisted = await navigator.storage.persist();
		} catch {
			persisted = false;
		}
	}

	return { persisted, isStandalone };
}
