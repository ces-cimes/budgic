<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { userService } from '$lib/core/services';
  import { db } from '$lib/core/db';
  import { PageLayout } from '$lib/components/layouts';
  import Header from '$lib/components/Header.svelte';
  import type { UserPreferences } from '$lib/core/db';

  // State
  let isLoading = $state(true);
  let isSaving = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);
  
  // Display settings - only fields that exist in schema
  let theme = $state<'light' | 'dark'>('dark');
  let language = $state<'en' | 'ru'>('en');
  let currency = $state('USD');
  let currencyOptions = $state<Array<{ value: string; label: string; symbol: string }>>([]);

  // Language options
  const languageOptions = [
    { value: 'en', label: 'English' },
    { value: 'ru', label: 'Русский' }
  ];

  // Load user preferences and currencies on mount
  onMount(async () => {
    try {
      // Load active currencies from database
      const activeCurrencies = await db.getActiveCurrencies();
      currencyOptions = activeCurrencies
        .filter(c => c.isActive)
        .sort((a, b) => {
          // Sort system currencies first, then by code
          if (a.isSystem && !b.isSystem) return -1;
          if (!a.isSystem && b.isSystem) return 1;
          return a.code.localeCompare(b.code);
        })
        .map(c => ({
          value: c.code,
          label: `${c.name} (${c.code})`,
          symbol: c.symbol
        }));

      // If no currencies found, this is an error state
      if (currencyOptions.length === 0) {
        console.error('No currencies available in database');
      }

      // Load user preferences
      const preferences = await userService.getUserPreferences();
      if (preferences) {
        theme = preferences.theme || 'dark';
        language = preferences.language || 'en';
        // Validate currency exists in available currencies
        if (preferences.currency) {
          const currencyExists = currencyOptions.some(c => c.value === preferences.currency);
          currency = currencyExists ? preferences.currency : (currencyOptions[0]?.value || currency);
        } else if (currencyOptions.length > 0) {
          currency = currencyOptions[0].value;
        }
      } else if (currencyOptions.length > 0) {
        currency = currencyOptions[0].value;
      }
    } catch (err) {
      error = 'Failed to load display settings';
      console.error('Error loading preferences:', err);
      // Don't set fallback - let the form handle the error
    } finally {
      isLoading = false;
    }
  });

  // Save preferences
  async function savePreferences() {
    if (isSaving) return;
    
    isSaving = true;
    error = null;
    success = null;
    
    try {
      await userService.updateUserPreferences({
        theme,
        language,
        currency
      });
      success = 'Saved';
    } catch (err) {
      error = 'Failed to save display settings';
      console.error('Error saving preferences:', err);
    } finally {
      isSaving = false;
    }
  }
</script>

<svelte:head>
  <title>Display | Budgic</title>
</svelte:head>

<PageLayout>
  {#snippet topBar()}
    <Header title="Display" backButtonLabel="Back to settings" backButtonLink="/settings" />
  {/snippet}

  <div class="mx-auto max-w-2xl px-4 py-6">
    {#if isLoading}
      <div class="space-y-4">
        {#each [1, 2] as _}
          <div class="h-24 animate-pulse rounded-2xl bg-[var(--color-bg-tertiary)]"></div>
        {/each}
      </div>
    {:else}
      {#if error}
        <div class="mb-5 rounded-xl border border-[var(--color-warm-coral)]/30 bg-[var(--color-warm-coral)]/8 px-5 py-3">
          <p class="text-sm text-[var(--color-warm-coral)]">{error}</p>
        </div>
      {/if}
      {#if success}
        <div class="mb-5 rounded-xl border border-[var(--color-sage-green)]/30 bg-[var(--color-sage-green)]/8 px-5 py-3">
          <p class="text-sm text-[var(--color-sage-green)]">{success}</p>
        </div>
      {/if}

      <form onsubmit={(e) => { e.preventDefault(); savePreferences(); }} class="space-y-6">
        <div class="rounded-2xl border border-border bg-[var(--color-bg-tertiary)] divide-y divide-border overflow-hidden">
          <div class="px-5 py-4 space-y-3">
            <h2 class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Appearance</h2>
            <div class="space-y-1.5">
              <label for="theme-select" class="text-sm font-medium text-[var(--color-text-primary)]">Theme</label>
              <select
                id="theme-select"
                bind:value={theme}
                class="w-full max-w-xs rounded-xl border border-border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
            <div class="space-y-1.5">
              <label for="language-select" class="text-sm font-medium text-[var(--color-text-primary)]">Language</label>
              <select
                id="language-select"
                bind:value={language}
                class="w-full max-w-xs rounded-xl border border-border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
              >
                {#each languageOptions as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </div>
          </div>
          <div class="px-5 py-4 space-y-3">
            <h2 class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Default currency</h2>
            <div class="space-y-1.5">
              <label for="currency-select" class="text-sm font-medium text-[var(--color-text-primary)]">Currency</label>
              <select
                id="currency-select"
                bind:value={currency}
                class="w-full max-w-xs rounded-xl border border-border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
              >
                {#each currencyOptions as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
              <p class="text-xs text-[var(--color-text-tertiary)]">Used for new accounts and transactions</p>
            </div>
          </div>
        </div>

        <div class="flex gap-3">
          <button
            type="submit"
            disabled={isSaving}
            class="rounded-xl bg-[var(--color-amber)] px-5 py-2.5 text-sm font-semibold text-[var(--color-bg-primary)] transition-opacity disabled:opacity-60"
          >
            {isSaving ? 'Saving…' : 'Save changes'}
          </button>
          <button
            type="button"
            onclick={() => goto('/settings')}
            class="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-surface)]"
          >
            Cancel
          </button>
        </div>
      </form>
    {/if}
  </div>
</PageLayout>
