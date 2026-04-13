<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { badgeService } from '$lib/core/services';
	import { db } from '$lib/core/db';
	import AchievementNotification from './AchievementNotification.svelte';
	import MilestoneCelebration from './MilestoneCelebration.svelte';
	import { goto } from '$app/navigation';
	import type { BadgeInsight } from './types';

	interface Props {
		enabled?: boolean;
		checkInterval?: number;
	}

	const { enabled = true, checkInterval = 60000 }: Props = $props(); // Check every minute

	let newBadges = $state<BadgeInsight[]>([]);
	let currentBadge = $state<BadgeInsight | null>(null);
	let showCelebration = $state(false);
	let checkIntervalId: ReturnType<typeof setInterval> | null = null;

	onMount(async () => {
		if (!enabled) return;

		// Initial check
		await checkForNewBadges();

		// Set up periodic checking
		checkIntervalId = setInterval(async () => {
			await checkForNewBadges();
		}, checkInterval);
	});

	onDestroy(() => {
		if (checkIntervalId) {
			clearInterval(checkIntervalId);
		}
	});

	async function checkForNewBadges() {
		try {
			// Check for new badges
			const unlocked = await badgeService.checkAllBadges(true);

			if (unlocked.length > 0) {
				// Get badge details
				const allBadges = await badgeService.getBadges();
				const newlyUnlocked = allBadges.filter((b) =>
					unlocked.some((u) => u.badgeId === b.id || u.id === b.id)
				);

				// Filter out badges that have already been notified
				const unnotified = newlyUnlocked.filter((badge) => {
					// Check if we've already shown this badge
					return !newBadges.some((nb) => nb.id === badge.id);
				});

				if (unnotified.length > 0) {
					// Show the first new badge
					showNewBadge(unnotified[0]);
				}
			}
		} catch (error) {
			console.error('Error checking for new badges:', error);
		}
	}

	async function showNewBadge(badge: BadgeInsight) {
		newBadges = [...newBadges, badge];
		currentBadge = badge;
		showCelebration = true;

		// Mark badge as notified
		// badge.id could be either the database id or badgeId depending on whether it's unlocked
		try {
			// Try to find the badge - first try as badgeId, then as database id
			let dbBadge = await db.getBadgeByBadgeId(badge.id);
			if (!dbBadge) {
				// If not found by badgeId, try to find by database id
				const allBadges = await db.getBadges();
				dbBadge = allBadges.find((b) => b.id === badge.id);
			}

			if (dbBadge) {
				await db.markBadgeNotified(dbBadge.badgeId);
			}
		} catch (error) {
			console.error('Error marking badge as notified:', error);
		}
	}

	function handleCelebrationClose() {
		showCelebration = false;
		// Show notification after celebration
		if (currentBadge) {
			setTimeout(() => {
				currentBadge = null;
			}, 500);
		}
	}

	function handleNotificationDismiss(badgeId: string) {
		newBadges = newBadges.filter((b) => b.id !== badgeId);
		if (currentBadge?.id === badgeId) {
			currentBadge = null;
		}
	}

	function handleViewBadge(badgeId: string) {
		goto(`/insights?tab=badges`);
		handleNotificationDismiss(badgeId);
	}
</script>

<!-- Celebration Modal -->
{#if showCelebration && currentBadge}
	<MilestoneCelebration
		badge={currentBadge}
		onClose={handleCelebrationClose}
		showAnimation={true}
	/>
{/if}

<!-- Notifications -->
{#each newBadges as badge (badge.id)}
	{#if !showCelebration || badge.id !== currentBadge?.id}
		<AchievementNotification
			{badge}
			onDismiss={() => handleNotificationDismiss(badge.id)}
			onView={() => handleViewBadge(badge.id)}
			autoDismiss={true}
			dismissDelay={8000}
		/>
	{/if}
{/each}
