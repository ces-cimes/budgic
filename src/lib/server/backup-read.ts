import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { backupPayloadCounts, backupPayloadHasUserData } from '$lib/backup/backup-payload-utils';
import { getBackupDir } from '$lib/server/device-auth';

export type BackupDirDiagnostics = {
	backupDir: string;
	filesScanned: number;
	maxAccounts: number;
	maxTransactions: number;
};

/** Summarize on-disk backups (for 404 diagnostics). */
export async function getBackupDirDiagnostics(): Promise<BackupDirDiagnostics> {
	const root = getBackupDir();
	let filesScanned = 0;
	let maxAccounts = 0;
	let maxTransactions = 0;

	let deviceIds: string[];
	try {
		deviceIds = await readdir(root);
	} catch {
		return { backupDir: root, filesScanned: 0, maxAccounts: 0, maxTransactions: 0 };
	}

	for (const deviceId of deviceIds) {
		const deviceDir = join(root, deviceId);
		try {
			const dirStat = await stat(deviceDir);
			if (!dirStat.isDirectory()) {
				continue;
			}
		} catch {
			continue;
		}
		let files: string[];
		try {
			files = await readdir(deviceDir);
		} catch {
			continue;
		}
		for (const name of files) {
			if (!name.endsWith('.json')) {
				continue;
			}
			const scored = await scoreBackupFile(deviceDir, deviceId, name, true);
			if (!scored) {
				continue;
			}
			filesScanned += 1;
			const { accounts, transactions } = backupPayloadCounts(scored.data);
			maxAccounts = Math.max(maxAccounts, accounts);
			maxTransactions = Math.max(maxTransactions, transactions);
		}
	}

	return { backupDir: root, filesScanned, maxAccounts, maxTransactions };
}

export type BackupReadResult = {
	data: unknown;
	/** Device folder the backup was read from (may differ from request device after browser wipe). */
	sourceDeviceId: string;
	/** File name within the device folder (e.g. latest.json or a timestamped export). */
	sourceFile: string;
	fallback: boolean;
};

type ScoredBackup = BackupReadResult & { mtimeMs: number; hasUserData: boolean };

async function scoreBackupFile(
	deviceDir: string,
	deviceId: string,
	fileName: string,
	fallback: boolean
): Promise<ScoredBackup | null> {
	const filePath = join(deviceDir, fileName);
	try {
		const fileStat = await stat(filePath);
		const raw = await readFile(filePath, 'utf8');
		const data = JSON.parse(raw) as unknown;
		return {
			data,
			sourceDeviceId: deviceId,
			sourceFile: fileName,
			fallback,
			mtimeMs: fileStat.mtimeMs,
			hasUserData: backupPayloadHasUserData(data)
		};
	} catch (err) {
		const code = (err as NodeJS.ErrnoException)?.code;
		if (code === 'ENOENT') {
			return null;
		}
		throw err;
	}
}

function pickBestBackup(candidates: ScoredBackup[]): ScoredBackup | null {
	if (candidates.length === 0) {
		return null;
	}
	const withUserData = candidates.filter((c) => c.hasUserData);
	const pool = withUserData.length > 0 ? withUserData : candidates;
	return pool.reduce((best, cur) => (cur.mtimeMs > best.mtimeMs ? cur : best));
}

/** Scan all `.json` backups in a device folder; prefer newest file that has accounts/transactions. */
export async function readBestBackupFromDeviceDir(
	deviceDir: string,
	deviceId: string,
	fallback: boolean
): Promise<BackupReadResult | null> {
	let entries: string[];
	try {
		entries = await readdir(deviceDir);
	} catch (err) {
		const code = (err as NodeJS.ErrnoException)?.code;
		if (code === 'ENOENT') {
			return null;
		}
		throw err;
	}

	const candidates: ScoredBackup[] = [];
	for (const name of entries) {
		if (!name.endsWith('.json')) {
			continue;
		}
		const scored = await scoreBackupFile(deviceDir, deviceId, name, fallback);
		if (scored) {
			candidates.push(scored);
		}
	}

	const best = pickBestBackup(candidates);
	if (!best) {
		return null;
	}

	const { mtimeMs: _mtime, hasUserData: _hasUserData, ...result } = best;
	return result;
}

/**
 * Newest backup with user data under BACKUP_DIR (any device folder).
 * Supports recovery after the user clears site data (new X-Device-Id).
 */
export async function findNewestBackupInBackupDir(): Promise<BackupReadResult | null> {
	const root = getBackupDir();
	let deviceIds: string[];
	try {
		deviceIds = await readdir(root);
	} catch (err) {
		const code = (err as NodeJS.ErrnoException)?.code;
		if (code === 'ENOENT') {
			return null;
		}
		throw err;
	}

	const candidates: ScoredBackup[] = [];

	for (const deviceId of deviceIds) {
		const deviceDir = join(root, deviceId);
		try {
			const dirStat = await stat(deviceDir);
			if (!dirStat.isDirectory()) {
				continue;
			}
		} catch {
			continue;
		}
		let files: string[];
		try {
			files = await readdir(deviceDir);
		} catch {
			continue;
		}
		for (const name of files) {
			if (!name.endsWith('.json')) {
				continue;
			}
			const scored = await scoreBackupFile(deviceDir, deviceId, name, true);
			if (scored) {
				candidates.push(scored);
			}
		}
	}

	const best = pickBestBackup(candidates);
	if (!best) {
		return null;
	}

	const { mtimeMs: _mtime, hasUserData: _hasUserData, ...result } = best;
	return result;
}

/** Read best backup for this device, or the best backup from any device folder. */
export async function readLatestBackupWithFallback(
	deviceId: string
): Promise<BackupReadResult | null> {
	const own = await readBestBackupFromDeviceDir(join(getBackupDir(), deviceId), deviceId, false);
	if (own && backupPayloadHasUserData(own.data)) {
		return own;
	}

	const fromAnyDevice = await findNewestBackupInBackupDir();
	if (fromAnyDevice && backupPayloadHasUserData(fromAnyDevice.data)) {
		return fromAnyDevice;
	}

	return null;
}
