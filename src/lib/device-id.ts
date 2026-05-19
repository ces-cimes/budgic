const STORAGE_KEY = 'budgic_device_id';

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidDeviceId(value: string | null | undefined): value is string {
	return typeof value === 'string' && UUID_RE.test(value);
}

/** Stable per-browser install ID for server backup and API auth. */
export function getDeviceId(): string {
	if (typeof localStorage === 'undefined') {
		throw new Error('Device ID is only available in the browser');
	}
	let id = localStorage.getItem(STORAGE_KEY);
	if (!id || !isValidDeviceId(id)) {
		id = crypto.randomUUID();
		localStorage.setItem(STORAGE_KEY, id);
	}
	return id;
}
