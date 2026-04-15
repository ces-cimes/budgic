<script lang="ts">
	import * as Input from '$lib/components/ui/input/index.ts';
	import {
		autocompleteService,
		type DescriptionSuggestion
	} from '$lib/core/services/autocomplete-service';

	interface Props {
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		onfocus?: (event: FocusEvent) => void;
		onSuggestionSelected?: (suggestion: DescriptionSuggestion) => void;
	}

	let {
		value = $bindable(''),
		placeholder = '',
		disabled = false,
		onfocus,
		onSuggestionSelected
	}: Props = $props();

	const DEBOUNCE_MS = 180;
	const SUGGESTION_LIMIT = 8;

	let suggestions = $state<DescriptionSuggestion[]>([]);
	let isFocused = $state(false);
	let highlightedIndex = $state(-1);
	let isDropdownDismissed = $state(false);

	let showDropdown = $derived(isFocused && !isDropdownDismissed && suggestions.length > 0 && !disabled);

	$effect(() => {
		const query = value.trim();
		const focused = isFocused;

		if (!focused || disabled) {
			suggestions = [];
			highlightedIndex = -1;
			return;
		}

		let cancelled = false;
		const timeoutId = setTimeout(async () => {
			try {
				const nextSuggestions = await autocompleteService.getSuggestionsForDescription(
					query,
					SUGGESTION_LIMIT
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
		onfocus?.(event);
	}

	function handleBlur() {
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
	}

	function handleInput() {
		isDropdownDismissed = false;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!showDropdown) {
			return;
		}

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			highlightedIndex = (highlightedIndex + 1) % suggestions.length;
			return;
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			highlightedIndex = (highlightedIndex - 1 + suggestions.length) % suggestions.length;
			return;
		}

		if (event.key === 'Enter' && highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
			event.preventDefault();
			selectSuggestion(suggestions[highlightedIndex]);
			return;
		}

		if (event.key === 'Escape') {
			event.preventDefault();
			isDropdownDismissed = true;
			highlightedIndex = -1;
		}
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

	{#if showDropdown}
		<div
			class="bg-background absolute z-20 mt-1 w-full rounded-md border shadow-sm"
			role="listbox"
			aria-label="Description suggestions"
		>
			<ul class="max-h-64 overflow-y-auto py-1">
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
							<p class="text-sm text-[var(--color-text-primary)]">{suggestion.value}</p>
							<p class="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
								Used {suggestion.frequency} time{suggestion.frequency === 1 ? '' : 's'} in 90 days
								- {formatLastUsed(suggestion.lastUsed)}
							</p>
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
