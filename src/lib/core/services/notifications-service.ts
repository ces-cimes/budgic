import { insightsService } from './analytics/insights-service';
import type { Insight } from '$lib/core/db';
import { toast } from 'svelte-sonner';

/**
 * Notifications Service
 * Manages notification state and unread tracking for the mobile notification button
 */
class NotificationsService {
	private _unreadCount: number = 0;
	private _unreadInsights: Insight[] = [];
	private _lastUpdate = 0;
	private _updateInterval: ReturnType<typeof setInterval> | null = null;
	private readonly UPDATE_FREQUENCY = 30 * 1000; // 30 seconds

	public get ready() {
		return Promise.resolve();
	}

	get unreadCount() {
		return this._unreadCount;
	}

	get unreadInsights() {
		return this._unreadInsights;
	}

	get hasUnread() {
		return this._unreadCount > 0;
	}

	/**
	 * Initialize the service and start polling for updates
	 */
	async initialize(): Promise<void> {
		await this.refresh();
		this.startPolling();
	}

	/**
	 * Refresh unread count and insights
	 */
	async refresh(): Promise<void> {
		try {
			console.log('🔄 Refreshing notifications...');
			const [count, insights] = await Promise.all([
				insightsService.getUnreadCount(),
				insightsService.getUnreadInsights()
			]);

			const previousCount = this._unreadCount;
			console.log(`📊 Previous count: ${previousCount}, New count: ${count}`);
			
			this._unreadCount = count;
			this._unreadInsights = insights;
			this._lastUpdate = Date.now();

			// Show toast notifications for new insights (only if count increased)
			if (count > previousCount) {
				const newCount = count - previousCount;
				console.log(`🆕 Found ${newCount} new insight(s), showing toasts...`);
				const newInsights = insights.slice(0, newCount);
				newInsights.forEach(insight => {
					this.showToastNotification(insight);
				});
			} else if (count === 0 && previousCount === 0) {
				console.log('🔔 No insights found');
			}
		} catch (error) {
			console.error('❌ Error refreshing notifications:', error);
		}
	}

	/**
	 * Mark an insight as read
	 */
	async markAsRead(insightId: string): Promise<void> {
		try {
			await insightsService.markAsRead(insightId);
			// Update local state immediately
			this._unreadInsights = this._unreadInsights.filter(i => i.id !== insightId);
			this._unreadCount = this._unreadCount - 1;
			
			// Refresh to ensure consistency
			await this.refresh();
		} catch (error) {
			console.error('Error marking insight as read:', error);
			throw error;
		}
	}

	/**
	 * Show a toast notification for a new insight
	 */
	showToastNotification(insight: Insight): void {
		const message = `${this.getSeverityEmoji(insight.severity)} ${insight.title}`;
		
    	console.log(message);

		toast(message, {
			description: insight.message,
			duration: 5000
		});
	}

	private getSeverityEmoji(severity: Insight['severity']): string {
		switch (severity) {
			case 'alert':
				return '🚨';
			case 'warning':
				return '⚠️';
			case 'success':
				return '✅';
			default:
				return 'ℹ️';
		}
	}

	/**
	 * Mark all insights as read
	 */
	async markAllAsRead(): Promise<void> {
		try {
			await insightsService.markAllAsRead();
			this._unreadInsights = [];
			this._unreadCount = 0;
		} catch (error) {
			console.error('Error marking all insights as read:', error);
			throw error;
		}
	}

	/**
	 * Start polling for updates
	 */
	private startPolling(): void {
		if (this._updateInterval) {
			clearInterval(this._updateInterval);
		}

		this._updateInterval = setInterval(() => {
			this.refresh();
		}, this.UPDATE_FREQUENCY);
	}

	/**
	 * Stop polling for updates
	 */
	stopPolling(): void {
		if (this._updateInterval) {
			clearInterval(this._updateInterval);
			this._updateInterval = null;
		}
	}

	/**
	 * Get unread alerts only (severity === 'alert')
	 */
	async getUnreadAlerts(): Promise<Insight[]> {
		try {
			return await insightsService.getUnreadBySeverity('alert');
		} catch (error) {
			console.error('Error getting unread alerts:', error);
			return [];
		}
	}

	/**
	 * Get unread alerts count
	 */
	async getUnreadAlertsCount(): Promise<number> {
		const alerts = await this.getUnreadAlerts();
		return alerts.length;
	}
}

// Export singleton instance
export const notificationsService = new NotificationsService();

