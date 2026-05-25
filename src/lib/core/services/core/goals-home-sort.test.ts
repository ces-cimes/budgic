import { describe, expect, it } from 'vitest';
import type { Goal } from '$lib/core/db';
import { goalService } from '$lib/core/services/core/goal-service';

function makeGoal(overrides: Partial<Goal> & Pick<Goal, 'id' | 'name' | 'priority'>): Goal {
	return {
		id: overrides.id,
		name: overrides.name,
		priority: overrides.priority,
		targetAmount: overrides.targetAmount ?? 1000,
		currentAmount: overrides.currentAmount ?? 0,
		targetDate: overrides.targetDate,
		status: overrides.status ?? 'active',
		category: overrides.category ?? 'other',
		currency: overrides.currency ?? 'USD',
		createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
		updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z',
		deletedAt: overrides.deletedAt ?? null
	} as Goal;
}

describe('goalService home snapshot sort', () => {
	it('sorts at-risk goals before healthy goals', () => {
		const healthy = makeGoal({
			id: 'healthy',
			name: 'Healthy',
			priority: 'critical',
			targetDate: '2026-12-31T00:00:00.000Z'
		});
		const atRisk = makeGoal({
			id: 'at-risk',
			name: 'At risk',
			priority: 'low',
			targetDate: '2026-06-30T00:00:00.000Z'
		});

		const progressById = new Map([
			[
				healthy.id,
				{
					goalId: healthy.id,
					goalName: healthy.name,
					targetAmount: 1000,
					currentAmount: 500,
					percentageComplete: 50,
					remainingAmount: 500,
					isOnTrack: true,
					priority: healthy.priority,
					isTimeBound: true
				}
			],
			[
				atRisk.id,
				{
					goalId: atRisk.id,
					goalName: atRisk.name,
					targetAmount: 1000,
					currentAmount: 100,
					percentageComplete: 10,
					remainingAmount: 900,
					isOnTrack: false,
					priority: atRisk.priority,
					isTimeBound: true
				}
			]
		]);

		const sorted = goalService.sortGoalsForHomeSnapshot([healthy, atRisk], progressById);
		expect(sorted.map((goal) => goal.id)).toEqual(['at-risk', 'healthy']);
	});

	it('uses priority then lowest completion as tiebreakers among at-risk goals', () => {
		const lowProgress = makeGoal({
			id: 'low',
			name: 'Low progress',
			priority: 'medium',
			targetDate: '2026-06-30T00:00:00.000Z'
		});
		const criticalHigherProgress = makeGoal({
			id: 'critical',
			name: 'Critical',
			priority: 'critical',
			targetDate: '2026-06-30T00:00:00.000Z'
		});

		const progressById = new Map([
			[
				lowProgress.id,
				{
					goalId: lowProgress.id,
					goalName: lowProgress.name,
					targetAmount: 1000,
					currentAmount: 50,
					percentageComplete: 5,
					remainingAmount: 950,
					isOnTrack: false,
					priority: lowProgress.priority,
					isTimeBound: true
				}
			],
			[
				criticalHigherProgress.id,
				{
					goalId: criticalHigherProgress.id,
					goalName: criticalHigherProgress.name,
					targetAmount: 1000,
					currentAmount: 200,
					percentageComplete: 20,
					remainingAmount: 800,
					isOnTrack: false,
					priority: criticalHigherProgress.priority,
					isTimeBound: true
				}
			]
		]);

		const sorted = goalService.sortGoalsForHomeSnapshot(
			[lowProgress, criticalHigherProgress],
			progressById
		);
		expect(sorted.map((goal) => goal.id)).toEqual(['critical', 'low']);
	});
});
