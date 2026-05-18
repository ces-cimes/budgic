/**
 * Detect import source type from user-selected files (Budgic JSON, MM CSV, MM SQLite).
 */

import { readMultipleCSVFiles } from './csv-parser';
import {
	fingerprintMoneyManagerSqlite,
	isSqliteDatabaseFile,
	openMoneyManagerSqlite,
	closeSqlite,
	type SqliteDb
} from './mm-sqlite-reader';
import { inspectSchema } from './schema-inspector';
import type { CSVFile, DetectedSchema } from './types';

export type ImportSourceKind =
	| 'budgic-json'
	| 'money-manager-csv'
	| 'money-manager-sqlite'
	| 'unknown-sqlite'
	| 'unsupported';

export type BudgicJsonDetection = {
	kind: 'budgic-json';
	file: File;
};

export type MoneyManagerCsvDetection = {
	kind: 'money-manager-csv';
	files: File[];
	csvFiles: Map<string, CSVFile>;
	schema: DetectedSchema;
};

export type MoneyManagerSqliteDetection = {
	kind: 'money-manager-sqlite';
	file: File;
	schema: DetectedSchema;
	/** Open DB handle — close after extract or on cancel */
	db: SqliteDb;
};

export type UnknownSqliteDetection = {
	kind: 'unknown-sqlite';
	file: File;
	schema: DetectedSchema;
	/** Hook for future generic SQLite import */
	futureGeneric: true;
	message: string;
	db: SqliteDb;
};

export type UnsupportedDetection = {
	kind: 'unsupported';
	message: string;
};

export type ImportSourceDetection =
	| BudgicJsonDetection
	| MoneyManagerCsvDetection
	| MoneyManagerSqliteDetection
	| UnknownSqliteDetection
	| UnsupportedDetection;

function isJsonFile(file: File): boolean {
	return file.name.toLowerCase().endsWith('.json');
}

function isCsvFile(file: File): boolean {
	return file.name.toLowerCase().endsWith('.csv');
}

async function tryBudgicJson(file: File): Promise<BudgicJsonDetection | null> {
	try {
		const text = await file.text();
		const data = JSON.parse(text) as Record<string, unknown>;
		if (data && typeof data.version !== 'undefined' && typeof data.exportDate === 'string') {
			return { kind: 'budgic-json', file };
		}
	} catch {
		// not budgic json
	}
	return null;
}

/**
 * Classify selected files for import routing on /data.
 */
export async function detectImportSource(files: File[]): Promise<ImportSourceDetection> {
	if (files.length === 0) {
		return { kind: 'unsupported', message: 'No files selected.' };
	}

	if (files.length === 1) {
		const file = files[0];

		if (isJsonFile(file)) {
			const budgic = await tryBudgicJson(file);
			if (budgic) return budgic;
			return {
				kind: 'unsupported',
				message: 'JSON file is not a recognized Budgic backup (missing version or exportDate).'
			};
		}

		if (isSqliteDatabaseFile(file)) {
			let db: SqliteDb;
			try {
				const opened = await openMoneyManagerSqlite(file);
				db = opened.db;
			} catch {
				return {
					kind: 'unsupported',
					message: 'Could not open file as a SQLite database. Check that the file is not corrupted.'
				};
			}

			const schema = fingerprintMoneyManagerSqlite(db);
			if (schema.isValid) {
				return { kind: 'money-manager-sqlite', file, schema, db };
			}

			const missing = schema.missingTables.join(', ');
			return {
				kind: 'unknown-sqlite',
				file,
				schema,
				futureGeneric: true,
				message: `SQLite database is not a recognized Money Manager backup. Missing tables: ${missing}.`,
				db
			};
		}

		return {
			kind: 'unsupported',
			message:
				'Unsupported file type. Supported: Budgic JSON backup, Money Manager CSV export, or Money Manager .sqlite/.db file.'
		};
	}

	const allCsv = files.every(isCsvFile);
	if (allCsv) {
		const csvFiles = await readMultipleCSVFiles(files);
		const schema = inspectSchema(csvFiles, 'money-manager-csv');
		if (schema.isValid) {
			return { kind: 'money-manager-csv', files, csvFiles, schema };
		}
		return {
			kind: 'unsupported',
			message: `CSV export is missing required Money Manager tables: ${schema.missingTables.join(', ')}.`
		};
	}

	const hasSqlite = files.some(isSqliteDatabaseFile);
	const hasJson = files.some(isJsonFile);
	if (hasSqlite || hasJson) {
		return {
			kind: 'unsupported',
			message: 'Select either one database/JSON file, or multiple CSV files only — not a mix.'
		};
	}

	return {
		kind: 'unsupported',
		message: 'All files must be CSV exports from Money Manager.'
	};
}

/**
 * Release SQLite handle from detection (no-op for non-sqlite kinds).
 */
export function releaseImportSourceDetection(detection: ImportSourceDetection | null): void {
	if (!detection) return;
	if (detection.kind === 'money-manager-sqlite' || detection.kind === 'unknown-sqlite') {
		closeSqlite(detection.db);
	}
}
