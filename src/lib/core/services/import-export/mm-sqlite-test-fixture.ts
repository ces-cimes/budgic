/**
 * Build minimal Money Manager–shaped SQLite DB for tests (in-memory via wasm).
 */

import type { SqliteDb } from './mm-sqlite-reader';

async function initSqliteForTests() {
	const init = (await import('@sqlite.org/sqlite-wasm')).default;
	const isNode = typeof process !== 'undefined' && typeof process.versions?.node === 'string';

	if (isNode) {
		const { readFileSync } = await import('node:fs');
		const { join } = await import('node:path');
		const wasmBinary = readFileSync(
			join(
				process.cwd(),
				'node_modules/@sqlite.org/sqlite-wasm/sqlite-wasm/jswasm/sqlite3.wasm'
			)
		);
		return init({
			instantiateWasm: (
				imports: WebAssembly.Imports,
				receiveInstance: (instance: WebAssembly.Instance) => void
			) => {
				void WebAssembly.instantiate(wasmBinary, imports).then((result) => {
					receiveInstance(result.instance);
				});
				return {};
			}
		} as Parameters<typeof init>[0]);
	}

	const wasmUrl = (await import('@sqlite.org/sqlite-wasm/sqlite3.wasm?url')).default;
	return init({
		locateFile: (file: string) => (file.endsWith('.wasm') ? wasmUrl : file)
	});
}

type Sqlite3Static = Awaited<ReturnType<typeof initSqliteForTests>>;

export async function createMinimalMmSqliteDb(): Promise<{ db: SqliteDb; sqlite3: Sqlite3Static }> {
	const sqlite3 = await initSqliteForTests();
	const db = new sqlite3.oo1.DB() as SqliteDb;

	db.exec(`
		CREATE TABLE ASSETS (uid TEXT, NIC_NAME TEXT, currencyUid TEXT, account_type TEXT, IS_DEL TEXT);
		CREATE TABLE ZCATEGORY (uid TEXT, NAME TEXT, TYPE TEXT, IS_DEL TEXT);
		CREATE TABLE INOUTCOME (uid TEXT, DO_TYPE TEXT, amount TEXT, assetUid TEXT, categoryUid TEXT, IS_DEL TEXT);
		CREATE TABLE CURRENCY (uid TEXT, ISO TEXT, NAME TEXT, IS_DEL TEXT, IS_SHOW TEXT, MODIFY_DATE TEXT);
		INSERT INTO ASSETS VALUES ('a1', 'Checking', 'USD_USD', '1', '0');
		INSERT INTO ZCATEGORY VALUES ('c1', 'Food', '0', '0');
		INSERT INTO INOUTCOME VALUES ('t1', '0', '-10.5', 'a1', 'c1', '0');
		INSERT INTO CURRENCY VALUES ('USD_USD', 'USD', 'US Dollar', '0', '1', '1609459200000');
	`);

	return { db, sqlite3 };
}

/** Serialize in-memory DB to bytes (for file-based detector tests). */
export function exportSqliteDbBytes(db: SqliteDb, sqlite3: Sqlite3Static): Uint8Array {
	return sqlite3.capi.sqlite3_js_db_export(db.pointer as number) as Uint8Array;
}
