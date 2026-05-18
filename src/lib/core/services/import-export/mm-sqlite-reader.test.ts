import { afterEach, describe, expect, it } from 'vitest';
import {
	closeSqlite,
	extractMoneyManagerCsvFiles,
	fingerprintMoneyManagerSqlite
} from './mm-sqlite-reader';
import { createMinimalMmSqliteDb } from './mm-sqlite-test-fixture';

describe('mm-sqlite-reader', () => {
	let db: Awaited<ReturnType<typeof createMinimalMmSqliteDb>>['db'] | null = null;

	afterEach(() => {
		if (db) {
			closeSqlite(db);
			db = null;
		}
	});

	it('fingerprints valid Money Manager schema', async () => {
		const opened = await createMinimalMmSqliteDb();
		db = opened.db;
		const schema = fingerprintMoneyManagerSqlite(db);
		expect(schema.isValid).toBe(true);
		expect(schema.format).toBe('money-manager-sqlite');
		expect(schema.missingTables).toEqual([]);
	});

	it('extracts tables as string-valued CSVFile map', async () => {
		const opened = await createMinimalMmSqliteDb();
		db = opened.db;
		const map = extractMoneyManagerCsvFiles(db);
		expect(map.has('ASSETS')).toBe(true);
		expect(map.has('INOUTCOME')).toBe(true);
		const assets = map.get('ASSETS')!;
		expect(assets.headers).toContain('uid');
		expect(assets.rows[0].uid).toBe('a1');
		expect(assets.rows[0].NIC_NAME).toBe('Checking');
		expect(typeof assets.rows[0].amount).toBe('undefined');
		const income = map.get('INOUTCOME')!;
		expect(income.rows[0].amount).toBe('-10.5');
	});
});
