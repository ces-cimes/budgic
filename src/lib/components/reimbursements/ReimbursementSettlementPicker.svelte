<script lang="ts">
	import * as Select from '$lib/components/ui/select/index.ts';

	export type SettlementOption = {
		transactionId: string;
		reimbursementId: string;
		label: string;
	};

	interface Props {
		options: SettlementOption[];
		value?: string;
		onValueChange?: (key: string) => void;
		placeholder?: string;
		id?: string;
		disabled?: boolean;
	}

	let {
		options,
		value = $bindable(''),
		onValueChange,
		placeholder = 'Select reimbursement to settle',
		id = 'settlement-picker',
		disabled = false
	}: Props = $props();

	function optionKey(opt: SettlementOption): string {
		return `${opt.transactionId}::${opt.reimbursementId}`;
	}

	const selectedLabel = $derived(
		options.find((o) => optionKey(o) === value)?.label ?? placeholder
	);

	function handleChange(v: string | undefined) {
		if (v == null) return;
		value = v;
		onValueChange?.(v);
	}
</script>

<Select.Root type="single" {value} onValueChange={handleChange} {disabled}>
	<Select.Trigger {id} class="w-full">{selectedLabel}</Select.Trigger>
	<Select.Content>
		{#if options.length === 0}
			<Select.Item value="" disabled>No outstanding reimbursements</Select.Item>
		{:else}
			{#each options as opt (optionKey(opt))}
				<Select.Item value={optionKey(opt)}>{opt.label}</Select.Item>
			{/each}
		{/if}
	</Select.Content>
</Select.Root>
