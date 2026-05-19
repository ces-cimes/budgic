const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let cachedAllowlist: Set<string> | null = null;

function parseAllowlist(): Set<string> {
	if (cachedAllowlist) {
		return cachedAllowlist;
	}
	const raw = process.env.ALLOWED_DEVICE_IDS ?? '';
	cachedAllowlist = new Set(
		raw
			.split(',')
			.map((s) => s.trim())
			.filter((s) => UUID_RE.test(s))
	);
	return cachedAllowlist;
}

export function isValidDeviceId(value: string | null | undefined): value is string {
	return typeof value === 'string' && UUID_RE.test(value);
}

export function isDeviceAllowed(deviceId: string | null | undefined): boolean {
	if (process.env.ALLOW_DEVICE_AUTH_BYPASS === 'true') {
		return isValidDeviceId(deviceId);
	}
	if (!isValidDeviceId(deviceId)) {
		return false;
	}
	const allowlist = parseAllowlist();
	if (allowlist.size === 0) {
		return false;
	}
	return allowlist.has(deviceId);
}

export function getBackupDir(): string {
	return process.env.BACKUP_DIR ?? '/var/lib/budgic-app/backups';
}
