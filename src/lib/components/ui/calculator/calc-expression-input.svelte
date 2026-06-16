<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import CalcKeypad from './calc-keypad.svelte';
	import {
		evaluateExpression,
		formatEvaluatedNumber,
		looksLikeExpression
	} from '$lib/utils/arithmetic-eval';
	import { cn } from '$lib/utils.js';

	const CALC_HINT_KEY = 'calc-hint-shown';

	interface Props {
		id?: string;
		class?: string;
		inputClass?: string;
		/** Inline style for the input (e.g. dynamic padding next to a currency button). */
		inputStyle?: string;
		placeholder?: string;
		required?: boolean;
		disabled?: boolean;
		min?: number;
		max?: number;
		decimalPlaces?: number;
		nestedKeypad?: boolean;
		variant?: 'default' | 'hero';
		/** Number mode: controlled numeric value. */
		value?: number;
		onValueChange?: (n: number) => void;
		/** String mode: raw field text (e.g. balance sheet). */
		stringValue?: string;
		onStringValueChange?: (s: string) => void;
		onfocus?: (e: FocusEvent) => void;
		onfocusin?: (e: FocusEvent) => void;
		oninput?: (e: Event) => void;
		onkeydown?: (e: KeyboardEvent) => void;
		onblur?: (e: FocusEvent) => void;
	}

	let props: Props = $props();

	const stringMode = $derived(
		props.stringValue !== undefined && props.onStringValueChange !== undefined
	);
	const decimalPlaces = $derived(props.decimalPlaces ?? 2);

	let exprStr = $state('');
	let keypadOpen = $state(false);
	let isFocused = $state(false);
	let isCoarse = $state(false);
	let shake = $state(false);
	let hintVisible = $state(false);
	let hintTimer: ReturnType<typeof setTimeout> | null = null;

	function formatFromExternal(): string {
		if (stringMode) {
			return props.stringValue ?? '';
		}
		const v = props.value ?? 0;
		return formatEvaluatedNumber(v, decimalPlaces);
	}

	$effect(() => {
		if (isFocused || keypadOpen) return;
		if (stringMode) {
			void props.stringValue;
			exprStr = props.stringValue ?? '';
		} else {
			void props.value;
			exprStr = formatFromExternal();
		}
	});

	onMount(() => {
		if (!browser) return;
		const mq = window.matchMedia('(pointer: coarse)');
		isCoarse = mq.matches;
		const fn = () => {
			isCoarse = mq.matches;
		};
		mq.addEventListener('change', fn);
		return () => mq.removeEventListener('change', fn);
	});

	function maybeShowFirstHint() {
		if (!browser) return;
		try {
			if (localStorage.getItem(CALC_HINT_KEY)) return;
			hintVisible = true;
			if (hintTimer) clearTimeout(hintTimer);
			hintTimer = setTimeout(() => dismissHint(), 4000);
		} catch {
			/* private mode */
		}
	}

	function dismissHint() {
		hintVisible = false;
		if (hintTimer) {
			clearTimeout(hintTimer);
			hintTimer = null;
		}
		try {
			localStorage.setItem(CALC_HINT_KEY, '1');
		} catch {
			/* ignore */
		}
	}

	function clamp(n: number): number {
		let x = n;
		if (props.min != null) x = Math.max(props.min, x);
		if (props.max != null) x = Math.min(props.max, x);
		return x;
	}

	function commitNumeric(n: number) {
		const c = clamp(n);
		const formatted = formatEvaluatedNumber(c, decimalPlaces);
		exprStr = formatted;
		if (stringMode) {
			props.onStringValueChange?.(formatted);
		} else {
			props.onValueChange?.(c);
		}
	}

	function evalAndCommit(): boolean {
		const raw = exprStr.trim();
		if (raw === '') {
			if (!props.required) {
				if (stringMode) {
					exprStr = '';
					props.onStringValueChange?.('');
					return true;
				}
				commitNumeric(0);
				return true;
			}
			return false;
		}
		const r = evaluateExpression(raw);
		if (r.error || r.result === null || !Number.isFinite(r.result)) {
			shake = true;
			setTimeout(() => (shake = false), 400);
			exprStr = formatFromExternal();
			return false;
		}
		commitNumeric(r.result);
		return true;
	}

	function handleFocus(e: FocusEvent) {
		isFocused = true;
		maybeShowFirstHint();
		if (isCoarse) {
			keypadOpen = true;
		}
		props.onfocus?.(e);
	}

	function handleFocusIn(e: FocusEvent) {
		props.onfocusin?.(e);
	}

	function handleInput(e: Event) {
		props.oninput?.(e);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			evalAndCommit();
		}
		props.onkeydown?.(e);
	}

	function handleBlur(e: FocusEvent) {
		isFocused = false;
		dismissHint();
		if (!keypadOpen) {
			evalAndCommit();
		}
		props.onblur?.(e);
	}

	function handleKeypadConfirm(value: number, _expr: string) {
		commitNumeric(value);
		keypadOpen = false;
	}

	function handleKeypadClose() {
		keypadOpen = false;
		exprStr = formatFromExternal();
	}

	const preview = $derived.by(() => {
		if (!looksLikeExpression(exprStr)) return '';
		const r = evaluateExpression(exprStr);
		if (r.error || r.result === null) return '';
		return `= ${r.result}`;
	});

	const inputmode = $derived(isCoarse && keypadOpen ? 'none' : 'decimal');
	const hero = $derived(props.variant === 'hero');
	const readOnlyMobile = $derived(isCoarse && keypadOpen);
</script>

<div class={cn('relative w-full', props.class)}>
	{#if hintVisible}
		<div
			role="status"
			class="bg-popover text-popover-foreground border-border absolute top-full left-1/2 z-50 mt-2 w-[min(100%,20rem)] -translate-x-1/2 rounded-[var(--radius-lg)] border px-3 py-2 text-center text-xs shadow-md"
		>
			Type 50+25 — arithmetic works here. On mobile, use the keypad below.
			<button
				type="button"
				class="text-primary mt-2 block w-full text-xs font-medium underline"
				onclick={dismissHint}>Got it</button
			>
		</div>
	{/if}

	{#if preview && !isCoarse && !hero}
		<span
			class="text-muted-foreground pointer-events-none absolute right-2 bottom-1 z-10 text-xs tabular-nums"
			aria-hidden="true">{preview}</span
		>
	{/if}

	<input
		id={props.id}
		type="text"
		{inputmode}
		autocomplete="off"
		spellcheck={false}
		disabled={props.disabled}
		required={props.required}
		placeholder={props.placeholder}
		readonly={readOnlyMobile}
		bind:value={exprStr}
		style={props.inputStyle}
		class={cn(
			hero
				? 'font-display w-full min-w-[12rem] border-0 border-b-2 border-[var(--color-amber)] bg-transparent text-center text-4xl text-[var(--color-hero-number)] outline-none placeholder:text-[var(--color-text-disabled)] focus:border-[var(--color-amber)]'
				: 'border-input bg-background selection:bg-primary dark:bg-input/30 selection:text-primary-foreground ring-offset-background placeholder:text-muted-foreground flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm',
			!hero &&
				'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
			shake && 'ring-destructive/50 border-destructive ring-2',
			!hero && 'pr-14',
			props.inputClass
		)}
		onfocus={handleFocus}
		onfocusin={handleFocusIn}
		oninput={handleInput}
		onkeydown={handleKeydown}
		onblur={handleBlur}
	/>

	<CalcKeypad
		bind:open={keypadOpen}
		bind:expression={exprStr}
		embedDrawer={true}
		nested={props.nestedKeypad ?? false}
		onConfirm={handleKeypadConfirm}
		onClose={handleKeypadClose}
	/>
</div>
