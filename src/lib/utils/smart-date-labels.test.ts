import { describe, it, expect } from 'vitest';
import { resolveSmartLabel, type SmartPatternForLabel } from './smart-date-labels';

describe('resolveSmartLabel', () => {
	it('returns Payday when income monthly pattern matches day of month', () => {
		const patterns: SmartPatternForLabel[] = [
			{
				frequency: 'monthly',
				confidence: 80,
				typicalDayOfMonth: 25,
				averageAmount: 5000,
				txType: 'income'
			}
		];
		const d = new Date(2026, 3, 25);
		expect(resolveSmartLabel(d, patterns)).toBe('Payday');
	});

	it('returns Rent day for large monthly transfer', () => {
		const patterns: SmartPatternForLabel[] = [
			{
				frequency: 'monthly',
				confidence: 70,
				typicalDayOfMonth: 1,
				averageAmount: -800,
				txType: 'transfer'
			}
		];
		const d = new Date(2026, 3, 1);
		expect(resolveSmartLabel(d, patterns)).toBe('Rent day');
	});

	it('returns Today for current date without pattern', () => {
		const today = new Date();
		expect(resolveSmartLabel(today, [])).toBe('Today');
	});
});
