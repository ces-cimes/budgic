import { db, generateUUID } from '$lib/core/db';
import type { ComponentType } from 'svelte';

// ============================================================================
// NAVIGATION TYPES
// ============================================================================

export interface NavItemConfig {
	id: string;
	path: string;
	label: string;
	icon: string; // Icon name from lucide-svelte
	hasSubRoutes: boolean;
	order: number;
	visible: boolean;
	showInMobile: boolean;
	showInDesktop: boolean;
	badge?: NavBadgeConfig;
	createdAt: string;
	updatedAt: string;
}

export interface NavBadgeConfig {
	type: 'count' | 'dot' | 'status';
	color?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
	countKey?: string; // Key to retrieve count from store
	dotVisible?: boolean;
	statusKey?: string; // Key to retrieve status from store
}

export interface NavigationState {
	items: NavItemConfig[];
	mobileItems: NavItemConfig[];
	desktopItems: NavItemConfig[];
	badges: Map<string, number | boolean | string>;
	lastUpdate: number;
}

// ============================================================================
// DEFAULT NAVIGATION CONFIGURATION
// ============================================================================

const DEFAULT_NAV_ITEMS: Omit<NavItemConfig, 'id' | 'createdAt' | 'updatedAt'>[] = [
	{
		path: '/',
		label: 'Home',
		icon: 'home',
		hasSubRoutes: false,
		order: 0,
		visible: true,
		showInMobile: true,
		showInDesktop: true
	},
	{
		path: '/transactions',
		label: 'Trans.',
		icon: 'receipt',
		hasSubRoutes: false,
		order: 1,
		visible: true,
		showInMobile: true,
		showInDesktop: true
	},
	{
		path: '/plan',
		label: 'Plan',
		icon: 'calendar',
		hasSubRoutes: true,
		order: 2,
		visible: true,
		showInMobile: true,
		showInDesktop: true
	},
	{
		path: '/analyze',
		label: 'Analyze',
		icon: 'bar-chart-3',
		hasSubRoutes: true,
		order: 3,
		visible: true,
		showInMobile: true,
		showInDesktop: true
	},
	{
		path: '/categories',
		label: 'Categories',
		icon: 'target',
		hasSubRoutes: true,
		order: 4,
		visible: true,
		showInMobile: true,
		showInDesktop: true
	},
	{
		path: '/goals',
		label: 'Goals',
		icon: 'target',
		hasSubRoutes: true,
		order: 5,
		visible: true,
		showInMobile: true,
		showInDesktop: true
	},
	{
		path: '/insights',
		label: 'Insights',
		icon: 'bell',
		hasSubRoutes: true,
		order: 6,
		visible: true,
		showInMobile: false,
		showInDesktop: true,
		badge: {
			type: 'count',
			color: 'warning',
			countKey: 'insights'
		}
	},
	{
		path: '/accounts',
		label: 'Accounts',
		icon: 'credit-card',
		hasSubRoutes: false,
		order: 7,
		visible: true,
		showInMobile: true,
		showInDesktop: true
	},
	{
		path: '/settings',
		label: 'Settings',
		icon: 'settings',
		hasSubRoutes: true,
		order: 8,
		visible: true,
		showInMobile: true,
		showInDesktop: true
	}
];

// ============================================================================
// NAVIGATION SERVICE
// ============================================================================

class NavigationService {
	private state: NavigationState = {
		items: [],
		mobileItems: [],
		desktopItems: [],
		badges: new Map(),
		lastUpdate: 0
	};

	private cache: Map<string, { data: any; timestamp: number }> = new Map();
	private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
	private initialized = false;
	
	// Race condition protection
	private initializationPromise: Promise<void> | null = null;
	private isCreatingDefaults = false;

	public get ready() {
		return db.isOpen() && this.initialized;
	}

	public isLoading() {
		return !this.ready;
	}

	/**
	 * Initialize the navigation service
	 * Protected against race conditions with request deduplication
	 */
	async initialize(): Promise<void> {
		// If already initialized, return immediately
		if (this.initialized) return;

		// If initialization is in progress, wait for it to complete
		// This prevents race conditions from multiple simultaneous calls
		if (this.initializationPromise) {
			return this.initializationPromise;
		}

		// Create and store the initialization promise
		this.initializationPromise = this._initialize();
		
		try {
			await this.initializationPromise;
		} finally {
			// Clear the promise after completion (success or failure)
			this.initializationPromise = null;
		}
	}

	/**
	 * Internal initialization logic
	 */
	private async _initialize(): Promise<void> {
		try {
			// Check if navigation items exist in the database
			const existingItems = await db.dynamicSettings
				.where('key')
				.startsWith('nav_item_')
				.filter(setting => !setting.deletedAt)
				.toArray();

			// If no items exist, create default configuration
			if (existingItems.length === 0) {
				await this.createDefaultNavigationSafe();
			} else {
				// Check for and remove duplicates
				await this.removeDuplicateNavigationItems(existingItems);
			}

			// Load navigation items from database
			await this.loadNavigationItems();
			this.initialized = true;
		} catch (error) {
			console.error('Error initializing navigation service:', error);
			// Fall back to default items
			this.state.items = this.createDefaultItemsInMemory();
			this.updateStateItems();
			this.initialized = true;
		}
	}

	/**
	 * Get all navigation items
	 */
	async getNavigationItems(): Promise<NavItemConfig[]> {
		await this.initialize();
		return this.state.items;
	}

	/**
	 * Get mobile navigation items (visible and configured for mobile)
	 */
	async getMobileNavigationItems(limit: number = 5): Promise<NavItemConfig[]> {
		await this.initialize();
		
		// Return cached mobile items if still valid
		const cacheKey = `mobile_nav_${limit}`;
		const cached = this.cache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
			return cached.data;
		}

		const mobileItems = this.state.items
			.filter(item => item.visible && item.showInMobile)
			.sort((a, b) => a.order - b.order)
			.slice(0, limit);

		this.cache.set(cacheKey, { data: mobileItems, timestamp: Date.now() });
		return mobileItems;
	}

	/**
	 * Get overflow navigation items (for mobile "More" menu)
	 */
	async getOverflowNavigationItems(limit: number = 5): Promise<NavItemConfig[]> {
		await this.initialize();
		
		const allMobileItems = this.state.items
			.filter(item => item.visible && item.showInMobile)
			.sort((a, b) => a.order - b.order);

		// Return items beyond the limit
		return allMobileItems.slice(limit);
	}

	/**
	 * Get desktop navigation items
	 */
	async getDesktopNavigationItems(): Promise<NavItemConfig[]> {
		await this.initialize();
		
		// Return cached desktop items if still valid
		const cacheKey = 'desktop_nav';
		const cached = this.cache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
			return cached.data;
		}

		const desktopItems = this.state.items
			.filter(item => item.visible && item.showInDesktop)
			.sort((a, b) => a.order - b.order);

		this.cache.set(cacheKey, { data: desktopItems, timestamp: Date.now() });
		return desktopItems;
	}

	/**
	 * Update navigation item order
	 */
	async updateItemOrder(itemId: string, newOrder: number): Promise<void> {
		await this.initialize();

		const item = this.state.items.find(i => i.id === itemId);
		if (!item) throw new Error('Navigation item not found');

		const now = new Date().toISOString();
		const key = `nav_item_${item.path}`;

		// Update using a transaction for atomicity
		await db.transaction('rw', db.dynamicSettings, async () => {
			// Get the current setting to ensure we're updating the right one
			const setting = await db.dynamicSettings
				.where('key')
				.equals(key)
				.filter(s => !s.deletedAt)
				.first();

			if (!setting) {
				throw new Error(`Navigation setting not found for path: ${item.path}`);
			}

			const updatedItem = { ...item, order: newOrder, updatedAt: now };
			
			await db.dynamicSettings.update(setting.id, {
				value: JSON.stringify(updatedItem),
				updatedAt: now
			});

			// Update in memory only after successful database update
			item.order = newOrder;
			item.updatedAt = now;
		});

		this.updateStateItems();
		this.clearCache();
	}

	/**
	 * Update navigation item visibility
	 */
	async updateItemVisibility(
		itemId: string, 
		visibility: { visible?: boolean; showInMobile?: boolean; showInDesktop?: boolean }
	): Promise<void> {
		await this.initialize();

		const item = this.state.items.find(i => i.id === itemId);
		if (!item) throw new Error('Navigation item not found');

		const now = new Date().toISOString();
		const key = `nav_item_${item.path}`;

		// Update using a transaction for atomicity
		await db.transaction('rw', db.dynamicSettings, async () => {
			// Get the current setting to ensure we're updating the right one
			const setting = await db.dynamicSettings
				.where('key')
				.equals(key)
				.filter(s => !s.deletedAt)
				.first();

			if (!setting) {
				throw new Error(`Navigation setting not found for path: ${item.path}`);
			}

			const updatedItem = {
				...item,
				...visibility,
				updatedAt: now
			};

			await db.dynamicSettings.update(setting.id, {
				value: JSON.stringify(updatedItem),
				updatedAt: now
			});

			// Update in memory only after successful database update
			Object.assign(item, updatedItem);
		});

		this.updateStateItems();
		this.clearCache();
	}

	/**
	 * Set badge value for a navigation item
	 */
	setBadgeValue(key: string, value: number | boolean | string): void {
		this.state.badges.set(key, value);
		this.state.lastUpdate = Date.now();
	}

	/**
	 * Get badge value for a navigation item
	 */
	getBadgeValue(key: string): number | boolean | string | undefined {
		return this.state.badges.get(key);
	}

	/**
	 * Get all badges
	 */
	getAllBadges(): Map<string, number | boolean | string> {
		return new Map(this.state.badges);
	}

	/**
	 * Reset to default navigation configuration
	 */
	async resetToDefaults(): Promise<void> {
		// Delete existing navigation items (including already deleted ones)
		const allItems = await db.dynamicSettings
			.where('key')
			.startsWith('nav_item_')
			.toArray();

		const now = new Date().toISOString();
		for (const item of allItems) {
			if (!item.deletedAt) {
				await db.dynamicSettings.update(item.id, {
					deletedAt: now,
					updatedAt: now
				});
			}
		}

		// Create default navigation
		await this.createDefaultNavigation();
		await this.loadNavigationItems();
		this.clearCache();
	}

	/**
	 * Debug method: Clear all navigation data completely
	 */
	async clearAllNavigationData(): Promise<void> {
		const allItems = await db.dynamicSettings
			.where('key')
			.startsWith('nav_item_')
			.toArray();

		// Hard delete all navigation items
		for (const item of allItems) {
			await db.dynamicSettings.delete(item.id);
		}

		console.log(`Cleared ${allItems.length} navigation items from database`);
		
		// Reset state
		this.state.items = [];
		this.state.mobileItems = [];
		this.state.desktopItems = [];
		this.clearCache();
		this.initialized = false;
	}

	/**
	 * Load navigation items from database
	 */
	private async loadNavigationItems(): Promise<void> {
		const settings = await db.dynamicSettings
			.where('key')
			.startsWith('nav_item_')
			.filter(setting => !setting.deletedAt)
			.toArray();

		this.state.items = settings
			.map(setting => {
				try {
					return JSON.parse(setting.value) as NavItemConfig;
				} catch {
					return null;
				}
			})
			.filter((item): item is NavItemConfig => item !== null)
			.sort((a, b) => a.order - b.order);

		this.updateStateItems();
	}

	/**
	 * Update mobile and desktop item lists
	 */
	private updateStateItems(): void {
		this.state.mobileItems = this.state.items
			.filter(item => item.visible && item.showInMobile)
			.sort((a, b) => a.order - b.order);

		this.state.desktopItems = this.state.items
			.filter(item => item.visible && item.showInDesktop)
			.sort((a, b) => a.order - b.order);
	}

	/**
	 * Remove duplicate navigation items (keep only the first occurrence of each path)
	 */
	private async removeDuplicateNavigationItems(existingItems: any[]): Promise<void> {
		const seenPaths = new Set<string>();
		const duplicatesToDelete: string[] = [];

		for (const setting of existingItems) {
			try {
				const navItem = JSON.parse(setting.value) as NavItemConfig;
				if (seenPaths.has(navItem.path)) {
					// This is a duplicate, mark for deletion
					duplicatesToDelete.push(setting.id);
				} else {
					seenPaths.add(navItem.path);
				}
			} catch (error) {
				// Invalid JSON, mark for deletion
				duplicatesToDelete.push(setting.id);
			}
		}

		// Delete duplicates
		if (duplicatesToDelete.length > 0) {
			console.log(`Removing ${duplicatesToDelete.length} duplicate navigation items`);
			const now = new Date().toISOString();
			for (const id of duplicatesToDelete) {
				await db.dynamicSettings.update(id, {
					deletedAt: now,
					updatedAt: now
				});
			}
		}
	}

	/**
	 * Create default navigation in database with race condition protection
	 */
	private async createDefaultNavigationSafe(): Promise<void> {
		// Guard against concurrent creation attempts
		if (this.isCreatingDefaults) {
			console.log('Default navigation creation already in progress, skipping...');
			return;
		}

		this.isCreatingDefaults = true;

		try {
			// Double-check that no items exist (race condition check)
			const existingCheck = await db.dynamicSettings
				.where('key')
				.startsWith('nav_item_')
				.filter(setting => !setting.deletedAt)
				.toArray();

			if (existingCheck.length > 0) {
				console.log('Navigation items already exist, skipping creation');
				return;
			}

			await this.createDefaultNavigation();
		} finally {
			this.isCreatingDefaults = false;
		}
	}

	/**
	 * Create default navigation in database
	 */
	private async createDefaultNavigation(): Promise<void> {
		const now = new Date().toISOString();

		// Use a transaction to ensure atomicity
		await db.transaction('rw', db.dynamicSettings, async () => {
			for (const item of DEFAULT_NAV_ITEMS) {
				const key = `nav_item_${item.path}`;
				
				// Check if this specific item already exists (idempotency check)
				const existing = await db.dynamicSettings
					.where('key')
					.equals(key)
					.filter(setting => !setting.deletedAt)
					.first();

				if (existing) {
					console.log(`Navigation item ${item.path} already exists, skipping`);
					continue;
				}

				const navItem: NavItemConfig = {
					id: generateUUID(),
					...item,
					createdAt: now,
					updatedAt: now
				};

				await db.dynamicSettings.add({
					id: generateUUID(),
					key,
					value: JSON.stringify(navItem),
					dataType: 'json',
					createdAt: now,
					updatedAt: now,
					deletedAt: null
				});
			}
		});
	}

	/**
	 * Create default items in memory (fallback)
	 */
	private createDefaultItemsInMemory(): NavItemConfig[] {
		const now = new Date().toISOString();
		return DEFAULT_NAV_ITEMS.map(item => ({
			id: generateUUID(),
			...item,
			createdAt: now,
			updatedAt: now
		}));
	}

	/**
	 * Clear cache
	 */
	private clearCache(): void {
		this.cache.clear();
	}

	/**
	 * Get navigation state (for reactive stores)
	 */
	getState(): NavigationState {
		return { ...this.state };
	}
}

export const navigationService = new NavigationService();

