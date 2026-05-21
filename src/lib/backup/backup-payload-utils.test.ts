import { describe, expect, it } from 'vitest';
import { backupPayloadHasUserData } from './backup-payload-utils';

describe('backupPayloadHasUserData', () => {
	it('detects v2 backups with accounts', () => {
		expect(
			backupPayloadHasUserData({
				version: '2.0',
				exportDate: '2026-01-01T00:00:00.000Z',
				tables: { accounts: [{ id: 'a1' }], transactions: [] }
			})
		).toBe(true);
	});

	it('rejects empty v2 backups', () => {
		expect(
			backupPayloadHasUserData({
				version: '2.0',
				exportDate: '2026-01-01T00:00:00.000Z',
				tables: { accounts: [], transactions: [] }
			})
		).toBe(false);
	});
});
