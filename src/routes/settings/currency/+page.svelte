<script lang="ts">
	import { onMount } from 'svelte';
	import { userService, currencyConfigService, exchangeRateService, insightsService } from '$lib/core/services';
	import { db, generateUUID } from '$lib/core/db';
	import { PageLayout } from '$lib/components/layouts';
	import * as Card from '$lib/components/ui/card/index.ts';
	import * as Button from '$lib/components/ui/button/index.ts';
	import * as Input from '$lib/components/ui/input/index.ts';
	import * as Label from '$lib/components/ui/label/index.ts';
	import * as Alert from '$lib/components/ui/alert/index.ts';
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.ts';
	import * as Sheet from '$lib/components/ui/sheet/index.ts';
	import * as Select from '$lib/components/ui/select/index.ts';
	import { formatAmount, sortCurrencies, sortInactiveCurrencies } from '$lib/utils/currency-utils';
	import type { CurrencyConfiguration, Currency, ExchangeRate } from '$lib/core/db';
	import { RefreshCw, Save, Edit2, Trash2, Plus, Eye, Settings, GripVertical, AlertCircle, CheckCircle2, Info } from '@lucide/svelte';
	import Header from '$lib/components/Header.svelte';
	import { toast } from 'svelte-sonner';
	import * as Tooltip from '$lib/components/ui/tooltip/index.ts';
	import * as Sidebar from '$lib/components/ui/sidebar/index.ts';
	import { swipe } from '$lib/actions/swipe';

	const sidebar = Sidebar.useSidebar();

	// State
	let isLoading = $state(true);
	let isSaving = $state(false);
	let error = $state<string | null>(null);
	let lastErrorAction = $state<(() => Promise<void>) | null>(null); // For error recovery
	
	// Drag and drop state
	let draggedCurrency = $state<Currency | null>(null);
	let dragOverIndex = $state<number | null>(null);
	
	// Edited currency name in drawer
	let editedCurrencyName = $state<string>('');
	
	// Main currency selection
	let mainCurrency = $state('USD');
	let oldMainCurrency = $state('USD'); // Track previous main currency for conversion
	let activeCurrencies = $state<Currency[]>([]);
	let currencyOptions = $state<Array<{ value: string; label: string; symbol: string }>>([]);
	
	// Currency configurations
	let currencyConfigs = $state<Map<string, CurrencyConfiguration>>(new Map());
	let editingCurrency = $state<string | null>(null);
	let editedConfigs = $state<Map<string, Partial<CurrencyConfiguration>>>(new Map());
	
	// Exchange rates
	let exchangeRates = $state<ExchangeRate[]>([]);
	let editingRate = $state<string | null>(null);
	let editedRates = $state<Map<string, { fromCurrency: string; toCurrency: string; rate: number }>>(new Map());
	let showAddRateForm = $state(false);
	let newRate = $state({ fromCurrency: 'USD', toCurrency: 'EUR', rate: 1 });
	
	// Currency management sheet
	let showAddCurrencySheet = $state(false);
	let showInactiveCurrencies = $state(false);
	let inactiveCurrencies = $state<Currency[]>([]);
	let newCurrency = $state({
		code: '',
		name: '',
		symbol: '',
		placement: 'before' as 'before' | 'after',
		decimalPlaces: 2
	});

	// Currency config drawer
	let showConfigDrawer = $state(false);
	let configCurrency = $state<Currency | null>(null);

	// Alert Dialog states
	let showResetDefaultsDialog = $state(false);
	let resetDefaultsCurrencyCode = $state<string | null>(null);
	let showConvertRatesDialog = $state(false);
	let showDeleteCurrencyDialog = $state(false);
	let currencyToDelete = $state<Currency | null>(null);

	// Swipe states for mobile
	let swipeOffset = $state<Record<string, number>>({});
	let swipingCurrency = $state<string | null>(null);

	// Success animation state
	let showSuccessConfetti = $state(false);
	let confettiTrigger = $state(0);

	// Pull-to-refresh state
	let isPulling = $state(false);
	let pullDistance = $state(0);
	let isRefreshing = $state(false);
	const PULL_THRESHOLD = 80;

	// Track if there are unsaved changes
	let hasUnsavedChanges = $derived(mainCurrency !== oldMainCurrency);

	// Save all changes on the page
	async function saveAllChanges() {
		if (hasUnsavedChanges && !isSaving) {
			await saveMainCurrency();
		}
	}

	// Keyboard shortcuts
	function handleKeydown(event: KeyboardEvent) {
		// Ctrl/Cmd + S to save all changes
		if ((event.ctrlKey || event.metaKey) && event.key === 's') {
			event.preventDefault();
			saveAllChanges();
		}
		
		// Ctrl/Cmd + R to refresh rates
		if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
			event.preventDefault();
			updateRatesFromAPI();
		}
		
		// Ctrl/Cmd + N to add new currency
		if ((event.ctrlKey || event.metaKey) && event.key === 'n') {
			event.preventDefault();
			showAddCurrencySheet = true;
		}
		
		// Esc to close drawers/sheets
		if (event.key === 'Escape') {
			if (showConfigDrawer) {
				cancelEditing();
			}
			if (showAddCurrencySheet) {
				showAddCurrencySheet = false;
			}
			if (showAddRateForm) {
				showAddRateForm = false;
			}
		}
	}

	// Load data on mount
	onMount(() => {
		loadData().catch((err) => {
			error = 'Failed to load currency settings';
			console.error('Error loading currency settings:', err);
		}).finally(() => {
			isLoading = false;
		});
		
		// Add keyboard event listener
		window.addEventListener('keydown', handleKeydown);
		
		return () => {
			window.removeEventListener('keydown', handleKeydown);
		};
	});

	async function loadData() {
		// Load user preferences for main currency FIRST (before sorting)
		const preferences = await userService.getUserPreferences();
		if (preferences?.currency) {
			mainCurrency = preferences.currency;
			oldMainCurrency = preferences.currency;
		}

		// Load all currencies (active and inactive)
		const allCurrencies = await db.getActiveCurrencies();
		
		// Separate active and inactive, sorting with main currency at top
		activeCurrencies = sortCurrencies(
			allCurrencies.filter(c => c.isActive),
			mainCurrency
		);

		// Sort inactive currencies: custom first, then system, then by code
		inactiveCurrencies = sortInactiveCurrencies(
			allCurrencies.filter(c => !c.isActive)
		);

		currencyOptions = activeCurrencies.map(c => ({
			value: c.code,
			label: `${c.name} (${c.code})`,
			symbol: c.symbol
		}));

		// Set default main currency if not set yet
		if (!mainCurrency && currencyOptions.length > 0) {
			mainCurrency = currencyOptions[0].value;
			oldMainCurrency = currencyOptions[0].value;
		}

		// Load all currency configurations
		await loadCurrencyConfigurations();
		
		// Load exchange rates
		await loadExchangeRates();
	}

	// Load currency configurations
	async function loadCurrencyConfigurations() {
		try {
			const configs = await currencyConfigService.getAllConfigurations();
			const configMap = new Map<string, CurrencyConfiguration>();
			
			for (const config of configs) {
				configMap.set(config.currencyCode, config);
			}
			
			currencyConfigs = configMap;
		} catch (err) {
			console.error('Error loading currency configurations:', err);
		}
	}

	// Get configuration for a currency
	function getConfig(currencyCode: string): CurrencyConfiguration | null {
		return currencyConfigs.get(currencyCode) || null;
	}

	// Drag and drop handlers
	function handleDragStart(event: DragEvent, currency: Currency) {
		draggedCurrency = currency;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
		}
	}

	function handleDragOver(event: DragEvent, index: number) {
		event.preventDefault();
		dragOverIndex = index;
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'move';
		}
	}

	function handleDragEnd() {
		draggedCurrency = null;
		dragOverIndex = null;
	}

	async function handleDrop(event: DragEvent, targetIndex: number) {
		event.preventDefault();
		
		if (!draggedCurrency) return;

		const draggedIndex = activeCurrencies.findIndex(c => c.id === draggedCurrency!.id);
		if (draggedIndex === targetIndex) {
			draggedCurrency = null;
			dragOverIndex = null;
			return;
		}

		// Reorder currencies (visual only - order is maintained by sorting logic)
		const newCurrencies = [...activeCurrencies];
		const [removed] = newCurrencies.splice(draggedIndex, 1);
		newCurrencies.splice(targetIndex, 0, removed);

		// Update order (we'll store a custom order field if needed, but for now just visual)
		activeCurrencies = newCurrencies;

		draggedCurrency = null;
		dragOverIndex = null;
		
		toast.success('Currency order updated');
	}

	// Open currency config drawer
	function openConfigDrawer(currency: Currency) {
		configCurrency = currency;
		editedCurrencyName = currency.name;
		const config = getConfig(currency.code);
		if (config) {
			editedConfigs.set(currency.code, {
				defaultCheckingBuffer: config.defaultCheckingBuffer,
				defaultSavingsBuffer: config.defaultSavingsBuffer,
				defaultMinimumBalance: config.defaultMinimumBalance,
				defaultOverdraftLimit: config.defaultOverdraftLimit,
				defaultOverdraftFee: config.defaultOverdraftFee,
				maxAmountLimit: config.maxAmountLimit,
				defaultBudgetAllocation: config.defaultBudgetAllocation,
				notes: config.notes
			});
		} else {
			// Initialize with empty values if no config exists
			editedConfigs.set(currency.code, {});
		}
		editingCurrency = currency.code;
		showConfigDrawer = true;
	}

	// Start editing a currency configuration (for drawer)
	function startEditing(currencyCode: string) {
		const config = getConfig(currencyCode);
		if (config) {
			editedConfigs.set(currencyCode, {
				defaultCheckingBuffer: config.defaultCheckingBuffer,
				defaultSavingsBuffer: config.defaultSavingsBuffer,
				defaultMinimumBalance: config.defaultMinimumBalance,
				defaultOverdraftLimit: config.defaultOverdraftLimit,
				defaultOverdraftFee: config.defaultOverdraftFee,
				maxAmountLimit: config.maxAmountLimit,
				defaultBudgetAllocation: config.defaultBudgetAllocation,
				notes: config.notes
			});
			editingCurrency = currencyCode;
		}
	}

	// Cancel editing
	function cancelEditing() {
		editedConfigs.clear();
		editingCurrency = null;
		showConfigDrawer = false;
		configCurrency = null;
	}

	// Save currency configuration
	async function saveCurrencyConfig(currencyCode: string) {
		if (isSaving || !configCurrency) return;
		
		isSaving = true;
		error = null;
		lastErrorAction = null;
		
		try {
			// Update currency name if changed
			if (editedCurrencyName !== configCurrency.name && editedCurrencyName.trim()) {
				await db.currencies.update(configCurrency.id, {
					name: editedCurrencyName.trim(),
					updatedAt: new Date().toISOString()
				});
				await loadData(); // Reload to refresh currency list
			}
			
			// Update configuration
			const updates = editedConfigs.get(currencyCode);
			if (updates) {
				await currencyConfigService.updateCurrencyConfig(currencyCode, updates);
				await loadCurrencyConfigurations();
			}
			
			editedConfigs.delete(currencyCode);
			editingCurrency = null;
			toast.success(`Settings for ${currencyCode} saved successfully`);
			showConfigDrawer = false;
			configCurrency = null;
		} catch (err) {
			const errorMsg = `Failed to save currency configuration: ${err instanceof Error ? err.message : 'Unknown error'}`;
			error = errorMsg;
			lastErrorAction = () => saveCurrencyConfig(currencyCode);
			toast.error(errorMsg);
			console.error('Error saving currency configuration:', err);
		} finally {
			isSaving = false;
		}
	}

	// Open reset defaults dialog
	function openResetDefaultsDialog(currencyCode: string) {
		resetDefaultsCurrencyCode = currencyCode;
		showResetDefaultsDialog = true;
	}

	// Reset to system defaults
	async function resetToDefaults(currencyCode: string) {
		if (isSaving || !currencyCode) return;
		
		isSaving = true;
		error = null;
		lastErrorAction = null;
		showResetDefaultsDialog = false;
		
		try {
			await currencyConfigService.resetToDefaults(currencyCode);
			await loadCurrencyConfigurations();
			// Reload the config for the drawer
			const config = await currencyConfigService.getCurrencyConfig(currencyCode);
			editedConfigs.set(currencyCode, {
				defaultCheckingBuffer: config.defaultCheckingBuffer,
				defaultSavingsBuffer: config.defaultSavingsBuffer,
				defaultMinimumBalance: config.defaultMinimumBalance,
				defaultOverdraftLimit: config.defaultOverdraftLimit,
				defaultOverdraftFee: config.defaultOverdraftFee,
				maxAmountLimit: config.maxAmountLimit,
				defaultBudgetAllocation: config.defaultBudgetAllocation,
				notes: config.notes
			});
			toast.success(`Currency configuration for ${currencyCode} reset to defaults`);
		} catch (err) {
			const errorMsg = `Failed to reset currency configuration: ${err instanceof Error ? err.message : 'Unknown error'}`;
			error = errorMsg;
			lastErrorAction = () => resetToDefaults(currencyCode);
			toast.error(errorMsg);
			console.error('Error resetting currency configuration:', err);
		} finally {
			isSaving = false;
			resetDefaultsCurrencyCode = null;
		}
	}

	// Convert exchange rates when main currency changes (delegates to service)
	async function convertExchangeRates(oldMain: string, newMain: string): Promise<void> {
		await exchangeRateService.convertExchangeRates(oldMain, newMain);
	}

	// Save main currency preference
	async function saveMainCurrency() {
		if (isSaving) return;
		
		if (mainCurrency === oldMainCurrency) {
			// No change, just save preference
			await userService.updateUserPreferences({ currency: mainCurrency });
			toast.success('Main currency updated successfully');
			return;
		}

		// Check if user wants to convert exchange rates
		const hasRates = exchangeRates.length > 0;
		
		if (hasRates) {
			// Show dialog to ask about conversion
			showConvertRatesDialog = true;
		} else {
			// No rates, just save directly
			await performMainCurrencyChange(false);
		}
	}

	// Perform the actual main currency change
	async function performMainCurrencyChange(shouldConvert: boolean) {
		if (isSaving) return;
		
		isSaving = true;
		error = null;
		lastErrorAction = null;
		showConvertRatesDialog = false;
		
		try {
			// Update preference first
			await userService.updateUserPreferences({ currency: mainCurrency });
			
			// Convert exchange rates if requested
			if (shouldConvert) {
				try {
					await convertExchangeRates(oldMainCurrency, mainCurrency);
					toast.success(`Main currency changed to ${mainCurrency}. Exchange rates have been converted.`);
				} catch (convertErr) {
					console.error('Error converting exchange rates:', convertErr);
					toast.success(`Main currency changed to ${mainCurrency}. Some exchange rates may need manual adjustment.`);
				}
			} else {
				toast.success(`Main currency changed to ${mainCurrency}. You may need to update exchange rates manually.`);
			}

			// Invalidate and regenerate prediction insights with new currency
			try {
				console.log(`[CurrencySettings] Invalidating old predictions and regenerating with new currency: ${mainCurrency}`);
				await insightsService.invalidatePredictionInsights();
				// Regenerate predictions with new currency - force update to bypass rate limiting
				await insightsService.generateCrossRouteInsights({
					timeRange: 'month',
					includePredictions: true,
					includeBehavioral: false // Only regenerate predictions, not behavioral insights
				}, true); // Force regeneration
				console.log(`[CurrencySettings] Successfully regenerated predictions with currency: ${mainCurrency}`);
			} catch (insightErr) {
				console.error('[CurrencySettings] Error regenerating prediction insights:', insightErr);
				// Don't fail the currency change if insight regeneration fails
			}

			oldMainCurrency = mainCurrency;
			await loadData(); // Reload to refresh currency list order
		} catch (err) {
			const errorMsg = 'Failed to update main currency';
			error = errorMsg;
			lastErrorAction = () => performMainCurrencyChange(shouldConvert);
			toast.error(errorMsg);
			console.error('Error saving main currency:', err);
			// Revert mainCurrency on error
			mainCurrency = oldMainCurrency;
		} finally {
			isSaving = false;
		}
	}

	// Get edited value or current value
	function getValue(currencyCode: string, field: keyof CurrencyConfiguration): number | string | undefined {
		const edited = editedConfigs.get(currencyCode);
		if (edited && field in edited) {
			return edited[field as keyof typeof edited] as number | string | undefined;
		}
		const config = getConfig(currencyCode);
		if (!config) return undefined;
		const value = config[field];
		if (value === null || typeof value === 'boolean') return undefined;
		return value as number | string | undefined;
	}

	// Update edited value
	function updateValue(currencyCode: string, field: keyof CurrencyConfiguration, value: number | string | undefined) {
		const edited = editedConfigs.get(currencyCode) || {};
		edited[field as keyof typeof edited] = value as any;
		editedConfigs.set(currencyCode, edited);
	}

	// Load exchange rates
	async function loadExchangeRates() {
		try {
			const today = new Date();
			const rates = await exchangeRateService.getRatesForDate(today);
			exchangeRates = rates.sort((a, b) => {
				if (a.fromCurrency !== b.fromCurrency) {
					return a.fromCurrency.localeCompare(b.fromCurrency);
				}
				return a.toCurrency.localeCompare(b.toCurrency);
			});
		} catch (err) {
			console.error('Error loading exchange rates:', err);
		}
	}

	// Check if exchange rate is outdated (delegates to service)
	function isRateOutdated(rate: ExchangeRate): boolean {
		return exchangeRateService.isRateOutdated(rate);
	}

	// Start editing a rate
	function startEditingRate(rateId: string) {
		const rate = exchangeRates.find(r => r.id === rateId);
		if (rate) {
			editedRates.set(rateId, {
				fromCurrency: rate.fromCurrency,
				toCurrency: rate.toCurrency,
				rate: rate.rate
			});
			editingRate = rateId;
		}
	}

	// Cancel editing rate
	function cancelEditingRate() {
		editedRates.clear();
		editingRate = null;
	}

	// Handle keydown in exchange rate editing
	function handleRateEditKeydown(event: KeyboardEvent, rateId: string) {
		if (event.key === 'Enter') {
			event.preventDefault();
			saveExchangeRate(rateId);
		}
	}

	// Pull to refresh handlers
	function handlePullStart() {
		if (window.scrollY === 0 && !isLoading && sidebar.isMobile) {
			isPulling = true;
		}
	}
	
	function handlePullMove(distance: number) {
		if (isPulling && window.scrollY === 0 && distance > 0) {
			pullDistance = Math.min(distance, PULL_THRESHOLD * 1.5);
		}
	}
	
	function handlePullEnd(direction: 'left' | 'right' | 'up' | 'down' | null) {
		// Only trigger refresh on downward pull
		if (isPulling && direction === 'down' && pullDistance >= PULL_THRESHOLD) {
			updateRatesFromAPI();
		} else {
			isPulling = false;
			pullDistance = 0;
		}
	}

	// Swipe action handlers for currency cards


	// Save exchange rate
	async function saveExchangeRate(rateId: string) {
		if (isSaving) return;
		
		const edited = editedRates.get(rateId);
		if (!edited) return;
		
		isSaving = true;
		error = null;
		lastErrorAction = null;
		
		try {
			await exchangeRateService.setExchangeRate(
				edited.fromCurrency,
				edited.toCurrency,
				edited.rate
			);
			await loadExchangeRates();
			editedRates.delete(rateId);
			editingRate = null;
			toast.success('Exchange rate updated successfully');
		} catch (err) {
			const errorMsg = `Failed to save exchange rate: ${err instanceof Error ? err.message : 'Unknown error'}`;
			error = errorMsg;
			lastErrorAction = () => saveExchangeRate(rateId);
			toast.error(errorMsg);
			console.error('Error saving exchange rate:', err);
		} finally {
			isSaving = false;
		}
	}

	// Add new exchange rate
	async function addExchangeRate() {
		if (isSaving) return;
		
		isSaving = true;
		error = null;
		lastErrorAction = null;
		
		try {
			await exchangeRateService.setExchangeRate(
				newRate.fromCurrency,
				newRate.toCurrency,
				newRate.rate
			);
			await loadExchangeRates();
			showAddRateForm = false;
			newRate = { fromCurrency: mainCurrency, toCurrency: 'EUR', rate: 1 };
			toast.success('Exchange rate added successfully');
		} catch (err) {
			const errorMsg = `Failed to add exchange rate: ${err instanceof Error ? err.message : 'Unknown error'}`;
			error = errorMsg;
			lastErrorAction = () => addExchangeRate();
			toast.error(errorMsg);
			console.error('Error adding exchange rate:', err);
		} finally {
			isSaving = false;
		}
	}

	// Update exchange rates from API
	async function updateRatesFromAPI() {
		if (isSaving || isRefreshing) return;
		
		isSaving = true;
		isRefreshing = true;
		error = null;
		lastErrorAction = null;
		
		try {
			await exchangeRateService.updateAllRates();
			await loadExchangeRates();
			
			// Trigger success animation
			showSuccessConfetti = true;
			confettiTrigger++;
			setTimeout(() => {
				showSuccessConfetti = false;
			}, 3000);
			
			toast.success('Exchange rates updated from API');
		} catch (err) {
			const errorMsg = `Failed to update rates: ${err instanceof Error ? err.message : 'Unknown error'}`;
			error = errorMsg;
			lastErrorAction = () => updateRatesFromAPI();
			toast.error(errorMsg);
			console.error('Error updating rates:', err);
		} finally {
			isSaving = false;
			isRefreshing = false;
			isPulling = false;
			pullDistance = 0;
		}
	}

	// Reset a rate pair and update from API (delegates to service)
	async function resetRateToAPI(rateId: string) {
		if (isSaving) return;
		
		const rate = exchangeRates.find(r => r.id === rateId);
		if (!rate) return;
		
		isSaving = true;
		error = null;
		lastErrorAction = null;
		
		try {
			await exchangeRateService.resetRateToAPI(rate.fromCurrency, rate.toCurrency);
			await loadExchangeRates();
			toast.success(`Exchange rate ${rate.fromCurrency} → ${rate.toCurrency} reset to API value`);
		} catch (err) {
			const errorMsg = `Failed to reset rate to API: ${err instanceof Error ? err.message : 'Unknown error'}`;
			error = errorMsg;
			lastErrorAction = () => resetRateToAPI(rateId);
			toast.error(errorMsg);
			console.error('Error resetting rate to API:', err);
		} finally {
			isSaving = false;
		}
	}

	// Get edited rate value
	function getRateValue(rateId: string, field: 'fromCurrency' | 'toCurrency' | 'rate'): string | number {
		const edited = editedRates.get(rateId);
		if (edited) {
			return edited[field];
		}
		const rate = exchangeRates.find(r => r.id === rateId);
		return rate ? rate[field] : (field === 'rate' ? 0 : '');
	}

	// Update edited rate value
	function updateRateValue(rateId: string, field: 'fromCurrency' | 'toCurrency' | 'rate', value: string | number) {
		const edited = editedRates.get(rateId) || { fromCurrency: '', toCurrency: '', rate: 1 };
		if (field === 'fromCurrency') {
			edited.fromCurrency = value as string;
		} else if (field === 'toCurrency') {
			edited.toCurrency = value as string;
		} else {
			edited.rate = value as number;
		}
		editedRates.set(rateId, edited);
	}

	// Toggle currency active status
	async function toggleCurrencyActive(currency: Currency) {
		if (isSaving) return;
		
		// Can't deactivate main currency
		if (!currency.isActive && currency.code === mainCurrency) {
			const errorMsg = 'Cannot deactivate the main currency. Please change your main currency first.';
			error = errorMsg;
			toast.error(errorMsg);
			return;
		}
		
		isSaving = true;
		error = null;
		lastErrorAction = null;
		
		try {
			await db.currencies.update(currency.id, {
				isActive: !currency.isActive,
				updatedAt: new Date().toISOString()
			});
			
			// If activating, create exchange rate pair to main currency if it doesn't exist
			if (!currency.isActive) {
				const today = new Date();
				const existingRate = await exchangeRateService.getExchangeRate(mainCurrency, currency.code, today);
				if (existingRate === null) {
					// Try to fetch from API, or set a default rate of 1 (user can adjust)
					try {
						const rate = await exchangeRateService.getExchangeRate(mainCurrency, currency.code, today);
						if (rate === null) {
							// Set default rate of 1, user can update later
							await exchangeRateService.setExchangeRate(mainCurrency, currency.code, 1, today);
						}
					} catch {
						// If API fails, set default rate
						await exchangeRateService.setExchangeRate(mainCurrency, currency.code, 1, today);
					}
				}
			}
			
			await loadData();
			toast.success(`Currency ${currency.code} ${!currency.isActive ? 'activated' : 'deactivated'}`);
		} catch (err) {
			const errorMsg = `Failed to update currency: ${err instanceof Error ? err.message : 'Unknown error'}`;
			error = errorMsg;
			lastErrorAction = () => toggleCurrencyActive(currency);
			toast.error(errorMsg);
			console.error('Error updating currency:', err);
		} finally {
			isSaving = false;
		}
	}

	// Add custom currency
	async function addCustomCurrency() {
		if (isSaving) return;
		
		// Validate currency code
		if (!/^[A-Z]{3}$/.test(newCurrency.code)) {
			const errorMsg = 'Currency code must be 3 uppercase letters (ISO 4217 format)';
			error = errorMsg;
			toast.error(errorMsg);
			return;
		}
		
		// Check if currency already exists
		const existing = await db.getCurrencyByCode(newCurrency.code);
		if (existing) {
			const errorMsg = `Currency ${newCurrency.code} already exists`;
			error = errorMsg;
			toast.error(errorMsg);
			return;
		}
		
		isSaving = true;
		error = null;
		lastErrorAction = null;
		
		try {
			await db.currencies.add({
				id: generateUUID(),
				code: newCurrency.code.toUpperCase(),
				name: newCurrency.name,
				symbol: newCurrency.symbol,
				placement: newCurrency.placement,
				decimalPlaces: newCurrency.decimalPlaces,
				isSystem: false,
				isActive: true,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				deletedAt: null
			});
			
			// Automatically create exchange rate pair to main currency
			const today = new Date();
			await exchangeRateService.setExchangeRate(
				mainCurrency,
				newCurrency.code.toUpperCase(),
				1, // Default rate of 1, user should update this
				today
			);
			
			const addedCode = newCurrency.code.toUpperCase();
			await loadData();
			showAddCurrencySheet = false;
			newCurrency = { code: '', name: '', symbol: '', placement: 'before', decimalPlaces: 2 };
			toast.success(`Currency ${addedCode} added. Please set the exchange rate in the Exchange Rates section.`);
		} catch (err) {
			const errorMsg = `Failed to add currency: ${err instanceof Error ? err.message : 'Unknown error'}`;
			error = errorMsg;
			lastErrorAction = () => addCustomCurrency();
			toast.error(errorMsg);
			console.error('Error adding currency:', err);
		} finally {
			isSaving = false;
		}
	}


	// Open delete currency dialog
	function openDeleteCurrencyDialog(currency: Currency) {
		// System currencies cannot be deleted
		if (currency.isSystem) {
			const errorMsg = 'System currencies cannot be deleted';
			error = errorMsg;
			toast.error(errorMsg);
			return;
		}
		
		// Can't delete main currency
		if (currency.code === mainCurrency) {
			const errorMsg = 'Cannot delete the main currency. Please change your main currency first.';
			error = errorMsg;
			toast.error(errorMsg);
			return;
		}
		
		currencyToDelete = currency;
		showDeleteCurrencyDialog = true;
	}

	// Swipe handlers for currency cards
	function handleCurrencySwipeStart(currencyId: string) {
		swipingCurrency = currencyId;
	}

	function handleCurrencySwipeMove(currencyId: string, distance: number) {
		if (swipingCurrency === currencyId) {
			// Only allow left swipe (negative distance)
			swipeOffset[currencyId] = Math.min(distance, 0);
		}
	}

	function handleCurrencySwipeEnd(currencyId: string, direction: 'left' | 'right' | null) {
		const currency = activeCurrencies.find(c => c.id === currencyId) || 
		                 inactiveCurrencies.find(c => c.id === currencyId);
		
		if (direction === 'left' && currency) {
			// Swipe left shows delete action
			if (!currency.isSystem && currency.code !== mainCurrency) {
				openDeleteCurrencyDialog(currency);
			}
		}
		
		// Reset swipe
		swipeOffset[currencyId] = 0;
		swipingCurrency = null;
	}


	// Delete custom currency (soft delete)
	async function deleteCurrency(currency: Currency) {
		if (isSaving || !currency) return;
		
		isSaving = true;
		error = null;
		lastErrorAction = null;
		showDeleteCurrencyDialog = false;
		
		try {
			await db.currencies.update(currency.id, {
				deletedAt: new Date().toISOString(),
				isActive: false,
				updatedAt: new Date().toISOString()
			});
			
			await loadData();
			toast.success(`Currency ${currency.code} deleted successfully`);
		} catch (err) {
			const errorMsg = `Failed to delete currency: ${err instanceof Error ? err.message : 'Unknown error'}`;
			error = errorMsg;
			lastErrorAction = () => deleteCurrency(currency);
			toast.error(errorMsg);
			console.error('Error deleting currency:', err);
		} finally {
			isSaving = false;
			currencyToDelete = null;
		}
	}
</script>

<svelte:head>
	<title>Currency Settings | Budgic</title>
</svelte:head>

<PageLayout>
	{#snippet topBar()}
			<Header title="Currency Settings" />
	{/snippet}

	<div 
		class="container mx-auto p-2 sm:p-4 max-w-4xl space-y-6"
		use:swipe={sidebar.isMobile ? {
			axis: 'vertical',
			threshold: PULL_THRESHOLD,
			canStart: () => window.scrollY === 0 && !isLoading,
			onSwipeStart: handlePullStart,
			onSwipeMove: handlePullMove,
			onSwipeEnd: handlePullEnd
		} : undefined}
		style="transform: translateY({Math.min(pullDistance, PULL_THRESHOLD)}px); transition: {isPulling ? 'none' : 'transform 200ms ease-out'};"
	>
		<!-- Pull to Refresh Indicator -->
		{#if sidebar.isMobile && pullDistance > 0}
			<div 
				class="flex items-center justify-center py-2 transition-opacity duration-200"
				style="opacity: {Math.min(pullDistance / PULL_THRESHOLD, 1)};"
			>
				<RefreshCw 
					class="h-5 w-5 text-primary {pullDistance >= PULL_THRESHOLD ? 'animate-spin' : ''}"
					style="transform: rotate({Math.min((pullDistance / PULL_THRESHOLD) * 360, 360)}deg);"
				/>
				<span class="ml-2 text-sm text-muted-foreground">
					{pullDistance >= PULL_THRESHOLD ? 'Release to refresh...' : 'Pull to refresh...'}
				</span>
			</div>
		{/if}

		{#if error && lastErrorAction}
			<Alert.Root 
				variant="destructive"
				class="animate-in slide-in-from-top-2 fade-in duration-300"
			>
				<AlertCircle class="h-4 w-4" />
				<Alert.Title>Error</Alert.Title>
				<Alert.Description class="flex items-center justify-between gap-4">
					<span>{error}</span>
					<Button.Root 
						variant="outline" 
						size="sm"
						onclick={async () => {
							error = null;
							if (lastErrorAction) await lastErrorAction();
						}}
						class="flex-shrink-0"
					>
						<RefreshCw class="h-4 w-4 mr-2" />
						Retry
					</Button.Root>
				</Alert.Description>
			</Alert.Root>
		{/if}

		{#if isLoading}
			<div class="text-center py-8 space-y-4">
				<div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
				<p class="text-muted-foreground animate-pulse">Loading currency settings...</p>
			</div>
		{:else}
			<!-- Main Currency Selection & Active Currencies -->
			<Card.Root>
				<Card.Header>
					<Card.Title>Main Currency & Active Currencies</Card.Title>
					<Card.Description>
						Select your primary currency and manage which currencies are active in your app
					</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<Label.Root for="main-currency">Main Currency</Label.Root>
							<span class="text-xs text-muted-foreground hidden md:inline">Press Ctrl+S to save</span>
						</div>
						<Select.Root
							type="single"
							bind:value={mainCurrency}
						>
							<Select.Trigger class="w-full" id="main-currency">
								{#if mainCurrency}
									{@const option = currencyOptions.find(o => o.value === mainCurrency)}
									{#if option}
										<span class="flex items-center justify-between w-full">
											<span>{option.label}</span>
											<span class="text-muted-foreground ml-2">{option.symbol}</span>
										</span>
									{:else}
										{mainCurrency}
									{/if}
								{:else}
									Select main currency
								{/if}
							</Select.Trigger>
							<Select.Content>
							{#each currencyOptions as option}
								<Select.Item value={option.value}>
									<span class="flex items-center justify-between w-full">
										<span>{option.label}</span>
										<span class="text-muted-foreground ml-2">{option.symbol}</span>
									</span>
								</Select.Item>
							{/each}
							</Select.Content>
						</Select.Root>
						<p class="text-xs text-muted-foreground">
							Your main currency is used for displaying totals and calculations throughout the app
						</p>
					</div>

					<div class="border-t pt-4">
						<div class="flex items-center justify-between mb-3">
							<Label.Root>Active Currencies ({activeCurrencies.length})</Label.Root>
							<Sheet.Root bind:open={showAddCurrencySheet}>
								<Sheet.Trigger>
									<Button.Root variant="outline" size="sm" disabled={isSaving}>
										<Plus class="h-4 w-4 mr-2" />
										Add Currency
									</Button.Root>
								</Sheet.Trigger>
								<Sheet.Content class="max-w-2xl sm:max-w-lg">
									<Sheet.Header>
										<Sheet.Title>Add Currency</Sheet.Title>
										<Sheet.Description>
											Create a custom currency or activate a system currency from the inactive list below.
										</Sheet.Description>
									</Sheet.Header>
									
									<div class="space-y-6 py-4 max-h-[calc(100vh-8rem)] overflow-y-auto">
										<div class="space-y-4">
											<div class="space-y-2">
												<Label.Root for="new-currency-code">Currency Code (ISO 4217)</Label.Root>
												<Input.Root
													id="new-currency-code"
													type="text"
													placeholder="USD"
													value={newCurrency.code}
													oninput={(e) => {
														const target = e.currentTarget as HTMLInputElement;
														newCurrency.code = target.value.toUpperCase();
													}}
												/>
												<p class="text-xs text-muted-foreground">3 uppercase letters (e.g., USD, EUR, INR)</p>
											</div>
											<div class="space-y-2">
												<Label.Root for="new-currency-name">Currency Name</Label.Root>
												<Input.Root
													id="new-currency-name"
													type="text"
													placeholder="US Dollar"
													bind:value={newCurrency.name}
												/>
											</div>
											<div class="space-y-2">
												<Label.Root for="new-currency-symbol">Symbol</Label.Root>
												<Input.Root
													id="new-currency-symbol"
													type="text"
													placeholder="$"
													bind:value={newCurrency.symbol}
												/>
											</div>
											<div class="space-y-2">
												<Label.Root for="new-currency-placement">Symbol Placement</Label.Root>
												<Select.Root
													type="single"
													bind:value={newCurrency.placement}
												>
													<Select.Trigger id="new-currency-placement">
														{newCurrency.placement === 'before' ? 'Before amount ($100)' : 'After amount (100₽)'}
													</Select.Trigger>
													<Select.Content>
														<Select.Item value="before">Before amount ($100)</Select.Item>
														<Select.Item value="after">After amount (100₽)</Select.Item>
													</Select.Content>
												</Select.Root>
											</div>
											<div class="space-y-2">
												<Label.Root for="new-currency-decimals">Decimal Places</Label.Root>
												<Input.Root
													id="new-currency-decimals"
													type="number"
													min="0"
													max="18"
													value={newCurrency.decimalPlaces.toString()}
													oninput={(e) => {
														const target = e.currentTarget as HTMLInputElement;
														const parsed = parseInt(target.value);
														if (!isNaN(parsed)) {
															newCurrency.decimalPlaces = parsed;
														}
													}}
												/>
											</div>
											<Button.Root
												onclick={addCustomCurrency}
												disabled={isSaving || !newCurrency.code || !newCurrency.name || !newCurrency.symbol}
												class="w-full"
											>
												<Save class="h-4 w-4 mr-2" />
												Create Currency
											</Button.Root>
										</div>
									</div>
								</Sheet.Content>
							</Sheet.Root>
						</div>

						{#if activeCurrencies.length === 0 && inactiveCurrencies.length === 0}
							<div class="text-center py-12 space-y-4">
								<div class="text-6xl mb-4">💱</div>
								<h3 class="text-lg font-semibold text-primary">No currencies yet</h3>
								<p class="text-muted-foreground max-w-md mx-auto">
									Get started by adding your first currency. You can create custom currencies or activate system currencies.
								</p>
								<Button.Root 
									variant="outline" 
									onclick={() => showAddCurrencySheet = true}
									class="mt-4"
								>
									<Plus class="h-4 w-4 mr-2" />
									Add Your First Currency
								</Button.Root>
							</div>
						{:else}
							<div class="space-y-2">
								{#each activeCurrencies as currency, index (currency.id)}
									{@const isMain = currency.code === mainCurrency}
									<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
									<div 
										role="button"
										tabindex="0"
										draggable="true"
										ondragstart={(e) => handleDragStart(e, currency)}
										ondragover={(e) => handleDragOver(e, index)}
										ondrop={(e) => handleDrop(e, index)}
										ondragend={handleDragEnd}
										onclick={(e) => {
											// Don't open drawer if clicking on drag handle or action buttons
											const target = e.target as HTMLElement;
											if (!target.closest('.drag-handle') && !target.closest('button')) {
												openConfigDrawer(currency);
											}
										}}
										onkeydown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												e.preventDefault();
												const target = e.target as HTMLElement;
												if (!target.closest('.drag-handle') && !target.closest('button')) {
													openConfigDrawer(currency);
												}
											}
										}}
										class="flex items-center gap-3 p-3 border rounded-lg transition-all duration-200 hover:shadow-md hover:border-primary/50 cursor-pointer group {isMain ? 'bg-muted border-primary/30' : 'hover:bg-muted/50'} {dragOverIndex === index ? 'border-primary bg-primary/10' : ''}"
										style="animation: slideIn 0.3s ease-out {index * 0.05}s both"
									>
										<Tooltip.Root>
											<Tooltip.Trigger>
												<GripVertical 
													class="h-5 w-5 text-muted-foreground flex-shrink-0 drag-handle cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
													aria-label="Drag to reorder"
												/>
											</Tooltip.Trigger>
											<Tooltip.Content>
												<p>Drag to reorder</p>
											</Tooltip.Content>
										</Tooltip.Root>
										<div class="flex items-center gap-3 flex-1 min-w-0">
											<div class="flex-1 min-w-0">
												<div class="font-medium flex items-center gap-2">
													<span class="truncate">{currency.name}</span>
													<span class="text-muted-foreground">({currency.code})</span>
													{#if isMain}
														<Tooltip.Root>
															<Tooltip.Trigger>
																<span class="text-xs px-2 py-0.5 bg-primary text-primary-foreground rounded">Main</span>
															</Tooltip.Trigger>
															<Tooltip.Content>
																<p>This is your main currency used for totals and calculations</p>
															</Tooltip.Content>
														</Tooltip.Root>
													{/if}
												</div>
												<div class="text-sm text-muted-foreground flex items-center gap-2">
													<span>{currency.symbol}</span>
													<span>•</span>
													<span>{currency.isSystem ? 'System' : 'Custom'}</span>
												</div>
											</div>
										</div>
										<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
										<div 
											role="group" 
											class="flex gap-2 flex-shrink-0" 
											onclick={(e) => e.stopPropagation()}
											onkeydown={(e) => e.stopPropagation()}
										>
											{#if !isMain}
												<Tooltip.Root>
													<Tooltip.Trigger>
														<Button.Root
															variant="outline"
															size="sm"
															onclick={() => toggleCurrencyActive(currency)}
															disabled={isSaving}
															class="transition-transform hover:scale-110 active:scale-95"
															title="Deactivate currency"
														>
															<Eye class="h-4 w-4" />
														</Button.Root>
													</Tooltip.Trigger>
													<Tooltip.Content>
														<p>Deactivate currency</p>
													</Tooltip.Content>
												</Tooltip.Root>
											{/if}
											{#if !currency.isSystem}
												<Tooltip.Root>
													<Tooltip.Trigger>
														<Button.Root
															variant="outline"
															size="sm"
															onclick={() => openDeleteCurrencyDialog(currency)}
															disabled={isSaving}
															class="transition-transform hover:scale-110 active:scale-95 hover:text-destructive"
															title="Delete currency"
														>
															<Trash2 class="h-4 w-4" />
														</Button.Root>
													</Tooltip.Trigger>
													<Tooltip.Content>
														<p>Delete currency</p>
													</Tooltip.Content>
												</Tooltip.Root>
											{/if}
										</div>
									</div>
								{/each}

								{#if inactiveCurrencies.length > 0}
									<div class="mt-4 pt-4 border-t">
										<Button.Root
											variant="ghost"
											size="sm"
											onclick={() => showInactiveCurrencies = !showInactiveCurrencies}
											class="w-full mb-2 transition-all duration-200 hover:bg-muted"
										>
											<span class="flex items-center justify-center gap-2">
												<span>{showInactiveCurrencies ? 'Hide' : 'Show'} Inactive Currencies ({inactiveCurrencies.length})</span>
												<svg 
													class="h-4 w-4 transition-transform duration-200 {showInactiveCurrencies ? 'rotate-180' : ''}"
													fill="none" 
													stroke="currentColor" 
													viewBox="0 0 24 24"
												>
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
												</svg>
											</span>
										</Button.Root>

										{#if showInactiveCurrencies}
											<div 
												class="space-y-2 overflow-hidden"
												style="animation: slideDown 0.3s ease-out"
											>
												{#each inactiveCurrencies as currency, index (currency.id)}
													<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
													<div 
														role="button"
														tabindex="0"
														onclick={(e) => {
															const target = e.target as HTMLElement;
															if (!target.closest('button')) {
																openConfigDrawer(currency);
															}
														}}
														onkeydown={(e) => {
															if (e.key === 'Enter' || e.key === ' ') {
																e.preventDefault();
																const target = e.target as HTMLElement;
																if (!target.closest('button')) {
																	openConfigDrawer(currency);
																}
															}
														}}
														class="flex items-center justify-between p-3 border rounded-lg opacity-60 transition-all duration-200 hover:opacity-100 hover:shadow-md hover:bg-muted/30 cursor-pointer group"
														style="animation: fadeIn 0.3s ease-out {index * 0.05}s both"
													>
														<div class="flex items-center gap-3 flex-1 min-w-0">
															<div class="flex-1 min-w-0">
																<div class="font-medium flex items-center gap-2 text-muted-foreground">
																	<span class="truncate">{currency.name}</span>
																	<span class="text-muted-foreground">({currency.code})</span>
																</div>
																<div class="text-sm text-muted-foreground flex items-center gap-2">
																	<span>{currency.symbol}</span>
																	<span>•</span>
																	<span>{currency.isSystem ? 'System' : 'Custom'}</span>
																</div>
															</div>
														</div>
														<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
														<div 
															role="group" 
															class="flex gap-2 flex-shrink-0" 
															onclick={(e) => e.stopPropagation()}
															onkeydown={(e) => e.stopPropagation()}
														>
															<Tooltip.Root>
																<Tooltip.Trigger>
																	<Button.Root
																		variant="outline"
																		size="sm"
																		onclick={() => toggleCurrencyActive(currency)}
																		disabled={isSaving}
																		class="transition-transform hover:scale-110 active:scale-95 hover:text-primary"
																		title="Activate currency"
																	>
																		<Eye class="h-4 w-4" />
																	</Button.Root>
																</Tooltip.Trigger>
																<Tooltip.Content>
																	<p>Activate currency</p>
																</Tooltip.Content>
															</Tooltip.Root>
															{#if !currency.isSystem}
																<Tooltip.Root>
																	<Tooltip.Trigger>
																		<Button.Root
																			variant="outline"
																			size="sm"
																			onclick={() => openDeleteCurrencyDialog(currency)}
																			disabled={isSaving}
																			class="transition-transform hover:scale-110 active:scale-95 hover:text-destructive"
																			title="Delete currency"
																		>
																			<Trash2 class="h-4 w-4" />
																		</Button.Root>
																	</Tooltip.Trigger>
																	<Tooltip.Content>
																		<p>Delete currency</p>
																	</Tooltip.Content>
																</Tooltip.Root>
															{/if}
														</div>
													</div>
												{/each}
											</div>
										{/if}
									</div>
								{/if}
							</div>
						{/if}
					</div>
				</Card.Content>
			</Card.Root>

			<!-- Exchange Rates -->
			<Card.Root>
				<Card.Header>
					<Card.Title>Exchange Rates</Card.Title>
					<Card.Description>
						View and edit conversion rates. Click "Update from API" to fetch current rates (required for correct multi-currency totals). You can also add or edit rates manually for currencies that can't be fetched.
					</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="flex flex-wrap gap-2">
						<Button.Root
							onclick={updateRatesFromAPI}
							disabled={isSaving}
							class="transition-all duration-200"
						>
							<RefreshCw class="h-4 w-4 mr-2 {isSaving ? 'animate-spin' : ''}" />
							{isSaving ? 'Updating...' : 'Update from API'}
						</Button.Root>
						<Button.Root
							variant="outline"
							onclick={() => showAddRateForm = !showAddRateForm}
							disabled={isSaving}
						>
							<Plus class="h-4 w-4 mr-2" />
							{showAddRateForm ? 'Cancel' : 'Add Rate'}
						</Button.Root>
					</div>

					{#if showAddRateForm}
						<div 
							class="border rounded-lg p-4 space-y-4 bg-muted/30"
							style="animation: slideDown 0.3s ease-out"
						>
							<h3 class="font-semibold">Add Manual Rate</h3>
							<p class="text-sm text-muted-foreground">1 from-currency = rate to-currency (e.g. 1 USD = 78 RUB means rate 78 for USD→RUB)</p>
							<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
								<div class="space-y-2">
									<Label.Root for="new-rate-from">From</Label.Root>
									<Select.Root
										type="single"
										bind:value={newRate.fromCurrency}
									>
										<Select.Trigger id="new-rate-from">
											{currencyOptions.find(o => o.value === newRate.fromCurrency)?.label || newRate.fromCurrency}
										</Select.Trigger>
										<Select.Content>
											{#each currencyOptions as o}
												<Select.Item value={o.value}>{o.label}</Select.Item>
											{/each}
										</Select.Content>
									</Select.Root>
								</div>
								<div class="space-y-2">
									<Label.Root for="new-rate-to">To</Label.Root>
									<Select.Root
										type="single"
										bind:value={newRate.toCurrency}
									>
										<Select.Trigger id="new-rate-to">
											{currencyOptions.find(o => o.value === newRate.toCurrency)?.label || newRate.toCurrency}
										</Select.Trigger>
										<Select.Content>
											{#each currencyOptions as o}
												<Select.Item value={o.value}>{o.label}</Select.Item>
											{/each}
										</Select.Content>
									</Select.Root>
								</div>
								<div class="space-y-2">
									<Label.Root for="new-rate-value">Rate</Label.Root>
									<Input.Root
										id="new-rate-value"
										type="number"
										min="0"
										step="0.000001"
										value={newRate.rate}
										oninput={(e) => { const v = parseFloat((e.currentTarget as HTMLInputElement).value); newRate.rate = isNaN(v) ? 1 : v; }}
									/>
								</div>
							</div>
							<div class="flex gap-2">
								<Button.Root onclick={addExchangeRate} disabled={isSaving}>
									<Save class="h-4 w-4 mr-2" />
									Add Rate
								</Button.Root>
								<Button.Root
									variant="outline"
									onclick={() => { showAddRateForm = false; newRate = { fromCurrency: mainCurrency, toCurrency: 'EUR', rate: 1 }; }}
									disabled={isSaving}
								>
									Cancel
								</Button.Root>
							</div>
						</div>
					{/if}

					{#if exchangeRates.length === 0}
						<div class="text-center py-12 space-y-4">
							<div class="text-6xl mb-4">📊</div>
							<h3 class="text-lg font-semibold text-primary">No exchange rates yet</h3>
							<p class="text-muted-foreground max-w-md mx-auto">
								Exchange rates are needed for accurate multi-currency calculations. Update from API or add rates manually.
							</p>
							<div class="flex flex-wrap gap-2 justify-center mt-4">
								<Button.Root 
									variant="outline" 
									onclick={updateRatesFromAPI}
									disabled={isSaving}
								>
									<RefreshCw class="h-4 w-4 mr-2" />
									Update from API
								</Button.Root>
								<Button.Root 
									variant="outline" 
									onclick={() => showAddRateForm = true}
									disabled={isSaving}
								>
									<Plus class="h-4 w-4 mr-2" />
									Add Manual Rate
								</Button.Root>
							</div>
						</div>
					{:else}
						<div class="border rounded-lg overflow-hidden">
							<div class="overflow-x-auto">
								<table class="w-full">
									<thead class="bg-muted">
										<tr>
											<th class="px-4 py-3 text-left text-sm font-medium">From</th>
											<th class="px-4 py-3 text-left text-sm font-medium">To</th>
											<th class="px-4 py-3 text-left text-sm font-medium">Rate</th>
											<th class="px-4 py-3 text-left text-sm font-medium">Source</th>
											<th class="px-4 py-3 text-left text-sm font-medium">Last Updated</th>
											<th class="px-4 py-3 text-right text-sm font-medium">Actions</th>
										</tr>
									</thead>
									<tbody>
										{#each exchangeRates as rate (rate.id)}
											{@const isEditing = editingRate === rate.id}
											<tr 
												class="border-t transition-all duration-150 hover:bg-muted/50 {isEditing ? 'bg-muted/70' : ''}"
												style="animation: fadeIn 0.2s ease-out {exchangeRates.indexOf(rate) * 0.03}s both"
											>
												<td class="px-4 py-3">
													{#if isEditing}
														{@const fromCurrencyValue = getRateValue(rate.id, 'fromCurrency') as string}
														<Select.Root
															type="single"
															value={fromCurrencyValue}
															onValueChange={(value) => {
																if (value) {
																	updateRateValue(rate.id, 'fromCurrency', value);
																}
															}}
														>
															<Select.Trigger class="w-full text-sm">
																{currencyOptions.find(o => o.value === fromCurrencyValue)?.label || fromCurrencyValue}
															</Select.Trigger>
															<Select.Content>
																{#each currencyOptions as o}
																	<Select.Item value={o.value}>{o.label}</Select.Item>
																{/each}
															</Select.Content>
														</Select.Root>
													{:else}
														{rate.fromCurrency}
													{/if}
												</td>
												<td class="px-4 py-3">
													{#if isEditing}
														{@const toCurrencyValue = getRateValue(rate.id, 'toCurrency') as string}
														<Select.Root
															type="single"
															value={toCurrencyValue}
															onValueChange={(value) => {
																if (value) {
																	updateRateValue(rate.id, 'toCurrency', value);
																}
															}}
														>
															<Select.Trigger class="w-full text-sm">
																{currencyOptions.find(o => o.value === toCurrencyValue)?.label || toCurrencyValue}
															</Select.Trigger>
															<Select.Content>
																{#each currencyOptions as o}
																	<Select.Item value={o.value}>{o.label}</Select.Item>
																{/each}
															</Select.Content>
														</Select.Root>
													{:else}
														{rate.toCurrency}
													{/if}
												</td>
												<td class="px-4 py-3">
													{#if isEditing}
														<Input.Root
															type="number"
															min="0"
															step="0.000001"
															value={getRateValue(rate.id, 'rate') as number}
															oninput={(e) => {
																const t = e.currentTarget as HTMLInputElement;
																updateRateValue(rate.id, 'rate', parseFloat(t.value) || 0);
															}}
															onkeydown={(e) => handleRateEditKeydown(e, rate.id)}
															class="w-24"
														/>
													{:else}
														{rate.rate.toFixed(6)}
													{/if}
												</td>
												<td class="px-4 py-3">
													<span class="text-xs text-muted-foreground">
														{rate.source === 'manual' ? 'Manual' : 'API'}
													</span>
												</td>
											<td class="px-4 py-3">
												<div class="flex items-center gap-2">
													<span class="text-xs {isRateOutdated(rate) ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-muted-foreground'}">
														{new Date(rate.date).toLocaleDateString()}
													</span>
													{#if isRateOutdated(rate)}
														<Tooltip.Root>
															<Tooltip.Trigger>
																<AlertCircle class="h-3 w-3 text-amber-600 dark:text-amber-400" aria-hidden="true" />
															</Tooltip.Trigger>
															<Tooltip.Content>
																<p>This rate is more than 1 day old. Consider updating it.</p>
															</Tooltip.Content>
														</Tooltip.Root>
													{/if}
												</div>
											</td>
												<td class="px-4 py-3 text-right">
													{#if isEditing}
														<div class="flex gap-2 justify-end">
															<Button.Root variant="outline" size="sm" onclick={() => cancelEditingRate()} disabled={isSaving}>
																Cancel
															</Button.Root>
															<Button.Root size="sm" onclick={() => saveExchangeRate(rate.id)} disabled={isSaving}>
																<Save class="h-4 w-4 mr-1" />
																Save
															</Button.Root>
														</div>
													{:else}
														<Button.Root
															variant="outline"
															size="sm"
															onclick={() => startEditingRate(rate.id)}
															disabled={isSaving || editingRate !== null}
														>
															<Edit2 class="h-4 w-4" />
														</Button.Root>
														<Button.Root
															variant="outline"
															size="sm"
															onclick={() => resetRateToAPI(rate.id)}
															disabled={isSaving || editingRate !== null}
														>
															<RefreshCw class="h-4 w-4" />
														</Button.Root>
													{/if}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>
					{/if}
				</Card.Content>
			</Card.Root>

			<!-- Currency Configuration Drawer -->
			{#if configCurrency}
				<Sheet.Root bind:open={showConfigDrawer}>
					<Sheet.Content class="max-w-2xl">
						<Sheet.Header>
							<Sheet.Title>{configCurrency.code} Settings</Sheet.Title>
							<Sheet.Description>
								Configure default values and display name for this currency. These values are used when creating accounts and calculating buffers.
							</Sheet.Description>
						</Sheet.Header>
						
						<div class="space-y-6 py-4">
							{#if configCurrency}
								{@const currency = configCurrency}
								{@const config = getConfig(currency.code)}
								{@const isEditing = editingCurrency === currency.code}
								
								<div class="flex items-center justify-between">
									<div>
										{#if config?.isCustom}
											<span class="text-xs text-muted-foreground">Customized Configuration</span>
										{:else}
											<span class="text-xs text-muted-foreground">System Default Configuration</span>
										{/if}
									</div>
									<div class="flex gap-2">
										{#if isEditing}
											<Button.Root
												variant="outline"
												size="sm"
												onclick={() => cancelEditing()}
												disabled={isSaving}
											>
												Cancel
											</Button.Root>
											<Button.Root
												size="sm"
												onclick={() => saveCurrencyConfig(currency.code)}
												disabled={isSaving}
											>
												<Save class="h-4 w-4 mr-2" />
												Save
											</Button.Root>
										{:else}
											<Button.Root
												variant="outline"
												size="sm"
												onclick={() => openResetDefaultsDialog(currency.code)}
												disabled={isSaving}
											>
												<RefreshCw class="h-4 w-4 mr-2" />
												Reset to Defaults
											</Button.Root>
											<Button.Root
												size="sm"
												onclick={() => startEditing(currency.code)}
												disabled={isSaving}
											>
												<Edit2 class="h-4 w-4 mr-2" />
												Edit
											</Button.Root>
										{/if}
									</div>
								</div>

								{#if isEditing}
									<div class="grid grid-cols-1 gap-4">
										<div class="space-y-2">
											<Label.Root for="currency-name-drawer">Currency Name</Label.Root>
											<Input.Root
												id="currency-name-drawer"
												type="text"
												value={editedCurrencyName}
												oninput={(e) => {
													editedCurrencyName = (e.currentTarget as HTMLInputElement).value;
												}}
												placeholder="Enter currency name"
											/>
											<p class="text-xs text-muted-foreground">Display name for this currency</p>
										</div>
										<div class="space-y-2">
											<Label.Root for="checking-buffer-drawer">Checking Buffer</Label.Root>
											<Input.Root
												id="checking-buffer-drawer"
												type="number"
												min="0"
												step="0.01"
												value={getValue(currency.code, 'defaultCheckingBuffer')?.toString() || ''}
												oninput={(e) => {
													const target = e.currentTarget as HTMLInputElement;
													updateValue(currency.code, 'defaultCheckingBuffer', parseFloat(target.value) || 0);
												}}
											/>
											<p class="text-xs text-muted-foreground">Default buffer amount for checking accounts</p>
										</div>
										<div class="space-y-2">
											<Label.Root for="savings-buffer-drawer">Savings Buffer</Label.Root>
											<Input.Root
												id="savings-buffer-drawer"
												type="number"
												min="0"
												step="0.01"
												value={getValue(currency.code, 'defaultSavingsBuffer')?.toString() || ''}
												oninput={(e) => {
													const target = e.currentTarget as HTMLInputElement;
													updateValue(currency.code, 'defaultSavingsBuffer', parseFloat(target.value) || 0);
												}}
											/>
											<p class="text-xs text-muted-foreground">Default buffer amount for savings accounts</p>
										</div>
										<div class="space-y-2">
											<Label.Root for="min-balance-drawer">Minimum Balance</Label.Root>
											<Input.Root
												id="min-balance-drawer"
												type="number"
												step="0.01"
												value={getValue(currency.code, 'defaultMinimumBalance')?.toString() || ''}
												oninput={(e) => {
													const target = e.currentTarget as HTMLInputElement;
													updateValue(currency.code, 'defaultMinimumBalance', parseFloat(target.value) || 0);
												}}
											/>
											<p class="text-xs text-muted-foreground">Default minimum balance (can be negative for credit accounts)</p>
										</div>
										<div class="space-y-2">
											<Label.Root for="max-amount-drawer">Max Amount Limit</Label.Root>
											<Input.Root
												id="max-amount-drawer"
												type="number"
												min="0"
												step="0.01"
												value={getValue(currency.code, 'maxAmountLimit')?.toString() || ''}
												oninput={(e) => {
													const target = e.currentTarget as HTMLInputElement;
													updateValue(currency.code, 'maxAmountLimit', parseFloat(target.value) || 0);
												}}
											/>
											<p class="text-xs text-muted-foreground">Maximum transaction amount limit (leave empty for unlimited)</p>
										</div>
									</div>
								{:else}
									<div class="space-y-4">
										<div class="flex justify-between items-center py-2 border-b">
											<span class="text-muted-foreground">Checking Buffer:</span>
											<span class="font-medium">
												{#if config?.defaultCheckingBuffer !== undefined}
													{formatAmount(config.defaultCheckingBuffer, currency.code)}
												{:else}
													Not set
												{/if}
											</span>
										</div>
										<div class="flex justify-between items-center py-2 border-b">
											<span class="text-muted-foreground">Savings Buffer:</span>
											<span class="font-medium">
												{#if config?.defaultSavingsBuffer !== undefined}
													{formatAmount(config.defaultSavingsBuffer, currency.code)}
												{:else}
													Not set
												{/if}
											</span>
										</div>
										<div class="flex justify-between items-center py-2 border-b">
											<span class="text-muted-foreground">Minimum Balance:</span>
											<span class="font-medium">
												{#if config?.defaultMinimumBalance !== undefined}
													{formatAmount(config.defaultMinimumBalance, currency.code)}
												{:else}
													Not set
												{/if}
											</span>
										</div>
										<div class="flex justify-between items-center py-2 border-b">
											<span class="text-muted-foreground">Max Amount Limit:</span>
											<span class="font-medium">
												{#if config?.maxAmountLimit !== undefined}
													{formatAmount(config.maxAmountLimit, currency.code)}
												{:else}
													Not set
												{/if}
											</span>
										</div>
									</div>
								{/if}
							{/if}
						</div>
					</Sheet.Content>
				</Sheet.Root>
			{/if}

			<!-- Reset Defaults Alert Dialog -->
			<AlertDialog.Root bind:open={showResetDefaultsDialog}>
				<AlertDialog.Content>
					<AlertDialog.Header>
						<AlertDialog.Title>Reset to Defaults</AlertDialog.Title>
						<AlertDialog.Description>
							Are you sure you want to reset {resetDefaultsCurrencyCode} configuration to system defaults? This will overwrite any custom settings you've configured.
						</AlertDialog.Description>
					</AlertDialog.Header>
					<AlertDialog.Footer>
						<AlertDialog.Cancel disabled={isSaving}>Cancel</AlertDialog.Cancel>
						<AlertDialog.Action
							onclick={() => {
								if (resetDefaultsCurrencyCode) {
									resetToDefaults(resetDefaultsCurrencyCode);
								}
							}}
							disabled={isSaving}
						>
							Reset to Defaults
						</AlertDialog.Action>
					</AlertDialog.Footer>
				</AlertDialog.Content>
			</AlertDialog.Root>

			<!-- Convert Exchange Rates Alert Dialog -->
			<AlertDialog.Root bind:open={showConvertRatesDialog}>
				<AlertDialog.Content>
					<AlertDialog.Header>
						<AlertDialog.Title>Convert Exchange Rates?</AlertDialog.Title>
						<AlertDialog.Description>
							Changing main currency from {oldMainCurrency} to {mainCurrency}.
							<br />
							<br />
							Would you like to automatically convert existing exchange rates to the new main currency?
							<br />
							<br />
							If you choose "No", you'll need to manually set exchange rates for the new main currency.
						</AlertDialog.Description>
					</AlertDialog.Header>
					<AlertDialog.Footer>
						<AlertDialog.Cancel
							disabled={isSaving}
							onclick={() => {
								showConvertRatesDialog = false;
								// Revert main currency on cancel
								mainCurrency = oldMainCurrency;
							}}
						>
							Cancel
						</AlertDialog.Cancel>
						<Button.Root
							variant="outline"
							onclick={() => {
								showConvertRatesDialog = false;
								performMainCurrencyChange(false);
							}}
							disabled={isSaving}
						>
							No, Keep Rates
						</Button.Root>
						<AlertDialog.Action
							onclick={() => {
								performMainCurrencyChange(true);
							}}
							disabled={isSaving}
						>
							Yes, Convert Rates
						</AlertDialog.Action>
					</AlertDialog.Footer>
				</AlertDialog.Content>
			</AlertDialog.Root>

			<!-- Delete Currency Alert Dialog -->
			<AlertDialog.Root bind:open={showDeleteCurrencyDialog}>
				<AlertDialog.Content>
					<AlertDialog.Header>
						<AlertDialog.Title>Delete Currency</AlertDialog.Title>
						<AlertDialog.Description>
							Are you sure you want to delete {currencyToDelete?.name} ({currencyToDelete?.code})? This will also deactivate it. This action cannot be undone.
						</AlertDialog.Description>
					</AlertDialog.Header>
					<AlertDialog.Footer>
						<AlertDialog.Cancel disabled={isSaving}>Cancel</AlertDialog.Cancel>
						<AlertDialog.Action
							onclick={() => {
								if (currencyToDelete) {
									deleteCurrency(currencyToDelete);
								}
							}}
							disabled={isSaving}
							class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							Delete Currency
						</AlertDialog.Action>
					</AlertDialog.Footer>
				</AlertDialog.Content>
			</AlertDialog.Root>
		{/if}
	</div>

	{#snippet bottomBar()}
			<div class="px-4 justify-center max-w-xs mx-auto">
				<Button.Root 
					onclick={saveAllChanges} 
					disabled={isSaving || !hasUnsavedChanges}
					class="w-full max-w-xs mx-auto transition-all duration-200"
				>
					<Save class="h-4 w-4 mr-2 {isSaving ? 'animate-pulse' : ''}" />
					{isSaving ? 'Saving...' : 'Save Changes'}
				</Button.Root>
			</div>
	{/snippet}
</PageLayout>

<style>
	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			max-height: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			max-height: 2000px;
			transform: translateY(0);
		}
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>
