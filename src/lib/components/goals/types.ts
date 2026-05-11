// Goals-specific types and interfaces

// TabConfig is now shared - import from shared types
export type { TabConfig } from '$lib/components/shared/types';

import type { Goal } from '$lib/core/db';
export type { Goal } from '$lib/core/db';

// Goal-specific enums (re-exported for convenience)
export type GoalCategory = Goal['category'];
export type GoalPriority = Goal['priority'];
export type GoalStatus = Goal['status'];

// Goal Progress tracking
export interface GoalProgress {
	goalId: string;
	date: string;
	amount: number;
	note?: string;
	source?: 'manual' | 'automatic' | 'transfer';
}

// Goal Insights
export interface GoalInsight {
	id: string;
	type: GoalInsightType;
	title: string;
	description: string;
	priority: 'low' | 'medium' | 'high';
	actionable: boolean;
	goalId?: string;
	createdAt: string;
	dismissedAt?: string;
	metadata?: Record<string, any>;
}

export type GoalInsightType =
	| 'achievement'
	| 'milestone'
	| 'recommendation'
	| 'warning'
	| 'celebration'
	| 'optimization';

// Goals Data aggregation
export interface GoalsData {
	activeGoals: Goal[];
	completedGoals: Goal[];
	allGoals: Goal[];
	totalTargetValue: number;
	totalCurrentValue: number;
	overallProgress: number;
	averageProgress: number;
	monthlyContributionTotal: number;
	categoryBreakdown: Record<
		GoalCategory,
		{
			count: number;
			totalValue: number;
			averageProgress: number;
		}
	>;
	priorityBreakdown: Record<
		GoalPriority,
		{
			count: number;
			totalValue: number;
		}
	>;
	insights: GoalInsight[];
	analytics: {
		totalGoals: number;
		activeGoalsCount: number;
		completedGoalsCount: number;
		averageGoalValue: number;
		completionRate: number;
	};
	totalGoals: number;
}

// Goal creation/update forms
export interface CreateGoalRequest {
	name: string;
	description?: string;
	targetAmount: number;
	currency: string;
	category: GoalCategory;
	priority: GoalPriority;
	targetDate?: string;
	monthlyContribution?: number;
	isRecurring?: boolean;
	tags?: string[];
	/** Expense category ids for Part 5 split nudges */
	linkedCategoryIds?: string[];
}

export interface UpdateGoalRequest {
	name?: string;
	description?: string;
	targetAmount?: number;
	currency?: string;
	category?: GoalCategory;
	priority?: GoalPriority;
	status?: GoalStatus;
	targetDate?: string;
	monthlyContribution?: number;
	isRecurring?: boolean;
	tags?: string[];
	linkedCategoryIds?: string[];
}

// Goal analytics
export interface GoalAnalytics {
	completionRate: number;
	averageTimeToComplete: number;
	mostSuccessfulCategory: GoalCategory;
	monthlyContributionTrend: Array<{
		month: string;
		amount: number;
	}>;
	progressVelocity: Array<{
		goalId: string;
		velocity: number; // amount per month
	}>;
}

// Goal templates
export interface GoalTemplate {
	id: string;
	name: string;
	description: string;
	category: GoalCategory;
	suggestedAmount?: number;
	suggestedTimeframe?: number; // months
	suggestedMonthlyContribution?: number;
	tags: string[];
	isPopular?: boolean;
}

// Core tab components are now shared - import from shared instead
