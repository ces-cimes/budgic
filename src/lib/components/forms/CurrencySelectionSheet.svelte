<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet/index.ts';

	interface Currency {
		code: string;
		name: string;
		symbol: string;
		placement?: 'before' | 'after';
		decimalPlaces?: number;
	}

	interface Props {
		open: boolean;
		currencies: Currency[];
		selectedCurrency: string;
		onCurrencySelect: (currency: string) => void;
		onClose: () => void;
	}

	let {
		open = $bindable(),
		currencies,
		selectedCurrency,
		onCurrencySelect,
		onClose
	}: Props = $props();
</script>

<Sheet.Root bind:open>
	<Sheet.Content side="bottom" class="mx-auto sm:max-w-md">
		<Sheet.Header>
			<Sheet.Title>Select Currency</Sheet.Title>
			<Sheet.Description>Choose the currency for this transaction</Sheet.Description>
		</Sheet.Header>
		<div class="max-h-[60vh] overflow-y-auto py-4">
			<div class="space-y-1">
				{#each currencies as curr (curr.code)}
					<button
						type="button"
						onclick={() => {
							onCurrencySelect(curr.code);
							onClose();
						}}
						class="hover:bg-secondary flex w-full items-center justify-between rounded-md px-4 py-3 text-left transition-colors {selectedCurrency ===
						curr.code
							? 'bg-secondary border-primary border'
							: ''}"
						aria-label="Select {curr.name}"
					>
						<div class="flex items-center gap-3">
							<span class="text-lg font-medium">{curr.symbol}</span>
							<div class="flex flex-col">
								<span class="text-primary text-sm font-medium">{curr.name}</span>
								<span class="text-muted-foreground text-xs">{curr.code}</span>
							</div>
						</div>
						{#if selectedCurrency === curr.code}
							<div class="bg-primary h-2 w-2 rounded-full" aria-hidden="true"></div>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	</Sheet.Content>
</Sheet.Root>
