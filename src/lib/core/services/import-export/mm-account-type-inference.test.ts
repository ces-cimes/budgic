import { describe, expect, it } from 'vitest';
import type { CSVFile } from './types';
import { buildMmAccountReviewRows, inferMmAccountType } from './mm-account-type-inference';

function csv(name: string, headers: string[], rows: Record<string, string>[]): CSVFile {
	return { name, headers, rows, rowCount: rows.length };
}

describe('inferMmAccountType', () => {
	it('maps numeric account_type', () => {
		expect(inferMmAccountType({ account_type: '2', NIC_NAME: 'Main' }).type).toBe('credit');
		expect(inferMmAccountType({ account_type: '2', NIC_NAME: 'Main' }).sources).toContain(
			'account_type'
		);
	});

	it('falls back to ZDATA when account_type missing', () => {
		expect(inferMmAccountType({ ZDATA: '0', NIC_NAME: 'Petty' }).type).toBe('cash');
		expect(inferMmAccountType({ ZDATA: '0', NIC_NAME: 'Petty' }).sources).toContain('zdata');
	});

	it('name heuristic overrides ZDATA checking for Savings label', () => {
		const r = inferMmAccountType({ ZDATA: '1', NIC_NAME: 'Emergency Savings' });
		expect(r.type).toBe('savings');
		expect(r.sources).toContain('name_heuristic');
	});

	it('maps string account_type labels', () => {
		expect(inferMmAccountType({ account_type: 'savings', NIC_NAME: 'X' }).type).toBe('savings');
	});
});

describe('buildMmAccountReviewRows', () => {
	const assets = csv(
		'ASSETS',
		['uid', 'NIC_NAME', 'ZDATA', 'account_type', 'IS_DEL'],
		[
			{ uid: 'a1', NIC_NAME: 'Main Bank', ZDATA: '1', IS_DEL: '0' },
			{ uid: 'a2', NIC_NAME: 'Anna', ZDATA: '1', IS_DEL: '0' },
			{ uid: 'a3', NIC_NAME: 'Dup', ZDATA: '1', IS_DEL: '0' }
		]
	);

	it('excludes duplicate when conflictResolution is skip', () => {
		const rows = buildMmAccountReviewRows(new Map([['ASSETS', assets]]), {
			existingAccountNames: ['Dup'],
			conflictResolution: 'skip'
		});
		expect(rows.map((r) => r.mmUid)).toEqual(['a1', 'a2']);
	});

	it('renames duplicate when conflictResolution is rename', () => {
		const rows = buildMmAccountReviewRows(new Map([['ASSETS', assets]]), {
			existingAccountNames: ['Dup'],
			conflictResolution: 'rename'
		});
		const dup = rows.find((r) => r.mmUid === 'a3');
		expect(dup?.displayName).toBe('Dup (Imported)');
	});

	it('flags person name candidates', () => {
		const rows = buildMmAccountReviewRows(new Map([['ASSETS', assets]]), {
			existingAccountNames: []
		});
		expect(rows.find((r) => r.mmUid === 'a2')?.personLedgerCandidate).toBe(true);
		expect(rows.find((r) => r.mmUid === 'a1')?.personLedgerCandidate).toBe(false);
	});
});
