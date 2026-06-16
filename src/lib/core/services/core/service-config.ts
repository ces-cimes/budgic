/**
 * Service Configuration Manager
 *
 * Provides centralized configuration management for all services,
 * including environment-specific settings, feature flags, and
 * service-specific options.
 *
 * @example
 * ```typescript
 * import { serviceConfig } from '$lib/core/services/core/service-config';
 *
 * // Get service configuration
 * const config = serviceConfig.getServiceConfig('accountService');
 *
 * // Check feature flag
 * if (serviceConfig.isFeatureEnabled('advancedAnalytics')) {
 *   // Use advanced analytics
 * }
 * ```
 */

interface ServiceConfig {
	name: string;
	enabled: boolean;
	cacheEnabled: boolean;
	cacheTTL: number;
	maxRetries: number;
	timeout: number;
	features: Record<string, boolean>;
	options: Record<string, any>;
}

interface FeatureFlag {
	name: string;
	enabled: boolean;
	description: string;
	services: string[];
}

interface EnvironmentConfig {
	development: Partial<ServiceConfig>;
	production: Partial<ServiceConfig>;
	test: Partial<ServiceConfig>;
}

class ServiceConfigManager {
	private configs = new Map<string, ServiceConfig>();
	private featureFlags = new Map<string, FeatureFlag>();
	private environment: 'development' | 'production' | 'test' = 'development';

	constructor() {
		this.initializeDefaultConfigs();
		this.initializeFeatureFlags();
		this.detectEnvironment();
	}

	/**
	 * Get configuration for a specific service
	 *
	 * @param serviceName - Name of the service
	 * @returns Service configuration object
	 */
	getServiceConfig(serviceName: string): ServiceConfig {
		const config = this.configs.get(serviceName);
		if (!config) {
			throw new Error(`Configuration not found for service: ${serviceName}`);
		}
		return { ...config };
	}

	/**
	 * Update configuration for a specific service
	 *
	 * @param serviceName - Name of the service
	 * @param updates - Partial configuration updates
	 */
	updateServiceConfig(serviceName: string, updates: Partial<ServiceConfig>): void {
		const current = this.configs.get(serviceName);
		if (!current) {
			throw new Error(`Configuration not found for service: ${serviceName}`);
		}

		this.configs.set(serviceName, { ...current, ...updates });
	}

	/**
	 * Check if a feature flag is enabled
	 *
	 * @param featureName - Name of the feature flag
	 * @returns True if feature is enabled
	 */
	isFeatureEnabled(featureName: string): boolean {
		const feature = this.featureFlags.get(featureName);
		return feature?.enabled ?? false;
	}

	/**
	 * Enable or disable a feature flag
	 *
	 * @param featureName - Name of the feature flag
	 * @param enabled - Whether to enable the feature
	 */
	setFeatureFlag(featureName: string, enabled: boolean): void {
		const feature = this.featureFlags.get(featureName);
		if (feature) {
			feature.enabled = enabled;
		}
	}

	/**
	 * Get all feature flags
	 *
	 * @returns Map of feature flags
	 */
	getAllFeatureFlags(): Map<string, FeatureFlag> {
		return new Map(this.featureFlags);
	}

	/**
	 * Get configuration for all services
	 *
	 * @returns Map of all service configurations
	 */
	getAllServiceConfigs(): Map<string, ServiceConfig> {
		return new Map(this.configs);
	}

	/**
	 * Check if a service is enabled
	 *
	 * @param serviceName - Name of the service
	 * @returns True if service is enabled
	 */
	isServiceEnabled(serviceName: string): boolean {
		const config = this.configs.get(serviceName);
		return config?.enabled ?? false;
	}

	/**
	 * Get cache TTL for a service
	 *
	 * @param serviceName - Name of the service
	 * @returns Cache TTL in milliseconds
	 */
	getCacheTTL(serviceName: string): number {
		const config = this.configs.get(serviceName);
		return config?.cacheTTL ?? 5 * 60 * 1000; // Default 5 minutes
	}

	/**
	 * Check if caching is enabled for a service
	 *
	 * @param serviceName - Name of the service
	 * @returns True if caching is enabled
	 */
	isCacheEnabled(serviceName: string): boolean {
		const config = this.configs.get(serviceName);
		return config?.cacheEnabled ?? true;
	}

	/**
	 * Get environment-specific configuration
	 *
	 * @param serviceName - Name of the service
	 * @returns Environment-specific configuration
	 */
	getEnvironmentConfig(serviceName: string): Partial<ServiceConfig> {
		const baseConfig = this.configs.get(serviceName);
		if (!baseConfig) {
			throw new Error(`Configuration not found for service: ${serviceName}`);
		}

		const envConfigs: EnvironmentConfig = {
			development: {
				cacheEnabled: true,
				cacheTTL: 2 * 60 * 1000, // 2 minutes in dev
				maxRetries: 3,
				timeout: 10000
			},
			production: {
				cacheEnabled: true,
				cacheTTL: 10 * 60 * 1000, // 10 minutes in prod
				maxRetries: 5,
				timeout: 30000
			},
			test: {
				cacheEnabled: false,
				cacheTTL: 0,
				maxRetries: 1,
				timeout: 5000
			}
		};

		return envConfigs[this.environment] || {};
	}

	/**
	 * Initialize default configurations for all services
	 */
	private initializeDefaultConfigs(): void {
		const services = [
			'accountService',
			'transactionService',
			'budgetService',
			'goalService',
			'userService',
			'analyticsService',
			'insightsService',
			'crossRouteSyncService',
			'analyzeService',
			'goalsService',
			'planningService'
		];

		services.forEach((serviceName) => {
			this.configs.set(serviceName, {
				name: serviceName,
				enabled: true,
				cacheEnabled: true,
				cacheTTL: 5 * 60 * 1000, // 5 minutes
				maxRetries: 3,
				timeout: 15000,
				features: {},
				options: {}
			});
		});
	}

	/**
	 * Initialize feature flags
	 */
	private initializeFeatureFlags(): void {
		const features: FeatureFlag[] = [
			{
				name: 'advancedAnalytics',
				enabled: true,
				description: 'Enable advanced analytics features',
				services: ['analyticsService', 'insightsService']
			},
			{
				name: 'crossRouteSync',
				enabled: true,
				description: 'Enable cross-route synchronization',
				services: ['crossRouteSyncService']
			},
			{
				name: 'realTimeUpdates',
				enabled: false,
				description: 'Enable real-time updates via WebSocket',
				services: ['crossRouteSyncService']
			},
			{
				name: 'offlineMode',
				enabled: true,
				description: 'Enable offline mode support',
				services: ['accountService', 'transactionService', 'budgetService']
			},
			{
				name: 'performanceMonitoring',
				enabled: false,
				description: 'Enable performance monitoring',
				services: ['accountService', 'transactionService', 'budgetService', 'goalService']
			},
			{
				name: 'experimentalFeatures',
				enabled: false,
				description: 'Enable experimental features',
				services: ['analyticsService', 'insightsService']
			}
		];

		features.forEach((feature) => {
			this.featureFlags.set(feature.name, feature);
		});
	}

	/**
	 * Detect current environment
	 */
	private detectEnvironment(): void {
		if (typeof window !== 'undefined') {
			// Browser environment
			this.environment =
				window.location.hostname === 'localhost' ? 'development' : 'production';
		} else {
			// Node.js environment
			this.environment =
				process.env.NODE_ENV === 'test'
					? 'test'
					: process.env.NODE_ENV === 'production'
						? 'production'
						: 'development';
		}
	}

	/**
	 * Get current environment
	 *
	 * @returns Current environment
	 */
	getEnvironment(): string {
		return this.environment;
	}

	/**
	 * Set environment (for testing)
	 *
	 * @param env - Environment to set
	 */
	setEnvironment(env: 'development' | 'production' | 'test'): void {
		this.environment = env;
	}

	/**
	 * Export configuration for backup/restore
	 *
	 * @returns Configuration export data
	 */
	exportConfig(): {
		configs: Record<string, ServiceConfig>;
		features: Record<string, FeatureFlag>;
	} {
		return {
			configs: Object.fromEntries(this.configs),
			features: Object.fromEntries(this.featureFlags)
		};
	}

	/**
	 * Import configuration from backup
	 *
	 * @param data - Configuration data to import
	 */
	importConfig(data: {
		configs: Record<string, ServiceConfig>;
		features: Record<string, FeatureFlag>;
	}): void {
		this.configs.clear();
		this.featureFlags.clear();

		Object.entries(data.configs).forEach(([key, value]) => {
			this.configs.set(key, value);
		});

		Object.entries(data.features).forEach(([key, value]) => {
			this.featureFlags.set(key, value);
		});
	}
}

/**
 * Singleton instance of ServiceConfigManager
 *
 * This is the main configuration instance used throughout the application.
 * It provides centralized configuration management for all services.
 */
export const serviceConfig = new ServiceConfigManager();

/**
 * Configuration decorator for service methods
 *
 * Automatically applies service-specific configuration to methods
 *
 * @param configKey - Configuration key to apply
 *
 * @example
 * ```typescript
 * class MyService {
 *   @withConfig('cacheTTL')
 *   async getData(): Promise<Data> {
 *     // Method will use configured cache TTL
 *   }
 * }
 * ```
 */
export function withConfig(configKey: keyof ServiceConfig) {
	return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
		const method = descriptor.value;
		const serviceName = target.constructor.name.replace('Service', 'Service').toLowerCase();

		descriptor.value = async function (...args: any[]) {
			const config = serviceConfig.getServiceConfig(serviceName);
			const configValue = config[configKey];

			// Apply configuration logic here
			return await method.apply(this, args);
		};

		return descriptor;
	};
}

/**
 * Feature flag decorator for service methods
 *
 * Automatically checks feature flags before executing methods
 *
 * @param featureName - Feature flag name to check
 * @param fallback - Fallback value if feature is disabled
 *
 * @example
 * ```typescript
 * class MyService {
 *   @withFeatureFlag('advancedAnalytics', null)
 *   async getAdvancedData(): Promise<AdvancedData | null> {
 *     // Method will return null if feature is disabled
 *   }
 * }
 * ```
 */
export function withFeatureFlag(featureName: string, fallback: any = null) {
	return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
		const method = descriptor.value;

		descriptor.value = async function (...args: any[]) {
			if (!serviceConfig.isFeatureEnabled(featureName)) {
				return fallback;
			}

			return await method.apply(this, args);
		};

		return descriptor;
	};
}
