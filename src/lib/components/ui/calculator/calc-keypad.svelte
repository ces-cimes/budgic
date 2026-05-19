<script lang="ts">
	import * as Drawer from '$lib/components/ui/drawer/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { evaluateExpression } from '$lib/utils/arithmetic-eval';
	import { cn } from '$lib/utils.js';

	interface Props {
		embedDrawer?: boolean;
		nested?: boolean;
		open?: boolean;
		/** Live expression string (synced with amount field). */
		expression?: string;
		onConfirm?: (value: number, expr: string) => void;
		onClose?: () => void;
		class?: string;
	}

	let {
		embedDrawer = true,
		nested = false,
		open = $bindable(false),
		expression = $bindable(''),
		onConfirm,
		onClose,
		class: className
	}: Props = $props();

	const preview = $derived.by(() => {
		const trimmed = expression.trim();
		if (!trimmed) return { text: '' as string, ok: true as boolean, isError: false };
		const r = evaluateExpression(expression);
		if (r.error) return { text: r.error, ok: false, isError: true };
		if (r.result === null) return { text: '', ok: true, isError: false };
		return { text: String(r.result), ok: true, isError: false };
	});

	const MAX_EXPR = 200;

	function append(ch: string) {
		if (expression.length >= MAX_EXPR) return;
		expression += ch;
	}

	function backspace() {
		expression = expression.slice(0, -1);
	}

	function clearAll() {
		expression = '';
	}

	function toggleSign() {
		const r = evaluateExpression(expression);
		if (r.result !== null && Number.isFinite(r.result)) {
			expression = String(-r.result);
			return;
		}
		if (expression.startsWith('-')) expression = expression.slice(1);
		else if (expression.length > 0) expression = '-' + expression;
	}

	function confirm() {
		const r = evaluateExpression(expression);
		if (r.result === null || !Number.isFinite(r.result)) return;
		onConfirm?.(r.result, expression);
	}

	function handleOpenChange(next: boolean) {
		open = next;
		if (!next) onClose?.();
	}

	const rows: {
		label: string;
		action: () => void;
		variant?: 'default' | 'secondary' | 'outline';
	}[][] = [
		[
			{ label: 'C', action: clearAll, variant: 'outline' },
			{ label: '(', action: () => append('('), variant: 'secondary' },
			{ label: ')', action: () => append(')'), variant: 'secondary' },
			{ label: '⌫', action: backspace, variant: 'outline' }
		],
		[
			{ label: '7', action: () => append('7'), variant: 'secondary' },
			{ label: '8', action: () => append('8'), variant: 'secondary' },
			{ label: '9', action: () => append('9'), variant: 'secondary' },
			{ label: '÷', action: () => append('/'), variant: 'secondary' }
		],
		[
			{ label: '4', action: () => append('4'), variant: 'secondary' },
			{ label: '5', action: () => append('5'), variant: 'secondary' },
			{ label: '6', action: () => append('6'), variant: 'secondary' },
			{ label: '×', action: () => append('*'), variant: 'secondary' }
		],
		[
			{ label: '1', action: () => append('1'), variant: 'secondary' },
			{ label: '2', action: () => append('2'), variant: 'secondary' },
			{ label: '3', action: () => append('3'), variant: 'secondary' },
			{ label: '−', action: () => append('-'), variant: 'secondary' }
		],
		[
			{ label: '±', action: toggleSign, variant: 'outline' },
			{ label: '0', action: () => append('0'), variant: 'secondary' },
			{ label: '.', action: () => append('.'), variant: 'secondary' },
			{ label: '+', action: () => append('+'), variant: 'secondary' }
		]
	];
</script>

{#snippet keypadBody()}
	<div class={cn('flex flex-col gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]', className)}>
		<div
			class="border-border bg-muted/40 min-h-[4.5rem] rounded-[var(--radius-lg)] border px-3 py-2"
		>
			<p class="text-muted-foreground font-mono text-xs tracking-wide break-all">
				{expression || '0'}
			</p>
			<p
				class="font-display mt-1 text-2xl text-[var(--color-hero-number)] tabular-nums"
				class:text-destructive={preview.isError}
			>
				{preview.text}
			</p>
		</div>

		<div class="grid grid-cols-4 gap-2">
			{#each rows as row (row[0]?.label)}
				{#each row as cell (cell.label)}
					<Button
						type="button"
						variant={cell.variant ?? 'secondary'}
						class="min-h-14 touch-manipulation rounded-[var(--radius)] text-base font-semibold"
						onclick={cell.action}
					>
						{cell.label}
					</Button>
				{/each}
			{/each}
		</div>

		<Button
			type="button"
			variant="default"
			class="min-h-14 w-full touch-manipulation rounded-[var(--radius)] text-base font-semibold"
			onclick={confirm}
			disabled={!preview.ok || preview.text === ''}
		>
			=
		</Button>
	</div>
{/snippet}

{#if embedDrawer}
	{#if nested}
		<Drawer.NestedRoot
			bind:open
			onOpenChange={handleOpenChange}
			direction="bottom"
			shouldScaleBackground={false}
		>
			<Drawer.Content class="bg-background rounded-t-[var(--radius-xl)] border-t">
				{@render keypadBody()}
			</Drawer.Content>
		</Drawer.NestedRoot>
	{:else}
		<Drawer.Root
			bind:open
			onOpenChange={handleOpenChange}
			direction="bottom"
			shouldScaleBackground={false}
		>
			<Drawer.Content class="bg-background rounded-t-[var(--radius-xl)] border-t">
				{@render keypadBody()}
			</Drawer.Content>
		</Drawer.Root>
	{/if}
{:else}
	{@render keypadBody()}
{/if}
