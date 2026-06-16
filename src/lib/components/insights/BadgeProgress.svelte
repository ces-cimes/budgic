<script lang="ts">
	import { Award, Trophy, Star, Sparkles } from '@lucide/svelte';
	import type { BadgeInsight } from './types';

	interface Props {
		badge: BadgeInsight;
		showDetails?: boolean;
		className?: string;
	}

	const { badge, showDetails = false, className = '' }: Props = $props();

	const isUnlocked = $derived(!!badge.unlockedAt);
	const progress = $derived(badge.progress);

	function getRarityColor(rarity: BadgeInsight['rarity']): string {
		switch (rarity) {
			case 'common':
				return 'text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700';
			case 'uncommon':
				return 'text-green-600 dark:text-green-400 border-green-300 dark:border-green-700';
			case 'rare':
				return 'text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700';
			case 'epic':
				return 'text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-700';
			case 'legendary':
				return 'text-yellow-600 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700';
			default:
				return 'text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700';
		}
	}

	function getRarityBg(rarity: BadgeInsight['rarity']): string {
		switch (rarity) {
			case 'common':
				return 'bg-gray-100 dark:bg-gray-800';
			case 'uncommon':
				return 'bg-green-100 dark:bg-green-900/20';
			case 'rare':
				return 'bg-blue-100 dark:bg-blue-900/20';
			case 'epic':
				return 'bg-purple-100 dark:bg-purple-900/20';
			case 'legendary':
				return 'bg-yellow-100 dark:bg-yellow-900/20';
			default:
				return 'bg-gray-100 dark:bg-gray-800';
		}
	}

	function getIcon(badgeType: BadgeInsight['badgeType']) {
		switch (badgeType) {
			case 'achievement':
				return Award;
			case 'milestone':
				return Trophy;
			case 'milestone_reached':
				return Star;
			case 'streak':
				return Sparkles;
			default:
				return Award;
		}
	}

	function getProgressPercentage(): number {
		if (!progress) return 0;
		return Math.min(100, Math.max(0, progress.percentage || 0));
	}
</script>

<div
	class="flex items-center gap-3 rounded-lg border p-4 {isUnlocked
		? getRarityColor(badge.rarity)
		: 'border-muted'} {className}"
>
	<!-- Icon -->
	<div class="flex-shrink-0">
		<div
			class="rounded-full p-2 {isUnlocked
				? getRarityBg(badge.rarity)
				: 'bg-muted'} {isUnlocked ? getRarityColor(badge.rarity) : 'text-muted-foreground'}"
		>
			{#if getIcon(badge.badgeType)}
				{@const Icon = getIcon(badge.badgeType)}
				<Icon class="h-6 w-6" />
			{/if}
		</div>
	</div>

	<!-- Content -->
	<div class="min-w-0 flex-1">
		<div class="mb-1 flex items-center justify-between">
			<h3
				class="truncate text-sm font-semibold {isUnlocked
					? 'text-foreground'
					: 'text-muted-foreground'}"
			>
				{badge.title}
			</h3>
			{#if isUnlocked}
				<span
					class="rounded-full px-2 py-0.5 text-xs {getRarityBg(
						badge.rarity
					)} {getRarityColor(badge.rarity)} ml-2 capitalize"
				>
					{badge.rarity}
				</span>
			{/if}
		</div>

		<p class="text-muted-foreground mb-2 line-clamp-2 text-xs">
			{badge.description}
		</p>

		<!-- Progress Bar -->
		{#if progress && !isUnlocked}
			<div class="space-y-1">
				<div class="text-muted-foreground flex items-center justify-between text-xs">
					<span>Progress</span>
					<span>{getProgressPercentage().toFixed(0)}%</span>
				</div>
				<div class="bg-muted h-2 w-full overflow-hidden rounded-full">
					<div
						class="h-full transition-all duration-500 {getRarityBg(badge.rarity)}"
						style="width: {getProgressPercentage()}%"
					></div>
				</div>
				{#if showDetails && progress.current !== undefined && progress.target !== undefined}
					<div class="text-muted-foreground text-xs">
						{progress.current} / {progress.target}
					</div>
				{/if}
			</div>
		{:else if isUnlocked}
			<div class="text-xs font-medium text-green-600 dark:text-green-400">
				✓ Unlocked {badge.unlockedAt ? new Date(badge.unlockedAt).toLocaleDateString() : ''}
			</div>
		{/if}
	</div>
</div>
