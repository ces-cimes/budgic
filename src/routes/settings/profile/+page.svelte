<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { userService } from '$lib/core/services';
  import { PageLayout } from '$lib/components/layouts';
  import Header from '$lib/components/Header.svelte';
  import type { UserPreferences } from '$lib/core/db';

  // State
  let isLoading = $state(true);
  let isSaving = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);
  
  // Form fields
  let username = $state('');
  let userMaturityLevel = $state<'beginner' | 'intermediate' | 'advanced' | 'expert'>('beginner');


  // User maturity options
  const userMaturityOptions = [
    { value: 'beginner', label: 'Beginner', description: 'New to budgeting and financial planning' },
    { value: 'intermediate', label: 'Intermediate', description: 'Some experience with budgeting' },
    { value: 'advanced', label: 'Advanced', description: 'Experienced with complex financial planning' },
    { value: 'expert', label: 'Expert', description: 'Financial planning professional or enthusiast' }
  ];

  // Load user preferences on mount
  onMount(async () => {
    try {
      const preferences = await userService.getUserPreferences();
      if (preferences) {
        username = preferences.username || 'User';
        userMaturityLevel = preferences.userMaturityLevel || 'beginner';
      }
    } catch (err) {
      error = 'Failed to load profile settings';
      console.error('Error loading preferences:', err);
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
        username,
        userMaturityLevel
      });
      success = 'Profile settings saved successfully';
    } catch (err) {
      error = 'Failed to save profile settings';
      console.error('Error saving preferences:', err);
    } finally {
      isSaving = false;
    }
  }

  // Reset to defaults
  function resetToDefaults() {
    username = 'User';
    userMaturityLevel = 'beginner';
  }
</script>

<svelte:head>
  <title>Profile | Budgic</title>
</svelte:head>

<PageLayout>
  {#snippet topBar()}
    <Header title="Profile" backButtonLabel="Back to settings" backButtonLink="/settings" />
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
            <h2 class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Basic information</h2>
            <div class="space-y-1.5">
              <label for="username" class="text-sm font-medium text-[var(--color-text-primary)]">Name</label>
              <input
                id="username"
                bind:value={username}
                placeholder="Your name"
                required
                class="w-full max-w-xs rounded-xl border border-border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
              />
              <p class="text-xs text-[var(--color-text-tertiary)]">Displayed throughout the app</p>
            </div>
          </div>
          <div class="px-5 py-4 space-y-3">
            <h2 class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Experience level</h2>
            <div class="grid grid-cols-2 gap-2">
              {#each userMaturityOptions as option}
                <button
                  type="button"
                  onclick={() => userMaturityLevel = option.value as typeof userMaturityLevel}
                  class="rounded-xl border p-3 text-left transition-colors {userMaturityLevel === option.value
                    ? 'border-[var(--color-amber)] bg-[var(--color-amber-subtle)]'
                    : 'border-border bg-[var(--color-bg-surface)] hover:border-[var(--color-amber)]/40'}"
                >
                  <p class="text-sm font-medium {userMaturityLevel === option.value ? 'text-[var(--color-amber)]' : 'text-[var(--color-text-primary)]'}">{option.label}</p>
                  <p class="text-xs text-[var(--color-text-tertiary)] mt-0.5">{option.description}</p>
                </button>
              {/each}
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

