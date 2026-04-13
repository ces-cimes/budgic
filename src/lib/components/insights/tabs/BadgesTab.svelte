<script lang="ts">
	import { onMount } from 'svelte';
	import { badgeService } from '$lib/core/services';
	import BadgeProgress from '../BadgeProgress.svelte';
	import { Award, Filter } from '@lucide/svelte';
	import * as Select from '$lib/components/ui/select/index.ts';
	import { Checkbox } from '$lib/components/ui/checkbox/index.ts';
	import { Button } from '$lib/components/ui/button/index.ts';
	import { Label } from '$lib/components/ui/label/index.ts';
	import type { BadgesTabProps, BadgeInsight } from '../types';

	interface Props {
		isLoading: boolean;
		onViewDetails?: (badgeId: string) => void;
		className?: string;
	}

	const { isLoading, onViewDetails, className = '' }: Props = $props();

	let badges = $state<BadgeInsight[]>([]);
	let localLoading = $state(false);
	let filterType = $state<BadgeInsight['type'] | 'all'>('all');
	let filterRarity = $state<BadgeInsight['rarity'] | 'all'>('all');
	let showUnlockedOnly = $state(false);

	onMount(() => {
		loadBadges();
		// Check for new badges periodically
		const interval = setInterval(
			async () => {
				await badgeService.checkAllBadges(true);
				await loadBadges();
			},
			5 * 60 * 1000
		); // Every 5 minutes

		return () => clearInterval(interval);
	});

	async function loadBadges() {
		localLoading = true;
		try {
			// Check for new badges first
			await badgeService.checkAllBadges(true);
			// Then load all badges
			badges = await badgeService.getBadges();
		} catch (error) {
			console.error('Error loading badges:', error);
			badges = [];
		} finally {
			localLoading = false;
		}
	}

	const filteredBadges = $derived(
		badges.filter((badge) => {
			if (filterType !== 'all' && badge.type !== filterType) return false;
			if (filterRarity !== 'all' && badge.rarity !== filterRarity) return false;
			if (showUnlockedOnly && !badge.unlockedAt) return false;
			return true;
		})
	);

	const unlockedCount = $derived(badges.filter((b) => b.unlockedAt).length);
	const totalCount = $derived(badges.length);
	const unlockedPercentage = $derived(
		totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0
	);
</script>

<div class="badges-tab {className}">
	<div class="space-y-4 py-2 sm:space-y-6 sm:py-4">
		<!-- Loading State -->
		{#if isLoading || localLoading}
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
				{#each Array(6) as _}
					<div class="h-24 animate-pulse rounded-xl bg-[var(--color-bg-tertiary)]"></div>
				{/each}
			</div>
		{:else if badges.length === 0}
			<div class="squircle-4xl squircle-border bg-card py-10 text-center">
				<p class="text-muted-foreground text-sm">No achievements yet.</p>
				<p class="mt-1 text-xs text-[var(--color-text-tertiary)]">
					Complete goals and track spending to unlock badges.
				</p>
			</div>
		{:else}
			<div class="space-y-3 sm:space-y-4">
				<!-- Summary Stats -->
				<div class="bg-card border-border rounded-lg border p-3 sm:p-4">
					<div class="mb-3 flex items-center justify-between">
						<div>
							<p class="text-muted-foreground text-[10px] sm:text-xs">Achievements</p>
							<p class="text-foreground text-lg font-bold sm:text-2xl">
								{unlockedCount}
								<span class="text-muted-foreground text-sm sm:text-lg">/ {totalCount}</span>
							</p>
						</div>
						<div class="text-right">
							<p class="text-muted-foreground text-[10px] sm:text-xs">Progress</p>
							<p class="text-foreground text-lg font-bold sm:text-2xl">{unlockedPercentage}%</p>
						</div>
					</div>
					<div class="bg-muted h-2 w-full rounded-full">
						<div
							class="bg-primary h-2 rounded-full transition-all duration-500"
							style="width: {unlockedPercentage}%"
						></div>
					</div>
				</div>

				<!-- Filters -->
				<div class="flex flex-wrap items-center gap-2 sm:gap-3">
					<Select.Root
						type="single"
						value={filterType}
						onValueChange={(value) =>
							(filterType = (value || 'all') as BadgeInsight['type'] | 'all')}
					>
						<Select.Trigger
							class="h-auto w-auto min-w-[120px] px-2 py-1.5 text-xs sm:px-3 sm:text-sm"
						>
							<span class="truncate">
								{filterType === 'all'
									? 'All Types'
									: filterType.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
							</span>
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="all">All Types</Select.Item>
							<Select.Item value="budget_badge">Budget</Select.Item>
							<Select.Item value="goal_milestone">Goals</Select.Item>
							<Select.Item value="behavioral_badge">Behavioral</Select.Item>
							<Select.Item value="financial_milestone">Financial</Select.Item>
							<Select.Item value="app_usage_badge">App Usage</Select.Item>
						</Select.Content>
					</Select.Root>

					<Select.Root
						type="single"
						value={filterRarity}
						onValueChange={(value) =>
							(filterRarity = (value || 'all') as BadgeInsight['rarity'] | 'all')}
					>
						<Select.Trigger
							class="h-auto w-auto min-w-[120px] px-2 py-1.5 text-xs sm:px-3 sm:text-sm"
						>
							<span class="truncate">
								{filterRarity === 'all'
									? 'All Rarities'
									: filterRarity.charAt(0).toUpperCase() + filterRarity.slice(1)}
							</span>
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="all">All Rarities</Select.Item>
							<Select.Item value="common">Common</Select.Item>
							<Select.Item value="uncommon">Uncommon</Select.Item>
							<Select.Item value="rare">Rare</Select.Item>
							<Select.Item value="epic">Epic</Select.Item>
							<Select.Item value="legendary">Legendary</Select.Item>
						</Select.Content>
					</Select.Root>

					<div class="flex items-center gap-1.5 sm:gap-2">
						<Checkbox bind:checked={showUnlockedOnly} id="unlocked-only" />
						<Label for="unlocked-only" class="cursor-pointer text-xs sm:text-sm">
							Unlocked Only
						</Label>
					</div>
				</div>

				<!-- Badges Grid — 2 col mobile, 3 col tablet+ -->
				<div class="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
					{#each filteredBadges as badge (badge.id)}
						{#if onViewDetails}
							<Button
								variant="ghost"
								onclick={() => onViewDetails(badge.id)}
								class="h-auto justify-start p-0 text-left hover:bg-transparent"
							>
								<BadgeProgress {badge} showDetails={true} />
							</Button>
						{:else}
							<BadgeProgress {badge} showDetails={true} />
						{/if}
					{/each}
				</div>

				{#if filteredBadges.length === 0}
					<div class="flex flex-col items-center py-12 text-center">
						<Filter class="mb-4 size-8 text-[var(--color-text-disabled)]" />
						<p class="text-sm text-[var(--color-text-secondary)]">No badges match your filters.</p>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
