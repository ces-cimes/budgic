<script lang="ts">
	import { goto } from '$app/navigation';
	import { toggleMode, mode } from 'mode-watcher';
	import { Switch } from '$lib/components/ui/switch/index.ts';
	import * as Alert from '$lib/components/ui/alert/index.ts';
	import { userService } from '$lib/core/services/index.ts';
	import { populateSampleData, clearAllData } from '$lib/core/test-data';
	import { onMount } from 'svelte';
	import Header from '$lib/components/Header.svelte';
	import { PageLayout } from '$lib/components/layouts';
	import {
		User,
		Palette,
		DollarSign,
		Navigation,
		Bell,
		SlidersHorizontal,
		Database,
		ChevronRight,
		Wallet,
		Sparkles
	} from '@lucide/svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import type { UserPreferences } from '$lib/core/db';
	import {
		getDismissedPostChecklistSuggestions,
		getEligiblePostChecklistSuggestions
	} from '$lib/utils/post-checklist-suggestions';
	import type { ResolvedPostChecklistSuggestion } from '$lib/utils/post-checklist-suggestions';

	const { data } = $props<{ data: any }>();

	let userPreferences = $state<UserPreferences | null>(null);
	let activeSetupSuggestions = $state<ResolvedPostChecklistSuggestion[]>([]);
	let dismissedSetupSuggestions = $state<ResolvedPostChecklistSuggestion[]>([]);
	let isLoading = $state(true);
	let isSaving = $state(false);
	let username = $state('');
	let notificationsEnabled = $state(true);
	let autoCategorizationEnabled = $state(true);
	let stressDetectionEnabled = $state(true);
	let suggestSplitsAfterAddEnabled = $state(true);
	let darkModeEnabled = $derived(mode.current === 'dark');

	// Dev section state
	let isDevActionLoading = $state(false);
	let devActionMessage = $state<string | null>(null);

	function refreshSetupSuggestions(prefs: UserPreferences) {
		activeSetupSuggestions = getEligiblePostChecklistSuggestions(prefs);
		dismissedSetupSuggestions = getDismissedPostChecklistSuggestions(prefs);
	}

	async function restoreSetupSuggestion(id: string) {
		if (!userPreferences) return;
		const dismissals = { ...(userPreferences.postChecklistSuggestionDismissals ?? {}) };
		delete dismissals[id];
		userPreferences = await userService.updateUserPreferences({
			postChecklistSuggestionDismissals: Object.keys(dismissals).length > 0 ? dismissals : undefined
		});
		refreshSetupSuggestions(userPreferences);
	}

	// Load user preferences on mount
	onMount(async () => {
		try {
			userPreferences = await userService.getUserPreferences();
			if (userPreferences) {
				username = userPreferences.username || 'User';
				notificationsEnabled = userPreferences.analyticsEnabled ?? true;
				autoCategorizationEnabled = userPreferences.enablePredictiveAnalytics ?? true;
				stressDetectionEnabled = userPreferences.enableAdvancedFeatures ?? true;
				suggestSplitsAfterAddEnabled = userPreferences.suggestSplitsAfterAdd ?? true;
				refreshSetupSuggestions(userPreferences);
			} else {
				// Create default preferences if none exist
				userPreferences = await userService.updateUserPreferences({
					username: 'User',
					analyticsEnabled: true,
					enablePredictiveAnalytics: true,
					enableAdvancedFeatures: true,
					theme: 'dark'
				});
				username = userPreferences.username;
				notificationsEnabled = userPreferences.analyticsEnabled;
				autoCategorizationEnabled = userPreferences.enablePredictiveAnalytics;
				stressDetectionEnabled = userPreferences.enableAdvancedFeatures;
			}
		} catch (error) {
			console.error('Failed to load user preferences:', error);
		} finally {
			isLoading = false;
		}
	});

	$effect(() => {
		if (darkModeEnabled && mode.current !== 'dark') {
			toggleMode();
		} else if (!darkModeEnabled && mode.current !== 'light') {
			toggleMode();
		}
	});

	async function savePreferences() {
		if (isSaving) return;
		isSaving = true;
		try {
			const current = await userService.getUserPreferences();
			await userService.updateUserPreferences({
				...current,
				username,
				analyticsEnabled: notificationsEnabled,
				enablePredictiveAnalytics: autoCategorizationEnabled,
				enableAdvancedFeatures: stressDetectionEnabled,
				suggestSplitsAfterAdd: suggestSplitsAfterAddEnabled,
				theme: darkModeEnabled ? 'dark' : 'light'
			});
		} catch (error) {
			console.error('Failed to save preferences:', error);
		} finally {
			isSaving = false;
		}
	}

	// Auto-save when preferences change
	$effect(() => {
		if (!isLoading && userPreferences) {
			savePreferences();
		}
	});

	// Dev section functions
	async function handleClearAllData() {
		if (isDevActionLoading) return;

		isDevActionLoading = true;
		devActionMessage = null;

		try {
			await clearAllData();
			devActionMessage = 'Cleared';
		} catch (error) {
			console.error('Error clearing all data:', error);
			devActionMessage =
				'Error clearing data: ' + (error instanceof Error ? error.message : 'Unknown error');
		} finally {
			isDevActionLoading = false;
		}
	}

	async function handlePopulateSampleData() {
		if (isDevActionLoading) return;

		isDevActionLoading = true;
		devActionMessage = null;

		try {
			await populateSampleData();
			devActionMessage = 'Sample data loaded';
		} catch (error) {
			console.error('Error populating sample data:', error);
			devActionMessage =
				'Error populating sample data: ' +
				(error instanceof Error ? error.message : 'Unknown error');
		} finally {
			isDevActionLoading = false;
		}
	}

	const settingsSections = [
		{
			title: 'Personal',
			items: [
				{
					name: 'Profile',
					description: 'Name, guidance & detail, privacy & data',
					Icon: User,
					href: '/settings/profile'
				}
			]
		},
		{
			title: 'App',
			items: [
				{
					name: 'Display',
					description: 'Theme, language, locale',
					Icon: Palette,
					href: '/settings/display'
				},
				{
					name: 'Currency',
					description: 'Currencies and exchange rates',
					Icon: DollarSign,
					href: '/settings/currency'
				},
				{
					name: 'Accounts',
					description: 'Passive balances, net worth accrual, batch updates',
					Icon: Wallet,
					href: '/settings/accounts'
				},
				{
					name: 'Navigation',
					description: 'Nav order, visibility, and widget rotation',
					Icon: Navigation,
					href: '/settings/navigation'
				},
				{
					name: 'Notifications',
					description: 'Notification preferences',
					Icon: Bell,
					href: '/settings/notifications'
				}
			]
		},
		{
			title: 'Plan defaults',
			items: [
				{
					name: 'Budget & allowance',
					description: 'Overspending, envelope borrowing, rollover',
					Icon: SlidersHorizontal,
					href: '/settings/plan'
				},
				{
					name: 'Round-up rules',
					description: 'Automatic spare-change transfers',
					Icon: SlidersHorizontal,
					href: '/settings/roundup'
				}
			]
		},
		{
			title: 'Data',
			items: [
				{
					name: 'Export & import',
					description: 'Backup, restore, or migrate data',
					Icon: Database,
					href: '/data'
				}
			]
		}
	];

	function toggleSetting(setting: string) {
		switch (setting) {
			case 'notifications':
				notificationsEnabled = !notificationsEnabled;
				break;
			case 'darkMode':
				toggleMode();
				break;
			case 'autoCategorization':
				autoCategorizationEnabled = !autoCategorizationEnabled;
				break;
			case 'stressDetection':
				stressDetectionEnabled = !stressDetectionEnabled;
				break;
		}
	}
</script>

<svelte:head>
	<title>Settings | Budgic</title>
</svelte:head>

<PageLayout>
	{#snippet topBar()}
		<Header title="Settings" />
	{/snippet}

	<div class="mx-auto max-w-2xl px-4 py-6">
		{#if isLoading}
			<div class="space-y-6">
				{#each [1, 2, 3] as _}
					<div class="space-y-1">
						<Skeleton class="mb-3 h-3 w-20 rounded bg-[var(--color-bg-surface)]" />
						{#each [1, 2] as _}
							<Skeleton class="h-14 w-full rounded-xl bg-[var(--color-bg-tertiary)]" />
						{/each}
					</div>
				{/each}
			</div>
		{:else}
			<!-- Settings link sections -->
			<div class="space-y-8">
				{#each settingsSections.slice(0, 1) as section}
					<section>
						<h2
							class="mb-3 px-1 text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
						>
							{section.title}
						</h2>
						<div
							class="border-border divide-border divide-y overflow-hidden rounded-2xl border bg-[var(--color-bg-tertiary)]"
						>
							{#each section.items as item}
								<button
									type="button"
									onclick={() => goto(item.href)}
									class="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[var(--color-bg-surface)]"
								>
									<div
										class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-amber-subtle)]"
									>
										<item.Icon class="size-4 text-[var(--color-amber)]" />
									</div>
									<div class="min-w-0 flex-1">
										<p class="text-sm font-medium text-[var(--color-text-primary)]">{item.name}</p>
										<p class="mt-0.5 truncate text-xs text-[var(--color-text-tertiary)]">
											{item.description}
										</p>
									</div>
									<ChevronRight class="size-4 text-[var(--color-text-tertiary)]" />
								</button>
							{/each}
						</div>
					</section>
				{/each}

				<section>
					<h2
						class="mb-3 px-1 text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
					>
						Setup
					</h2>
					<div
						class="border-border divide-border divide-y overflow-hidden rounded-2xl border bg-[var(--color-bg-tertiary)]"
					>
						<button
							type="button"
							onclick={() => goto('/settings/profile')}
							class="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[var(--color-bg-surface)]"
						>
							<div
								class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-amber-subtle)]"
							>
								<Sparkles class="size-4 text-[var(--color-amber)]" />
							</div>
							<div class="min-w-0 flex-1">
								<p class="text-sm font-medium text-[var(--color-text-primary)]">
									Guidance & detail
								</p>
								<p class="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
									Adjust coaching tone and helper copy length → Profile
								</p>
							</div>
							<ChevronRight class="size-4 text-[var(--color-text-tertiary)]" />
						</button>

						{#if activeSetupSuggestions.length > 0}
							{#each activeSetupSuggestions as suggestion (suggestion.id)}
								<div class="flex items-center justify-between gap-3 px-5 py-4">
									<div class="min-w-0 flex-1">
										<p class="text-sm font-medium text-[var(--color-text-primary)]">
											{suggestion.title}
										</p>
										<p class="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
											{suggestion.helper}
										</p>
									</div>
									<button
										type="button"
										onclick={() => goto(suggestion.href)}
										class="shrink-0 text-xs font-medium text-[var(--color-amber)]"
									>
										Open →
									</button>
								</div>
							{/each}
						{:else if userPreferences?.firstRunChecklistComplete}
							<p class="px-5 py-4 text-xs text-[var(--color-text-tertiary)]">
								No active setup suggestions right now.
							</p>
						{/if}

						{#if dismissedSetupSuggestions.length > 0}
							<div class="bg-[var(--color-bg-surface)]/40 px-5 py-2">
								<p
									class="text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
								>
									Dismissed
								</p>
							</div>
							{#each dismissedSetupSuggestions as suggestion (suggestion.id)}
								<div class="flex items-center justify-between gap-3 px-5 py-4">
									<div class="min-w-0 flex-1">
										<p class="text-sm text-[var(--color-text-secondary)]">{suggestion.title}</p>
									</div>
									<button
										type="button"
										onclick={() => restoreSetupSuggestion(suggestion.id)}
										class="shrink-0 text-xs font-medium text-[var(--color-amber)]"
									>
										Show again
									</button>
								</div>
							{/each}
						{/if}
					</div>
				</section>

				{#each settingsSections.slice(1) as section}
					<section>
						<h2
							class="mb-3 px-1 text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
						>
							{section.title}
						</h2>
						<div
							class="border-border divide-border divide-y overflow-hidden rounded-2xl border bg-[var(--color-bg-tertiary)]"
						>
							{#each section.items as item}
								<button
									type="button"
									onclick={() => goto(item.href)}
									class="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[var(--color-bg-surface)]"
								>
									<div
										class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-amber-subtle)]"
									>
										<item.Icon class="size-4 text-[var(--color-amber)]" />
									</div>
									<div class="min-w-0 flex-1">
										<p class="text-sm font-medium text-[var(--color-text-primary)]">{item.name}</p>
										<p class="mt-0.5 truncate text-xs text-[var(--color-text-tertiary)]">
											{item.description}
										</p>
									</div>
									<ChevronRight class="size-4 text-[var(--color-text-tertiary)]" />
								</button>
							{/each}
						</div>
					</section>
				{/each}

				<!-- Quick toggles -->
				<section>
					<h2
						class="mb-3 px-1 text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
					>
						Quick toggles
					</h2>
					<div
						class="border-border divide-border divide-y overflow-hidden rounded-2xl border bg-[var(--color-bg-tertiary)]"
					>
						<div class="flex items-center justify-between px-5 py-4">
							<span class="text-sm font-medium text-[var(--color-text-primary)]">Dark mode</span>
							<Switch bind:checked={darkModeEnabled} aria-label="Toggle dark mode" />
						</div>
						<div class="flex items-center justify-between px-5 py-4">
							<span class="text-sm font-medium text-[var(--color-text-primary)]"
								>Predictive analytics</span
							>
							<Switch
								bind:checked={autoCategorizationEnabled}
								aria-label="Toggle predictive analytics"
							/>
						</div>
						<div class="flex items-center justify-between px-5 py-4">
							<span class="text-sm font-medium text-[var(--color-text-primary)]">Analytics</span>
							<Switch bind:checked={notificationsEnabled} aria-label="Toggle analytics" />
						</div>
						<div class="flex items-center justify-between px-5 py-4">
							<span class="text-sm font-medium text-[var(--color-text-primary)]"
								>Advanced features</span
							>
							<Switch bind:checked={stressDetectionEnabled} aria-label="Toggle advanced features" />
						</div>
						<div class="flex items-center justify-between px-5 py-4">
							<span class="text-sm font-medium text-[var(--color-text-primary)]"
								>Suggest splits after adding</span
							>
							<Switch
								bind:checked={suggestSplitsAfterAddEnabled}
								aria-label="Toggle split suggestions after adding transactions"
							/>
						</div>
					</div>
				</section>

				<!-- Developer section -->
				<section>
					<h2
						class="mb-3 px-1 text-[10px] font-semibold tracking-widest text-[var(--color-text-tertiary)] uppercase"
					>
						Developer
					</h2>
					<div
						class="border-border space-y-3 overflow-hidden rounded-2xl border bg-[var(--color-bg-tertiary)] p-5"
					>
						{#if devActionMessage}
							<div
								class="rounded-xl border border-[var(--color-sage-green)]/30 bg-[var(--color-sage-green)]/8 px-4 py-3"
							>
								<p class="text-sm text-[var(--color-sage-green)]">{devActionMessage}</p>
							</div>
						{/if}
						<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
							<button
								onclick={handlePopulateSampleData}
								disabled={isDevActionLoading}
								class="border-border rounded-xl border bg-[var(--color-bg-surface)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-tertiary)] disabled:opacity-50"
							>
								{isDevActionLoading ? 'Working…' : 'Populate sample data'}
							</button>
							<button
								onclick={handleClearAllData}
								disabled={isDevActionLoading}
								class="rounded-xl border border-[var(--color-warm-coral)]/30 bg-[var(--color-warm-coral)]/8 px-4 py-2.5 text-sm font-medium text-[var(--color-warm-coral)] transition-colors hover:bg-[var(--color-warm-coral)]/12 disabled:opacity-50"
							>
								{isDevActionLoading ? 'Working…' : 'Clear all data'}
							</button>
						</div>
					</div>
				</section>
			</div>

			<!-- App footer -->
			<div class="mt-12 pb-4 text-center">
				<p class="font-display text-xl font-normal text-[var(--color-hero-number)]">Budgic</p>
				<p class="mt-1 text-xs text-[var(--color-text-tertiary)]">Version 1.0.0</p>
				<p class="mt-2 text-xs text-[var(--color-text-disabled)]">© 2025 Budgic</p>
			</div>
		{/if}
	</div>
</PageLayout>
