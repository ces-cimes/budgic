import type { TabConfig } from '$lib/components/shared/types';

// Re-export TabConfig for local use
export type { TabConfig };

// ============================================================================
// UNIFIED INSIGHT TYPES
// ============================================================================

export interface UnifiedInsight {
	id: string;
	type: InsightType;
	category: InsightCategory;
	severity: InsightSeverity;
	title: string;
	description: string;
	actionable: boolean;
	actionText?: string;
	actionUrl?: string;
	metadata: InsightMetadata;
	createdAt: string;
	dismissedAt?: string;
	isActive: boolean;
	expiresAt?: string;
	sourceRoute?: 'plan' | 'goals' | 'analyze' | 'system'; // Track insight source
}

export type InsightType =
	| 'budget_alert' // Budget warnings and alerts
	| 'goal_milestone' // Goal progress and achievements
	| 'spending_pattern' // Spending behavior analysis
	| 'app_usage' // App usage patterns and suggestions
	| 'prediction' // Predictive financial insights
	| 'optimization' // Optimization recommendations
	| 'achievement' // User badges and celebrations
	| 'anomaly' // Unusual spending patterns
	| 'trend' // Spending trend analysis
	| 'behavioral'; // Behavioral pattern insights

export type InsightCategory = 'survival' | 'security' | 'growth' | 'lifestyle' | 'system';
export type InsightSeverity = 'info' | 'warning' | 'alert' | 'success' | 'celebration';

export interface InsightMetadata {
	percentage?: number;
	amount?: number;
	remaining?: number;
	threshold?: number;
	confidence?: number;
	category?: InsightCategory;
	sourceRoute?: 'plan' | 'goals' | 'analyze' | 'system';
	tags?: string[];
	relatedInsights?: string[]; // IDs of related insights
}

// ============================================================================
// BEHAVIORAL PATTERN TYPES
// ============================================================================

export interface BehavioralPattern {
	id: string;
	type:
		| 'transaction_timing'
		| 'budget_adherence'
		| 'engagement'
		| 'spending_timing'
		| 'app_usage'
		| 'category_usage'
		| 'alert_response';
	title: string;
	description: string;
	confidence: number;
	frequency: 'daily' | 'weekly' | 'monthly' | 'irregular';
	impact: 'low' | 'medium' | 'high';
	actionable: boolean;
	recommendation?: string;
	metadata: {
		pattern?: string;
		percentage?: number;
		timeframe?: string;
		category?: InsightCategory;
	};
	createdAt: string;
	lastObserved: string;
}

// ============================================================================
// PREDICTION TYPES
// ============================================================================

export interface PredictionInsight {
	id: string;
	type:
		| 'spending_forecast'
		| 'goal_completion'
		| 'budget_risk'
		| 'income_timing'
		| 'seasonal_pattern'
		| 'anomaly_detection';
	title: string;
	description: string;
	confidence: number;
	timeframe: string;
	predictedValue?: number;
	currentValue?: number;
	variance?: number;
	riskLevel: 'low' | 'medium' | 'high';
	actionable: boolean;
	actionText?: string;
	actionUrl?: string;
	metadata: {
		algorithm?: string;
		factors?: string[];
		historicalData?: number[];
		category?: InsightCategory;
	};
	createdAt: string;
	expiresAt: string;
}

// ============================================================================
// BADGE TYPES
// ============================================================================

export interface BadgeInsight {
	id: string;
	type:
		| 'budget_badge'
		| 'goal_milestone'
		| 'behavioral_badge'
		| 'financial_milestone'
		| 'app_usage_badge';
	title: string;
	description: string;
	badgeType: 'achievement' | 'milestone' | 'streak' | 'milestone_reached';
	rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
	category: InsightCategory;
	progress?: {
		current: number;
		target: number;
		percentage: number;
	};
	unlockedAt: string;
	metadata: {
		streakDays?: number;
		amount?: number;
		timeframe?: string;
		category?: InsightCategory;
	};
}

// ============================================================================
// TAB CONFIGURATION
// ============================================================================

export const insightsTabs: TabConfig[] = [
	{ id: 'overview', label: 'Overview', icon: 'BarChart3' },
	{ id: 'patterns', label: 'Patterns', icon: 'TrendingUp' },
	{ id: 'predictions', label: 'Predictions', icon: 'CrystalBall' },
	{ id: 'badges', label: 'Badges', icon: 'Award' }
];

// ============================================================================
// COMPONENT PROPS
// ============================================================================

export interface TabContentProps {
	tabId: string;
	isActive: boolean;
	className?: string;
	children: any;
	tabs: any[]; // Array of tabs to infer count from
}

export interface TabContentWrapperProps {
	tabs: TabConfig[];
	activeTab: string;
	onTabChange: (tabId: string) => void;
	className?: string;
	class?: string;
	children: any;
}

export interface InsightCardProps {
	insight: UnifiedInsight;
	showTimestamp?: boolean;
	showActions?: boolean;
	onDismiss?: (insightId: string) => void;
	onAction?: (insightId: string) => void;
	className?: string;
	/** Tailwind classes for the description paragraph (default: muted + text-sm). */
	descriptionClass?: string;
}

export interface InsightListProps {
	insights: UnifiedInsight[];
	maxItems?: number;
	showViewAll?: boolean;
	onViewAll?: () => void;
	onDismiss?: (insightId: string) => void;
	onAction?: (insightId: string) => void;
	className?: string;
	/** Passed through to each `InsightCard` description. */
	descriptionClass?: string;
}

export interface InsightFiltersProps {
	selectedSeverity?: InsightSeverity[];
	selectedCategory?: InsightCategory[];
	selectedType?: InsightType[];
	onSeverityChange?: (severity: InsightSeverity[]) => void;
	onCategoryChange?: (category: InsightCategory[]) => void;
	onTypeChange?: (type: InsightType[]) => void;
	className?: string;
}

export interface OverviewTabProps {
	insights: UnifiedInsight[];
	onDismiss?: (insightId: string) => void;
	onAction?: (insightId: string) => void;
	className?: string;
}

export interface PatternsTabProps {
	patterns: BehavioralPattern[];
	onRecommendation?: (patternId: string) => void;
	className?: string;
}

export interface PredictionsTabProps {
	predictions: PredictionInsight[];
	onAction?: (predictionId: string) => void;
	className?: string;
}

export interface BadgesTabProps {
	badges: BadgeInsight[];
	onViewDetails?: (badgeId: string) => void;
	className?: string;
}

// ============================================================================
// SERVICE INTERFACES
// ============================================================================

export interface InsightsServiceInterface {
	getInsights(): UnifiedInsight[];
	getInsightsByType(type: InsightType): UnifiedInsight[];
	getInsightsBySeverity(severity: InsightSeverity): UnifiedInsight[];
	getInsightsByCategory(category: InsightCategory): UnifiedInsight[];
	getInsightsBySourceRoute(
		sourceRoute: 'plan' | 'goals' | 'analyze' | 'system'
	): UnifiedInsight[];
	dismissInsight(insightId: string): Promise<void>;
	getInsightsCount(): {
		total: number;
		info: number;
		warning: number;
		alert: number;
		success: number;
		celebration: number;
	};
	startAutoUpdates(): void;
	stopAutoUpdates(): void;
	forceUpdate(): Promise<void>;
}

export interface BehavioralAnalysisServiceInterface {
	getPatterns(): BehavioralPattern[];
	analyzeTransactionPatterns(): Promise<BehavioralPattern[]>;
	analyzeEngagementPatterns(): Promise<BehavioralPattern[]>;
	analyzeSpendingPatterns(): Promise<BehavioralPattern[]>;
}

export interface PredictionServiceInterface {
	getPredictions(): PredictionInsight[];
	generateSpendingForecast(): Promise<PredictionInsight[]>;
	generateGoalPredictions(): Promise<PredictionInsight[]>;
	detectAnomalies(): Promise<PredictionInsight[]>;
}

export interface BadgeServiceInterface {
	getBadges(): BadgeInsight[];
	checkBudgetBadges(): Promise<BadgeInsight[]>;
	checkGoalBadges(): Promise<BadgeInsight[]>;
	checkBehavioralBadges(): Promise<BadgeInsight[]>;
	checkFinancialMilestones(): Promise<BadgeInsight[]>;
}

// ============================================================================
// STORE INTERFACES
// ============================================================================

export interface InsightsStore {
	insights: UnifiedInsight[];
	patterns: BehavioralPattern[];
	predictions: PredictionInsight[];
	badges: BadgeInsight[];
	activeTab: string;
	isLoading: boolean;
	lastUpdate: number;
	unreadCount: number;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export type InsightSortOption = 'createdAt' | 'severity' | 'category' | 'type';
export type InsightSortOrder = 'asc' | 'desc';

export interface InsightSortConfig {
	sortBy: InsightSortOption;
	order: InsightSortOrder;
}

export interface InsightFilterConfig {
	severity?: InsightSeverity[];
	category?: InsightCategory[];
	type?: InsightType[];
	sourceRoute?: ('plan' | 'goals' | 'analyze' | 'system')[];
	dateRange?: {
		start: string;
		end: string;
	};
	actionable?: boolean;
}
