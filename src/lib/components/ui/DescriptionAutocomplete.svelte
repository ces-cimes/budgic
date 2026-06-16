<script lang="ts">
	import * as Input from '$lib/components/ui/input/index.ts';
	import {
		autocompleteService,
		autocompleteFilterFromContext,
		type DescriptionSuggestion
	} from '$lib/core/services/autocomplete-service';

	interface Props {
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		onfocus?: (event: FocusEvent) => void;
		fieldKey?: string;
		selectionContext?: Record<string, unknown>;
		onSuggestionSelected?: (suggestion: DescriptionSuggestion) => void;
		suggestionFetcher?: (partial: string, limit: number) => Promise<DescriptionSuggestion[]>;
	}

	let {
		value = $bindable(''),
		placeholder = '',
		disabled = false,
		onfocus,
		fieldKey = 'transaction.description',
		selectionContext,
		onSuggestionSelected,
		suggestionFetcher
	}: Props = $props();

	const DEBOUNCE_MS = 180;
	const SUGGESTION_LIMIT = 8;

	let suggestions = $state<DescriptionSuggestion[]>([]);
	let isFocused = $state(false);
	let highlightedIndex = $state(-1);
	let isDropdownDismissed = $state(false);
	let committedValuesInFocusSession: string[] = [];
	let lastSuggestionValue: string | null = null;

	let showDropdown = $derived(
		isFocused && !isDropdownDismissed && suggestions.length > 0 && !disabled
	);
	const isSuggestedMatch = $derived.by(() => {
		if (!lastSuggestionValue) return false;
		const normalized = normalizeCommittedValue(value);
		return normalized !== null && normalized === lastSuggestionValue;
	});

	$effect(() => {
		const query = value.trim();
		const focused = isFocused;
		const txFilter = autocompleteFilterFromContext(selectionContext);

		if (!focused || disabled) {
			suggestions = [];
			highlightedIndex = -1;
			return;
		}

		let cancelled = false;
		const timeoutId = setTimeout(async () => {
			try {
				const nextSuggestions = suggestionFetcher
					? await suggestionFetcher(query, SUGGESTION_LIMIT)
					: await autocompleteService.getSuggestionsForDescription(
							query,
							SUGGESTION_LIMIT,
							txFilter
						);
				if (!cancelled) {
					suggestions = nextSuggestions;
					highlightedIndex = nextSuggestions.length > 0 ? 0 : -1;
				}
			} catch (error) {
				console.error('Failed to load description suggestions', error);
				if (!cancelled) {
					suggestions = [];
					highlightedIndex = -1;
				}
			}
		}, DEBOUNCE_MS);

		return () => {
			cancelled = true;
			clearTimeout(timeoutId);
		};
	});

	function handleFocus(event: FocusEvent) {
		isFocused = true;
		isDropdownDismissed = false;
		committedValuesInFocusSession = [];
		lastSuggestionValue = null;
		onfocus?.(event);
	}

	function handleBlur() {
		commitManualEntry();
		setTimeout(() => {
			isFocused = false;
			isDropdownDismissed = false;
			highlightedIndex = -1;
		}, 100);
	}

	function selectSuggestion(suggestion: DescriptionSuggestion) {
		value = suggestion.value;
		onSuggestionSelected?.(suggestion);
		isDropdownDismissed = true;
		highlightedIndex = -1;
		lastSuggestionValue = normalizeCommittedValue(suggestion.value);

		autocompleteService
			.recordSelection(fieldKey, suggestion.value, true, selectionContext)
			.catch((error) => {
				console.error('Failed to record autocomplete selection', error);
			});
	}

	function handleInput() {
		isDropdownDismissed = false;
		if (
			lastSuggestionValue &&
			normalizeCommittedValue(value) !== null &&
			normalizeCommittedValue(value) !== lastSuggestionValue
		) {
			lastSuggestionValue = null;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' && showDropdown) {
			event.preventDefault();
			highlightedIndex = (highlightedIndex + 1) % suggestions.length;
			return;
		}

		if (event.key === 'ArrowUp' && showDropdown) {
			event.preventDefault();
			highlightedIndex = (highlightedIndex - 1 + suggestions.length) % suggestions.length;
			return;
		}

		if (event.key === 'Enter') {
			if (showDropdown && highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
				event.preventDefault();
				selectSuggestion(suggestions[highlightedIndex]);
				return;
			}

			commitManualEntry();
			return;
		}

		if (event.key === 'Escape' && showDropdown) {
			event.preventDefault();
			isDropdownDismissed = true;
			highlightedIndex = -1;
		}
	}

	function normalizeCommittedValue(input: string): string | null {
		const normalized = input.trim().replace(/\s+/g, ' ');
		return normalized.length > 0 ? normalized : null;
	}

	function commitManualEntry() {
		const normalized = normalizeCommittedValue(value);
		if (!normalized) {
			return;
		}

		if (lastSuggestionValue && normalized === lastSuggestionValue) {
			return;
		}

		const dedupeKey = normalized.toLowerCase();
		if (committedValuesInFocusSession.includes(dedupeKey)) {
			return;
		}
		committedValuesInFocusSession = [...committedValuesInFocusSession, dedupeKey];

		autocompleteService
			.recordSelection(fieldKey, normalized, false, selectionContext)
			.catch((error) => {
				console.error('Failed to record manual autocomplete entry', error);
			});
	}

	function formatLastUsed(value: Date): string {
		const date = value instanceof Date ? value : new Date(value);
		return `Last used ${date.toLocaleDateString()}`;
	}
</script>

<div class="relative">
	<Input.Root
		id="description"
		bind:value
		{placeholder}
		{disabled}
		onfocus={handleFocus}
		onblur={handleBlur}
		onkeydown={handleKeydown}
		oninput={handleInput}
		autocomplete="off"
	/>
	{#if isSuggestedMatch}
		<div class="mt-1">
			<span
				class="inline-flex items-center rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-tertiary)]"
			>
				Suggested
			</span>
		</div>
	{/if}

	{#if showDropdown}
		<div
			class="bg-background absolute z-20 mt-1 w-full rounded-md border shadow-sm"
			role="listbox"
			aria-label="Description suggestions"
		>
			<ul class="max-h-64 overflow-y-auto py-1">
				{#if value.trim().length === 0}
					<li class="px-3 py-1 text-xs text-[var(--color-text-tertiary)]">
						Top suggestions
					</li>
				{/if}
				{#each suggestions as suggestion, index (suggestion.value)}
					<li>
						<button
							type="button"
							class="hover:bg-accent w-full px-3 py-2 text-left transition-colors {index ===
							highlightedIndex
								? 'bg-accent'
								: ''}"
							onmousedown={(event) => event.preventDefault()}
							onclick={() => selectSuggestion(suggestion)}
							role="option"
							aria-selected={index === highlightedIndex}
						>
							<p class="text-sm text-[var(--color-text-primary)]">
								{suggestion.value}
							</p>
							<p class="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
								Used {suggestion.frequency} time{suggestion.frequency === 1
									? ''
									: 's'} in 90 days - {formatLastUsed(suggestion.lastUsed)}
								{#if (suggestion.variationCount ?? 0) > 1}
									- inc. {suggestion.variationCount} variations
								{/if}
							</p>
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
