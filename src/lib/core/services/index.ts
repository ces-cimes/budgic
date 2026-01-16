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

// Import/Export services
export * from './import-export';

// Re-export types from db for convenience
export type {
    Account,
    Currency,
    Category,
    Transaction,
    UserPreferences,
    UserAction,
    Goal,
    Insight
} from '../db';