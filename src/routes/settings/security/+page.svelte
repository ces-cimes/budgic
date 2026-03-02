<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { userService } from '$lib/core/services';
  import { PageLayout } from '$lib/components/layouts';
  import Header from '$lib/components/Header.svelte';
  import { Switch } from '$lib/components/ui/switch/index.ts';
  import { BarChart2, HardDrive } from '@lucide/svelte';
  import type { UserPreferences } from '$lib/core/db';

  // State
  let isLoading = $state(true);
  let isSaving = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);
  
  // Privacy settings - only fields that exist in schema
  let analyticsEnabled = $state(true);
  let backupEnabled = $state(true);

  // Load user preferences on mount
  onMount(async () => {
    try {
      const preferences = await userService.getUserPreferences();
      if (preferences) {
        analyticsEnabled = preferences.analyticsEnabled ?? true;
        backupEnabled = preferences.backupEnabled ?? true;
      }
    } catch (err) {
      error = 'Failed to load security settings';
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
        analyticsEnabled,
        backupEnabled
      });
      success = 'Security settings saved successfully';
    } catch (err) {
      error = 'Failed to save security settings';
      console.error('Error saving preferences:', err);
    } finally {
      isSaving = false;
    }
  }
</script>

<svelte:head>
  <title>Security & privacy | Budgic</title>
</svelte:head>

<PageLayout>
  {#snippet topBar()}
    <Header title="Security & privacy" backButtonLabel="Back to settings" backButtonLink="/settings" />
  {/snippet}

  <div class="mx-auto max-w-2xl px-4 py-6">
    {#if isLoading}
      <div class="h-36 animate-pulse rounded-2xl bg-[var(--color-bg-tertiary)]"></div>
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
          <div class="px-5 py-2.5">
            <h2 class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Data privacy</h2>
          </div>
          <div class="flex items-center justify-between gap-4 px-5 py-4">
            <div class="flex items-center gap-3">
              <div class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-amber-subtle)]">
                <BarChart2 class="size-4 text-[var(--color-amber)]" />
              </div>
              <div>
                <p class="text-sm font-medium text-[var(--color-text-primary)]">Analytics</p>
                <p class="text-xs text-[var(--color-text-tertiary)]">Help improve the app by sharing usage data</p>
              </div>
            </div>
            <Switch bind:checked={analyticsEnabled} aria-label="Toggle analytics" />
          </div>
          <div class="flex items-center justify-between gap-4 px-5 py-4">
            <div class="flex items-center gap-3">
              <div class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-amber-subtle)]">
                <HardDrive class="size-4 text-[var(--color-amber)]" />
              </div>
              <div>
                <p class="text-sm font-medium text-[var(--color-text-primary)]">Data backup</p>
                <p class="text-xs text-[var(--color-text-tertiary)]">Automatically back up your financial data</p>
              </div>
            </div>
            <Switch bind:checked={backupEnabled} aria-label="Toggle data backup" />
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
