<script lang="ts">
  import { goto } from '$app/navigation';
  import { userService } from '$lib/core/services/index.ts';
  import type { NegativeAllowanceHandling } from '$lib/core/services/core/negative-allowance-service';
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger
  } from '$lib/components/ui/select/index.ts';
  import { onMount } from 'svelte';
  import Header from '$lib/components/Header.svelte';
  import { PageLayout } from '$lib/components/layouts';

  const NEGATIVE_ALLOWANCE_LABELS: Record<NegativeAllowanceHandling, string> = {
    block_with_warning: 'Block with warning – alert and require override',
    allow_with_strong_warning: 'Allow with strong warning – permit but flag for review (default)',
    borrow_from_future: "Borrow from future – use next period's allowance",
    borrow_from_other_categories: 'Borrow from other categories – envelope borrowing'
  };

  let isLoading = $state(true);
  let isSaving = $state(false);
  let negativeAllowanceHandling = $state<NegativeAllowanceHandling>('allow_with_strong_warning');
  let envelopeBorrowMaxPerCategoryPercent = $state(50);
  let envelopeBorrowRepaymentPeriods = $state(2);
  let envelopeBorrowTotalLimit = $state<string>('');
  let envelopeBorrowRequireConfirmationRepeated = $state(true);
  let rolloverSurplusBehavior = $state<'rollover_next' | 'to_savings_goals' | 'hybrid'>('rollover_next');
  let rolloverSurplusHybridRatio = $state(50);
  let rolloverDeficitBehavior = $state<'reduce_next_period' | 'borrow_from_other' | 'one_time_exception'>('reduce_next_period');
  let savingsOpportunityMinSurplus = $state<string>('');

  onMount(async () => {
    try {
      const prefs = await userService.getUserPreferences();
      if (prefs) {
        negativeAllowanceHandling = (prefs as { negativeAllowanceHandling?: NegativeAllowanceHandling }).negativeAllowanceHandling ?? 'allow_with_strong_warning';
        const p = prefs as Record<string, unknown>;
        envelopeBorrowMaxPerCategoryPercent = Math.round((typeof p.envelopeBorrowMaxPerCategoryPercent === 'number' ? p.envelopeBorrowMaxPerCategoryPercent : 0.5) * 100);
        envelopeBorrowRepaymentPeriods = (p.envelopeBorrowRepaymentPeriods as number) ?? 2;
        envelopeBorrowTotalLimit = (p.envelopeBorrowTotalLimit as number) != null ? String(p.envelopeBorrowTotalLimit) : '';
        envelopeBorrowRequireConfirmationRepeated = (p.envelopeBorrowRequireConfirmationRepeated as boolean) ?? true;
        const rsb = p.rolloverSurplusBehavior;
        rolloverSurplusBehavior = (rsb === 'rollover_next' || rsb === 'to_savings_goals' || rsb === 'hybrid') ? rsb : 'rollover_next';
        rolloverSurplusHybridRatio = typeof p.rolloverSurplusHybridRatio === 'number' ? Math.round(p.rolloverSurplusHybridRatio * 100) : 50;
        const rdb = p.rolloverDeficitBehavior;
        rolloverDeficitBehavior = (rdb === 'reduce_next_period' || rdb === 'borrow_from_other' || rdb === 'one_time_exception') ? rdb : 'reduce_next_period';
        savingsOpportunityMinSurplus = typeof p.savingsOpportunityMinSurplus === 'number' ? String(p.savingsOpportunityMinSurplus) : '';
      }
    } catch (e) {
      console.error('Failed to load plan settings', e);
    } finally {
      isLoading = false;
    }
  });

  async function save() {
    if (isSaving) return;
    isSaving = true;
    try {
      const prefs = await userService.getUserPreferences();
      if (!prefs) return;
      await userService.updateUserPreferences({
        ...prefs,
        negativeAllowanceHandling,
        envelopeBorrowMaxPerCategoryPercent: envelopeBorrowMaxPerCategoryPercent / 100,
        envelopeBorrowRepaymentPeriods,
        envelopeBorrowTotalLimit: envelopeBorrowTotalLimit === '' ? undefined : Number(envelopeBorrowTotalLimit),
        envelopeBorrowRequireConfirmationRepeated,
        rolloverSurplusBehavior,
        rolloverSurplusHybridRatio: rolloverSurplusHybridRatio / 100,
        rolloverDeficitBehavior,
        savingsOpportunityMinSurplus:
          savingsOpportunityMinSurplus !== '' && !Number.isNaN(Number(savingsOpportunityMinSurplus))
            ? Number(savingsOpportunityMinSurplus)
            : undefined
      });
    } catch (e) {
      console.error('Failed to save plan settings', e);
    } finally {
      isSaving = false;
    }
  }
</script>

<svelte:head>
  <title>Budget & Allowance | Settings | Budgic</title>
</svelte:head>

<PageLayout>
  {#snippet topBar()}
    <Header
      title="Budget & allowance"
      buttonProps={[
        { text: 'Save', onclick: save, size: 'sm', disabled: isSaving }
      ]}
    />
  {/snippet}

  <div class="mx-auto max-w-2xl px-4 py-6">
    {#if isLoading}
      <div class="h-96 animate-pulse rounded-2xl bg-[var(--color-bg-tertiary)]"></div>
    {:else}
      <div class="space-y-6">
        <!-- Negative allowance -->
        <div class="rounded-2xl border border-border bg-[var(--color-bg-tertiary)] overflow-hidden">
          <div class="px-5 py-3 border-b border-border">
            <h2 class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Negative allowance</h2>
            <p class="text-xs text-[var(--color-text-tertiary)] mt-0.5">When spending exceeds your allowance this period</p>
          </div>
          <div class="px-5 py-4 space-y-2">
            <label for="negative-allowance-handling" class="text-sm font-medium text-[var(--color-text-primary)]">Handling</label>
            <Select
              type="single"
              value={negativeAllowanceHandling}
              onValueChange={(v) => v && (negativeAllowanceHandling = v as NegativeAllowanceHandling)}
            >
              <SelectTrigger id="negative-allowance-handling" class="max-w-md" aria-label="Choose how to handle overspending">
                {NEGATIVE_ALLOWANCE_LABELS[negativeAllowanceHandling] ?? 'Choose behaviour'}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="block_with_warning">{NEGATIVE_ALLOWANCE_LABELS.block_with_warning}</SelectItem>
                <SelectItem value="allow_with_strong_warning">{NEGATIVE_ALLOWANCE_LABELS.allow_with_strong_warning}</SelectItem>
                <SelectItem value="borrow_from_future">{NEGATIVE_ALLOWANCE_LABELS.borrow_from_future}</SelectItem>
                <SelectItem value="borrow_from_other_categories">{NEGATIVE_ALLOWANCE_LABELS.borrow_from_other_categories}</SelectItem>
              </SelectContent>
            </Select>
            <p class="text-xs text-[var(--color-text-tertiary)]">"Allow with strong warning" permits spending but surfaces recovery suggestions.</p>
          </div>
        </div>

        <!-- Envelope borrowing -->
        <div class="rounded-2xl border border-border bg-[var(--color-bg-tertiary)] overflow-hidden">
          <div class="px-5 py-3 border-b border-border">
            <h2 class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Envelope borrowing limits</h2>
            <p class="text-xs text-[var(--color-text-tertiary)] mt-0.5">Applies when "Borrow from other categories" is selected</p>
          </div>
          <div class="px-5 py-4 space-y-4">
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="space-y-1.5">
                <label for="envelope-borrow-max-pct" class="text-sm font-medium text-[var(--color-text-primary)]">Max per category (%)</label>
                <input id="envelope-borrow-max-pct" type="number" min="0" max="100" bind:value={envelopeBorrowMaxPerCategoryPercent}
                  class="w-24 rounded-xl border border-border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]" />
              </div>
              <div class="space-y-1.5">
                <label for="envelope-borrow-repayment" class="text-sm font-medium text-[var(--color-text-primary)]">Repayment periods</label>
                <input id="envelope-borrow-repayment" type="number" min="1" max="6" bind:value={envelopeBorrowRepaymentPeriods}
                  class="w-20 rounded-xl border border-border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]" />
              </div>
            </div>
            <div class="space-y-1.5">
              <label for="envelope-borrow-total-limit" class="text-sm font-medium text-[var(--color-text-primary)]">Total borrowing limit (optional)</label>
              <input id="envelope-borrow-total-limit" type="number" min="0" placeholder="No limit" bind:value={envelopeBorrowTotalLimit}
                class="w-36 rounded-xl border border-border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]" />
            </div>
            <label class="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" id="envelope-borrow-confirm-repeated" bind:checked={envelopeBorrowRequireConfirmationRepeated}
                class="rounded border-border accent-[var(--color-amber)]" />
              <span class="text-sm text-[var(--color-text-primary)]">Require confirmation for repeated borrowing</span>
            </label>
          </div>
        </div>

        <!-- Rollover -->
        <div class="rounded-2xl border border-border bg-[var(--color-bg-tertiary)] overflow-hidden">
          <div class="px-5 py-3 border-b border-border">
            <h2 class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Rollover at period end</h2>
            <p class="text-xs text-[var(--color-text-tertiary)] mt-0.5">What to do with leftover or overspent allowance</p>
          </div>
          <div class="px-5 py-4 space-y-4">
            <div class="space-y-1.5">
              <label for="rollover-surplus" class="text-sm font-medium text-[var(--color-text-primary)]">Surplus (unspent)</label>
              <Select type="single" value={rolloverSurplusBehavior} onValueChange={(v) => v && (rolloverSurplusBehavior = v as typeof rolloverSurplusBehavior)}>
                <SelectTrigger id="rollover-surplus" class="max-w-sm">
                  {rolloverSurplusBehavior === 'rollover_next' ? 'Roll over to next period' : rolloverSurplusBehavior === 'to_savings_goals' ? 'Reallocate to savings goals' : 'Hybrid (split)'}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rollover_next">Roll over to next period</SelectItem>
                  <SelectItem value="to_savings_goals">Reallocate to savings goals</SelectItem>
                  <SelectItem value="hybrid">Hybrid (split)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {#if rolloverSurplusBehavior === 'hybrid'}
              <div class="space-y-1.5">
                <label for="rollover-hybrid-ratio" class="text-sm font-medium text-[var(--color-text-primary)]">Share to next period (%)</label>
                <input id="rollover-hybrid-ratio" type="number" min="0" max="100" bind:value={rolloverSurplusHybridRatio}
                  class="w-20 rounded-xl border border-border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]" />
              </div>
            {/if}
            <div class="space-y-1.5">
              <label for="rollover-deficit" class="text-sm font-medium text-[var(--color-text-primary)]">Deficit (overspent)</label>
              <Select type="single" value={rolloverDeficitBehavior} onValueChange={(v) => v && (rolloverDeficitBehavior = v as typeof rolloverDeficitBehavior)}>
                <SelectTrigger id="rollover-deficit" class="max-w-sm">
                  {rolloverDeficitBehavior === 'reduce_next_period' ? 'Reduce next period allowance' : rolloverDeficitBehavior === 'borrow_from_other' ? 'Borrow from other categories' : 'One-time exception'}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reduce_next_period">Reduce next period allowance</SelectItem>
                  <SelectItem value="borrow_from_other">Borrow from other categories</SelectItem>
                  <SelectItem value="one_time_exception">One-time exception (no adjustment)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <!-- Savings opportunities -->
        <div class="rounded-2xl border border-border bg-[var(--color-bg-tertiary)] overflow-hidden">
          <div class="px-5 py-3 border-b border-border">
            <h2 class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Savings opportunities</h2>
            <p class="text-xs text-[var(--color-text-tertiary)] mt-0.5">Suggest contributing surplus to goals</p>
          </div>
          <div class="px-5 py-4 space-y-1.5">
            <label for="savings-opportunity-threshold" class="text-sm font-medium text-[var(--color-text-primary)]">Minimum surplus to suggest</label>
            <input id="savings-opportunity-threshold" type="number" min="0" step="10" placeholder="50" bind:value={savingsOpportunityMinSurplus}
              class="w-36 rounded-xl border border-border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]" />
          </div>
        </div>

        <!-- Occasions link -->
        <div class="rounded-2xl border border-border bg-[var(--color-bg-tertiary)] px-5 py-4 flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-[var(--color-text-primary)]">Occasions</p>
            <p class="text-xs text-[var(--color-text-tertiary)] mt-0.5">Recurring spending events that adjust your allowance</p>
          </div>
          <button
            type="button"
            onclick={() => goto('/settings/occasions')}
            class="rounded-xl border border-border px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-surface)]"
          >
            Manage
          </button>
        </div>
      </div>
    {/if}
  </div>
</PageLayout>

