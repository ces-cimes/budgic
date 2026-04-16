<script lang="ts">
	import { autocompleteService } from '$lib/core/services/autocomplete-service';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import CheckIcon from '@lucide/svelte/icons/check';
	import * as Input from '$lib/components/ui/input/index.ts';

	interface SearchableSelectOption {
		value: string;
		label: string;
		hint?: string;
		chip?: {
			label: string;
			color?: string;
		};
	}

	interface Props {
		value?: string;
		options: SearchableSelectOption[];
		placeholder?: string;
		emptyLabel?: string;
		allowClear?: boolean;
		clearLabel?: string;
		disabled?: boolean;
		fieldKey?: string;
		selectionContext?: Record<string, unknown>;
	}

	let {
		value = $bindable(''),
		options,
		placeholder = 'Select an option',
		emptyLabel = 'No matches',
		allowClear = false,
		clearLabel = 'Clear selection',
		disabled = false,
		fieldKey,
		selectionContext
	}: Props = $props();

	let isOpen = $state(false);
	let searchTerm = $state('');
	let highlightedIndex = $state(0);
	let containerRef: HTMLDivElement | null = $state(null);
	let filterInputRef: HTMLInputElement | null = $state(null);

	let selectedOption = $derived(options.find((option) => option.value === value));
	let filteredOptions = $derived.by(() => {
		const query = searchTerm.trim().toLowerCase();
		if (!query) return options;
		return options.filter(
			(option) =>
				option.label.toLowerCase().includes(query) ||
				option.value.toLowerCase().includes(query) ||
				option.hint?.toLowerCase().includes(query)
		);
	});

	$effect(() => {
		if (!isOpen) return;

		highlightedIndex = filteredOptions.length > 0 ? 0 : -1;
		const timeoutId = setTimeout(() => {
			filterInputRef?.focus();
		}, 0);

		return () => {
			clearTimeout(timeoutId);
		};
	});

	function openPanel() {
		if (disabled) return;
		searchTerm = '';
		isOpen = true;
	}

	function closePanel() {
		isOpen = false;
		searchTerm = '';
		highlightedIndex = 0;
	}

	function handleTriggerKeydown(event: KeyboardEvent) {
		if (disabled) return;

		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			if (!isOpen) {
				openPanel();
				return;
			}
			moveHighlight(event.key === 'ArrowDown' ? 1 : -1);
			return;
		}

		if (event.key === 'Enter') {
			event.preventDefault();
			if (!isOpen) {
				openPanel();
				return;
			}
			selectHighlighted();
			return;
		}

		if (event.key === 'Escape' && isOpen) {
			event.preventDefault();
			closePanel();
		}
	}

	function handleFilterKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			moveHighlight(1);
			return;
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			moveHighlight(-1);
			return;
		}
		if (event.key === 'Enter') {
			event.preventDefault();
			selectHighlighted();
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			closePanel();
		}
	}

	function moveHighlight(step: number) {
		if (filteredOptions.length === 0) {
			highlightedIndex = -1;
			return;
		}
		if (highlightedIndex < 0) {
			highlightedIndex = 0;
			return;
		}
		highlightedIndex = (highlightedIndex + step + filteredOptions.length) % filteredOptions.length;
	}

	function selectHighlighted() {
		if (highlightedIndex < 0 || highlightedIndex >= filteredOptions.length) return;
		selectOption(filteredOptions[highlightedIndex].value);
	}

	function selectOption(nextValue: string) {
		value = nextValue;
		closePanel();

		if (fieldKey) {
			autocompleteService
				.recordSelection(fieldKey, nextValue, true, selectionContext)
				.catch((error) => console.error('Failed to record searchable select selection', error));
		}
	}

	function clearSelection() {
		value = '';
		closePanel();
	}

	function handleWindowMouseDown(event: MouseEvent) {
		if (!isOpen || !containerRef) return;
		const target = event.target;
		if (target instanceof Node && !containerRef.contains(target)) {
			closePanel();
		}
	}
</script>

<svelte:window onmousedown={handleWindowMouseDown} />

<div class="relative" bind:this={containerRef}>
	<button
		type="button"
		class="border-input data-[placeholder]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50 flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none select-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
		aria-haspopup="listbox"
		aria-expanded={isOpen}
		{disabled}
		onclick={() => (isOpen ? closePanel() : openPanel())}
		onkeydown={handleTriggerKeydown}
	>
		<span class={selectedOption ? 'text-foreground' : 'text-muted-foreground'}>
			{selectedOption?.label || placeholder}
		</span>
		<ChevronDownIcon class="size-4 opacity-50" />
	</button>

	{#if isOpen}
		<div
			class="bg-popover text-popover-foreground absolute z-50 mt-1 w-full rounded-md border p-2 shadow-md"
		>
			<div class="mb-2">
				<Input.Root
					bind:ref={filterInputRef}
					bind:value={searchTerm}
					placeholder="Search..."
					onkeydown={handleFilterKeydown}
					autocomplete="off"
				/>
			</div>

			<div class="max-h-56 overflow-y-auto">
				{#if allowClear}
					<button
						type="button"
						class="hover:bg-accent flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm"
						onmousedown={(event) => event.preventDefault()}
						onclick={clearSelection}
					>
						<span>{clearLabel}</span>
						{#if !value}
							<CheckIcon class="size-4 opacity-70" />
						{/if}
					</button>
				{/if}

				{#if filteredOptions.length === 0}
					<p class="text-muted-foreground px-2 py-1.5 text-sm">{emptyLabel}</p>
				{:else}
					{#each filteredOptions as option, index (option.value)}
						<button
							type="button"
							class="hover:bg-accent flex w-full min-w-0 items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm {index ===
							highlightedIndex
								? 'bg-accent'
								: ''}"
							role="option"
							aria-selected={value === option.value}
							onmousedown={(event) => event.preventDefault()}
							onmouseover={() => (highlightedIndex = index)}
							onfocus={() => (highlightedIndex = index)}
							onclick={() => selectOption(option.value)}
						>
							<span class="min-w-0 flex-1">
								<span class="block truncate">{option.label}</span>
								{#if option.hint}
									<span class="text-muted-foreground block truncate text-xs">{option.hint}</span>
								{/if}
							</span>
							<span class="flex shrink-0 items-center gap-2">
								{#if option.chip}
									<span
										class="max-w-28 truncate rounded-full px-2 py-0.5 text-[10px] font-medium"
										style={`background-color: color-mix(in srgb, ${option.chip.color ?? 'var(--color-muted)'} 18%, transparent); color: ${option.chip.color ?? 'var(--color-text-tertiary)'};`}
									>
										{option.chip.label}
									</span>
								{/if}
								{#if value === option.value}
									<CheckIcon class="size-4 shrink-0 opacity-70" />
								{/if}
							</span>
						</button>
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</div>
