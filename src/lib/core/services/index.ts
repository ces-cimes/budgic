// Core Services - Simplified Architecture
export { accountService } from './account-service';
export { transactionService } from './transaction-service';
export { budgetService } from './budget-service';
export { goalService } from './goal-service';
export { analyticsService } from './analytics-service';
export { userService } from './user-service';

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