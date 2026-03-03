<script lang="ts">
  import { goto } from '$app/navigation';
  import { PageLayout } from '$lib/components/layouts';
  import Header from '$lib/components/Header.svelte';
  import * as Select from '$lib/components/ui/select/index.ts';
  import { goalsService } from '$lib/core/services';
  import type { CreateGoalRequest, GoalCategory, GoalPriority } from '$lib/components/goals/types';

  // State
  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let success = $state(false);

  // Form data
  let formData = $state<CreateGoalRequest>({
    name: '',
    description: '',
    targetAmount: 0,
    currency: 'USD',
    category: 'other' as GoalCategory,
    priority: 'medium' as GoalPriority,
    targetDate: '',
    monthlyContribution: 0,
    isRecurring: false,
    tags: []
  });

  // Goal categories
  const goalCategories: { value: GoalCategory; label: string }[] = [
    { value: 'emergency_fund', label: 'Emergency fund' },
    { value: 'vacation', label: 'Vacation' },
    { value: 'house_down_payment', label: 'House down payment' },
    { value: 'car_purchase', label: 'Car purchase' },
    { value: 'education', label: 'Education' },
    { value: 'retirement', label: 'Retirement' },
    { value: 'debt_payoff', label: 'Debt payoff' },
    { value: 'investment', label: 'Investment' },
    { value: 'wedding', label: 'Wedding' },
    { value: 'home_improvement', label: 'Home improvement' },
    { value: 'other', label: 'Other' }
  ];

  // Goal priorities
  const goalPriorities: { value: GoalPriority; label: string }[] = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'critical', label: 'Critical' }
  ];

  // Currencies
  const currencies = [
    { value: 'USD', label: 'USD - US Dollar' },
    { value: 'EUR', label: 'EUR - Euro' },
    { value: 'GBP', label: 'GBP - British Pound' },
    { value: 'CAD', label: 'CAD - Canadian Dollar' },
    { value: 'AUD', label: 'AUD - Australian Dollar' }
  ];

  async function handleSubmit() {
    try {
      isLoading = true;
      error = null;
      success = false;

      // Validate form
      if (!formData.name.trim()) {
        throw new Error('Goal name is required');
      }
      if (formData.targetAmount <= 0) {
        throw new Error('Target amount must be greater than 0');
      }

      // Create goal
      await goalsService.createGoal(formData);
      
      success = true;
      
      // Redirect to goals page after a short delay
      setTimeout(() => {
        goto('/goals');
      }, 1500);

    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to create goal';
      console.error('Error creating goal:', err);
    } finally {
      isLoading = false;
    }
  }

  function handleCancel() {
    goto('/goals');
  }
</script>

<svelte:head>
  <title>New goal | Budgic</title>
</svelte:head>

<PageLayout>
  {#snippet topBar()}
    <Header
      title="New goal"
      backButtonLabel="Back to plan"
      backButtonLink="/plan"
    />
  {/snippet}

  <div class="mx-auto max-w-2xl px-4 py-6">
    {#if success}
      <div class="squircle-4xl squircle-border p-8 text-center" style="--squircle-border-color: color-mix(in oklch, var(--color-sage-green) 30%, transparent); --squircle-fill: color-mix(in oklch, var(--color-sage-green) 8%, transparent);">
        <p class="text-sm font-medium text-[var(--color-sage-green)]">Goal created. Redirecting…</p>
      </div>
    {:else}
      {#if error}
        <div class="mb-5 squircle-2xl squircle-border px-5 py-3" style="--squircle-border-color: color-mix(in oklch, var(--color-warm-coral) 30%, transparent); --squircle-fill: color-mix(in oklch, var(--color-warm-coral) 8%, transparent);">
          <p class="text-sm text-[var(--color-warm-coral)]">{error}</p>
        </div>
      {/if}

      <form onsubmit={handleSubmit} class="space-y-6">
        <div class="squircle-4xl squircle-border squircle-fill-tertiary divide-y divide-border overflow-hidden">
          <div class="px-5 py-2.5">
            <h2 class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Goal details</h2>
          </div>

          <div class="px-5 py-4 space-y-1.5">
            <label for="goal-name" class="text-sm font-medium text-[var(--color-text-primary)]">Name</label>
            <input
              id="goal-name"
              bind:value={formData.name}
              placeholder="e.g., Emergency fund, Europe trip"
              required
              class="w-full rounded-xl border border-border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
            />
          </div>

          <div class="px-5 py-4 space-y-1.5">
            <label for="goal-description" class="text-sm font-medium text-[var(--color-text-primary)]">Description <span class="text-[var(--color-text-tertiary)]">(optional)</span></label>
            <textarea
              id="goal-description"
              bind:value={formData.description}
              placeholder="Why this goal matters…"
              rows="2"
              class="w-full rounded-xl border border-border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] resize-none outline-none focus:border-[var(--color-amber)]"
            ></textarea>
          </div>

          <div class="grid grid-cols-2 gap-0 divide-x divide-border">
            <div class="px-5 py-4 space-y-1.5">
              <label for="goal-amount" class="text-sm font-medium text-[var(--color-text-primary)]">Target amount</label>
              <input
                id="goal-amount"
                type="number"
                bind:value={formData.targetAmount}
                placeholder="0.00"
                min="0"
                step="0.01"
                required
                class="w-full rounded-xl border border-border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
              />
            </div>
            <div class="px-5 py-4 space-y-1.5">
              <label for="goal-currency" class="text-sm font-medium text-[var(--color-text-primary)]">Currency</label>
              <Select.Root type="single" bind:value={formData.currency}>
                <Select.Trigger id="goal-currency" class="w-full">
                  {formData.currency}
                </Select.Trigger>
                <Select.Content>
                  {#each currencies as curr}
                    <Select.Item value={curr.value}>{curr.label}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-0 divide-x divide-border">
            <div class="px-5 py-4 space-y-1.5">
              <label for="goal-category" class="text-sm font-medium text-[var(--color-text-primary)]">Category</label>
              <Select.Root type="single" bind:value={formData.category}>
                <Select.Trigger id="goal-category" class="w-full">
                  {goalCategories.find(c => c.value === formData.category)?.label || 'Select'}
                </Select.Trigger>
                <Select.Content>
                  {#each goalCategories as cat}
                    <Select.Item value={cat.value}>{cat.label}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
            </div>
            <div class="px-5 py-4 space-y-1.5">
              <label for="goal-priority" class="text-sm font-medium text-[var(--color-text-primary)]">Priority</label>
              <Select.Root type="single" bind:value={formData.priority}>
                <Select.Trigger id="goal-priority" class="w-full">
                  {goalPriorities.find(p => p.value === formData.priority)?.label || 'Select'}
                </Select.Trigger>
                <Select.Content>
                  {#each goalPriorities as pri}
                    <Select.Item value={pri.value}>{pri.label}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-0 divide-x divide-border">
            <div class="px-5 py-4 space-y-1.5">
              <label for="goal-date" class="text-sm font-medium text-[var(--color-text-primary)]">Target date <span class="text-[var(--color-text-tertiary)]">(optional)</span></label>
              <input
                id="goal-date"
                type="date"
                bind:value={formData.targetDate}
                class="w-full rounded-xl border border-border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
              />
            </div>
            <div class="px-5 py-4 space-y-1.5">
              <label for="goal-monthly" class="text-sm font-medium text-[var(--color-text-primary)]">Monthly contribution</label>
              <input
                id="goal-monthly"
                type="number"
                bind:value={formData.monthlyContribution}
                placeholder="0.00"
                min="0"
                step="0.01"
                class="w-full rounded-xl border border-border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
              />
            </div>
          </div>

          <div class="flex items-center justify-between px-5 py-4">
            <p class="text-sm font-medium text-[var(--color-text-primary)]">Recurring goal</p>
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                id="isRecurring"
                type="checkbox"
                bind:checked={formData.isRecurring}
                class="rounded accent-[var(--color-amber)]"
              />
            </label>
          </div>
        </div>

        <div class="flex gap-3">
          <button
            type="submit"
            disabled={isLoading}
            class="flex-1 rounded-xl bg-[var(--color-amber)] px-5 py-2.5 text-sm font-semibold text-[var(--color-bg-primary)] transition-opacity disabled:opacity-60"
          >
            {isLoading ? 'Creating…' : 'Create goal'}
          </button>
          <button
            type="button"
            onclick={handleCancel}
            disabled={isLoading}
            class="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-surface)] disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </form>
    {/if}
  </div>
</PageLayout>
