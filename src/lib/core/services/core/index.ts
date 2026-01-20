/**
 * Core Services
 *
 * These services handle the fundamental business logic of the application:
 * - Account management and balance calculations
 * - Transaction CRUD operations and business rules
 * - Transaction dependency tracking and graph validation
 * - Budget allocation and waterfall budgeting
 * - Goal tracking and progress monitoring
 * - User preferences and behavior tracking
 * - Service-level caching and performance optimization
 */

export { accountService } from './account-service';
export { transactionService } from './transaction-service';
export { dependencyTrackingService } from './dependency-tracking-service';
export { budgetService } from './budget-service';
export { goalService } from './goal-service';
export { userService } from './user-service';
export { currencyConfigService } from './currency-config-service';
export { exchangeRateService } from './exchange-rate-service';
export { serviceCache, cacheMethod, invalidateCache } from './service-cache';
export { serviceConfig, withConfig, withFeatureFlag } from './service-config';
export {
	performanceMonitor,
	monitorPerformance,
	performanceThreshold
} from './performance-monitor';
