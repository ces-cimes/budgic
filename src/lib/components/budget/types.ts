// Import planning service types
import type {
	DailyAllowance,
	WeeklyProjection,
	PlanningInsight,
	PlanningData
} from '$lib/core/services/pages/planning-service';

// Re-export for convenience
export type { DailyAllowance, WeeklyProjection, PlanningInsight, PlanningData };

// TabConfig is now shared - import from shared types
export type { TabConfig } from '$lib/components/shared/types';

// Planning-specific component props
export interface OverviewTabProps {
	dailyAllowance: DailyAllowance | null;
	enhancedAllowance?: import('$lib/core/services/core/budget-service').EnhancedAllowance | null;
	/** When spending exceeds allowance (for warnings) */
	negativeAllowanceStatus?:
		| import('$lib/core/services/core/negative-allowance-service').NegativeAllowanceStatus
		| null;
	recoverySuggestions?: import('$lib/core/services/core/negative-allowance-service').RecoverySuggestion[];
	totalPlannedIncome: number;
	totalPlannedExpenses: number;
	netProjectedChange: number;
	userCurrency: string;
	onAddPlannedTransaction: () => void;
	onSetGoal: () => void;
	/** Optional: called after envelope borrow is created (e.g. refresh allowance) */
	onBorrowCreated?: () => void;
	/** Optional: called after rollover is applied (e.g. refresh allowance) */
	onRolloverApplied?: () => void;
	/** Optional: account id for per-account envelope borrowing (omit for global) */
	accountId?: string;
}

export interface ProjectionsTabProps {
	weeklyProjections: WeeklyProjection[];
	userCurrency: string;
	selectedAccountId: string;
	onRefresh: () => void;
}

export interface BudgetTabProps {
	userCurrency: string;
	selectedAccountId: string;
	planningData: PlanningData | null;
	onSetGoal: () => void;
}

export interface InsightsTabProps {
	insights: PlanningInsight[];
	userCurrency: string;
	onRefresh: () => void;
}

// Financial goal types
export interface FinancialGoal {
	id: string;
	title: string;
	description?: string;
	targetAmount: number;
	currentAmount: number;
	targetDate: string;
	priority: 'high' | 'medium' | 'low';
	category: 'emergency' | 'savings' | 'debt' | 'investment' | 'purchase' | 'other';
	status: 'active' | 'paused' | 'completed' | 'cancelled';
	createdAt: string;
	updatedAt: string;
}

// Component props
export interface GoalsTabProps {
	userCurrency: string;
	selectedAccountId?: string;
	onSetGoal?: () => void;
}

// Planning recommendation types
export interface PlanningRecommendation {
	id: string;
	type: 'expense_reduction' | 'income_increase' | 'timing_optimization' | 'goal_adjustment';
	title: string;
	description: string;
	impact: number; // Estimated impact in currency
	effort: 'low' | 'medium' | 'high';
	priority: 'high' | 'medium' | 'low';
	actionable: boolean;
	actionText?: string;
	actionUrl?: string;
}
