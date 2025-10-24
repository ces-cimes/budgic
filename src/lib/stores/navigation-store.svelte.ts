import { insightsService } from '$lib/core/services';
import { navigationService } from '$lib/core/services/navigation-service';
import type { NavItemConfig } from '$lib/core/services/navigation-service';

/**
 * Navigation store using Svelte 5 runes
 * Manages navigation items and dynamic badges
 */
class NavigationStore {
	private _items = $state<NavItemConfig[]>([]);
	private _mobileItems = $state<NavItemConfig[]>([]);
	private _desktopItems = $state<NavItemConfig[]>([]);
	private _badges = $state<Map<string, number | boolean | string>>(new Map());
	private _loading = $state(true);
	private _initialized = $state(false);
	
	private updateInterval: ReturnType<typeof setInterval> | null = null;
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

			// Initialize navigation service (already has its own race protection)
			await navigationService.initialize();

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
	 * Load navigation items from service
	 */
	async loadItems(): Promise<void> {
		try {
			this._items = await navigationService.getNavigationItems();
			this._mobileItems = await navigationService.getMobileNavigationItems(5);
			this._desktopItems = await navigationService.getDesktopNavigationItems();
		} catch (error) {
			console.error('Error loading navigation items:', error);
		}
	}

	/**
	 * Update badge values
	 */
	async updateBadges(): Promise<void> {
		try {
			// Get insights count
			const insightsCount = insightsService.getInsightsCount();
			
			// Update badge for insights
			this.setBadge('insights', insightsCount.total);
			
			// You can add more badge updates here
			// Example: unread notifications, pending transactions, etc.
			
		} catch (error) {
			console.error('Error updating badges:', error);
		}
	}

	/**
	 * Set a badge value
	 */
	setBadge(key: string, value: number | boolean | string): void {
		this._badges.set(key, value);
		navigationService.setBadgeValue(key, value);
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
		const visible = await navigationService.getMobileNavigationItems(limit);
		const overflow = await navigationService.getOverflowNavigationItems(limit);
		
		return { visible, overflow };
	}

	/**
	 * Update item order
	 */
	async updateItemOrder(itemId: string, newOrder: number): Promise<void> {
		await navigationService.updateItemOrder(itemId, newOrder);
		await this.loadItems();
	}

	/**
	 * Update item visibility
	 */
	async updateItemVisibility(
		itemId: string,
		visibility: { visible?: boolean; showInMobile?: boolean; showInDesktop?: boolean }
	): Promise<void> {
		await navigationService.updateItemVisibility(itemId, visibility);
		await this.loadItems();
	}

	/**
	 * Reset to default configuration
	 */
	async resetToDefaults(): Promise<void> {
		await navigationService.resetToDefaults();
		await this.loadItems();
	}

	/**
	 * Start periodic badge updates
	 */
	private startBadgeUpdates(): void {
		if (this.updateInterval) {
			clearInterval(this.updateInterval);
		}

		// Update badges every 30 seconds
		this.updateInterval = setInterval(() => {
			this.updateBadges();
		}, 30 * 1000);
	}

	/**
	 * Stop periodic badge updates
	 */
	stopBadgeUpdates(): void {
		if (this.updateInterval) {
			clearInterval(this.updateInterval);
			this.updateInterval = null;
		}
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

