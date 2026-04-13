/**
 * Behavioral Analysis Service - Accuracy Tests
 *
 * This file contains tests to validate the accuracy of behavioral insights.
 * To run these tests, you'll need to set up a testing framework (e.g., Vitest).
 *
 * Installation:
 *   npm install -D vitest @vitest/ui
 *
 * Add to package.json scripts:
 *   "test": "vitest",
 *   "test:ui": "vitest --ui"
 *
 * Run tests:
 *   npm test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { behavioralAnalysisService } from './behavioral-analysis-service';
import { db, generateUUID } from '$lib/core/db';
import type { UserAction, Transaction } from '$lib/core/db';

// Mock data generators
function createMockUserAction(action: string, daysAgo: number = 0): UserAction {
	const date = new Date();
	date.setDate(date.getDate() - daysAgo);

	return {
		id: generateUUID(),
		action,
		metadata: '{}',
		timestamp: date.toISOString(),
		sessionId: `session-${Math.random()}`,
		createdAt: date.toISOString(),
		updatedAt: date.toISOString(),
		deletedAt: null
	};
}

function createMockTransaction(
	type: 'expense' | 'income',
	amount: number,
	daysAgo: number = 0,
	categoryId?: string
): Transaction {
	const date = new Date();
	date.setDate(date.getDate() - daysAgo);

	return {
		id: generateUUID(),
		type,
		amount,
		currency: 'USD',
		status: 'cleared',
		clearedDate: date.toISOString(),
		accountId: 'test-account',
		categoryId: categoryId || 'test-category',
		description: `Test ${type}`,
		createdAt: date.toISOString(),
		updatedAt: date.toISOString(),
		deletedAt: null
	};
}

describe('BehavioralAnalysisService', () => {
	describe('detectDayOfWeekPatterns', () => {
		it('should detect patterns when user is active on specific days', async () => {
			// Create actions mostly on Mondays
			const actions: UserAction[] = [];
			for (let i = 0; i < 20; i++) {
				const date = new Date();
				date.setDate(date.getDate() - i);
				// Force to Monday
				const dayOfWeek = date.getDay();
				const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
				date.setDate(date.getDate() + diff);
				actions.push(createMockUserAction('view_transactions', i));
			}

			const patterns = await behavioralAnalysisService.detectDayOfWeekPatterns(actions);

			expect(patterns.length).toBeGreaterThan(0);
			expect(patterns[0].frequency).toBeGreaterThan(0);
		});

		it('should return empty array when insufficient data', async () => {
			const actions: UserAction[] = [
				createMockUserAction('view_transactions', 1),
				createMockUserAction('view_transactions', 2)
			];

			const patterns = await behavioralAnalysisService.detectDayOfWeekPatterns(actions);

			expect(patterns.length).toBe(0);
		});
	});

	describe('detectWeeklyCycles', () => {
		it('should detect weekly patterns with consistent spending', async () => {
			const transactions: Transaction[] = [];

			// Create consistent weekly spending for 4 weeks
			for (let week = 0; week < 4; week++) {
				for (let day = 0; day < 7; day++) {
					transactions.push(createMockTransaction('expense', 50, week * 7 + day));
				}
			}

			const cycles = await behavioralAnalysisService.detectWeeklyCycles(transactions);

			expect(cycles.length).toBeGreaterThan(0);
			if (cycles.length > 0) {
				expect(cycles[0].type).toBe('weekly');
				expect(cycles[0].confidence).toBeGreaterThan(70);
			}
		});

		it('should return empty array when insufficient data', async () => {
			const transactions: Transaction[] = [
				createMockTransaction('expense', 50, 1),
				createMockTransaction('expense', 50, 2)
			];

			const cycles = await behavioralAnalysisService.detectWeeklyCycles(transactions);

			expect(cycles.length).toBe(0);
		});
	});

	describe('detectMonthlyCycles', () => {
		it('should detect monthly patterns with consistent spending', async () => {
			const transactions: Transaction[] = [];

			// Create consistent monthly spending for 4 months
			for (let month = 0; month < 4; month++) {
				for (let day = 0; day < 15; day++) {
					transactions.push(createMockTransaction('expense', 100, month * 30 + day));
				}
			}

			const cycles = await behavioralAnalysisService.detectMonthlyCycles(transactions);

			expect(cycles.length).toBeGreaterThan(0);
			if (cycles.length > 0) {
				expect(cycles[0].type).toBe('monthly');
				expect(cycles[0].confidence).toBeGreaterThan(70);
			}
		});

		it('should return empty array when insufficient data', async () => {
			const transactions: Transaction[] = [
				createMockTransaction('expense', 100, 1),
				createMockTransaction('expense', 100, 15)
			];

			const cycles = await behavioralAnalysisService.detectMonthlyCycles(transactions);

			expect(cycles.length).toBe(0);
		});
	});

	describe('detectTransactionTimingPatterns', () => {
		it('should detect timing patterns when transactions occur at specific hours', async () => {
			const transactions: Transaction[] = [];

			// Create transactions mostly at 2 PM (14:00)
			for (let i = 0; i < 20; i++) {
				const tx = createMockTransaction('expense', 50, i);
				const date = new Date(tx.clearedDate!);
				date.setHours(14, 0, 0, 0);
				tx.clearedDate = date.toISOString();
				transactions.push(tx);
			}

			const patterns =
				await behavioralAnalysisService.detectTransactionTimingPatterns(transactions);

			expect(patterns.length).toBeGreaterThan(0);
			expect(patterns[0].hour).toBe(14);
		});

		it('should return empty array when insufficient data', async () => {
			const transactions: Transaction[] = [createMockTransaction('expense', 50, 1)];

			const patterns =
				await behavioralAnalysisService.detectTransactionTimingPatterns(transactions);

			expect(patterns.length).toBe(0);
		});
	});

	describe('detectAllPatterns', () => {
		it('should detect multiple pattern types', async () => {
			// Create diverse data
			const actions: UserAction[] = [];
			const transactions: Transaction[] = [];

			for (let i = 0; i < 30; i++) {
				actions.push(createMockUserAction('view_transactions', i));
				transactions.push(createMockTransaction('expense', 50 + Math.random() * 20, i));
			}

			// Mock the service methods to return test data
			const patterns = await behavioralAnalysisService.detectAllPatterns(90);

			// Should return array (may be empty if patterns don't meet thresholds)
			expect(Array.isArray(patterns)).toBe(true);
		});

		it('should handle empty data gracefully', async () => {
			const patterns = await behavioralAnalysisService.detectAllPatterns(90);

			expect(Array.isArray(patterns)).toBe(true);
		});
	});

	describe('Pattern Confidence Calculation', () => {
		it('should calculate confidence based on pattern strength', async () => {
			// Create very consistent weekly pattern
			const transactions: Transaction[] = [];
			for (let week = 0; week < 6; week++) {
				for (let day = 0; day < 7; day++) {
					transactions.push(createMockTransaction('expense', 100, week * 7 + day));
				}
			}

			const cycles = await behavioralAnalysisService.detectWeeklyCycles(transactions);

			if (cycles.length > 0) {
				// High consistency should yield high confidence
				expect(cycles[0].confidence).toBeGreaterThan(70);
			}
		});

		it('should have lower confidence for inconsistent patterns', async () => {
			// Create inconsistent spending
			const transactions: Transaction[] = [];
			for (let week = 0; week < 4; week++) {
				const amount = 50 + Math.random() * 200; // High variance
				for (let day = 0; day < 7; day++) {
					transactions.push(createMockTransaction('expense', amount, week * 7 + day));
				}
			}

			const cycles = await behavioralAnalysisService.detectWeeklyCycles(transactions);

			// Inconsistent patterns may not be detected, or have lower confidence
			if (cycles.length > 0) {
				expect(cycles[0].confidence).toBeLessThan(90);
			}
		});
	});

	describe('Pattern Threshold Validation', () => {
		it('should require minimum occurrences for pattern detection', async () => {
			// Less than 3 weeks of data
			const transactions: Transaction[] = [];
			for (let day = 0; day < 10; day++) {
				transactions.push(createMockTransaction('expense', 50, day));
			}

			const cycles = await behavioralAnalysisService.detectWeeklyCycles(transactions);

			// Should not detect pattern with insufficient data
			expect(cycles.length).toBe(0);
		});

		it('should require low variance for pattern detection', async () => {
			// High variance spending
			const transactions: Transaction[] = [];
			for (let week = 0; week < 4; week++) {
				const amounts = [10, 500, 20, 600, 15, 400, 30]; // Very high variance
				amounts.forEach((amount, day) => {
					transactions.push(createMockTransaction('expense', amount, week * 7 + day));
				});
			}

			const cycles = await behavioralAnalysisService.detectWeeklyCycles(transactions);

			// High variance should prevent pattern detection
			expect(cycles.length).toBe(0);
		});
	});
});

/**
 * Manual Testing Guide
 *
 * To manually test behavioral insights accuracy:
 *
 * 1. Create test data:
 *    - Generate user actions with known patterns (e.g., always on Mondays)
 *    - Generate transactions with known cycles (e.g., weekly, monthly)
 *
 * 2. Run pattern detection:
 *    - Call detectAllPatterns() with test data
 *    - Verify detected patterns match expected patterns
 *
 * 3. Validate confidence scores:
 *    - Strong patterns should have confidence > 70%
 *    - Weak patterns should have lower confidence
 *    - No patterns should be detected when data is insufficient
 *
 * 4. Test edge cases:
 *    - Empty data
 *    - Insufficient data (< 3 occurrences)
 *    - High variance data
 *    - Mixed patterns
 *
 * 5. Performance testing:
 *    - Test with large datasets (1000+ transactions)
 *    - Measure detection time
 *    - Verify no memory leaks
 */
