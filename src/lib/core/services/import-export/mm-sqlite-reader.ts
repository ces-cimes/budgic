/**
 * Money Manager SQLite reader — opens MM backup files in-browser and converts
 * tables to the CSVFile map shape used by MoneyManagerImporter.
 */

import type { CSVFile, DetectedSchema } from './types';
import {
	getMoneyManagerTableNames,
	inspectSchemaFromTableNames,
	type MoneyManagerImportFormat
} from './schema-inspector';

/** Warn when file exceeds this size (bytes). */
export const MM_SQLITE_FILE_SIZE_WARN_BYTES = 50 * 1024 * 1024;

/** Warn when INOUTCOME row count exceeds this threshold. */
export const MM_SQLITE_INOUTCOME_ROW_WARN = 50_000;

const MM_SQLITE_FORMAT: MoneyManagerImportFormat = 'money-manager-sqlite';

type Sqlite3Module = {
	oo1: {
		DB: new () => SqliteDb;
	};
	capi: {
		sqlite3_deserialize: (
			dbPointer: unknown,
			schema: string,
			ptr: number,
			size: number,
			bufSize: number,
			flags: number
		) => number;
	};
	wasm: {
		allocFromTypedArray: (bytes: Uint8Array) => number;
		dealloc: (ptr: number) => void;
	};
};

export type SqliteDb = {
	pointer: unknown;
	checkRc: (rc: number) => void;
	close: () => void;
	onclose?: { after?: () => void };
	exec: (sql: string | string[]) => void;
	selectArrays: (sql: string, bind?: unknown) => unknown[][];
	selectObjects: (sql: string, bind?: unknown) => Record<string, unknown>[];
};

let sqlite3ModulePromise: Promise<Sqlite3Module> | null = null;

async function getSqlite3Module(): Promise<Sqlite3Module> {
	if (!sqlite3ModulePromise) {
		sqlite3ModulePromise = (async () => {
			const mod = await import('@sqlite.org/sqlite-wasm');
			const isNode = typeof process !== 'undefined' && typeof process.versions?.node === 'string';

			if (isNode) {
				const { readFileSync } = await import('node:fs');
				const { join } = await import('node:path');
				const wasmPath = join(
					process.cwd(),
					'node_modules/@sqlite.org/sqlite-wasm/sqlite-wasm/jswasm/sqlite3.wasm'
				);
				const wasmBinary = readFileSync(wasmPath);
				return mod.default({
					instantiateWasm: (
						imports: WebAssembly.Imports,
						receiveInstance: (instance: WebAssembly.Instance) => void
					) => {
						void WebAssembly.instantiate(wasmBinary, imports).then((result) => {
							receiveInstance(result.instance);
						});
						return {};
					}
				} as Parameters<typeof mod.default>[0]) as Promise<Sqlite3Module>;
			}

			const wasmUrl = (await import('@sqlite.org/sqlite-wasm/sqlite3.wasm?url')).default;
			return mod.default({
				locateFile: (file: string) => (file.endsWith('.wasm') ? wasmUrl : file)
			}) as Promise<Sqlite3Module>;
		})();
	}
	return sqlite3ModulePromise;
}

function isSqliteExtension(name: string): boolean {
	const lower = name.toLowerCase();
	return lower.endsWith('.sqlite') || lower.endsWith('.db') || lower.endsWith('.sqlite3');
}

/**
 * Whether a file looks like a SQLite database by extension.
 */
export function isSqliteDatabaseFile(file: File): boolean {
	return isSqliteExtension(file.name);
}

/**
 * Open an on-disk Money Manager backup as an in-memory SQLite database (read-only use).
 */
export async function openMoneyManagerSqlite(file: File): Promise<{
	sqlite3: Sqlite3Module;
	db: SqliteDb;
}> {
	const sqlite3 = await getSqlite3Module();
	const bytes = new Uint8Array(await file.arrayBuffer());
	const db = new sqlite3.oo1.DB();
	const p = sqlite3.wasm.allocFromTypedArray(bytes);
	db.onclose = {
		after: () => {
			sqlite3.wasm.dealloc(p);
		}
	};
	const rc = sqlite3.capi.sqlite3_deserialize(db.pointer, 'main', p, bytes.length, bytes.length, 0);
	db.checkRc(rc);
	return { sqlite3, db };
}

/**
 * Close a database opened via {@link openMoneyManagerSqlite}.
 */
export function closeSqlite(db: SqliteDb): void {
	try {
		db.close();
	} catch {
		// already closed
	}
}

function listTableNames(db: SqliteDb): string[] {
	const rows = db.selectArrays(
		"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
	);
	return rows.map((row) => String(row[0] ?? '')).filter(Boolean);
}

/**
 * Fingerprint SQLite schema for Money Manager tables.
 */
export function fingerprintMoneyManagerSqlite(db: SqliteDb): DetectedSchema {
	const tableNames = listTableNames(db);
	return inspectSchemaFromTableNames(tableNames, MM_SQLITE_FORMAT);
}

function coerceCell(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (value instanceof Uint8Array || value instanceof ArrayBuffer) return '';
	if (typeof value === 'bigint') return value.toString();
	if (typeof value === 'boolean') return value ? '1' : '0';
	return String(value);
}

function getTableColumns(db: SqliteDb, tableName: string): string[] {
	const rows = db.selectArrays(`PRAGMA table_info(${tableName})`);
	return rows.map((row) => String(row[1] ?? '')).filter(Boolean);
}

function tableExists(db: SqliteDb, tableName: string): boolean {
	const rows = db.selectArrays(
		"SELECT 1 FROM sqlite_master WHERE type='table' AND upper(name)=upper(?)",
		[tableName]
	);
	return rows.length > 0;
}

/**
 * Extract MM tables present in the DB into CSVFile map (keys = uppercase table names).
 */
export function extractMoneyManagerCsvFiles(db: SqliteDb): Map<string, CSVFile> {
	const csvFiles = new Map<string, CSVFile>();
	const present = new Set(listTableNames(db).map((n) => n.toUpperCase()));

	for (const tableName of getMoneyManagerTableNames()) {
		if (!present.has(tableName)) continue;
		if (!tableExists(db, tableName)) continue;

		const headers = getTableColumns(db, tableName);
		const objects = db.selectObjects(`SELECT * FROM ${tableName}`);
		const rows: Record<string, string>[] = objects.map((obj) => {
			const row: Record<string, string> = {};
			for (const header of headers) {
				row[header] = coerceCell(obj[header]);
			}
			return row;
		});

		csvFiles.set(tableName, {
			name: tableName,
			headers,
			rows,
			rowCount: rows.length
		});
	}

	return csvFiles;
}

/**
 * Non-blocking warnings for large imports (file size / transaction count).
 */
export function getLargeImportWarnings(file: File, db: SqliteDb): string[] {
	const warnings: string[] = [];

	if (file.size > MM_SQLITE_FILE_SIZE_WARN_BYTES) {
		const mb = (file.size / (1024 * 1024)).toFixed(1);
		warnings.push(
			`Database file is large (${mb} MB). Import may use significant memory and take longer.`
		);
	}

	if (tableExists(db, 'INOUTCOME')) {
		const countRows = db.selectArrays('SELECT COUNT(*) AS c FROM INOUTCOME');
		const count = Number(countRows[0]?.[0] ?? 0);
		if (count > MM_SQLITE_INOUTCOME_ROW_WARN) {
			warnings.push(
				`INOUTCOME has ${count.toLocaleString()} rows (over ${MM_SQLITE_INOUTCOME_ROW_WARN.toLocaleString()}). Import may be slow.`
			);
		}
	}

	return warnings;
}

/**
 * Open file, fingerprint, extract CSV map, and return warnings. Caller must close db in finally.
 */
export async function readMoneyManagerSqliteFile(file: File): Promise<{
	db: SqliteDb;
	schema: DetectedSchema;
	csvFiles: Map<string, CSVFile>;
	warnings: string[];
}> {
	const { db } = await openMoneyManagerSqlite(file);
	const schema = fingerprintMoneyManagerSqlite(db);
	const warnings = getLargeImportWarnings(file, db);
	const csvFiles = schema.isValid ? extractMoneyManagerCsvFiles(db) : new Map();
	return { db, schema, csvFiles, warnings };
}
