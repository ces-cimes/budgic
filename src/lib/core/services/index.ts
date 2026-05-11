/**
 * Budgic Services
 *
 * Centralized service exports organized by category for better maintainability.
 * All services follow consistent patterns and are designed to be stateless and testable.
 */

// Core business logic services
export * from './core';

// Analytics and insights services
export * from './analytics';

// Page-specific services
export * from './pages';

// Alerts aggregation (Phase 5 — unified alerts: fee + negative allowance → Insight store)
export { refreshFeeAndNegativeAllowanceInsights } from './alerts-aggregation-service';
export { autocompleteService } from './autocomplete-service';

// Import/Export services
export * from './import-export';
export * from './intelligence';

// Re-export types from db for convenience
export type {
	Account,
	Currency,
	Category,
	Transaction,
	DataCorrection,
	UserPreferences,
	UserAction,
	Goal,
	Insight,
	ReconciliationRecord,
	ReconciliationDiscrepancy
} from '../db';

export type { Recommendation } from './analytics/recommendation-service';
