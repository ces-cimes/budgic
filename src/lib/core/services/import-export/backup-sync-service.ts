import { apiFetch, apiFetchJson, ApiError } from '$lib/api-client';
import { db } from '$lib/core/db';
import { userService } from '$lib/core/services/core/user-service';
import { devLog } from '$lib/utils/dev-log';
import { BACKUP_TABLE_NAMES } from './budgic-backup-service';
import {
	backupHasUserData,
	exportFullBackup,
	importFullBackup,
	isLocalDatabaseEmpty,
	type BudgicBackup
} from './budgic-backup-service';

const DEBOUNCE_MS = 30_000;
const LAST_BACKUP_KEY = 'budgic_last_server_backup_at';
const DECLINED_RESTORE_KEY = 'budgic_server_restore_declined';
const RESTORE_OFFER_IN_PROGRESS_KEY = 'budgic_restore_offer_in_progress';
const POST_RESTORE_RELOAD_KEY = 'budgic_post_restore_reload';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let syncInFlight = false;
let restoreStartupOnce: Promise<boolean> | null = null;
let backupHooksRegistered = false;
let backupSyncCleanup: (() => void) | null = null;

export function getLastServerBackupAt(): string | null {
	if (typeof localStorage === 'undefined') {
		return null;
	}
	return localStorage.getItem(LAST_BACKUP_KEY);
}

function setLastServerBackupAt(iso: string): void {
	localStorage.setItem(LAST_BACKUP_KEY, iso);
}

export function hasDeclinedServerRestore(): boolean {
	if (typeof localStorage === 'undefined') {
		return false;
	}
	return localStorage.getItem(DECLINED_RESTORE_KEY) === '1';
}

function setDeclinedServerRestore(): void {
	if (typeof localStorage === 'undefined') {
		return;
	}
	localStorage.setItem(DECLINED_RESTORE_KEY, '1');
}

/** Clears auto-restore decline so startup can offer server restore again. */
export function clearServerRestoreDeclined(): void {
	if (typeof localStorage === 'undefined') {
		return;
	}
	localStorage.removeItem(DECLINED_RESTORE_KEY);
}

/**
 * Resets all auto-restore prompt guards (e.g. after intentional full local wipe).
 * Call before reload so startup can offer server restore again.
 */
export function resetAutoRestorePromptState(): void {
	clearServerRestoreDeclined();
	clearRestoreOfferInProgress();
	if (typeof sessionStorage !== 'undefined') {
		sessionStorage.removeItem(POST_RESTORE_RELOAD_KEY);
	}
	restoreStartupOnce = null;
}

function clearRestoreOfferInProgress(): void {
	if (typeof sessionStorage === 'undefined') {
		return;
	}
	sessionStorage.removeItem(RESTORE_OFFER_IN_PROGRESS_KEY);
}

function markRestoreOfferInProgress(): void {
	if (typeof sessionStorage === 'undefined') {
		return;
	}
	sessionStorage.setItem(RESTORE_OFFER_IN_PROGRESS_KEY, '1');
}

/** Page was reloaded while the restore confirm dialog was open — treat as declined. */
function consumeInterruptedRestoreOffer(): boolean {
	if (typeof sessionStorage === 'undefined') {
		return false;
	}
	if (sessionStorage.getItem(RESTORE_OFFER_IN_PROGRESS_KEY) !== '1') {
		return false;
	}
	clearRestoreOfferInProgress();
	setDeclinedServerRestore();
	return true;
}

/** Reload at most once per session after a successful restore (prevents reload loops). */
export function reloadPageAfterRestoreIfNeeded(): void {
	if (typeof sessionStorage === 'undefined') {
		window.location.reload();
		return;
	}
	if (sessionStorage.getItem(POST_RESTORE_RELOAD_KEY) === '1') {
		return;
	}
	sessionStorage.setItem(POST_RESTORE_RELOAD_KEY, '1');
	window.location.reload();
}

function registerBackupTableHooksOnce(): void {
	if (backupHooksRegistered || typeof window === 'undefined') {
		return;
	}
	backupHooksRegistered = true;
	const backupTables = new Set<string>(BACKUP_TABLE_NAMES);
	for (const table of db.tables) {
		if (!backupTables.has(table.name)) {
			continue;
		}
		table.hook('creating', () => scheduleBackupPush());
		table.hook('updating', () => scheduleBackupPush());
		table.hook('deleting', () => scheduleBackupPush());
	}
}

/** Register debounced backup hooks and visibility listener once per app lifetime. */
export function initBackupSyncOnce(): void {
	if (typeof window === 'undefined') {
		return;
	}
	registerBackupTableHooksOnce();
	if (!backupSyncCleanup) {
		backupSyncCleanup = startBackupSyncListeners();
	}
}

export function stopBackupSync(): void {
	backupSyncCleanup?.();
	backupSyncCleanup = null;
}

/** @internal Resets module singletons between vitest cases. */
export function resetBackupSyncStateForTests(): void {
	restoreStartupOnce = null;
	backupHooksRegistered = false;
	stopBackupSync();
	if (debounceTimer) {
		clearTimeout(debounceTimer);
		debounceTimer = null;
	}
	syncInFlight = false;
}

export async function isServerBackupEnabled(): Promise<boolean> {
	try {
		const prefs = await userService.getUserPreferences();
		return prefs?.backupEnabled ?? true;
	} catch {
		// Prefs may not exist yet on first run; default to offering restore.
		return true;
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
	if (await isLocalDatabaseEmpty()) {
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

type BackupNotFoundBody = {
	error?: string;
	message?: string;
	diagnostics?: {
		backupDir?: string;
		filesScanned?: number;
		maxAccounts?: number;
		maxTransactions?: number;
	};
};

export async function fetchLatestServerBackup(): Promise<BudgicBackup | null> {
	try {
		return await apiFetchJson<BudgicBackup>('/api/backup/latest');
	} catch (err) {
		if (err instanceof ApiError && err.status === 404) {
			const body = err.details as BackupNotFoundBody | undefined;
			const diag = body?.diagnostics;
			if (diag && diag.filesScanned && diag.filesScanned > 0) {
				devLog(
					`[backup] restore skipped: ${diag.filesScanned} file(s) in ${diag.backupDir ?? 'BACKUP_DIR'} but max accounts=${diag.maxAccounts ?? 0}, transactions=${diag.maxTransactions ?? 0}. Financial data was never backed up — use Data → Import or a local JSON export.`
				);
			} else {
				devLog('[backup] restore skipped: no backup files on server');
			}
			return null;
		}
		if (err instanceof ApiError && err.status === 401) {
			devLog(
				'[backup] restore skipped: device not allowed — copy Device ID from Settings and add to ALLOWED_DEVICE_IDS'
			);
			return null;
		}
		throw err;
	}
}

async function runRestoreFromServerIfEmpty(confirm: () => boolean): Promise<boolean> {
	if (consumeInterruptedRestoreOffer()) {
		devLog('[backup] restore skipped: previous restore dialog was interrupted');
		return false;
	}
	if (hasDeclinedServerRestore()) {
		devLog('[backup] restore skipped: previously declined');
		return false;
	}
	if (!(await isServerBackupEnabled())) {
		devLog('[backup] restore skipped: backup disabled in preferences');
		return false;
	}
	if (!(await isLocalDatabaseEmpty())) {
		if (typeof sessionStorage !== 'undefined') {
			sessionStorage.removeItem(POST_RESTORE_RELOAD_KEY);
		}
		return false;
	}
	const remote = await fetchLatestServerBackup();
	if (!remote) {
		return false;
	}
	if (!backupHasUserData(remote)) {
		devLog('[backup] restore skipped: server backup has no accounts or transactions');
		return false;
	}

	markRestoreOfferInProgress();
	let accepted = false;
	try {
		accepted = confirm();
	} finally {
		clearRestoreOfferInProgress();
	}

	if (!accepted) {
		setDeclinedServerRestore();
		return false;
	}

	await importFullBackup(remote);
	if (await isLocalDatabaseEmpty()) {
		setDeclinedServerRestore();
		return false;
	}
	clearServerRestoreDeclined();
	return true;
}

/** If local DB is empty but server has a backup, import it (with confirmation in UI). */
export async function restoreFromServerIfEmpty(confirm: () => boolean): Promise<boolean> {
	restoreStartupOnce ??= runRestoreFromServerIfEmpty(confirm);
	return restoreStartupOnce;
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
