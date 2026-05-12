import { describe, expect, it } from 'vitest';
import type { CSVFile } from './types';
import { detectMmCurrencyReviewNeeded } from './mm-currency-review-detect';

function csv(name: string, headers: string[], rows: Record<string, string>[]): CSVFile {
	return { name, headers, rows, rowCount: rows.length };
}

describe('detectMmCurrencyReviewNeeded', () => {
	it('returns empty when INOUTCOME missing', () => {
		const files = new Map<string, CSVFile>();
		expect(detectMmCurrencyReviewNeeded(files)).toEqual({ needsReview: false, rows: [] });
	});

	it('needsReview false for single default uid with no fallback', () => {
		const files = new Map<string, CSVFile>([
			[
				'INOUTCOME',
				csv('INOUTCOME', ['DO_TYPE', 'IS_DEL', 'currencyUid', 'uid', 'assetUid', 'ctgUid'], [
					{
						DO_TYPE: '1',
						IS_DEL: '0',
						currencyUid: 'RUB_RUB',
						uid: 't1',
						assetUid: 'a1',
						ctgUid: 'c1'
					}
				])
			],
			[
				'CURRENCY',
				csv('CURRENCY', ['uid', 'ISO', 'IS_DEL'], [
					{ uid: 'RUB_RUB', ISO: 'RUB', IS_DEL: '0' }
				])
			]
		]);
		const r = detectMmCurrencyReviewNeeded(files);
		expect(r.needsReview).toBe(false);
		expect(r.rows).toHaveLength(1);
		expect(r.rows[0]?.hasFallback).toBe(false);
	});

	it('needsReview true when two distinct currency UIDs', () => {
		const files = new Map<string, CSVFile>([
			[
				'INOUTCOME',
				csv('INOUTCOME', ['DO_TYPE', 'IS_DEL', 'currencyUid', 'uid'], [
					{ DO_TYPE: '1', IS_DEL: '0', currencyUid: 'RUB_RUB', uid: 't1' },
					{ DO_TYPE: '1', IS_DEL: '0', currencyUid: 'USD_USD', uid: 't2' }
				])
			]
		]);
		const r = detectMmCurrencyReviewNeeded(files);
		expect(r.needsReview).toBe(true);
		expect(r.rows.length).toBe(2);
	});

	it('needsReview true when extract hits currencyFallback', () => {
		const files = new Map<string, CSVFile>([
			[
				'INOUTCOME',
				csv('INOUTCOME', ['DO_TYPE', 'IS_DEL', 'currencyUid', 'uid'], [
					{ DO_TYPE: '1', IS_DEL: '0', currencyUid: 'null', uid: 't1' }
				])
			]
		]);
		const r = detectMmCurrencyReviewNeeded(files);
		expect(r.needsReview).toBe(true);
		expect(r.rows[0]?.hasFallback).toBe(true);
	});

	it('skips DO_TYPE 7/8 for currency counts', () => {
		const files = new Map<string, CSVFile>([
			[
				'INOUTCOME',
				csv('INOUTCOME', ['DO_TYPE', 'IS_DEL', 'currencyUid', 'uid'], [
					{ DO_TYPE: '7', IS_DEL: '0', currencyUid: 'EUR_EUR', uid: 'r1' },
					{ DO_TYPE: '1', IS_DEL: '0', currencyUid: 'RUB_RUB', uid: 't1' }
				])
			],
			[
				'CURRENCY',
				csv('CURRENCY', ['uid', 'ISO', 'IS_DEL'], [
					{ uid: 'RUB_RUB', ISO: 'RUB', IS_DEL: '0' },
					{ uid: 'EUR_EUR', ISO: 'EUR', IS_DEL: '0' }
				])
			]
		]);
		const r = detectMmCurrencyReviewNeeded(files);
		expect(r.needsReview).toBe(false);
		expect(r.rows.map((x) => x.mmUid)).toEqual(['RUB_RUB']);
	});

	it('transfer pair counts transfer-out currency once', () => {
		const files = new Map<string, CSVFile>([
			[
				'INOUTCOME',
				csv(
					'INOUTCOME',
					['DO_TYPE', 'IS_DEL', 'currencyUid', 'uid', 'txUidTrans', 'assetUid'],
					[
						{
							DO_TYPE: '3',
							IS_DEL: '0',
							currencyUid: 'OUT_UID',
							uid: 'o1',
							txUidTrans: 'PAIR1',
							assetUid: 'a1'
						},
						{
							DO_TYPE: '4',
							IS_DEL: '0',
							currencyUid: 'IN_UID',
							uid: 'i1',
							txUidTrans: 'PAIR1',
							assetUid: 'a2'
						}
					]
				)
			]
		]);
		const r = detectMmCurrencyReviewNeeded(files);
		const out = r.rows.find((x) => x.mmUid === 'OUT_UID');
		expect(out?.txCount).toBe(1);
		expect(r.rows.find((x) => x.mmUid === 'IN_UID')).toBeUndefined();
	});

	it('sorts rows by txCount descending', () => {
		const files = new Map<string, CSVFile>([
			[
				'INOUTCOME',
				csv('INOUTCOME', ['DO_TYPE', 'IS_DEL', 'currencyUid', 'uid'], [
					{ DO_TYPE: '1', IS_DEL: '0', currencyUid: 'AAA', uid: 't1' },
					{ DO_TYPE: '1', IS_DEL: '0', currencyUid: 'BBB', uid: 't2' },
					{ DO_TYPE: '1', IS_DEL: '0', currencyUid: 'BBB', uid: 't3' },
					{ DO_TYPE: '1', IS_DEL: '0', currencyUid: 'BBB', uid: 't4' }
				])
			]
		]);
		const r = detectMmCurrencyReviewNeeded(files);
		expect(r.rows[0]?.mmUid).toBe('BBB');
		expect(r.rows[0]?.txCount).toBe(3);
		expect(r.rows[1]?.mmUid).toBe('AAA');
	});
});
