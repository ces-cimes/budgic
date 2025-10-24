// Goals-specific types and interfaces
import type { LucideIcon } from '@lucide/svelte';

// Tab configuration
export interface TabConfig {
  id: string;
  label: string;
  icon?: any; // Lucide icon component
}

// Financial Goal types
export interface FinancialGoal {
  id: string;
  name: string;
  description?: string;
  targetAmount: number;
  currentAmount: number;
  currency: string;
  category: GoalCategory;
  priority: GoalPriority;
  status: GoalStatus;
  targetDate?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  monthlyContribution?: number;
  isRecurring?: boolean;
  parentGoalId?: string; // For sub-goals
  tags?: string[];
}

export type GoalCategory = 
  | 'emergency_fund'
  | 'vacation'
  | 'house_down_payment'
  | 'car_purchase'
  | 'education'
  | 'retirement'
  | 'debt_payoff'
  | 'investment'
  | 'wedding'
  | 'home_improvement'
  | 'other';

export type GoalPriority = 'low' | 'medium' | 'high' | 'critical';

export type GoalStatus = 'active' | 'paused' | 'completed' | 'cancelled';

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
  totalGoals: number;
  activeGoals: number;
  completedGoals: number;
  totalTargetValue: number;
  totalCurrentValue: number;
  overallProgress: number;
  averageProgress: number;
  monthlyContributionTotal: number;
  estimatedCompletionDate?: string;
  categoryBreakdown: Record<GoalCategory, {
    count: number;
    totalValue: number;
    averageProgress: number;
  }>;
  priorityBreakdown: Record<GoalPriority, {
    count: number;
    totalValue: number;
  }>;
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
  parentGoalId?: string;
  tags?: string[];
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
  parentGoalId?: string;
  tags?: string[];
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

// Export all components for easy importing
export { default as TabHeader } from './core/TabHeader.svelte';
export { default as TabContent } from './core/TabContent.svelte';
export { default as TabContentWrapper } from './core/TabContentWrapper.svelte';
export { default as OverviewTab } from './tabs/OverviewTab.svelte';
export { default as ActiveTab } from './tabs/ActiveTab.svelte';
export { default as CompletedTab } from './tabs/CompletedTab.svelte';
export { default as InsightsTab } from './tabs/InsightsTab.svelte';
