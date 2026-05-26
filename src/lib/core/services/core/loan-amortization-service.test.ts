import { describe, it, expect } from 'vitest';
import { loanAmortizationService } from './loan-amortization-service';

describe('loanAmortizationService.projectClearanceDate', () => {
	it('uses schedule end date when surplus covers monthly pace', () => {
		const end = '2027-06-01T00:00:00.000Z';
		const result = loanAmortizationService.projectClearanceDate(12000, 500, {
			lastScheduleDate: end,
			monthlyPaymentPace: 400
		});
		expect(result).toBe(end);
	});

	it('extrapolates when surplus is below payment pace', () => {
		const result = loanAmortizationService.projectClearanceDate(1000, 50, {
			lastScheduleDate: '2027-06-01T00:00:00.000Z',
			monthlyPaymentPace: 400
		});
		expect(result).toBeTruthy();
		expect(result).not.toBe('2027-06-01T00:00:00.000Z');
	});

	it('returns now when balance is cleared', () => {
		const result = loanAmortizationService.projectClearanceDate(0, 50, {});
		expect(new Date(result!).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
	});
});
