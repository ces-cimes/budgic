<script lang="ts">
	/**
	 * Week view: 7 mini bars Mon–Sun (UX_SPEC §3.2).
	 * Mon–today = actual spent; tomorrow–Sun = projected from planned/recurring. Today highlighted.
	 */
	import { onMount } from 'svelte';
	import { planService } from '$lib/core/services';
	import { transactionService } from '$lib/core/services';
	import type { EnhancedAllowance } from '$lib/utils/allowance-utils';
	import { formatAmount } from '$lib/utils/currency-utils';

	interface Props {
		allowance: EnhancedAllowance | null;
		currency: string;
		/** Phase 8 — ISO date key (yyyy-MM-dd) → short label (e.g. Payday) */
		dayAnnotations?: Record<string, string>;
	}

	const { allowance, currency, dayAnnotations = {} }: Props = $props();

	const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

	type DayRow = {
		label: string;
		date: Date;
		dateKey: string;
		index: number;
		isToday: boolean;
		spentActual: number;
		spentProjected: number;
		isFuture: boolean;
	};

	let days = $state<DayRow[]>([]);
	let isLoading = $state(true);

	function getWeekStart(d: Date): Date {
		const x = new Date(d);
		const day = x.getDay();
		const diff = x.getDate() - day + (day === 0 ? -6 : 1);
		x.setDate(diff);
		x.setHours(0, 0, 0, 0);
		return x;
	}

	function addDays(date: Date, n: number): Date {
		const r = new Date(date);
		r.setDate(r.getDate() + n);
		return r;
	}

	function toDateOnlyKey(date: Date): string {
		return date.toISOString().slice(0, 10);
	}

	onMount(async () => {
		isLoading = true;
		try {
			const now = new Date();
			const weekStart = getWeekStart(now);
			const weekEnd = addDays(weekStart, 7);
			const weekStartIso = weekStart.toISOString();
			const weekEndIso = weekEnd.toISOString();

			const [cleared, planned] = await Promise.all([
				transactionService.getTransactionsByDateRange(weekStartIso, weekEndIso),
				transactionService.getPlannedTransactionsByDateRange(weekStartIso, weekEndIso)
			]);

			const todayKey = toDateOnlyKey(now);
			const byDayActual: Record<string, number> = {};
			const byDayProjected: Record<string, number> = {};
			for (let i = 0; i < 7; i++) {
				const d = addDays(weekStart, i);
				const key = toDateOnlyKey(d);
				byDayActual[key] = 0;
				byDayProjected[key] = 0;
			}

			for (const t of cleared) {
				if (t.deletedAt || t.type !== 'expense') continue;
				const key = t.clearedDate ? toDateOnlyKey(new Date(t.clearedDate)) : '';
				if (key && byDayActual[key] !== undefined) {
					byDayActual[key] += Math.abs(t.amount ?? 0);
				}
			}
			for (const t of planned) {
				if (t.deletedAt || t.type !== 'expense') continue;
				const key = t.plannedDate ? toDateOnlyKey(new Date(t.plannedDate)) : '';
				if (key && byDayProjected[key] !== undefined) {
					byDayProjected[key] += Math.abs(t.amount ?? 0);
				}
			}

			const dailyBudget =
				allowance && allowance.total.monthly > 0 ? allowance.total.monthly / 30 : 0;

			days = [];
			for (let i = 0; i < 7; i++) {
				const date = addDays(weekStart, i);
				const key = toDateOnlyKey(date);
				const isToday = key === todayKey;
				const isFuture = date > now;
				const spentActual = byDayActual[key] ?? 0;
				const spentProjected = byDayProjected[key] ?? 0;
				days.push({
					label: DAY_LABELS[i],
					date,
					dateKey: key,
					index: i,
					isToday,
					spentActual,
					spentProjected,
					isFuture
				});
			}
		} catch (e) {
			console.error('AllowanceWeekView load error:', e);
			days = [];
		} finally {
			isLoading = false;
		}
	});

	const dailyBudget = $derived(
		allowance && allowance.total.monthly > 0 ? allowance.total.monthly / 30 : 1
	);
</script>

<div class="space-y-2">
	<h3 class="text-xs font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase">
		Week view
	</h3>
	{#if isLoading}
		<div class="flex h-12 items-end gap-1">
			{#each Array(7) as _}
				<div class="h-8 flex-1 animate-pulse rounded bg-[var(--color-bg-surface)]"></div>
			{/each}
		</div>
	{:else}
		<div class="flex items-end gap-1">
			{#each days as day}
				<div
					class="flex flex-1 flex-col items-center gap-1 {day.isToday
						? '-m-0.5 rounded-lg p-1 ring-2 ring-[var(--color-amber)]'
						: ''}"
				>
					{#if dayAnnotations[day.dateKey]}
						<span
							class="text-[9px] font-medium tracking-tight text-[var(--color-text-tertiary)]"
							title={dayAnnotations[day.dateKey]}
						>
							{dayAnnotations[day.dateKey]}
						</span>
					{:else}
						<span class="h-[11px]"></span>
					{/if}
					<div class="relative w-full">
						<div
							class="flex min-h-[4px] w-full flex-col justify-end overflow-hidden rounded-t bg-[var(--color-bg-surface)]"
							style="height: 40px;"
						>
							{#if day.isFuture}
								<!-- Projected: show projected spend as bar -->
								{#if day.spentProjected > 0}
									<div
										class="w-full rounded-t border border-dashed border-[var(--color-amber)] bg-[var(--color-amber)]/50"
										style="height: {Math.min(100, (day.spentProjected / dailyBudget) * 100)}%;"
									></div>
								{/if}
							{:else}
								<!-- Actual: show spent vs daily budget -->
								<div
									class="w-full rounded-t transition-all {day.spentActual > dailyBudget
										? 'bg-[var(--color-warm-coral)]'
										: 'bg-[var(--color-amber)]'}"
									style="height: {Math.min(100, (day.spentActual / dailyBudget) * 100)}%;"
								></div>
							{/if}
						</div>
						{#if day.isToday && day.index < 6}
							<div
								class="pointer-events-none absolute top-0 -right-[5px] bottom-0 z-10 w-0 border-r-2 border-dashed border-[var(--color-amber)]/80"
								title="Today boundary: actual to projected"
							></div>
						{/if}
					</div>
					<span
						class="text-[10px] font-medium {day.isToday
							? 'text-[var(--color-amber)]'
							: 'text-[var(--color-text-tertiary)]'}"
					>
						{day.label}
					</span>
				</div>
			{/each}
		</div>
		{#if dailyBudget > 0}
			<p class="text-[10px] text-[var(--color-text-tertiary)]">
				Daily reference: {formatAmount(dailyBudget, currency)}
			</p>
		{/if}
		<p class="text-[10px] text-[var(--color-text-tertiary)]">
			Solid = actual, dashed = projected
		</p>
	{/if}
</div>
