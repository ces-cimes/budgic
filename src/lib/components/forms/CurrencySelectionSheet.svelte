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
	<Sheet.Content side="bottom" class="sm:max-w-md mx-auto">
		<Sheet.Header>
			<Sheet.Title>Select Currency</Sheet.Title>
			<Sheet.Description>
				Choose the currency for this transaction
			</Sheet.Description>
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
						class="w-full flex items-center justify-between px-4 py-3 rounded-md hover:bg-secondary transition-colors text-left {selectedCurrency === curr.code ? 'bg-secondary border border-primary' : ''}"
						aria-label="Select {curr.name}"
					>
						<div class="flex items-center gap-3">
							<span class="text-lg font-medium">{curr.symbol}</span>
							<div class="flex flex-col">
								<span class="text-sm font-medium text-primary">{curr.name}</span>
								<span class="text-xs text-muted-foreground">{curr.code}</span>
							</div>
						</div>
						{#if selectedCurrency === curr.code}
							<div class="w-2 h-2 rounded-full bg-primary" aria-hidden="true"></div>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	</Sheet.Content>
</Sheet.Root>

