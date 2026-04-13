<script lang="ts">
	import { ChevronDown } from '@lucide/svelte';
	import * as Input from '$lib/components/ui/input/index.ts';
	import CurrencySelectionSheet from './CurrencySelectionSheet.svelte';
	import { getCurrencyInfo } from '$lib/utils/currency-utils';
	import { createMobileInputFocusHandler } from '$lib/utils/mobile-input-utils';
	import type { CurrencyInfo } from '$lib/core/db';

	interface Currency {
		code: string;
		name: string;
		symbol: string;
		placement?: 'before' | 'after';
		decimalPlaces?: number;
	}

	interface Props {
		value: number;
		currency: string;
		currencies: Currency[];
		onValueChange: (value: number) => void;
		onCurrencyChange: (currency: string) => void;
		placeholder?: string;
		required?: boolean;
		min?: number;
		max?: number;
		error?: string;
		id?: string;
		label?: string;
	}

	const {
		value,
		currency,
		currencies,
		onValueChange,
		onCurrencyChange,
		placeholder,
		required = false,
		min,
		max,
		error,
		id = 'amount',
		label
	}: Props = $props();

	let showCurrencySheet = $state(false);
	let currencyButtonRef: HTMLButtonElement | null = $state(null);
	let currencyButtonPadding = $state(64); // Default padding in pixels
	let inputValue = $state(0);
	let lastExternalValue = $state(0);

	$effect.pre(() => {
		inputValue = value;
		lastExternalValue = value;
	});

	// Get current currency info
	let currentCurrencyInfo = $derived(() => {
		const info = getCurrencyInfo(currency);
		if (!info) {
			console.warn(`Currency info not found for code: ${currency}`);
			// Return minimal fallback - but this should not happen in normal operation
			return {
				code: currency,
				name: currency,
				symbol: currency,
				placement: 'before' as const,
				decimalPlaces: 2,
				isSystem: false,
				isActive: true
			} as CurrencyInfo;
		}
		return info;
	});

	// Get currency symbol for display
	let currencySymbol = $derived(() => currentCurrencyInfo().symbol);

	// Calculate step based on decimal places
	let step = $derived(() => {
		const decimals = currentCurrencyInfo().decimalPlaces;
		if (decimals === 0) return '1';
		if (decimals === 1) return '0.1';
		if (decimals === 2) return '0.01';
		return `0.${'0'.repeat(decimals - 1)}1`;
	});

	// Measure currency button width and update padding
	$effect(() => {
		if (currencyButtonRef) {
			// Use ResizeObserver to track button width changes
			const resizeObserver = new ResizeObserver((entries) => {
				for (const entry of entries) {
					// Use offsetWidth to include padding (px-2 = 8px each side = 16px total)
					const width = currencyButtonRef?.offsetWidth || 0;
					// Button is at left-2 (8px), button width includes its padding, add 12px spacing
					currencyButtonPadding = width + 12;
				}
			});

			resizeObserver.observe(currencyButtonRef);

			// Initial measurement with a small delay to ensure DOM is updated
			const updatePadding = () => {
				if (currencyButtonRef) {
					// Use offsetWidth to include padding (px-2 = 8px each side = 16px total)
					const width = currencyButtonRef.offsetWidth;
					// Button is at left-2 (8px), button width includes its padding, add 12px spacing
					currencyButtonPadding = width + 12;
				}
			};

			// Immediate measurement
			updatePadding();

			// Also measure after a short delay to catch any layout changes
			const timeoutId = setTimeout(updatePadding, 50);

			return () => {
				resizeObserver.disconnect();
				clearTimeout(timeoutId);
			};
		}
	});

	const handleFocus = createMobileInputFocusHandler();

	// Handle input changes
	function handleInputChange() {
		if (inputValue !== lastExternalValue) {
			onValueChange(inputValue);
			lastExternalValue = inputValue;
		}
	}
</script>

<div class="relative flex flex-1 items-center">
	<button
		type="button"
		bind:this={currencyButtonRef}
		onclick={() => (showCurrencySheet = true)}
		class="hover:bg-secondary absolute top-1/2 left-2 z-10 flex -translate-y-1/2 transform items-center gap-1 rounded-md px-2 py-1 transition-colors"
		aria-label="Change currency"
	>
		<span class="text-primary text-sm font-medium">{currencySymbol()}</span>
		<ChevronDown class="text-muted-foreground h-3 w-3" />
	</button>
	<Input.Root
		{id}
		type="number"
		bind:value={inputValue}
		oninput={handleInputChange}
		onchange={handleInputChange}
		placeholder={placeholder ||
			(() => {
				const decimalPlaces = currentCurrencyInfo().decimalPlaces;
				return `0.${'0'.repeat(decimalPlaces)}`;
			})()}
		step={step()}
		style="padding-left: {currencyButtonPadding}px;"
		{required}
		{min}
		{max}
		onfocus={handleFocus}
		class={error ? 'border-destructive' : ''}
	/>
</div>

{#if error}
	<p class="text-destructive mt-1 text-sm" role="alert">{error}</p>
{/if}

<CurrencySelectionSheet
	open={showCurrencySheet}
	{currencies}
	selectedCurrency={currency}
	onCurrencySelect={onCurrencyChange}
	onClose={() => (showCurrencySheet = false)}
/>
