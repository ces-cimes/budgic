import { describe, expect, it } from 'vitest';
import {
	evaluateExpression,
	formatEvaluatedNumber,
	looksLikeExpression
} from './arithmetic-eval';

describe('looksLikeExpression', () => {
	it('detects operators between digits', () => {
		expect(looksLikeExpression('50+25')).toBe(true);
		expect(looksLikeExpression('100 / 4')).toBe(true);
		expect(looksLikeExpression('2*3')).toBe(true);
	});
	it('allows plain numbers', () => {
		expect(looksLikeExpression('42')).toBe(false);
		expect(looksLikeExpression('-3.5')).toBe(false);
		expect(looksLikeExpression('')).toBe(false);
	});
	it('detects parens', () => {
		expect(looksLikeExpression('(1+2)')).toBe(true);
	});
});

describe('evaluateExpression', () => {
	it('evaluates basic expressions', () => {
		expect(evaluateExpression('50+25').result).toBe(75);
		expect(evaluateExpression('100/4').result).toBe(25);
		expect(evaluateExpression('2*3+4').result).toBe(10);
		expect(evaluateExpression('(1+2)*3').result).toBe(9);
	});
	it('handles comma decimal', () => {
		expect(evaluateExpression('1,5+1,5').result).toBe(3);
	});
	it('handles unary minus', () => {
		expect(evaluateExpression('-5+2').result).toBe(-3);
		expect(evaluateExpression('2*-3').result).toBe(-6);
	});
	it('rejects division by zero', () => {
		const r = evaluateExpression('1/0');
		expect(r.result).toBeNull();
		expect(r.error).toBeDefined();
	});
	it('returns null for empty', () => {
		expect(evaluateExpression('   ').result).toBeNull();
	});
});

describe('formatEvaluatedNumber', () => {
	it('strips trailing zeros', () => {
		expect(formatEvaluatedNumber(10, 2)).toBe('10');
		expect(formatEvaluatedNumber(10.5, 2)).toBe('10.5');
	});
});
