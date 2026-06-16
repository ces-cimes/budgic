<script lang="ts">
	import type { Transaction } from '$lib/core/db';
	import { onMount } from 'svelte';

	/** UX_SPEC: Row 3 (bottom) = Expense | Income; Row 2 = Planned expense | Planned income; Row 1 (top) = Transfer */
	interface Option {
		label: string;
		type: Transaction['type'];
		status: Transaction['status'];
		borderStyle: 'solid' | 'dashed' | 'dotted';
		borderColor: string;
		accentColor?: string;
		icon: string;
		shortcut?: string;
		fullWidth?: boolean;
	}

	const options: Option[] = [
		{
			label: 'Expense',
			type: 'expense',
			status: 'cleared',
			borderStyle: 'solid',
			borderColor: 'var(--color-warm-coral)',
			accentColor: 'var(--color-warm-coral)',
			icon: 'minus-circle',
			shortcut: '1'
		},
		{
			label: 'Income',
			type: 'income',
			status: 'cleared',
			borderStyle: 'solid',
			borderColor: 'var(--color-sage-green)',
			accentColor: 'var(--color-sage-green)',
			icon: 'plus-circle',
			shortcut: '2'
		},
		{
			label: 'Planned expense',
			type: 'expense',
			status: 'planned',
			borderStyle: 'dashed',
			borderColor: 'var(--color-warm-coral)',
			accentColor: 'var(--color-warm-coral)',
			icon: 'clock',
			shortcut: '3'
		},
		{
			label: 'Planned income',
			type: 'income',
			status: 'planned',
			borderStyle: 'dashed',
			borderColor: 'var(--color-sage-green)',
			accentColor: 'var(--color-sage-green)',
			icon: 'calendar-check',
			shortcut: '4'
		},
		{
			label: 'Transfer',
			type: 'transfer',
			status: 'cleared',
			borderStyle: 'dotted',
			borderColor: 'var(--color-text-tertiary)',
			accentColor: 'var(--color-blue-indigo)',
			icon: 'arrow-right-left',
			shortcut: 'T',
			fullWidth: true
		}
	];

	interface Props {
		onSelect: (type: Transaction['type'], status: Transaction['status']) => void;
	}

	const { onSelect }: Props = $props();

	let activeAnimationIndex = $state<number | null>(null);

	function handleSelect(index: number, type: Transaction['type'], status: Transaction['status']) {
		activeAnimationIndex = index;
		setTimeout(() => {
			onSelect(type, status);
		}, 150);
	}

	function handleKeydown(event: KeyboardEvent) {
		const key = event.key.toUpperCase();
		const option = options.find((opt) => opt.shortcut?.toUpperCase() === key);
		if (option) {
			event.preventDefault();
			const index = options.indexOf(option);
			handleSelect(index, option.type, option.status);
		}
	}

	onMount(() => {
		window.addEventListener('keydown', handleKeydown);
		return () => {
			window.removeEventListener('keydown', handleKeydown);
		};
	});

	function getButtonDelay(rowIndex: number, colIndex: number): string {
		// Row 0 (Transfer): 0ms
		// Row 1 (Planned): 60ms, 120ms
		// Row 2 (Cleared): 180ms, 240ms
		if (rowIndex === 0) return '0ms';
		if (rowIndex === 1) return `${60 + colIndex * 60}ms`;
		if (rowIndex === 2) return `${180 + colIndex * 60}ms`;
		return '0ms';
	}
</script>

<div class="space-y-2" role="group" aria-label="Choose transaction type">
	<!-- Row 1 (top): Transfer - full width -->
	<button
		type="button"
		class="group animate-in fade-in slide-in-from-top-1 relative w-full overflow-hidden rounded-xl px-3.5 py-3 text-left transition-all duration-250 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-amber)] focus-visible:ring-offset-2"
		style="
			border: 2px dotted {options[4].borderColor};
			background: linear-gradient(135deg, var(--color-card-start, oklch(0.17 0.005 285)), var(--color-card-end, oklch(0.19 0.006 285)));
			animation-delay: {getButtonDelay(0, 0)};
			animation-duration: 400ms;
			animation-fill-mode: both;
			opacity: {activeAnimationIndex === 4 ? 0.5 : 1};
			transform: {activeAnimationIndex === 4 ? 'scale(0.95)' : 'scale(1)'};
		"
		onclick={() => handleSelect(4, options[4].type, options[4].status)}
	>
		<!-- Glow effect on click -->
		<div
			class="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300"
			style="background: radial-gradient(circle, color-mix(in oklch, {options[4]
				.accentColor} 20%, transparent) 0%, transparent 70%);
				opacity: {activeAnimationIndex === 4 ? 0.6 : 0};"
		></div>

		<!-- Hover overlay -->
		<div
			class="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
			style="background: linear-gradient(135deg, color-mix(in oklch, {options[4]
				.accentColor} 8%, transparent), transparent); pointer-events: none;"
		></div>

		<div class="relative flex items-center gap-2">
			<div
				class="h-4 w-4 flex-shrink-0 text-[{options[4]
					.borderColor}] group-hover:text-[{options[4]
					.accentColor}] transition-colors duration-250"
			>
				<svg
					class="h-full w-full"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<line x1="12" y1="5" x2="12" y2="19"></line>
					<polyline points="19 12 12 19 5 12"></polyline>
				</svg>
			</div>
			<span
				class="text-foreground relative text-sm font-medium group-hover:text-[{options[4]
					.accentColor}] transition-colors duration-250">{options[4].label}</span
			>
		</div>
	</button>

	<!-- Row 2: Planned expense | Planned income -->
	<div class="grid grid-cols-2 gap-2">
		<button
			type="button"
			class="group animate-in fade-in slide-in-from-top-1 relative overflow-hidden rounded-xl px-3.5 py-3 text-left transition-all duration-250 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-amber)] focus-visible:ring-offset-2"
			style="
				border: 2px dashed {options[2].borderColor};
				background: linear-gradient(135deg, var(--color-card-start, oklch(0.17 0.005 285)), var(--color-card-end, oklch(0.19 0.006 285)));
				animation-delay: {getButtonDelay(1, 0)};
				animation-duration: 400ms;
				animation-fill-mode: both;
				opacity: {activeAnimationIndex === 2 ? 0.5 : 1};
				transform: {activeAnimationIndex === 2 ? 'scale(0.95)' : 'scale(1)'};
			"
			onclick={() => handleSelect(2, options[2].type, options[2].status)}
		>
			<div
				class="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300"
				style="background: radial-gradient(circle, color-mix(in oklch, {options[2]
					.borderColor} 20%, transparent) 0%, transparent 70%);
					opacity: {activeAnimationIndex === 2 ? 0.6 : 0};"
			></div>
			<div
				class="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
				style="background: linear-gradient(135deg, color-mix(in oklch, {options[2]
					.borderColor} 8%, transparent), transparent); pointer-events: none;"
			></div>
			<div class="relative flex items-center gap-2">
				<div
					class="h-4 w-4 flex-shrink-0 text-[{options[2]
						.borderColor}] group-hover:text-[{options[2]
						.borderColor}] transition-colors duration-250"
				>
					<svg
						class="h-full w-full"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<circle cx="12" cy="12" r="9"></circle>
						<polyline points="12 6 12 12 16 14"></polyline>
					</svg>
				</div>
				<span
					class="text-foreground relative text-sm font-medium group-hover:text-[{options[2]
						.borderColor}] truncate transition-colors duration-250"
					>{options[2].label}</span
				>
			</div>
		</button>
		<button
			type="button"
			class="group animate-in fade-in slide-in-from-top-1 relative overflow-hidden rounded-xl px-3.5 py-3 text-left transition-all duration-250 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-amber)] focus-visible:ring-offset-2"
			style="
				border: 2px dashed {options[3].borderColor};
				background: linear-gradient(135deg, var(--color-card-start, oklch(0.17 0.005 285)), var(--color-card-end, oklch(0.19 0.006 285)));
				animation-delay: {getButtonDelay(1, 1)};
				animation-duration: 400ms;
				animation-fill-mode: both;
				opacity: {activeAnimationIndex === 3 ? 0.5 : 1};
				transform: {activeAnimationIndex === 3 ? 'scale(0.95)' : 'scale(1)'};
			"
			onclick={() => handleSelect(3, options[3].type, options[3].status)}
		>
			<div
				class="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300"
				style="background: radial-gradient(circle, color-mix(in oklch, {options[3]
					.borderColor} 20%, transparent) 0%, transparent 70%);
					opacity: {activeAnimationIndex === 3 ? 0.6 : 0};"
			></div>
			<div
				class="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
				style="background: linear-gradient(135deg, color-mix(in oklch, {options[3]
					.borderColor} 8%, transparent), transparent); pointer-events: none;"
			></div>
			<div class="relative flex items-center gap-2">
				<div
					class="h-4 w-4 flex-shrink-0 text-[{options[3]
						.borderColor}] group-hover:text-[{options[3]
						.borderColor}] transition-colors duration-250"
				>
					<svg
						class="h-full w-full"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path
							d="M8 5c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2h-2.5a.5.5 0 0 0-.5.5v2.5H10v-2.5a.5.5 0 0 0-.5-.5H7c-1.1 0-2-.9-2-2z"
						></path>
						<polyline points="12 9 12 13"></polyline>
						<polyline points="10 11 14 11"></polyline>
					</svg>
				</div>
				<span
					class="text-foreground relative text-sm font-medium group-hover:text-[{options[3]
						.borderColor}] truncate transition-colors duration-250"
					>{options[3].label}</span
				>
			</div>
		</button>
	</div>

	<!-- Row 3 (bottom, closest to thumb): Expense | Income -->
	<div class="grid grid-cols-2 gap-2">
		<button
			type="button"
			class="group animate-in fade-in slide-in-from-top-1 relative overflow-hidden rounded-xl px-3.5 py-3 text-left transition-all duration-250 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-amber)] focus-visible:ring-offset-2"
			style="
				border: 2px solid {options[0].borderColor};
				background: linear-gradient(135deg, var(--color-card-start, oklch(0.17 0.005 285)), var(--color-card-end, oklch(0.19 0.006 285)));
				animation-delay: {getButtonDelay(2, 0)};
				animation-duration: 400ms;
				animation-fill-mode: both;
				opacity: {activeAnimationIndex === 0 ? 0.5 : 1};
				transform: {activeAnimationIndex === 0 ? 'scale(0.95)' : 'scale(1)'};
			"
			onclick={() => handleSelect(0, options[0].type, options[0].status)}
		>
			<div
				class="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300"
				style="background: radial-gradient(circle, color-mix(in oklch, {options[0]
					.borderColor} 20%, transparent) 0%, transparent 70%);
					opacity: {activeAnimationIndex === 0 ? 0.6 : 0};"
			></div>
			<div
				class="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
				style="background: linear-gradient(135deg, color-mix(in oklch, {options[0]
					.borderColor} 8%, transparent), transparent); pointer-events: none;"
			></div>
			<div class="relative flex items-center gap-2">
				<div
					class="h-4 w-4 flex-shrink-0 text-[{options[0]
						.borderColor}] group-hover:text-[{options[0]
						.borderColor}] transition-colors duration-250"
				>
					<svg
						class="h-full w-full"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<circle cx="12" cy="12" r="10"></circle>
						<line x1="8" y1="12" x2="16" y2="12"></line>
					</svg>
				</div>
				<span
					class="text-foreground relative text-sm font-medium group-hover:text-[{options[0]
						.borderColor}] transition-colors duration-250">{options[0].label}</span
				>
			</div>
		</button>
		<button
			type="button"
			class="group animate-in fade-in slide-in-from-top-1 relative overflow-hidden rounded-xl px-3.5 py-3 text-left transition-all duration-250 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-amber)] focus-visible:ring-offset-2"
			style="
				border: 2px solid {options[1].borderColor};
				background: linear-gradient(135deg, var(--color-card-start, oklch(0.17 0.005 285)), var(--color-card-end, oklch(0.19 0.006 285)));
				animation-delay: {getButtonDelay(2, 1)};
				animation-duration: 400ms;
				animation-fill-mode: both;
				opacity: {activeAnimationIndex === 1 ? 0.5 : 1};
				transform: {activeAnimationIndex === 1 ? 'scale(0.95)' : 'scale(1)'};
			"
			onclick={() => handleSelect(1, options[1].type, options[1].status)}
		>
			<div
				class="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300"
				style="background: radial-gradient(circle, color-mix(in oklch, {options[1]
					.borderColor} 20%, transparent) 0%, transparent 70%);
					opacity: {activeAnimationIndex === 1 ? 0.6 : 0};"
			></div>
			<div
				class="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
				style="background: linear-gradient(135deg, color-mix(in oklch, {options[1]
					.borderColor} 8%, transparent), transparent); pointer-events: none;"
			></div>
			<div class="relative flex items-center gap-2">
				<div
					class="h-4 w-4 flex-shrink-0 text-[{options[1]
						.borderColor}] group-hover:text-[{options[1]
						.borderColor}] transition-colors duration-250"
				>
					<svg
						class="h-full w-full"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<circle cx="12" cy="12" r="10"></circle>
						<line x1="12" y1="8" x2="12" y2="16"></line>
						<line x1="8" y1="12" x2="16" y2="12"></line>
					</svg>
				</div>
				<span
					class="text-foreground relative text-sm font-medium group-hover:text-[{options[1]
						.borderColor}] transition-colors duration-250">{options[1].label}</span
				>
			</div>
		</button>
	</div>
</div>

<style>
	button {
		transition: all 250ms cubic-bezier(0.16, 1, 0.3, 1);
	}

	button:hover {
		transform: translateY(-1px);
	}

	button:active {
		transform: scale(0.97);
	}

	@keyframes fadeInSlide {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	:global(.animate-in) {
		animation: fadeInSlide forwards;
	}
</style>
