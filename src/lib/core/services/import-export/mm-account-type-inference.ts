/**
 * Pre-import MM account type inference and review row building.
 */

import type { Account } from '$lib/core/db';
import { isPersonLedgerNameCandidate } from '$lib/utils/person-ledger-heuristics';
import { getMmCsvTable } from './csv-parser';
import { isDeleted, mapAccountType } from './money-manager-mapper';
import type { CSVFile } from './types';

export type MmAccountTypeSource = 'account_type' | 'zdata' | 'name_heuristic';

export interface MmAccountReviewRow {
	mmUid: string;
	displayName: string;
	suggestedType: Account['type'];
	sources: MmAccountTypeSource[];
	personLedgerCandidate: boolean;
	mmAccountTypeRaw?: string;
	mmZdataRaw?: string;
}

export interface BuildMmAccountReviewRowsOptions {
	existingAccountNames: Iterable<string>;
	conflictResolution?: 'skip' | 'rename' | 'merge' | 'replace';
}

const STRING_ACCOUNT_TYPE_MAP: Record<string, Account['type']> = {
	checking: 'checking',
	check: 'checking',
	savings: 'savings',
	saving: 'savings',
	credit: 'credit',
	'credit card': 'credit',
	creditcard: 'credit',
	cash: 'cash',
	wallet: 'cash',
	investment: 'investment',
	invest: 'investment',
	brokerage: 'investment',
	crypto: 'crypto',
	cryptocurrency: 'crypto',
	loan: 'credit',
	mortgage: 'credit',
	debt: 'credit'
};

const REVIEW_ACCOUNT_TYPES = [
	'checking',
	'savings',
	'credit',
	'cash',
	'investment',
	'crypto'
] as const satisfies readonly Account['type'][];

export const MM_ACCOUNT_REVIEW_TYPE_LABELS: Record<(typeof REVIEW_ACCOUNT_TYPES)[number], string> =
	{
		checking: 'Checking',
		savings: 'Savings',
		credit: 'Credit Card',
		cash: 'Cash',
		investment: 'Investment',
		crypto: 'Cryptocurrency'
	};

export { REVIEW_ACCOUNT_TYPES };

function typeFromMmStringField(raw: string): Account['type'] | null {
	const normalized = raw.trim().toLowerCase();
	if (!normalized || normalized === 'null') return null;
	if (STRING_ACCOUNT_TYPE_MAP[normalized]) {
		return STRING_ACCOUNT_TYPE_MAP[normalized];
	}
	if (/^\d+$/.test(normalized)) {
		return mapAccountType(normalized);
	}
	return null;
}

function inferTypeFromName(name: string): { type: Account['type']; matched: boolean } {
	const lower = name.toLowerCase();
	if (/\b(credit|card|visa|amex|mastercard)\b/.test(lower)) {
		return { type: 'credit', matched: true };
	}
	if (/\b(saving|savings)\b/.test(lower)) {
		return { type: 'savings', matched: true };
	}
	if (/\b(cash|wallet|petty)\b/.test(lower)) {
		return { type: 'cash', matched: true };
	}
	if (/\b(invest|broker|401k|ira|brokerage)\b/.test(lower)) {
		return { type: 'investment', matched: true };
	}
	if (/\b(crypto|bitcoin|btc|eth)\b/.test(lower)) {
		return { type: 'crypto', matched: true };
	}
	if (/\b(loan|mortgage|debt)\b/.test(lower)) {
		return { type: 'credit', matched: true };
	}
	if (/\b(checking|check)\b/.test(lower)) {
		return { type: 'checking', matched: true };
	}
	return { type: 'checking', matched: false };
}

/**
 * Infer Budgic account type from one ASSETS row.
 */
export function inferMmAccountType(row: Record<string, string>): {
	type: Account['type'];
	sources: MmAccountTypeSource[];
} {
	const sources: MmAccountTypeSource[] = [];
	let baseType: Account['type'] = 'checking';

	const accountTypeRaw = row.account_type?.trim();
	const zdataRaw = row.ZDATA?.trim();

	if (accountTypeRaw) {
		baseType = typeFromMmStringField(accountTypeRaw) ?? mapAccountType(accountTypeRaw);
		sources.push('account_type');
	} else if (zdataRaw) {
		baseType = mapAccountType(zdataRaw);
		sources.push('zdata');
	} else {
		sources.push('zdata');
	}

	const nameInference = inferTypeFromName(row.NIC_NAME || '');
	if (nameInference.matched && nameInference.type !== baseType) {
		const nextSources: MmAccountTypeSource[] = sources.filter((s) => s !== 'name_heuristic');
		nextSources.push('name_heuristic');
		return { type: nameInference.type, sources: nextSources };
	}
	if (nameInference.matched && !sources.includes('name_heuristic')) {
		sources.push('name_heuristic');
	}

	return { type: baseType, sources };
}

/**
 * ASSETS rows that will create new Budgic accounts (mirrors importer duplicate rules).
 */
export function buildMmAccountReviewRows(
	csvFiles: Map<string, CSVFile>,
	options: BuildMmAccountReviewRowsOptions
): MmAccountReviewRow[] {
	const assetsFile = getMmCsvTable(csvFiles, 'ASSETS');
	if (!assetsFile) return [];

	const existingNames = new Set(options.existingAccountNames);
	const conflictResolution = options.conflictResolution ?? 'skip';
	const rows: MmAccountReviewRow[] = [];

	for (const row of assetsFile.rows) {
		if (isDeleted(row.IS_DEL)) continue;

		const accountUid = row.uid || row.ID;
		if (!accountUid || accountUid === 'null') continue;

		const rawName = row.NIC_NAME || '';
		if (!rawName) continue;

		let displayName = rawName;
		if (existingNames.has(rawName)) {
			if (conflictResolution === 'skip') continue;
			if (conflictResolution === 'rename') {
				displayName = `${rawName} (Imported)`;
			}
		}

		const inferred = inferMmAccountType(row);
		rows.push({
			mmUid: accountUid,
			displayName,
			suggestedType: inferred.type,
			sources: inferred.sources,
			personLedgerCandidate: isPersonLedgerNameCandidate(displayName),
			mmAccountTypeRaw: row.account_type,
			mmZdataRaw: row.ZDATA
		});
	}

	return rows;
}
