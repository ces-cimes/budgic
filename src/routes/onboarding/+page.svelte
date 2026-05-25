<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import * as Select from '$lib/components/ui/select/index.ts';
	import { PageLayout } from '$lib/components/layouts';
	import GuidanceDetailPicker from '$lib/components/GuidanceDetailPicker.svelte';
	import { userService } from '$lib/core/services';
	import { navigationStore } from '$lib/stores/navigation-store.svelte';
	import { db, type UserPreferences } from '$lib/core/db';
	import { BarChart2, Target, Lightbulb, Upload } from '@lucide/svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import type { ExplanationDetail, GuidanceTone } from '$lib/utils/guidance-presentation';

	let currentStep = $state(1);
	const totalSteps = 6;
	let isSaving = $state(false);
	let error = $state<string | null>(null);
	let isLoading = $state(true);
	let currencies = $state<Array<{ value: string; label: string }>>([]);

	let formData = $state({
		username: '',
		currency: 'USD',
		theme: 'dark' as 'light' | 'dark',
		language: 'en' as 'en' | 'ru',
		guidanceTone: 'balanced' as GuidanceTone,
		explanationDetail: 'standard' as ExplanationDetail
	});

	onMount(async () => {
		try {
			const activeCurrencies = await db.getActiveCurrencies();
			currencies = activeCurrencies
				.filter((c) => c.isActive)
				.sort((a, b) => {
					if (a.isSystem && !b.isSystem) return -1;
					if (!a.isSystem && b.isSystem) return 1;
					return a.code.localeCompare(b.code);
				})
				.map((c) => ({
					value: c.code,
					label: `${c.code} - ${c.name}`
				}));

			if (currencies.length === 0) {
				console.error('No currencies available in database');
			}

			const preferences = await userService.getUserPreferences();
			if (preferences.username) formData.username = preferences.username;
			if (preferences.currency && currencies.length > 0) {
				const currencyExists = currencies.some((c) => c.value === preferences.currency);
				formData.currency = currencyExists ? preferences.currency : currencies[0]?.value || 'USD';
			} else if (currencies.length > 0) {
				formData.currency = currencies[0].value;
			}
			if (preferences.theme) formData.theme = preferences.theme;
			if (preferences.language) formData.language = preferences.language;
			if (preferences.guidanceTone) formData.guidanceTone = preferences.guidanceTone;
			if (preferences.explanationDetail) formData.explanationDetail = preferences.explanationDetail;
		} catch (err) {
			console.error('Error loading data:', err);
		} finally {
			isLoading = false;
		}
	});

	function nextStep() {
		if (currentStep < totalSteps) {
			currentStep++;
		}
	}

	function prevStep() {
		if (currentStep > 1) {
			currentStep--;
		}
	}

	function buildPreferences(): Partial<UserPreferences> {
		return {
			username: formData.username || 'User',
			currency: formData.currency,
			theme: formData.theme,
			language: formData.language,
			guidanceTone: formData.guidanceTone,
			explanationDetail: formData.explanationDetail,
			onboardingCompleted: true,
			enablePredictiveAnalytics: true,
			analyticsEnabled: true,
			backupEnabled: true
		};
	}

	async function finishOnboarding(redirectTo: string) {
		if (isSaving) return;

		isSaving = true;
		error = null;

		try {
			await userService.updateUserPreferences(buildPreferences());
			await navigationStore.refresh();

			await userService.trackUserAction({
				action: 'onboarding_completed',
				details: JSON.stringify({
					username: formData.username,
					currency: formData.currency,
					guidanceTone: formData.guidanceTone,
					explanationDetail: formData.explanationDetail,
					redirectTo
				})
			});

			goto(redirectTo);
		} catch (err) {
			error = 'Failed to save onboarding data. Please try again.';
			console.error('Onboarding error:', err);
		} finally {
			isSaving = false;
		}
	}

	async function handleSkip() {
		if (isSaving) return;

		isSaving = true;
		error = null;

		try {
			await userService.updateUserPreferences(buildPreferences());
			await navigationStore.refresh();

			await userService.trackUserAction({
				action: 'onboarding_skipped',
				details: JSON.stringify({
					step: currentStep,
					username: formData.username || 'User',
					currency: formData.currency
				})
			});

			goto('/');
		} catch (err) {
			error = 'Failed to skip onboarding. Please try again.';
			console.error('Onboarding skip error:', err);
		} finally {
			isSaving = false;
		}
	}

	function getStepTitle() {
		switch (currentStep) {
			case 1:
				return 'Welcome to Budgic';
			case 2:
				return 'Your name';
			case 3:
				return 'Currency';
			case 4:
				return 'Theme & language';
			case 5:
				return 'Guidance & detail';
			case 6:
				return 'Import existing data?';
			default:
				return '';
		}
	}

	function getStepDescription() {
		switch (currentStep) {
			case 1:
				return "Let's get to know you and set up your financial profile";
			case 2:
				return 'What should we call you in the app?';
			case 3:
				return 'Choose your primary currency for balances and budgets';
			case 4:
				return 'Pick how Budgic looks and which language to use';
			case 5:
				return 'Tune how much guidance Budgic shows — you can change this anytime in Profile';
			case 6:
				return 'Optional: bring in transactions from a CSV or another app now, or skip and add data later';
			default:
				return '';
		}
	}
</script>

<svelte:head>
	<title>Welcome to Budgic</title>
</svelte:head>

<PageLayout>
	<div
		class="flex min-h-screen items-center justify-center bg-[var(--color-bg-primary)] px-4 py-12"
	>
		<div class="w-full max-w-lg">
			{#if isLoading}
				<div class="space-y-4">
					<Skeleton class="h-2 w-full rounded-full bg-[var(--color-bg-tertiary)]" />
					<Skeleton class="h-64 w-full rounded-2xl bg-[var(--color-bg-tertiary)]" />
				</div>
			{:else}
				<div class="mb-8 text-center">
					<p class="font-display text-2xl text-[var(--color-hero-number)]">Budgic</p>
				</div>

				<div class="mb-6">
					<div class="mb-2 flex items-center justify-between">
						<span class="text-xs text-[var(--color-text-tertiary)]"
							>Step {currentStep} of {totalSteps}</span
						>
						<span class="text-xs text-[var(--color-text-tertiary)]"
							>{Math.round((currentStep / totalSteps) * 100)}%</span
						>
					</div>
					<div class="budget-progress">
						<div
							class="budget-progress-fill"
							style="width: {(currentStep / totalSteps) * 100}%"
						></div>
					</div>
				</div>

				<div class="squircle-4xl squircle-border squircle-fill-tertiary p-8">
					<div class="mb-6">
						<h1 class="text-xl font-semibold text-[var(--color-text-primary)]">{getStepTitle()}</h1>
						<p class="mt-1 text-sm text-[var(--color-text-tertiary)]">{getStepDescription()}</p>
					</div>

					{#if error}
						<div
							class="squircle-2xl squircle-border mb-5 px-4 py-3"
							style="--squircle-border-color: color-mix(in oklch, var(--color-warm-coral) 30%, transparent); --squircle-fill: color-mix(in oklch, var(--color-warm-coral) 8%, transparent);"
						>
							<p class="text-sm text-[var(--color-warm-coral)]">{error}</p>
						</div>
					{/if}

					{#if currentStep === 1}
						<div class="space-y-6">
							<div class="grid grid-cols-3 gap-3">
								<div class="squircle-2xl squircle-border squircle-fill-surface p-4 text-center">
									<div
										class="squircle-xl mx-auto mb-2 flex size-9 items-center justify-center bg-[var(--color-amber-subtle)]"
									>
										<BarChart2 class="size-4 text-[var(--color-amber)]" />
									</div>
									<p class="text-xs font-medium text-[var(--color-text-primary)]">Smart tracking</p>
									<p class="mt-0.5 text-xs text-[var(--color-text-tertiary)]">Auto-categorized</p>
								</div>
								<div class="squircle-2xl squircle-border squircle-fill-surface p-4 text-center">
									<div
										class="squircle-xl mx-auto mb-2 flex size-9 items-center justify-center bg-[var(--color-amber-subtle)]"
									>
										<Target class="size-4 text-[var(--color-amber)]" />
									</div>
									<p class="text-xs font-medium text-[var(--color-text-primary)]">Goal setting</p>
									<p class="mt-0.5 text-xs text-[var(--color-text-tertiary)]">Achieve targets</p>
								</div>
								<div class="squircle-2xl squircle-border squircle-fill-surface p-4 text-center">
									<div
										class="squircle-xl mx-auto mb-2 flex size-9 items-center justify-center bg-[var(--color-amber-subtle)]"
									>
										<Lightbulb class="size-4 text-[var(--color-amber)]" />
									</div>
									<p class="text-xs font-medium text-[var(--color-text-primary)]">Insights</p>
									<p class="mt-0.5 text-xs text-[var(--color-text-tertiary)]">Personalised</p>
								</div>
							</div>
						</div>
					{/if}

					{#if currentStep === 2}
						<div class="space-y-1.5">
							<label for="ob-username" class="text-sm font-medium text-[var(--color-text-primary)]"
								>Your name</label
							>
							<input
								id="ob-username"
								type="text"
								bind:value={formData.username}
								placeholder="What should we call you?"
								class="border-border w-full rounded-xl border bg-[var(--color-bg-surface)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
							/>
						</div>
					{/if}

					{#if currentStep === 3}
						<div class="space-y-1.5">
							<label for="ob-currency" class="text-sm font-medium text-[var(--color-text-primary)]"
								>Currency</label
							>
							<Select.Root type="single" bind:value={formData.currency}>
								<Select.Trigger id="ob-currency" class="w-full">
									{formData.currency
										? (currencies.find((c) => c.value === formData.currency)?.label ??
											formData.currency)
										: 'Select currency'}
								</Select.Trigger>
								<Select.Content>
									{#each currencies as currency}
										<Select.Item value={currency.value}>{currency.label}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
					{/if}

					{#if currentStep === 4}
						<div class="grid grid-cols-2 gap-3">
							<div class="space-y-1.5">
								<label for="ob-theme" class="text-sm font-medium text-[var(--color-text-primary)]"
									>Theme</label
								>
								<Select.Root type="single" bind:value={formData.theme}>
									<Select.Trigger id="ob-theme" class="w-full">
										{formData.theme === 'light' ? 'Light' : 'Dark'}
									</Select.Trigger>
									<Select.Content>
										<Select.Item value="light">Light</Select.Item>
										<Select.Item value="dark">Dark</Select.Item>
									</Select.Content>
								</Select.Root>
							</div>
							<div class="space-y-1.5">
								<label
									for="ob-language"
									class="text-sm font-medium text-[var(--color-text-primary)]">Language</label
								>
								<Select.Root type="single" bind:value={formData.language}>
									<Select.Trigger id="ob-language" class="w-full">
										{formData.language === 'en' ? 'English' : 'Русский'}
									</Select.Trigger>
									<Select.Content>
										<Select.Item value="en">English</Select.Item>
										<Select.Item value="ru">Русский</Select.Item>
									</Select.Content>
								</Select.Root>
							</div>
						</div>
					{/if}

					{#if currentStep === 5}
						<GuidanceDetailPicker
							guidanceTone={formData.guidanceTone}
							explanationDetail={formData.explanationDetail}
							onGuidanceToneChange={(value) => (formData.guidanceTone = value)}
							onExplanationDetailChange={(value) => (formData.explanationDetail = value)}
						/>
					{/if}

					{#if currentStep === 6}
						<div class="space-y-4">
							<div
								class="squircle-2xl squircle-border squircle-fill-surface flex items-start gap-3 p-4"
							>
								<div
									class="squircle-xl flex size-9 shrink-0 items-center justify-center bg-[var(--color-amber-subtle)]"
								>
									<Upload class="size-4 text-[var(--color-amber)]" />
								</div>
								<div>
									<p class="text-sm font-medium text-[var(--color-text-primary)]">
										Bring in past transactions
									</p>
									<p class="mt-1 text-xs text-[var(--color-text-tertiary)]">
										Import a CSV or file from another app. You can also add transactions manually
										from Home later.
									</p>
								</div>
							</div>
						</div>
					{/if}

					<div class="mt-8 flex items-center justify-between gap-3">
						<div class="flex gap-2">
							{#if currentStep > 1}
								<button
									type="button"
									onclick={prevStep}
									disabled={isSaving}
									class="border-border rounded-xl border px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-surface)] disabled:opacity-50"
								>
									Previous
								</button>
							{/if}
							{#if currentStep > 1 && currentStep < 6}
								<button
									type="button"
									onclick={handleSkip}
									disabled={isSaving}
									class="rounded-xl px-4 py-2 text-sm text-[var(--color-text-tertiary)] transition-colors hover:text-[var(--color-text-secondary)] disabled:opacity-50"
								>
									Skip
								</button>
							{/if}
						</div>

						{#if currentStep === 6}
							<div class="flex gap-2">
								<button
									type="button"
									onclick={() => finishOnboarding('/')}
									disabled={isSaving}
									class="border-border rounded-xl border px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-surface)] disabled:opacity-50"
								>
									Skip for now
								</button>
								<button
									type="button"
									onclick={() => finishOnboarding('/data?tab=import')}
									disabled={isSaving}
									class="rounded-xl bg-[var(--color-amber)] px-6 py-2 text-sm font-semibold text-[var(--color-bg-primary)] transition-opacity disabled:opacity-60"
								>
									{isSaving ? 'Setting up…' : 'Import data'}
								</button>
							</div>
						{:else}
							<button
								type="button"
								onclick={nextStep}
								disabled={isSaving}
								class="rounded-xl bg-[var(--color-amber)] px-6 py-2 text-sm font-semibold text-[var(--color-bg-primary)] transition-opacity disabled:opacity-60"
							>
								Next
							</button>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>
</PageLayout>
