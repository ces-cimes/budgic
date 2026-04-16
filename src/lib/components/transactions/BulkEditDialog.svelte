<script lang="ts">
	import * as AlertDialog from '$lib/components/ui/alert-dialog/index.ts';
	import * as Button from '$lib/components/ui/button/index.ts';
	import * as Dialog from '$lib/components/ui/dialog/index.ts';
	import * as Input from '$lib/components/ui/input/index.ts';
	import * as Label from '$lib/components/ui/label/index.ts';
	import * as Select from '$lib/components/ui/select/index.ts';
	import * as Textarea from '$lib/components/ui/textarea/index.ts';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.ts';

	type BulkAction =
		| 'account'
		| 'category'
		| 'description'
		| 'dates'
		| 'notes'
		| 'amount'
		| 'currency'
		| 'status'
		| 'delete'
		| null;
	type BulkStatus = 'cleared' | 'pending' | 'planned' | 'cancelled';

	interface Props {
		open: boolean;
		action: BulkAction;
		selectedCount: number;
		accounts: Array<{ id: string; name: string }>;
		categories: Array<{ id: string; name: string; color?: string | null }>;
		/** ISO currency codes for bulk currency picker (e.g. from accounts). */
		currencyCodes?: string[];
		defaultCurrency?: string | null;
		isProcessing?: boolean;
		onApplyAccount: (accountId: string) => Promise<void> | void;
		onApplyCategory: (categoryId: string) => Promise<void> | void;
		onApplyDescription: (
			payload:
				| { kind: 'findReplace'; find: string; replaceWith: string }
				| { kind: 'set'; text: string }
		) => Promise<void> | void;
		onApplyDates: (
			payload:
				| { kind: 'shift'; shiftDays: number; applyTo: 'cleared' | 'planned' | 'both' }
				| { kind: 'set'; calendarDate: string; applyTo: 'cleared' | 'planned' | 'both' }
		) => Promise<void> | void;
		onApplyNotesReference: (payload: {
			field: 'notes' | 'reference';
			mode: 'append' | 'prepend' | 'replace' | 'set';
			text: string;
			find?: string;
		}) => Promise<void> | void;
		onApplyAmountAdjust: (
			mode: 'fixed' | 'percent' | 'absolute',
			value: number
		) => Promise<void> | void;
		onApplyCurrency: (currency: string) => Promise<void> | void;
		onApplyStatus: (status: BulkStatus) => Promise<void> | void;
		onConfirmDelete: () => Promise<void> | void;
		onCancel: () => void;
	}

	let {
		open = $bindable(),
		action,
		selectedCount,
		accounts,
		categories,
		currencyCodes = [],
		defaultCurrency = null,
		isProcessing = false,
		onApplyAccount,
		onApplyCategory,
		onApplyDescription,
		onApplyDates,
		onApplyNotesReference,
		onApplyAmountAdjust,
		onApplyCurrency,
		onApplyStatus,
		onConfirmDelete,
		onCancel
	}: Props = $props();

	let selectedCategoryId = $state('');
	let selectedAccountId = $state('');
	let descriptionBulkKind = $state<'findReplace' | 'setEntire'>('findReplace');
	let descriptionFind = $state('');
	let descriptionReplace = $state('');
	let descriptionSetAllText = $state('');
	let selectedStatus = $state<BulkStatus>('pending');

	let dateBulkKind = $state<'shift' | 'setFixed'>('shift');
	let dateShiftInput = $state('1');
	let fixedDateInput = $state('');
	let dateApplyTo = $state<'cleared' | 'planned' | 'both'>('both');

	let notesField = $state<'notes' | 'reference'>('notes');
	let notesMode = $state<'append' | 'prepend' | 'replace' | 'set'>('append');
	let notesText = $state('');
	let notesFind = $state('');

	let amountAdjustMode = $state<'fixed' | 'percent' | 'absolute'>('fixed');
	let amountAdjustInput = $state('');
	let selectedBulkCurrency = $state('');

	const dateShiftParsed = $derived(Number.parseInt(String(dateShiftInput ?? '').trim(), 10));
	const dateShiftFormValid = $derived(
		Number.isFinite(dateShiftParsed) && Number.isInteger(dateShiftParsed) && dateShiftParsed !== 0
	);
	const dateSetFormValid = $derived(
		/^\d{4}-\d{2}-\d{2}$/.test(String(fixedDateInput ?? '').trim())
	);
	const dateFormValid = $derived(dateBulkKind === 'shift' ? dateShiftFormValid : dateSetFormValid);

	const descriptionFormValid = $derived(
		descriptionBulkKind === 'findReplace' ? descriptionFind.trim().length > 0 : true
	);

	const notesFormValid = $derived(
		notesMode === 'replace'
			? notesFind.trim().length > 0
			: notesMode === 'set'
				? true
				: notesText.trim().length > 0
	);

	const amountAdjustParsed = $derived(Number.parseFloat(String(amountAdjustInput ?? '').trim()));
	const amountFormValid = $derived(
		amountAdjustMode === 'absolute'
			? Number.isFinite(amountAdjustParsed)
			: Number.isFinite(amountAdjustParsed) && amountAdjustParsed !== 0
	);

	const currencyFormValid = $derived(
		selectedBulkCurrency.length > 0 && currencyCodes.includes(selectedBulkCurrency)
	);

	function handleOpenChange(nextOpen: boolean) {
		if (nextOpen && action === 'currency') {
			const list = currencyCodes;
			selectedBulkCurrency =
				(defaultCurrency && list.includes(defaultCurrency) ? defaultCurrency : list[0]) ?? '';
		}
		if (nextOpen && action === 'amount') {
			amountAdjustMode = 'fixed';
			amountAdjustInput = '';
		}
		if (nextOpen && action === 'description') {
			descriptionBulkKind = 'findReplace';
		}
		if (nextOpen && action === 'dates') {
			dateBulkKind = 'shift';
			fixedDateInput = '';
		}
		open = nextOpen;
		if (!nextOpen) {
			onCancel();
		}
	}
</script>

{#if action === 'delete'}
	<AlertDialog.Root {open} onOpenChange={handleOpenChange}>
		<AlertDialog.Content>
			<AlertDialog.Header>
				<AlertDialog.Title>Delete {selectedCount} transactions?</AlertDialog.Title>
				<AlertDialog.Description>
					This will soft-delete all selected transactions. Group selections include each group
					member.
				</AlertDialog.Description>
			</AlertDialog.Header>
			<AlertDialog.Footer>
				<AlertDialog.Cancel disabled={isProcessing} onclick={onCancel}>Cancel</AlertDialog.Cancel>
				<AlertDialog.Action
					disabled={isProcessing}
					onclick={onConfirmDelete}
					class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
				>
					{isProcessing ? 'Deleting...' : 'Delete'}
				</AlertDialog.Action>
			</AlertDialog.Footer>
		</AlertDialog.Content>
	</AlertDialog.Root>
{:else}
	<Dialog.Root {open} onOpenChange={handleOpenChange}>
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>
					{#if action === 'category'}
						Change category
					{:else if action === 'account'}
						Change account
					{:else if action === 'description'}
						Edit descriptions
					{:else if action === 'dates'}
						Edit dates
					{:else if action === 'notes'}
						Notes and reference
					{:else if action === 'amount'}
						Adjust amount
					{:else if action === 'currency'}
						Set currency
					{:else if action === 'status'}
						Change status
					{:else}
						Bulk edit
					{/if}
				</Dialog.Title>
				<Dialog.Description>
					{#if action === 'description'}
						Find-and-replace uses literal text (not regex). “Replace entire” overwrites every
						selected description with the same text (empty clears the field).
					{:else if action === 'dates'}
						Shift moves existing dates by whole days (skips rows with no date in that field). Set
						fixed assigns the same calendar day to cleared and/or planned on every row. FX may
						recalc.
					{:else if action === 'notes'}
						Append, prepend, find-and-replace, or replace the whole notes or reference field (empty
						clears when using “Set entire”). Notes use a newline when appending or prepending.
					{:else if action === 'amount'}
						Fixed delta, percent change, or set every row to the same amount. Transfers are skipped.
					{:else if action === 'currency'}
						Sets the transaction currency and recomputes account amounts from stored rates.
						Transfers are skipped.
					{:else}
						Apply changes to {selectedCount} selected transactions.
					{/if}
				</Dialog.Description>
			</Dialog.Header>

			{#if action === 'account'}
				<div class="space-y-3">
					<Select.Root type="single" bind:value={selectedAccountId}>
						<Select.Trigger class="w-full">
							{accounts.find((account) => account.id === selectedAccountId)?.name ||
								'Select account'}
						</Select.Trigger>
						<Select.Content>
							{#each accounts as account (account.id)}
								<Select.Item value={account.id}>{account.name}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			{:else if action === 'description'}
				<div class="space-y-3">
					<div class="space-y-1.5">
						<Label.Root>Mode</Label.Root>
						<ToggleGroup.Root
							type="single"
							value={descriptionBulkKind}
							onValueChange={(value) =>
								value && (descriptionBulkKind = value as typeof descriptionBulkKind)}
							class="flex flex-wrap gap-1"
						>
							<ToggleGroup.Item value="findReplace">Find and replace</ToggleGroup.Item>
							<ToggleGroup.Item value="setEntire">Replace entire</ToggleGroup.Item>
						</ToggleGroup.Root>
					</div>
					{#if descriptionBulkKind === 'findReplace'}
						<div class="space-y-1.5">
							<Label.Root for="bulk-desc-find">Find</Label.Root>
							<Input.Root
								id="bulk-desc-find"
								placeholder="Text to find"
								bind:value={descriptionFind}
								autocomplete="off"
							/>
						</div>
						<div class="space-y-1.5">
							<Label.Root for="bulk-desc-replace">Replace with</Label.Root>
							<Input.Root
								id="bulk-desc-replace"
								placeholder="Replacement (can be empty)"
								bind:value={descriptionReplace}
								autocomplete="off"
							/>
						</div>
					{:else}
						<div class="space-y-1.5">
							<Label.Root for="bulk-desc-set-all">New description for all</Label.Root>
							<Textarea.Root
								id="bulk-desc-set-all"
								placeholder="Same text on every row (empty clears)"
								bind:value={descriptionSetAllText}
							/>
						</div>
					{/if}
				</div>
			{:else if action === 'dates'}
				<div class="space-y-3">
					<div class="space-y-1.5">
						<Label.Root>Mode</Label.Root>
						<ToggleGroup.Root
							type="single"
							value={dateBulkKind}
							onValueChange={(value) => value && (dateBulkKind = value as typeof dateBulkKind)}
							class="flex flex-wrap gap-1"
						>
							<ToggleGroup.Item value="shift">Shift by days</ToggleGroup.Item>
							<ToggleGroup.Item value="setFixed">Set fixed date</ToggleGroup.Item>
						</ToggleGroup.Root>
					</div>
					{#if dateBulkKind === 'shift'}
						<div class="space-y-1.5">
							<Label.Root for="bulk-date-shift">Days to shift (negative allowed)</Label.Root>
							<Input.Root
								id="bulk-date-shift"
								type="number"
								step="1"
								inputmode="numeric"
								bind:value={dateShiftInput}
								autocomplete="off"
							/>
						</div>
					{:else}
						<div class="space-y-1.5">
							<Label.Root for="bulk-date-fixed">Calendar date</Label.Root>
							<Input.Root id="bulk-date-fixed" type="date" bind:value={fixedDateInput} />
						</div>
					{/if}
					<div class="space-y-1.5">
						<Label.Root>Apply to</Label.Root>
						<Select.Root type="single" bind:value={dateApplyTo}>
							<Select.Trigger class="w-full">
								{#if dateApplyTo === 'cleared'}
									Cleared date only
								{:else if dateApplyTo === 'planned'}
									Planned date only
								{:else}
									Both dates
								{/if}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="cleared">Cleared date only</Select.Item>
								<Select.Item value="planned">Planned date only</Select.Item>
								<Select.Item value="both">Both dates</Select.Item>
							</Select.Content>
						</Select.Root>
					</div>
				</div>
			{:else if action === 'notes'}
				<div class="space-y-3">
					<div class="space-y-1.5">
						<Label.Root>Field</Label.Root>
						<Select.Root type="single" bind:value={notesField}>
							<Select.Trigger class="w-full">
								{notesField === 'notes' ? 'Notes' : 'Reference'}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="notes">Notes</Select.Item>
								<Select.Item value="reference">Reference</Select.Item>
							</Select.Content>
						</Select.Root>
					</div>
					<div class="space-y-1.5">
						<Label.Root>Mode</Label.Root>
						<ToggleGroup.Root
							type="single"
							value={notesMode}
							onValueChange={(value) => value && (notesMode = value as typeof notesMode)}
							class="flex flex-wrap gap-1"
						>
							<ToggleGroup.Item value="append">Append</ToggleGroup.Item>
							<ToggleGroup.Item value="prepend">Prepend</ToggleGroup.Item>
							<ToggleGroup.Item value="replace">Replace</ToggleGroup.Item>
							<ToggleGroup.Item value="set">Set entire</ToggleGroup.Item>
						</ToggleGroup.Root>
					</div>
					{#if notesMode === 'replace'}
						<div class="space-y-1.5">
							<Label.Root for="bulk-notes-find">Find</Label.Root>
							<Input.Root
								id="bulk-notes-find"
								placeholder="Text to find"
								bind:value={notesFind}
								autocomplete="off"
							/>
						</div>
						<div class="space-y-1.5">
							<Label.Root for="bulk-notes-replace">Replace with</Label.Root>
							<Textarea.Root
								id="bulk-notes-replace"
								placeholder="Replacement (can be empty)"
								bind:value={notesText}
							/>
						</div>
					{:else if notesMode === 'set'}
						<div class="space-y-1.5">
							<Label.Root for="bulk-notes-set">New value for all</Label.Root>
							<Textarea.Root
								id="bulk-notes-set"
								placeholder="Same text on every row (empty clears)"
								bind:value={notesText}
							/>
						</div>
					{:else}
						<div class="space-y-1.5">
							<Label.Root for="bulk-notes-text">Text to add</Label.Root>
							<Textarea.Root id="bulk-notes-text" placeholder="Text" bind:value={notesText} />
						</div>
					{/if}
				</div>
			{:else if action === 'amount'}
				<div class="space-y-3">
					<div class="space-y-1.5">
						<Label.Root>Mode</Label.Root>
						<ToggleGroup.Root
							type="single"
							value={amountAdjustMode}
							onValueChange={(value) =>
								value && (amountAdjustMode = value as typeof amountAdjustMode)}
							class="flex flex-wrap gap-1"
						>
							<ToggleGroup.Item value="fixed">Fixed delta</ToggleGroup.Item>
							<ToggleGroup.Item value="percent">Percent</ToggleGroup.Item>
							<ToggleGroup.Item value="absolute">Set amount</ToggleGroup.Item>
						</ToggleGroup.Root>
					</div>
					<div class="space-y-1.5">
						<Label.Root for="bulk-amount-value">
							{#if amountAdjustMode === 'fixed'}
								Amount to add (can be negative)
							{:else if amountAdjustMode === 'percent'}
								Percent change
							{:else}
								New amount for every row
							{/if}
						</Label.Root>
						<Input.Root
							id="bulk-amount-value"
							type="number"
							step="any"
							placeholder={amountAdjustMode === 'fixed'
								? 'e.g. -5 or 10'
								: amountAdjustMode === 'percent'
									? 'e.g. 10 for +10%'
									: 'e.g. 42.50'}
							bind:value={amountAdjustInput}
							autocomplete="off"
						/>
					</div>
				</div>
			{:else if action === 'currency'}
				<div class="space-y-3">
					{#if currencyCodes.length === 0}
						<p class="text-muted-foreground text-sm">
							No currencies available. Add an account first.
						</p>
					{:else}
						<div class="space-y-1.5">
							<Label.Root>Currency</Label.Root>
							<Select.Root type="single" bind:value={selectedBulkCurrency}>
								<Select.Trigger class="w-full">
									{selectedBulkCurrency || 'Select currency'}
								</Select.Trigger>
								<Select.Content>
									{#each currencyCodes as code (code)}
										<Select.Item value={code}>{code}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
					{/if}
				</div>
			{:else if action === 'category'}
				<div class="space-y-3">
					<Select.Root type="single" bind:value={selectedCategoryId}>
						<Select.Trigger class="w-full">
							{categories.find((category) => category.id === selectedCategoryId)?.name ||
								'Select category'}
						</Select.Trigger>
						<Select.Content>
							{#each categories as category (category.id)}
								<Select.Item value={category.id}>{category.name}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			{:else if action === 'status'}
				<div class="space-y-3">
					<ToggleGroup.Root
						type="single"
						value={selectedStatus}
						onValueChange={(value) => value && (selectedStatus = value as BulkStatus)}
					>
						<ToggleGroup.Item value="pending">Pending</ToggleGroup.Item>
						<ToggleGroup.Item value="planned">Planned</ToggleGroup.Item>
						<ToggleGroup.Item value="cleared">Cleared</ToggleGroup.Item>
						<ToggleGroup.Item value="cancelled">Cancelled</ToggleGroup.Item>
					</ToggleGroup.Root>
				</div>
			{/if}

			<Dialog.Footer>
				<Button.Root variant="outline" onclick={onCancel} disabled={isProcessing}
					>Cancel</Button.Root
				>
				{#if action === 'account'}
					<Button.Root
						onclick={() => onApplyAccount(selectedAccountId)}
						disabled={isProcessing || !selectedAccountId}
					>
						{isProcessing ? 'Applying...' : 'Apply Account'}
					</Button.Root>
				{:else if action === 'description'}
					<Button.Root
						onclick={() =>
							descriptionBulkKind === 'findReplace'
								? onApplyDescription({
										kind: 'findReplace',
										find: descriptionFind,
										replaceWith: descriptionReplace
									})
								: onApplyDescription({ kind: 'set', text: descriptionSetAllText })}
						disabled={isProcessing || !descriptionFormValid}
					>
						{isProcessing ? 'Applying...' : 'Apply'}
					</Button.Root>
				{:else if action === 'dates'}
					<Button.Root
						onclick={() =>
							dateBulkKind === 'shift'
								? onApplyDates({ kind: 'shift', shiftDays: dateShiftParsed, applyTo: dateApplyTo })
								: onApplyDates({
										kind: 'set',
										calendarDate: String(fixedDateInput ?? '').trim(),
										applyTo: dateApplyTo
									})}
						disabled={isProcessing || !dateFormValid}
					>
						{isProcessing ? 'Applying...' : dateBulkKind === 'shift' ? 'Shift dates' : 'Set dates'}
					</Button.Root>
				{:else if action === 'notes'}
					<Button.Root
						onclick={() =>
							onApplyNotesReference({
								field: notesField,
								mode: notesMode,
								text: notesText,
								find: notesMode === 'replace' ? notesFind : undefined
							})}
						disabled={isProcessing || !notesFormValid}
					>
						{isProcessing ? 'Applying...' : 'Apply'}
					</Button.Root>
				{:else if action === 'amount'}
					<Button.Root
						onclick={() => onApplyAmountAdjust(amountAdjustMode, amountAdjustParsed)}
						disabled={isProcessing || !amountFormValid}
					>
						{isProcessing ? 'Applying...' : 'Apply'}
					</Button.Root>
				{:else if action === 'currency'}
					<Button.Root
						onclick={() => onApplyCurrency(selectedBulkCurrency)}
						disabled={isProcessing || !currencyFormValid || currencyCodes.length === 0}
					>
						{isProcessing ? 'Applying...' : 'Apply'}
					</Button.Root>
				{:else if action === 'category'}
					<Button.Root
						onclick={() => onApplyCategory(selectedCategoryId)}
						disabled={isProcessing || !selectedCategoryId}
					>
						{isProcessing ? 'Applying...' : 'Apply Category'}
					</Button.Root>
				{:else if action === 'status'}
					<Button.Root onclick={() => onApplyStatus(selectedStatus)} disabled={isProcessing}>
						{isProcessing ? 'Applying...' : 'Apply Status'}
					</Button.Root>
				{/if}
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
{/if}
