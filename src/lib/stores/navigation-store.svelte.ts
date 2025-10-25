import { analyticsService } from '$lib/core/services';

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
			// Define static navigation items for simplified architecture
			const defaultItems = [
				{
					id: 'dashboard',
					label: 'Dashboard',
					path: '/',
					icon: 'home',
					visible: true,
					showInMobile: true,
					showInDesktop: true
				},
				{
					id: 'accounts',
					label: 'Accounts',
					path: '/accounts',
					icon: 'credit-card',
					visible: true,
					showInMobile: true,
					showInDesktop: true
				},
				{
					id: 'transactions',
					label: 'Transactions',
					path: '/transactions',
					icon: 'receipt',
					visible: true,
					showInMobile: true,
					showInDesktop: true
				},
				{
					id: 'categories',
					label: 'Categories',
					path: '/categories',
					icon: 'calendar', // Using calendar icon for categories
					visible: true,
					showInMobile: true,
					showInDesktop: true
				},
				{
					id: 'budget',
					label: 'Budget',
					path: '/plan',
					icon: 'bar-chart-3',
					visible: true,
					showInMobile: true,
					showInDesktop: true
				},
				{
					id: 'goals',
					label: 'Goals',
					path: '/goals',
					icon: 'target',
					visible: true,
					showInMobile: true,
					showInDesktop: true
				},
				{
					id: 'analyze',
					label: 'Analyze',
					path: '/analyze',
					icon: 'bar-chart-3',
					visible: true,
					showInMobile: true,
					showInDesktop: true
				},
				{
					id: 'insights',
					label: 'Insights',
					path: '/insights',
					icon: 'bell',
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
					id: 'settings',
					label: 'Settings',
					path: '/settings',
					icon: 'settings',
					visible: true,
					showInMobile: true,
					showInDesktop: true
				}
			];

			// Load custom order from localStorage
			const customOrder = localStorage.getItem('budgic-navigation-order');
			if (customOrder) {
				try {
					const orderArray = JSON.parse(customOrder);
					// Reorder items based on saved order
					const orderedItems = orderArray.map((id: string) => 
						defaultItems.find(item => item.id === id)
					).filter(Boolean);
					
					// Add any new items that weren't in the saved order
					const existingIds = new Set(orderArray);
					const newItems = defaultItems.filter(item => !existingIds.has(item.id));
					
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
					this._items = this._items.map(item => ({
						...item,
						...settings[item.id]
					}));
				} catch (error) {
					console.error('Error parsing visibility settings:', error);
				}
			}

			// Update mobile items - specific order: Home, Transactions, Plan, Analyze, [overflow]
			// Find the indices of the key items in the current order
			const homeIndex = this._items.findIndex(item => item.id === 'dashboard');
			const transactionsIndex = this._items.findIndex(item => item.id === 'transactions');
			const planIndex = this._items.findIndex(item => item.id === 'budget');
			const analyzeIndex = this._items.findIndex(item => item.id === 'analyze');
			
			// Create mobile items array with the specific order
			const mobileOrder = [homeIndex, transactionsIndex, planIndex, analyzeIndex]
				.filter(index => index !== -1)
				.map(index => this._items[index]);
			
			// Add remaining items to overflow
			const remainingItems = this._items.filter(item => 
				!['dashboard', 'transactions', 'budget', 'analyze'].includes(item.id)
			);
			
			this._mobileItems = [...mobileOrder, ...remainingItems];
			
			// Desktop items (all visible items)
			this._desktopItems = this._items.filter(item => item.visible && item.showInDesktop);
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
			const itemIndex = this._items.findIndex(item => item.id === itemId);
			if (itemIndex === -1) return;

			// Create new array with reordered items
			const newItems = [...this._items];
			const [movedItem] = newItems.splice(itemIndex, 1);
			newItems.splice(newOrder, 0, movedItem);

			// Update the items array
			this._items = newItems;

			// Update mobile items - maintain the specific order: Home, Transactions, Plan, Analyze, [overflow]
			// Find the indices of the key items in the new order
			const homeIndex = newItems.findIndex(item => item.id === 'dashboard');
			const transactionsIndex = newItems.findIndex(item => item.id === 'transactions');
			const planIndex = newItems.findIndex(item => item.id === 'budget');
			const analyzeIndex = newItems.findIndex(item => item.id === 'analyze');
			
			// Create mobile items array with the specific order
			const mobileOrder = [homeIndex, transactionsIndex, planIndex, analyzeIndex]
				.filter(index => index !== -1)
				.map(index => newItems[index]);
			
			// Add remaining items to overflow
			const remainingItems = newItems.filter(item => 
				!['dashboard', 'transactions', 'budget', 'analyze'].includes(item.id)
			);
			
			this._mobileItems = [...mobileOrder, ...remainingItems];

			// Update desktop items to match the new order
			this._desktopItems = [...newItems];

			// Store the custom order in localStorage for persistence
			const customOrder = newItems.map(item => item.id);
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
		visibility: { visible?: boolean; showInMobile?: boolean; showInDesktop?: boolean }
	): Promise<void> {
		try {
			// Find and update the item
			const itemIndex = this._items.findIndex(item => item.id === itemId);
			if (itemIndex === -1) return;

			const updatedItem = { ...this._items[itemIndex], ...visibility };
			this._items[itemIndex] = updatedItem;

			// Update mobile and desktop items based on visibility
			this._mobileItems = this._items.filter(item => item.visible && item.showInMobile);
			this._desktopItems = this._items.filter(item => item.visible && item.showInDesktop);

			// Store visibility settings in localStorage
			const visibilitySettings = this._items.reduce((acc, item) => {
				acc[item.id] = {
					visible: item.visible,
					showInMobile: item.showInMobile,
					showInDesktop: item.showInDesktop
				};
				return acc;
			}, {} as Record<string, any>);
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

