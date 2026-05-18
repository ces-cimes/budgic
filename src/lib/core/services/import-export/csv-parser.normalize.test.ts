import { describe, expect, it } from 'vitest';
import { getMmCsvTable, normalizeMmCsvFileKeys, parseCSV } from './csv-parser';

describe('normalizeMmCsvFileKeys', () => {
	it('uppercases table keys from mixed-case CSV filenames', () => {
		const raw = new Map([
			[
				'assets',
				parseCSV('uid,NIC_NAME\na1,Test', 'assets.csv')
			]
		]);
		const normalized = normalizeMmCsvFileKeys(raw);
		expect(normalized.has('ASSETS')).toBe(true);
		expect(getMmCsvTable(normalized, 'ASSETS')?.rows).toHaveLength(1);
	});

	it('parseCSV strips .CSV extension case-insensitively', () => {
		const file = parseCSV('uid,NIC_NAME\n', 'ASSETS.CSV');
		expect(file.name).toBe('ASSETS');
	});
});
