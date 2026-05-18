import { describe, expect, it } from 'vitest';
import { detectImportSource } from './import-source-detector';
import { createMinimalMmSqliteDb, exportSqliteDbBytes } from './mm-sqlite-test-fixture';
import { closeSqlite } from './mm-sqlite-reader';

function file(name: string, content: string | Blob, type?: string): File {
	return new File([content], name, { type });
}

describe('import-source-detector', () => {
	it('detects Budgic JSON backup', async () => {
		const json = file(
			'backup.json',
			JSON.stringify({ version: '1.0', exportDate: '2026-01-01T00:00:00.000Z' }),
			'application/json'
		);
		const result = await detectImportSource([json]);
		expect(result.kind).toBe('budgic-json');
	});

	it('detects Money Manager CSV bundle', async () => {
		const files = [
			file('ASSETS.csv', 'uid,NIC_NAME\na1,Test'),
			file('ZCATEGORY.csv', 'uid,NAME\n'),
			file('INOUTCOME.csv', 'uid,DO_TYPE\n'),
			file('CURRENCY.csv', 'uid,ISO\n')
		];
		const result = await detectImportSource(files);
		expect(result.kind).toBe('money-manager-csv');
		if (result.kind === 'money-manager-csv') {
			expect(result.schema.isValid).toBe(true);
			expect(result.csvFiles.has('ASSETS')).toBe(true);
		}
	});

	it('rejects mixed JSON and CSV', async () => {
		const files = [
			file('backup.json', JSON.stringify({ version: '1', exportDate: 'x' })),
			file('ASSETS.csv', 'uid\n')
		];
		const result = await detectImportSource(files);
		expect(result.kind).toBe('unsupported');
	});

	it('detects Money Manager sqlite file', async () => {
		const { db, sqlite3 } = await createMinimalMmSqliteDb();
		const bytes = exportSqliteDbBytes(db, sqlite3);
		closeSqlite(db);

		const sqliteFile = file('mm.sqlite', new Blob([new Uint8Array(bytes)]));
		const result = await detectImportSource([sqliteFile]);
		expect(result.kind).toBe('money-manager-sqlite');
		if (result.kind === 'money-manager-sqlite') {
			expect(result.schema.isValid).toBe(true);
			closeSqlite(result.db);
		}
	});
});
