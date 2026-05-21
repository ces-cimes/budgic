import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findNewestBackupInBackupDir, readLatestBackupWithFallback } from './backup-read';

const DEVICE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DEVICE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function backupJson(exportDate: string, withUserData: boolean): string {
	return JSON.stringify({
		version: '2.0',
		exportDate,
		tables: {
			accounts: withUserData ? [{ id: 'acct-1' }] : [],
			transactions: []
		}
	});
}

describe('backup-read', () => {
	const env = process.env;
	let backupRoot = '';

	beforeEach(async () => {
		process.env = { ...env };
		backupRoot = join(tmpdir(), `budgic-backup-test-${Date.now()}`);
		process.env.BACKUP_DIR = backupRoot;
		await mkdir(backupRoot, { recursive: true });
	});

	afterEach(() => {
		process.env = env;
	});

	it('returns own device backup when present', async () => {
		const dir = join(backupRoot, DEVICE_A);
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, 'latest.json'), backupJson('2026-01-01T00:00:00.000Z', true));

		const result = await readLatestBackupWithFallback(DEVICE_A);

		expect(result?.sourceDeviceId).toBe(DEVICE_A);
		expect(result?.sourceFile).toBe('latest.json');
		expect(result?.fallback).toBe(false);
	});

	it('prefers versioned backup with user data over empty latest.json', async () => {
		const dir = join(backupRoot, DEVICE_A);
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, 'latest.json'), backupJson('2026-03-01T00:00:00.000Z', false));
		await new Promise((r) => setTimeout(r, 5));
		await writeFile(
			join(dir, '2026-02-01T00-00-00-000Z.json'),
			backupJson('2026-02-01T00:00:00.000Z', true)
		);

		const result = await readLatestBackupWithFallback(DEVICE_A);

		expect(result?.sourceFile).toBe('2026-02-01T00-00-00-000Z.json');
		expect(result?.sourceDeviceId).toBe(DEVICE_A);
	});

	it('falls back to newest backup with user data from another device folder', async () => {
		const dirA = join(backupRoot, DEVICE_A);
		const dirB = join(backupRoot, DEVICE_B);
		await mkdir(dirA, { recursive: true });
		await mkdir(dirB, { recursive: true });
		await writeFile(join(dirA, 'latest.json'), backupJson('2026-01-01T00:00:00.000Z', true));
		await new Promise((r) => setTimeout(r, 5));
		await writeFile(join(dirB, 'latest.json'), backupJson('2026-02-01T00:00:00.000Z', true));

		const newDevice = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
		const result = await readLatestBackupWithFallback(newDevice);

		expect(result?.sourceDeviceId).toBe(DEVICE_B);
		expect(result?.fallback).toBe(true);
	});

	it('returns null when only empty backups exist', async () => {
		const dir = join(backupRoot, DEVICE_A);
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, 'latest.json'), backupJson('2026-01-01T00:00:00.000Z', false));

		const result = await readLatestBackupWithFallback(DEVICE_A);
		expect(result).toBeNull();
	});

	it('returns null when no backups exist', async () => {
		const result = await findNewestBackupInBackupDir();
		expect(result).toBeNull();
	});
});
