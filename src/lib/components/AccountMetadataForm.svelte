<script lang="ts">
	import { Label } from '$lib/components/ui/label/index.ts';
	import { Input } from '$lib/components/ui/input/index.ts';
	import { CalcExpressionInput } from '$lib/components/ui/calculator/index.ts';
	import * as Switch from '$lib/components/ui/switch/index.ts';
	import { LabelWithTooltip } from '$lib/components/forms';
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

	const { accountType, metadata = {}, currency = 'USD', onMetadataChange }: Props = $props();

	// Get relevant fields for this account type
	const relevantFields = $derived(getRelevantMetadataFields(accountType));
	const showMetadata = $derived(relevantFields.length > 0);

	// State for metadata fields (filled by $effect from `metadata` prop)
	let metadataState = $state<Partial<AccountMetadata>>({});

	// Initialize with defaults if needed
	$effect(() => {
		if (!metadata || Object.keys(metadata).length === 0) {
			const defaults = getDefaultMetadata(accountType);
			metadataState = { ...defaults, ...(metadata || {}) };
		} else {
			metadataState = { ...metadata };
		}
	});

	function updateField(field: keyof AccountMetadata, value: string | number | boolean | undefined) {
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

	function getTooltipText(field: keyof AccountMetadata): string {
		switch (field) {
			case 'minimumBalance':
				return 'Minimum balance to maintain in this account';
			case 'overdraftLimit':
				return 'Maximum overdraft amount allowed';
			case 'overdraftFee':
				return 'Fee charged per overdraft occurrence';
			case 'interestRate':
				return 'Annual interest rate (APY) for savings accounts';
			case 'creditLimit':
				return 'Maximum credit limit for this card';
			case 'apr':
				return 'Annual percentage rate for credit card';
			case 'statementCloseDate':
				return 'Day of month when statement closes (1-31)';
			case 'paymentDueDate':
				return 'Day of month when payment is due (1-31)';
			case 'bufferAmount':
				return 'Safety buffer amount to maintain in account';
			case 'isEmergencyFund':
				return 'Designate this account as part of your emergency fund for tracking and recommendations';
			default:
				return 'Optional field for account optimization';
		}
	}
</script>

{#if showMetadata}
	{#each relevantFields as field (field)}
		<!-- Label with Tooltip -->
		<LabelWithTooltip for={field} tooltip={getTooltipText(field)}>
			{formatMetadataFieldLabel(field)}
		</LabelWithTooltip>

		<!-- Input -->
		<div>
			{#if field === 'isEmergencyFund'}
				<div class="flex items-center space-x-2">
					<Switch.Root
						checked={metadataState?.[field] === true}
						onCheckedChange={(checked) => updateField(field, checked)}
					/>
					<Label for={field} class="text-sm font-normal">
						Use this account for emergency fund tracking
					</Label>
				</div>
			{:else if field === 'accountType' && accountType === 'investment'}
				{@const fieldValue = metadataState?.[field] ?? ''}
				<select
					id={field}
					value={String(fieldValue)}
					onchange={(e) => updateField(field, e.currentTarget.value)}
					class="border-input bg-background text-primary w-full rounded-md border px-3 py-2"
				>
					<option value="">Select account type</option>
					<option value="IRA">IRA</option>
					<option value="401k">401k</option>
					<option value="brokerage">Brokerage</option>
					<option value="other">Other</option>
				</select>
			{:else}
				<div class="relative">
					{#if field === 'minimumBalance' || field === 'overdraftLimit' || field === 'overdraftFee' || field === 'creditLimit' || field === 'minimumPayment' || field === 'loanBalance' || field === 'transferLimit' || field === 'bufferAmount'}
						<span
							class="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2 transform text-sm"
						>
							{currency === 'USD' ? '$' : currency}
						</span>
						<CalcExpressionInput
							id={String(field)}
							stringValue={getFieldValue(field)}
							onStringValueChange={(s) => updateField(field, s)}
							decimalPlaces={2}
							min={getInputMin(field)}
							max={getInputMax(field)}
							placeholder={getInputPlaceholder(field)}
							inputClass="pl-8"
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
						<span
							class="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2 transform text-sm"
						>
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
		</div>
	{/each}
{/if}
