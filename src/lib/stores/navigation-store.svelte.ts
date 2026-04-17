import {
	analyticsService,
	reconciliationService,
	accountService,
	notificationsService,
	userService
} from '$lib/core/services';
import { scheduler } from '$lib/utils/scheduler';
import { planTabs, insightsNavTabsForMaturity, reportsTabs } from '$lib/config/nav-tabs';

const NAV_BADGES_TASK = 'nav:badge-updates';

export interface NavTabDef {
	id: string;
	label: string;
}

export interface NavItemConfig {
	id: string;
	label: string;
	path: string;
	icon?: string;
	badge?: {
		type: 'count' | 'indicator' | 'text';
		value?: number | string;
		color?: string;
		countKey?: string;
	};
	children?: NavItemConfig[];
	/** Desktop sidebar: group for sectioning (main, more, bottom). */
	group?: 'main' | 'more' | 'bottom';
	/** If true, clicking this item opens a panel instead of navigating (e.g. Alerts). */
	opensPanel?: boolean;
	/** Desktop sidebar: optional label for the group (e.g. "Insights"). */
	groupLabel?: string;
	/** Desktop sidebar: tab sub-links for routes with ?tab= (plan, insights, reports). */
	tabs?: NavTabDef[];
	requiresAuth?: boolean;
	hidden?: boolean;
	visible?: boolean;
	showInMobile?: boolean;
	showInDesktop?: boolean;
}

/**
 * Navigation store using Svelte 5 runes
 * Manages navigation items and dynamic badges
 */
class NavigationStore {
	private _items = $state<NavItemConfig[]>([]);
	private _mobileItems = $state<NavItemConfig[]>([]);
	private _desktopItems = $state<NavItemConfig[]>([]);
	private _badges = $state<Map<string, number | boolean | string>>(new Map());
	/** Matches `notificationsService.badgeVariant` after each alerts refresh (sidebar bell). */
	private _alertsBadgeVariant = $state<'destructive' | 'warning' | null>(null);
	private _loading = $state(true);
	private _initialized = $state(false);

	private initializationPromise: Promise<void> | null = null;

	constructor() {
		// Initialize on creation
		this.initialize();
	}

	// Getters for reactive state
	get items() {
		return this._items;
	}

	get mobileItems() {
		return this._mobileItems;
	}

	get desktopItems() {
		return this._desktopItems;
	}

	get badges() {
		return this._badges;
	}

	/** Red if any Critical unread, amber if only High; null when no panel unread alerts. */
	get alertsBadgeVariant() {
		return this._alertsBadgeVariant;
	}

	get loading() {
		return this._loading;
	}

	get initialized() {
		return this._initialized;
	}

	/**
	 * Initialize the store
	 * Protected against race conditions
	 */
	async initialize(): Promise<void> {
		// If already initialized, return immediately
		if (this._initialized) return;

		// If initialization is in progress, wait for it to complete
		if (this.initializationPromise) {
			return this.initializationPromise;
		}

		// Create and store the initialization promise
		this.initializationPromise = this._initialize();

		try {
			await this.initializationPromise;
		} finally {
			// Clear the promise after completion
			this.initializationPromise = null;
		}
	}

	/**
	 * Internal initialization logic
	 */
	private async _initialize(): Promise<void> {
		try {
			this._loading = true;

			// Load navigation items
			await this.loadItems();

			// Update badges
			await this.updateBadges();

			// Start periodic badge updates
			this.startBadgeUpdates();

			this._initialized = true;
		} catch (error) {
			console.error('Error initializing navigation store:', error);
		} finally {
			this._loading = false;
		}
	}

	/**
	 * Load navigation items
	 */
	async loadItems(): Promise<void> {
		try {
			let insightsNavTabs = insightsNavTabsForMaturity('beginner');
			try {
				const prefs = await userService.getUserPreferences();
				const level =
					(prefs as { userMaturityLevel?: string } | null | undefined)?.userMaturityLevel ??
					'beginner';
				insightsNavTabs = insightsNavTabsForMaturity(level);
			} catch {
				// Keep beginner-filtered tabs (conservative; matches default route behavior)
			}

			// New IA: first 4 = Home, Trans, Plan, Insights (mobile bar); Accounts, Reports, Settings in More; Alerts in bottom (panel)
			const defaultItems: NavItemConfig[] = [
				{
					id: 'dashboard',
					label: 'Home',
					path: '/',
					icon: 'home',
					group: 'main',
					visible: true,
					showInMobile: true,
					showInDesktop: true
				},
				{
					id: 'transactions',
					label: 'Transactions',
					path: '/transactions',
					icon: 'receipt',
					group: 'main',
					visible: true,
					showInMobile: true,
					showInDesktop: true
				},
				{
					id: 'plan',
					label: 'Plan',
					path: '/plan',
					icon: 'wallet',
					group: 'main',
					tabs: planTabs,
					visible: true,
					showInMobile: true,
					showInDesktop: true
				},
				{
					id: 'insights',
					label: 'Insights',
					path: '/insights',
					icon: 'bell',
					group: 'main',
					tabs: insightsNavTabs,
					visible: true,
					showInMobile: true,
					showInDesktop: true,
					badge: {
						type: 'count' as const,
						value: 0,
						color: 'info',
						countKey: 'insights'
					}
				},
				{
					id: 'accounts',
					label: 'Accounts',
					path: '/accounts',
					icon: 'credit-card',
					group: 'more',
					visible: true,
					showInMobile: true,
					showInDesktop: true,
					badge: {
						type: 'count' as const,
						value: 0,
						color: 'warning',
						countKey: 'reconciliation'
					}
				},
				{
					id: 'reports',
					label: 'Reports',
					path: '/reports',
					icon: 'trending-up',
					group: 'more',
					tabs: reportsTabs,
					visible: true,
					showInMobile: true,
					showInDesktop: true
				},
				{
					id: 'settings',
					label: 'Settings',
					path: '/settings',
					icon: 'settings',
					group: 'bottom',
					visible: true,
					showInMobile: true,
					showInDesktop: true
				},
				{
					id: 'alerts',
					label: 'Alerts',
					path: '#',
					icon: 'bell',
					group: 'bottom',
					opensPanel: true,
					visible: true,
					showInMobile: false,
					showInDesktop: true,
					badge: {
						type: 'count' as const,
						value: 0,
						color: 'danger',
						countKey: 'alerts'
					}
				}
			];

			// Map old nav ids to new (for users with saved order)
			const legacyIdMap: Record<string, string> = {
				budget: 'plan',
				goals: 'plan',
				categories: 'plan',
				analyze: 'reports',
				optimization: 'insights',
				reconciliation: 'accounts'
			};
			const validIds = new Set(defaultItems.map((i) => i.id));

			// Load custom order from localStorage
			const customOrder = localStorage.getItem('budgic-navigation-order');
			if (customOrder) {
				try {
					const orderArray = JSON.parse(customOrder) as string[];
					const mappedIds = orderArray
						.map((id: string) => legacyIdMap[id] ?? id)
						.filter((id) => validIds.has(id));
					const uniqueOrder = [...new Set(mappedIds)];
					const orderedItems = uniqueOrder
						.map((id) => defaultItems.find((item) => item.id === id))
						.filter((item): item is NavItemConfig => item != null);
					const existingIds = new Set(uniqueOrder);
					const newItems = defaultItems.filter((item) => !existingIds.has(item.id));

					this._items = [...orderedItems, ...newItems];
				} catch (error) {
					console.error('Error parsing custom order:', error);
					this._items = defaultItems;
				}
			} else {
				this._items = defaultItems;
			}

			// Load visibility settings from localStorage
			const visibilitySettings = localStorage.getItem('budgic-navigation-visibility');
			if (visibilitySettings) {
				try {
					const settings = JSON.parse(visibilitySettings);
					this._items = this._items.map((item) => ({
						...item,
						...settings[item.id]
					}));
				} catch (error) {
					console.error('Error parsing visibility settings:', error);
				}
			}

			// Unified navigation: both mobile and desktop use the same order
			// Mobile shows first 4 items in main bar, rest in overflow
			// Desktop shows all visible items in sidebar
			this._mobileItems = this._items.filter((item) => item.showInMobile);
			this._desktopItems = this._items.filter((item) => item.showInDesktop);
		} catch (error) {
			console.error('Error loading navigation items:', error);
		}
	}

	/**
	 * Update badge values
	 */
	async updateBadges(): Promise<void> {
		try {
			// For now, set a simple badge count
			// This can be enhanced later with actual insights
			this.setBadge('insights', 0);

			// Alerts badge: unread Critical + High only (panel count)
			try {
				await notificationsService.refresh();
				this.setBadge('alerts', notificationsService.unreadCount);
				this._alertsBadgeVariant = notificationsService.badgeVariant;
			} catch {
				this.setBadge('alerts', 0);
				this._alertsBadgeVariant = null;
			}

			// Update reconciliation badge - count accounts needing reconciliation
			try {
				const accounts = await accountService.getAccounts();
				let needsReconciliation = 0;

				const summaryPromises = accounts.map(async (account) => {
					try {
						const summary = await reconciliationService.getReconciliationSummary(account.id);
						// Count accounts that haven't been reconciled in >30 days or never
						if (
							summary.daysSinceLastReconciliation > 30 ||
							summary.daysSinceLastReconciliation === -1
						) {
							needsReconciliation++;
						}
						// Also count accounts with unresolved discrepancies
						if (summary.unresolvedDiscrepancies > 0) {
							needsReconciliation++;
						}
					} catch (err) {
						// Silently ignore errors for individual accounts
						console.debug(`Failed to get reconciliation summary for account ${account.name}:`, err);
					}
				});

				await Promise.all(summaryPromises);
				this.setBadge('reconciliation', needsReconciliation);
			} catch (error) {
				// If reconciliation service fails, set badge to 0
				this.setBadge('reconciliation', 0);
			}

			// You can add more badge updates here
			// Example: unread notifications, pending transactions, etc.
		} catch (error) {
			console.error('Error updating badges:', error);
		}
	}

	/**
	 * Set a badge value. Reassigns the map so Svelte 5 $state reactivity picks up changes.
	 */
	setBadge(key: string, value: number | boolean | string): void {
		this._badges.set(key, value);
		this._badges = new Map(this._badges);
	}

	/**
	 * Get a badge value
	 */
	getBadge(key: string): number | boolean | string | undefined {
		return this._badges.get(key);
	}

	/**
	 * Get mobile items with overflow handling
	 */
	async getMobileItemsWithOverflow(limit: number = 5): Promise<{
		visible: NavItemConfig[];
		overflow: NavItemConfig[];
	}> {
		const visible = this._mobileItems.slice(0, limit);
		const overflow = this._mobileItems.slice(limit);

		return { visible, overflow };
	}

	/**
	 * Update item order
	 */
	async updateItemOrder(itemId: string, newOrder: number): Promise<void> {
		try {
			// Find the item to move
			const itemIndex = this._items.findIndex((item) => item.id === itemId);
			if (itemIndex === -1) return;

			// Create new array with reordered items
			const newItems = [...this._items];
			const [movedItem] = newItems.splice(itemIndex, 1);
			newItems.splice(newOrder, 0, movedItem);

			// Update the items array
			this._items = newItems;

			// Update mobile and desktop items to match the unified order
			this._mobileItems = this._items.filter((item) => item.showInMobile);
			this._desktopItems = this._items.filter((item) => item.showInDesktop);

			// Store the custom order in localStorage for persistence
			const customOrder = newItems.map((item) => item.id);
			localStorage.setItem('budgic-navigation-order', JSON.stringify(customOrder));
		} catch (error) {
			console.error('Error updating item order:', error);
			throw error;
		}
	}

	/**
	 * Update item visibility
	 */
	async updateItemVisibility(
		itemId: string,
		visibility: { showInMobile?: boolean; showInDesktop?: boolean }
	): Promise<void> {
		try {
			// Find and update the item
			const itemIndex = this._items.findIndex((item) => item.id === itemId);
			if (itemIndex === -1) return;

			const updatedItem = { ...this._items[itemIndex], ...visibility };
			this._items[itemIndex] = updatedItem;

			// Update mobile and desktop items based on visibility
			this._mobileItems = this._items.filter((item) => item.showInMobile);
			this._desktopItems = this._items.filter((item) => item.showInDesktop);

			// Store visibility settings in localStorage
			const visibilitySettings = this._items.reduce(
				(acc, item) => {
					acc[item.id] = {
						showInMobile: item.showInMobile,
						showInDesktop: item.showInDesktop
					};
					return acc;
				},
				{} as Record<string, any>
			);
			localStorage.setItem('budgic-navigation-visibility', JSON.stringify(visibilitySettings));
		} catch (error) {
			console.error('Error updating item visibility:', error);
			throw error;
		}
	}

	/**
	 * Reset to default configuration
	 */
	async resetToDefaults(): Promise<void> {
		try {
			// Clear localStorage
			localStorage.removeItem('budgic-navigation-order');
			localStorage.removeItem('budgic-navigation-visibility');

			// Reload items with default configuration
			await this.loadItems();
		} catch (error) {
			console.error('Error resetting to defaults:', error);
			throw error;
		}
	}

	/**
	 * Start periodic badge updates
	 */
	private startBadgeUpdates(): void {
		scheduler.schedule(NAV_BADGES_TASK, () => this.updateBadges(), 30 * 1000);
	}

	/**
	 * Stop periodic badge updates
	 */
	stopBadgeUpdates(): void {
		scheduler.cancel(NAV_BADGES_TASK);
	}

	/**
	 * Force refresh
	 */
	async refresh(): Promise<void> {
		await this.loadItems();
		await this.updateBadges();
	}
}

// Export singleton instance
export const navigationStore = new NavigationStore();
