// Core services
export { accountService } from './account-service';
export { currencyService } from './currency-service';
export { tagService } from './tag-service';
export { transactionService } from './transaction-service';
export { transferService } from './transfer-service';
export { bankTransactionService } from './bank-transaction-service';
export { settingsService } from './settings-service';
export { payeeService } from './payee-service';
export { priorityLevelMappingService } from './priority-level-mapping-service';

// Validation service
export { validationService } from './validation-service';

// New consolidated budget service
export { budgetService } from './budget-service';
export { enhancedBudgetService } from './enhanced-budget-service';

// Phase 2 Services - User Experience & Insights
export { waterfallVisualizationService } from './waterfall-visualization-service';

// Phase 3 Services - Data Portability, Analytics & Performance
export { exportService } from './export-service';
export { importValidationService } from './import-validation-service';
export { cacheService, transactionCache, accountCache, analyticsCache } from './caching-service';

// Consolidated Analytics Services
export { analyticsCoreService } from './analytics-core-service';
export { insightsService } from './insights-service';
export { navigationService } from './navigation-service';

// User Actions & Behavior Tracking Services
export { userActionsService, PrivacyUtils } from './user-actions-service';

// Planning Service
export { planningService } from './planning-service';

// Re-export types from db for convenience
export type {
    Account,
    Currency,
    TagDimension,
    Tag,
    TransactionTag,
    BankTransaction,
    Transaction,
    Settings,
    UserPreferences,
    CategorizationRule,
    ImportPreset,
    ImportHistory,
    SpendingInsight,
    WhatTagType,
    WhyTagType,
    Payee,
    PriorityLevelMapping,
} from '../db';

// Re-export validation service types
export type {
    ValidationResult,
    CurrencyValidationResult,
    AmountValidationResult,
    DateValidationResult,
    AccountValidationResult,
    SplitTransactionValidationResult,
    EntityValidationResult
} from './validation-service';

// Re-export budget service types
export type {
    BudgetCategory,
    CategoryBudget,
    BudgetAllocation,
    BudgetRecommendation,
    BudgetInsight
} from './budget-service';

// Re-export enhanced budget service types
export type {
    LifeStage,
    AdaptivePriority,
    UserMaturity,
    ContextualSuggestion,
    EmotionalIntelligence,
    HybridAllocation,
    ProgressiveOnboarding
} from './enhanced-budget-service';

// Re-export Phase 2 service types
export type {
    WaterfallTier,
    WaterfallTagBudget,
    WaterfallProgressData,
    WaterfallInsight,
    WaterfallComparisonData
} from './waterfall-visualization-service';

// Re-export Phase 3 service types
export type {
    ExportOptions,
    ExportResult,
    ExportHistory
} from './export-service';

export type {
    ImportData,
    ValidationResult as ImportValidationResult,
    ImportOptions
} from './import-validation-service';

export type {
    CacheEntry,
    CacheStats,
    CacheOptions
} from './caching-service';

// Re-export consolidated analytics service types
export type {
    TransactionAnalysis,
    TrendData,
    FinancialHealthComponents,
    FinancialHealthScore as CoreFinancialHealthScore,
    GoalProgress,
    SpendingVelocity
} from './analytics-core-service';

export type {
    Insight
} from './insights-service';

// Re-export user actions service types
export type {
    TransactionEntryAction,
    BudgetInteractionAction,
    ProgressCheckingAction,
    BudgetModificationAction,
    BehaviorPattern
} from './user-actions-service';

// Re-export UserAction type from db.ts
export type { UserAction } from '$lib/core/db';

// Re-export planning service types
export type {
    DailyAllowance,
    WeeklyProjection,
    PlanningInsight,
    PlanningData
} from './planning-service'; 