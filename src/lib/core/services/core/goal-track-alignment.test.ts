import { describe, expect, it } from 'vitest';
import { isTimeBoundGoalAtRisk } from '$lib/core/services/core/goal-service';

describe('isTimeBoundGoalAtRisk', () => {
	it('matches goalService isOnTrack (strict, not 0.8× threshold)', () => {
		const goal = { targetDate: '2026-12-31T00:00:00.000Z' };

		expect(isTimeBoundGoalAtRisk(goal, { isOnTrack: false })).toBe(true);
		expect(isTimeBoundGoalAtRisk(goal, { isOnTrack: true })).toBe(false);
		expect(isTimeBoundGoalAtRisk({ targetDate: undefined }, { isOnTrack: false })).toBe(false);
		expect(isTimeBoundGoalAtRisk(goal, null)).toBe(false);
	});

	it('treats barely-on-track progress as healthy (no 0.8 cushion)', () => {
		const goal = { targetDate: '2026-12-31T00:00:00.000Z' };
		// Under old insights rule (avg < 0.8 × required) this could still warn while isOnTrack is true.
		expect(isTimeBoundGoalAtRisk(goal, { isOnTrack: true })).toBe(false);
	});
});
