/**
 * Service Performance Monitor
 *
 * Provides comprehensive performance monitoring for all services,
 * including method execution times, memory usage, error rates,
 * and performance metrics.
 *
 * @example
 * ```typescript
 * import { performanceMonitor } from '$lib/core/services/core/performance-monitor';
 *
 * // Monitor a service method
 * const result = await performanceMonitor.monitor('accountService', 'getAccounts',
 *   () => accountService.getAccounts()
 * );
 *
 * // Get performance metrics
 * const metrics = performanceMonitor.getMetrics('accountService');
 * ```
 */

interface PerformanceMetric {
	serviceName: string;
	methodName: string;
	executionTime: number;
	timestamp: number;
	success: boolean;
	error?: string;
	memoryUsage?: number;
}

interface ServiceMetrics {
	serviceName: string;
	totalCalls: number;
	successfulCalls: number;
	failedCalls: number;
	averageExecutionTime: number;
	minExecutionTime: number;
	maxExecutionTime: number;
	totalExecutionTime: number;
	errorRate: number;
	lastExecutionTime: number;
	memoryUsage: number;
}

interface PerformanceReport {
	timestamp: number;
	services: ServiceMetrics[];
	overallMetrics: {
		totalCalls: number;
		averageExecutionTime: number;
		errorRate: number;
		memoryUsage: number;
	};
}

class PerformanceMonitor {
	private metrics: PerformanceMetric[] = [];
	private maxMetrics = 1000; // Keep last 1000 metrics
	private isEnabled = true;
	private listeners: ((report: PerformanceReport) => void)[] = [];

	/**
	 * Monitor a service method execution
	 *
	 * @param serviceName - Name of the service
	 * @param methodName - Name of the method
	 * @param fn - Function to monitor
	 * @returns Result of the function execution
	 */
	async monitor<T>(serviceName: string, methodName: string, fn: () => Promise<T>): Promise<T> {
		if (!this.isEnabled) {
			return await fn();
		}

		const startTime = performance.now();
		const startMemory = this.getMemoryUsage();
		let success = true;
		let error: string | undefined;

		try {
			const result = await fn();
			return result;
		} catch (err) {
			success = false;
			error = err instanceof Error ? err.message : 'Unknown error';
			throw err;
		} finally {
			const endTime = performance.now();
			const endMemory = this.getMemoryUsage();
			const executionTime = endTime - startTime;

			this.recordMetric({
				serviceName,
				methodName,
				executionTime,
				timestamp: Date.now(),
				success,
				error,
				memoryUsage: endMemory - startMemory
			});
		}
	}

	/**
	 * Record a performance metric
	 *
	 * @param metric - Performance metric to record
	 */
	recordMetric(metric: PerformanceMetric): void {
		if (!this.isEnabled) return;

		this.metrics.push(metric);

		// Keep only the last maxMetrics entries
		if (this.metrics.length > this.maxMetrics) {
			this.metrics = this.metrics.slice(-this.maxMetrics);
		}

		// Notify listeners if this is a significant metric
		if (metric.executionTime > 1000 || !metric.success) {
			// > 1 second or error
			this.notifyListeners();
		}
	}

	/**
	 * Get metrics for a specific service
	 *
	 * @param serviceName - Name of the service
	 * @returns Service metrics
	 */
	getMetrics(serviceName: string): ServiceMetrics {
		const serviceMetrics = this.metrics.filter((m) => m.serviceName === serviceName);

		if (serviceMetrics.length === 0) {
			return this.createEmptyMetrics(serviceName);
		}

		const successfulCalls = serviceMetrics.filter((m) => m.success).length;
		const failedCalls = serviceMetrics.filter((m) => !m.success).length;
		const executionTimes = serviceMetrics.map((m) => m.executionTime);

		return {
			serviceName,
			totalCalls: serviceMetrics.length,
			successfulCalls,
			failedCalls,
			averageExecutionTime: executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length,
			minExecutionTime: Math.min(...executionTimes),
			maxExecutionTime: Math.max(...executionTimes),
			totalExecutionTime: executionTimes.reduce((a, b) => a + b, 0),
			errorRate: (failedCalls / serviceMetrics.length) * 100,
			lastExecutionTime: serviceMetrics[serviceMetrics.length - 1]?.executionTime || 0,
			memoryUsage: serviceMetrics.reduce((sum, m) => sum + (m.memoryUsage || 0), 0)
		};
	}

	/**
	 * Get metrics for all services
	 *
	 * @returns Map of service metrics
	 */
	getAllMetrics(): Map<string, ServiceMetrics> {
		const serviceNames = [...new Set(this.metrics.map((m) => m.serviceName))];
		const metricsMap = new Map<string, ServiceMetrics>();

		serviceNames.forEach((serviceName) => {
			metricsMap.set(serviceName, this.getMetrics(serviceName));
		});

		return metricsMap;
	}

	/**
	 * Generate a comprehensive performance report
	 *
	 * @returns Performance report
	 */
	generateReport(): PerformanceReport {
		const allMetrics = this.getAllMetrics();
		const services = Array.from(allMetrics.values());

		const totalCalls = services.reduce((sum, s) => sum + s.totalCalls, 0);
		const totalExecutionTime = services.reduce((sum, s) => sum + s.totalExecutionTime, 0);
		const totalErrors = services.reduce((sum, s) => sum + s.failedCalls, 0);
		const totalMemoryUsage = services.reduce((sum, s) => sum + s.memoryUsage, 0);

		return {
			timestamp: Date.now(),
			services,
			overallMetrics: {
				totalCalls,
				averageExecutionTime: totalCalls > 0 ? totalExecutionTime / totalCalls : 0,
				errorRate: totalCalls > 0 ? (totalErrors / totalCalls) * 100 : 0,
				memoryUsage: totalMemoryUsage
			}
		};
	}

	/**
	 * Get recent metrics for a service
	 *
	 * @param serviceName - Name of the service
	 * @param limit - Number of recent metrics to return
	 * @returns Recent metrics
	 */
	getRecentMetrics(serviceName: string, limit: number = 10): PerformanceMetric[] {
		return this.metrics
			.filter((m) => m.serviceName === serviceName)
			.slice(-limit)
			.reverse();
	}

	/**
	 * Clear all metrics
	 */
	clearMetrics(): void {
		this.metrics = [];
	}

	/**
	 * Enable or disable performance monitoring
	 *
	 * @param enabled - Whether to enable monitoring
	 */
	setEnabled(enabled: boolean): void {
		this.isEnabled = enabled;
	}

	/**
	 * Check if monitoring is enabled
	 *
	 * @returns True if monitoring is enabled
	 */
	isMonitoringEnabled(): boolean {
		return this.isEnabled;
	}

	/**
	 * Add a listener for performance reports
	 *
	 * @param listener - Function to call when report is generated
	 */
	addListener(listener: (report: PerformanceReport) => void): void {
		this.listeners.push(listener);
	}

	/**
	 * Remove a performance report listener
	 *
	 * @param listener - Listener to remove
	 */
	removeListener(listener: (report: PerformanceReport) => void): void {
		const index = this.listeners.indexOf(listener);
		if (index > -1) {
			this.listeners.splice(index, 1);
		}
	}

	/**
	 * Get performance statistics
	 *
	 * @returns Performance statistics
	 */
	getStats(): {
		totalMetrics: number;
		servicesMonitored: number;
		averageExecutionTime: number;
		errorRate: number;
		memoryUsage: number;
	} {
		const allMetrics = this.getAllMetrics();
		const services = Array.from(allMetrics.values());

		return {
			totalMetrics: this.metrics.length,
			servicesMonitored: services.length,
			averageExecutionTime:
				services.length > 0
					? services.reduce((sum, s) => sum + s.averageExecutionTime, 0) / services.length
					: 0,
			errorRate:
				services.length > 0
					? services.reduce((sum, s) => sum + s.errorRate, 0) / services.length
					: 0,
			memoryUsage: services.reduce((sum, s) => sum + s.memoryUsage, 0)
		};
	}

	/**
	 * Create empty metrics for a service
	 *
	 * @param serviceName - Name of the service
	 * @returns Empty service metrics
	 */
	private createEmptyMetrics(serviceName: string): ServiceMetrics {
		return {
			serviceName,
			totalCalls: 0,
			successfulCalls: 0,
			failedCalls: 0,
			averageExecutionTime: 0,
			minExecutionTime: 0,
			maxExecutionTime: 0,
			totalExecutionTime: 0,
			errorRate: 0,
			lastExecutionTime: 0,
			memoryUsage: 0
		};
	}

	/**
	 * Get current memory usage
	 *
	 * @returns Memory usage in bytes
	 */
	private getMemoryUsage(): number {
		const perf = performance as Performance & {
			memory?: { usedJSHeapSize: number };
		};
		if (typeof performance !== 'undefined' && perf.memory) {
			return perf.memory.usedJSHeapSize;
		}
		return 0;
	}

	/**
	 * Notify all listeners of performance report
	 */
	private notifyListeners(): void {
		const report = this.generateReport();
		this.listeners.forEach((listener) => {
			try {
				listener(report);
			} catch (error) {
				console.error('Error in performance monitor listener:', error);
			}
		});
	}
}

/**
 * Singleton instance of PerformanceMonitor
 *
 * This is the main performance monitoring instance used throughout the application.
 * It provides comprehensive performance monitoring for all services.
 */
export const performanceMonitor = new PerformanceMonitor();

/**
 * Performance monitoring decorator for service methods
 *
 * Automatically monitors method execution performance
 *
 * @example
 * ```typescript
 * class MyService {
 *   @monitorPerformance
 *   async getData(): Promise<Data> {
 *     // Method execution will be automatically monitored
 *   }
 * }
 * ```
 */
export function monitorPerformance(
	target: any,
	propertyName: string,
	descriptor: PropertyDescriptor
) {
	const method = descriptor.value;
	const serviceName = target.constructor.name;

	descriptor.value = async function (...args: any[]) {
		return await performanceMonitor.monitor(serviceName, propertyName, () =>
			method.apply(this, args)
		);
	};

	return descriptor;
}

/**
 * Performance threshold decorator
 *
 * Warns when method execution exceeds threshold
 *
 * @param threshold - Execution time threshold in milliseconds
 *
 * @example
 * ```typescript
 * class MyService {
 *   @performanceThreshold(1000)
 *   async slowMethod(): Promise<Data> {
 *     // Will warn if execution takes longer than 1 second
 *   }
 * }
 * ```
 */
export function performanceThreshold(threshold: number) {
	return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
		const method = descriptor.value;
		const serviceName = target.constructor.name;

		descriptor.value = async function (...args: any[]) {
			const startTime = performance.now();
			const result = await method.apply(this, args);
			const executionTime = performance.now() - startTime;

			if (executionTime > threshold) {
				console.warn(
					`Performance warning: ${serviceName}.${propertyName} ` +
						`took ${executionTime.toFixed(2)}ms (threshold: ${threshold}ms)`
				);
			}

			return result;
		};

		return descriptor;
	};
}

// Auto-generate reports every 5 minutes
setInterval(
	() => {
		if (performanceMonitor.isMonitoringEnabled()) {
			const report = performanceMonitor.generateReport();
			console.log('Performance Report:', report);
		}
	},
	5 * 60 * 1000
);
