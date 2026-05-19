/**
 * Pre-import heuristic: detect Money Manager transaction currency UIDs that benefit from user review.
 */

import type { CSVFile, TransferPair } from './types';
import { extractCurrencyCodeWithQuality, isDeleted } from './money-manager-mapper';

export interface MmCurrencyReviewRow {
	mmUid: string;
	txCount: number;
	suggestedCode: string;
	hasFallback: boolean;
}

export interface MmCurrencyReviewDetection {
	needsReview: boolean;
	rows: MmCurrencyReviewRow[];
}

function buildTransferGroups(incomeFile: CSVFile): Map<string, TransferPair> {
	const transferGroups = new Map<string, TransferPair>();
	for (const row of incomeFile.rows) {
		const doType = parseInt(row.DO_TYPE || '0', 10);
		const txUidTrans = row.txUidTrans;
		if (
			(doType === 3 || doType === 4) &&
			txUidTrans &&
			txUidTrans !== 'null' &&
			txUidTrans !== ''
		) {
			if (!transferGroups.has(txUidTrans)) {
				transferGroups.set(txUidTrans, {
					txUidTrans,
					transferOut: undefined,
					transferIn: undefined,
					feeTransaction: undefined
				});
			}
			const pair = transferGroups.get(txUidTrans)!;
			if (doType === 3) pair.transferOut = row;
			else if (doType === 4) pair.transferIn = row;
		}
	}
	return transferGroups;
}

/**
 * Scan INOUTCOME.csv the same way `MoneyManagerImporter.importTransactions` attributes currency:
 * complete transfer pairs use transfer-out `currencyUid`; reconciliation DO_TYPE 7/8 skipped;
 * other rows use their own `currencyUid` (default `RUB_RUB` when missing, matching importer).
 */
export function detectMmCurrencyReviewNeeded(
	csvFiles: Map<string, CSVFile>
): MmCurrencyReviewDetection {
	const incomeFile = csvFiles.get('INOUTCOME');
	const currencyFile = csvFiles.get('CURRENCY');
	if (!incomeFile) {
		return { needsReview: false, rows: [] };
	}

	const transferGroups = buildTransferGroups(incomeFile);
	const counts = new Map<string, number>();
	const processedTransferUids = new Set<string>();

	for (const row of incomeFile.rows) {
		if (isDeleted(row.IS_DEL)) continue;

		const doType = parseInt(row.DO_TYPE || '0', 10);
		const txUidTrans = row.txUidTrans;

		if (
			(doType === 3 || doType === 4) &&
			txUidTrans &&
			txUidTrans !== 'null' &&
			txUidTrans !== ''
		) {
			if (processedTransferUids.has(txUidTrans)) continue;
			const pair = transferGroups.get(txUidTrans);
			if (pair?.transferOut && pair?.transferIn) {
				const uid = pair.transferOut.currencyUid || 'RUB_RUB';
				counts.set(uid, (counts.get(uid) ?? 0) + 1);
				processedTransferUids.add(txUidTrans);
				continue;
			}
		}

		if (doType === 7 || doType === 8) continue;

		const uid = row.currencyUid || 'RUB_RUB';
		counts.set(uid, (counts.get(uid) ?? 0) + 1);
	}

	const rows: MmCurrencyReviewRow[] = [];
	for (const [mmUid, txCount] of counts) {
		const q = extractCurrencyCodeWithQuality(mmUid, currencyFile);
		const hasFallback = Boolean(q.importQuality?.currencyFallback);
		rows.push({
			mmUid,
			txCount,
			suggestedCode: q.code,
			hasFallback
		});
	}

	rows.sort((a, b) => b.txCount - a.txCount);

	const distinct = rows.length;
	const anyFallback = rows.some((r) => r.hasFallback);
	const needsReview = distinct >= 2 || anyFallback;

	return { needsReview, rows };
}
