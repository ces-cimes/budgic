import { insightsService } from './analytics/insights-service';
import { getPanelAlerts, getBadgeVariant } from '$lib/utils/alert-tiers';
import type { Insight } from '$lib/core/db';

/**
 * Notifications Service
 * Manages alert state for the bell panel. Panel shows Critical + High only; badge count = unread Critical + High.
 */
class NotificationsService {
	private _panelUnreadCount: number = 0;
	private _panelUnreadInsights: Insight[] = [];
	private _earlierAlerts: Insight[] = [];
	private _lastUpdate = 0;
	private _updateInterval: ReturnType<typeof setInterval> | null = null;
	private readonly UPDATE_FREQUENCY = 30 * 1000; // 30 seconds

	public get ready() {
		return Promise.resolve();
	}

	/** Unread count for badge: Critical + High only */
	get unreadCount() {
		return this._panelUnreadCount;
	}

	/** Panel list: Critical + High only (for bell panel) */
	get unreadInsights() {
		return this._panelUnreadInsights;
	}

	get hasUnread() {
		return this._panelUnreadCount > 0;
	}

	/** "Earlier (read)" section */
	get earlierAlerts() {
		return this._earlierAlerts;
	}

	/** Badge variant: 'destructive' (red) if any Critical, else 'warning' (amber) */
	get badgeVariant(): 'destructive' | 'warning' | null {
		return getBadgeVariant(this._panelUnreadInsights);
	}

	/**
	 * Initialize the service and start polling for updates.
	 * Phase 5: Populate fee-risk and negative-allowance alerts into the unified store first.
	 */
	async initialize(): Promise<void> {
		try {
			const { refreshFeeAndNegativeAllowanceInsights } = await import(
				'$lib/core/services/alerts-aggregation-service'
			);
			await refreshFeeAndNegativeAllowanceInsights();
		} catch (e) {
			console.error('Error refreshing alert sources:', e);
		}
		await this.refresh();
		this.startPolling();
	}

	/**
	 * Refresh panel alerts (Critical + High only) and earlier alerts
	 */
	async refresh(): Promise<void> {
		try {
			await insightsService.expireStaleInsights();
			const [allUnread, earlier] = await Promise.all([
				insightsService.getUnreadInsights(),
				insightsService.getEarlierInsights()
			]);

			const panelInsights = getPanelAlerts(allUnread);

			this._panelUnreadInsights = panelInsights;
			this._panelUnreadCount = panelInsights.length;
			this._earlierAlerts = earlier;
			this._lastUpdate = Date.now();
		} catch (error) {
			console.error('Error refreshing notifications:', error);
		}
	}

	/**
	 * Mark an insight as read
	 */
	async markAsRead(insightId: string): Promise<void> {
		try {
			await insightsService.markAsRead(insightId);
			this._panelUnreadInsights = this._panelUnreadInsights.filter((i) => i.id !== insightId);
			this._panelUnreadCount = this._panelUnreadCount - 1;
			await this.refresh();
		} catch (error) {
			console.error('Error marking insight as read:', error);
			throw error;
		}
	}

	/**
	 * Dismiss an insight (soft delete). Used when user taps dismiss on a card.
	 */
	async dismiss(insightId: string): Promise<void> {
		try {
			await insightsService.dismissInsight(insightId);
			this._panelUnreadInsights = this._panelUnreadInsights.filter((i) => i.id !== insightId);
			this._panelUnreadCount = this._panelUnreadCount - 1;
			await this.refresh();
		} catch (error) {
			console.error('Error dismissing insight:', error);
			throw error;
		}
	}

	/**
	 * Mark all panel alerts (Critical + High) as read. Used by "Mark all read" in Alerts panel.
	 */
	async markAllAsRead(): Promise<void> {
		try {
			await insightsService.markPanelAlertsAsRead();
			this._panelUnreadInsights = [];
			this._panelUnreadCount = 0;
			await this.refresh();
		} catch (error) {
			console.error('Error marking panel alerts as read:', error);
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

