import { apiFetch, apiFetchJson, ApiError } from '$lib/api-client';
import { userService } from '$lib/core/services/core/user-service';
import {
	exportFullBackup,
	importFullBackup,
	isLocalDatabaseEmpty,
	type BudgicBackup
} from './budgic-backup-service';

const DEBOUNCE_MS = 30_000;
const LAST_BACKUP_KEY = 'budgic_last_server_backup_at';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let syncInFlight = false;

export function getLastServerBackupAt(): string | null {
	if (typeof localStorage === 'undefined') {
		return null;
	}
	return localStorage.getItem(LAST_BACKUP_KEY);
}

function setLastServerBackupAt(iso: string): void {
	localStorage.setItem(LAST_BACKUP_KEY, iso);
}

export async function isServerBackupEnabled(): Promise<boolean> {
	try {
		const prefs = await userService.getUserPreferences();
		return prefs?.backupEnabled ?? true;
	} catch {
		return false;
	}
}

/** Push full backup to server (no-op when backup disabled or offline). */
export async function pushBackupToServer(): Promise<void> {
	if (typeof window === 'undefined' || !navigator.onLine) {
		return;
	}
	if (!(await isServerBackupEnabled())) {
		return;
	}
	if (syncInFlight) {
		return;
	}

	syncInFlight = true;
	try {
		const payload = await exportFullBackup();
		await apiFetch('/api/backup', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		}).then(async (res) => {
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				throw new ApiError(
					body.error === 'device_not_allowed'
						? 'Device not registered for server backup'
						: `Backup failed (${res.status})`,
					res.status,
					body.error
				);
			}
		});
		setLastServerBackupAt(new Date().toISOString());
	} finally {
		syncInFlight = false;
	}
}

export function scheduleBackupPush(): void {
	if (debounceTimer) {
		clearTimeout(debounceTimer);
	}
	debounceTimer = setTimeout(() => {
		debounceTimer = null;
		void pushBackupToServer();
	}, DEBOUNCE_MS);
}

export async function fetchLatestServerBackup(): Promise<BudgicBackup | null> {
	try {
		return await apiFetchJson<BudgicBackup>('/api/backup/latest');
	} catch (err) {
		if (err instanceof ApiError && err.status === 404) {
			return null;
		}
		throw err;
	}
}

/** If local DB is empty but server has a backup, import it (with confirmation in UI). */
export async function restoreFromServerIfEmpty(confirm: () => boolean): Promise<boolean> {
	if (!(await isLocalDatabaseEmpty())) {
		return false;
	}
	const remote = await fetchLatestServerBackup();
	if (!remote) {
		return false;
	}
	if (!confirm()) {
		return false;
	}
	await importFullBackup(remote);
	return true;
}

export function startBackupSyncListeners(): () => void {
	const onHide = () => {
		if (document.visibilityState === 'hidden') {
			void pushBackupToServer();
		}
	};
	document.addEventListener('visibilitychange', onHide);

	return () => {
		document.removeEventListener('visibilitychange', onHide);
		if (debounceTimer) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}
	};
}
