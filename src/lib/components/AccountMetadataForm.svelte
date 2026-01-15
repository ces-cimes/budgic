<script lang="ts">
	import { Label } from '$lib/components/ui/label/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import type { Account, AccountMetadata } from '$lib/core/db';
	import {
		getRelevantMetadataFields,
		getDefaultMetadata,
		formatMetadataFieldLabel
	} from '$lib/utils/account-metadata-utils';

	interface Props {
		accountType: Account['type'];
		metadata?: AccountMetadata;
		currency?: string;
		onMetadataChange?: (metadata: Partial<AccountMetadata>) => void;
	}

	const {
		accountType,
		metadata = {},
		currency = 'USD',
		onMetadataChange
	}: Props = $props();

	// Get relevant fields for this account type
	const relevantFields = $derived(getRelevantMetadataFields(accountType));
	const showMetadata = $derived(relevantFields.length > 0);
	let isOpen = $state(false);

	// State for metadata fields
	let metadataState = $state<Partial<AccountMetadata>>(metadata || {});

	// Initialize with defaults if needed
	$effect(() => {
		if (!metadata || Object.keys(metadata).length === 0) {
			const defaults = getDefaultMetadata(accountType);
			metadataState = { ...defaults, ...(metadata || {}) };
		} else {
			metadataState = { ...metadata };
		}
	});

	function updateField(field: keyof AccountMetadata, value: string | number | undefined) {
		if (value === '' || value === null) {
			const newMetadata = { ...metadataState };
			delete newMetadata[field];
			metadataState = newMetadata;
		} else {
			metadataState = {
				...metadataState,
				[field]: typeof value === 'string' && !isNaN(Number(value)) ? Number(value) : value
			};
		}
		onMetadataChange?.(metadataState);
	}

	function getFieldValue(field: keyof AccountMetadata): string {
		if (!metadataState) return '';
		const value = metadataState[field];
		if (value === undefined || value === null) {
			return '';
		}
		return String(value);
	}

	function getInputType(field: keyof AccountMetadata): 'text' | 'number' {
		if (
			field === 'statementCloseDate' ||
			field === 'paymentDueDate' ||
			field === 'loanDueDate' ||
			field === 'creditBureauReportingDate'
		) {
			return 'number';
		}
		return 'number';
	}

	function getInputPlaceholder(field: keyof AccountMetadata): string {
		switch (field) {
			case 'statementCloseDate':
			case 'paymentDueDate':
			case 'loanDueDate':
			case 'creditBureauReportingDate':
				return 'Day of month (1-31)';
			case 'interestRate':
			case 'apr':
				return '0.00';
			case 'gracePeriodDays':
			case 'transferDelayDays':
				return '0';
			default:
				return '0.00';
		}
	}

	function getInputStep(field: keyof AccountMetadata): string {
		if (field === 'interestRate' || field === 'apr') {
			return '0.01';
		}
		if (
			field === 'statementCloseDate' ||
			field === 'paymentDueDate' ||
			field === 'loanDueDate' ||
			field === 'creditBureauReportingDate' ||
			field === 'gracePeriodDays' ||
			field === 'transferDelayDays'
		) {
			return '1';
		}
		return '0.01';
	}

	function getInputMin(field: keyof AccountMetadata): number | undefined {
		if (
			field === 'statementCloseDate' ||
			field === 'paymentDueDate' ||
			field === 'loanDueDate' ||
			field === 'creditBureauReportingDate'
		) {
			return 1;
		}
		if (
			field === 'minimumBalance' ||
			field === 'overdraftLimit' ||
			field === 'overdraftFee' ||
			field === 'creditLimit' ||
			field === 'minimumPayment' ||
			field === 'loanBalance' ||
			field === 'transferLimit' ||
			field === 'bufferAmount'
		) {
			return 0;
		}
		if (field === 'interestRate' || field === 'apr') {
			return 0;
		}
		if (field === 'gracePeriodDays' || field === 'transferDelayDays') {
			return 0;
		}
		return undefined;
	}

	function getInputMax(field: keyof AccountMetadata): number | undefined {
		if (
			field === 'statementCloseDate' ||
			field === 'paymentDueDate' ||
			field === 'loanDueDate' ||
			field === 'creditBureauReportingDate'
		) {
			return 31;
		}
		if (field === 'interestRate' || field === 'apr') {
			return 100;
		}
		return undefined;
	}
</script>

{#if showMetadata}
	<div class="space-y-4">
		<button
			type="button"
			onclick={() => (isOpen = !isOpen)}
			class="flex items-center justify-between w-full p-3 rounded-lg border border-border hover:bg-accent transition-colors"
		>
			<div class="flex items-center space-x-2">
				<span class="text-sm font-medium">Account Metadata</span>
				<span class="text-xs text-muted-foreground">(Optional)</span>
			</div>
			<span class="text-sm text-muted-foreground">
				{isOpen ? 'Hide' : 'Show'} advanced settings
			</span>
		</button>

		{#if isOpen}
			<div class="space-y-4 pt-2">
				<p class="text-xs text-muted-foreground mb-4">
					Configure account-specific settings to enable optimization features like fee avoidance,
					credit utilization tracking, and buffer management.
				</p>

				<div class="space-y-4">
					{#each relevantFields as field (field)}
						<div class="space-y-2">
							<Label for={field}>{formatMetadataFieldLabel(field)}</Label>
							{#if field === 'accountType' && accountType === 'investment'}
								{@const fieldValue = metadataState?.[field] ?? ''}
								<select
									id={field}
									value={String(fieldValue)}
									onchange={(e) => updateField(field, e.currentTarget.value)}
									class="w-full px-3 py-2 border border-border rounded-md bg-background"
								>
									<option value="">Select account type</option>
									<option value="IRA">IRA</option>
									<option value="401k">401k</option>
									<option value="brokerage">Brokerage</option>
									<option value="other">Other</option>
								</select>
							{:else}
								<div class="relative">
									{#if (
										field === 'minimumBalance' ||
										field === 'overdraftLimit' ||
										field === 'overdraftFee' ||
										field === 'creditLimit' ||
										field === 'minimumPayment' ||
										field === 'loanBalance' ||
										field === 'transferLimit' ||
										field === 'bufferAmount'
									)}
										<span class="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
											{currency === 'USD' ? '$' : currency}
										</span>
										{@const fieldValue = metadataState?.[field] ?? ''}
										<Input
											id={field}
											type={getInputType(field)}
											value={String(fieldValue)}
											oninput={(e) => updateField(field, e.currentTarget.value)}
											placeholder={getInputPlaceholder(field)}
											step={getInputStep(field)}
											min={getInputMin(field)}
											max={getInputMax(field)}
											class="pl-8"
										/>
									{:else if field === 'interestRate' || field === 'apr'}
										{@const fieldValue = metadataState?.[field] ?? ''}
										<Input
											id={field}
											type="number"
											value={String(fieldValue)}
											oninput={(e) => updateField(field, e.currentTarget.value)}
											placeholder={getInputPlaceholder(field)}
											step={getInputStep(field)}
											min={getInputMin(field)}
											max={getInputMax(field)}
											class="pr-8"
										/>
										<span class="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
											%
										</span>
									{:else}
										{@const fieldValue = metadataState?.[field] ?? ''}
										<Input
											id={field}
											type={getInputType(field)}
											value={String(fieldValue)}
											oninput={(e) => updateField(field, e.currentTarget.value)}
											placeholder={getInputPlaceholder(field)}
											step={getInputStep(field)}
											min={getInputMin(field)}
											max={getInputMax(field)}
										/>
									{/if}
								</div>
							{/if}
							<p class="text-xs text-muted-foreground">
								{#if field === 'minimumBalance'}
									Minimum balance to maintain in this account
								{:else if field === 'overdraftLimit'}
									Maximum overdraft amount allowed
								{:else if field === 'overdraftFee'}
									Fee charged per overdraft occurrence
								{:else if field === 'interestRate'}
									Annual interest rate (APY) for savings accounts
								{:else if field === 'creditLimit'}
									Maximum credit limit for this card
								{:else if field === 'apr'}
									Annual percentage rate for credit card
								{:else if field === 'statementCloseDate'}
									Day of month when statement closes (1-31)
								{:else if field === 'paymentDueDate'}
									Day of month when payment is due (1-31)
								{:else if field === 'bufferAmount'}
									Safety buffer amount to maintain in account
								{:else}
									Optional field for account optimization
								{/if}
							</p>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
{/if}
