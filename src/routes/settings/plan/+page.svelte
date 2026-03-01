<script lang="ts">
  import { goto } from '$app/navigation';
  import { userService } from '$lib/core/services/index.ts';
  import type { NegativeAllowanceHandling } from '$lib/core/services/core/negative-allowance-service';
  import { Input } from '$lib/components/ui/input/index.ts';
  import { Label } from '$lib/components/ui/label/index.ts';
  import * as Button from '$lib/components/ui/button/index.ts';
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger
  } from '$lib/components/ui/select/index.ts';
  import { onMount } from 'svelte';
  import Header from '$lib/components/Header.svelte';
  import { PageLayout } from '$lib/components/layouts';
  import * as Card from '$lib/components/ui/card/index.ts';

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

  <div class="container mx-auto max-w-2xl p-4">
    {#if isLoading}
      <div class="text-muted-foreground py-8 text-center">Loading…</div>
    {:else}
      <Card.Root class="border-border">
        <Card.Header>
          <Card.Title>Negative allowance</Card.Title>
          <Card.Description>When spending exceeds your allowance this period</Card.Description>
        </Card.Header>
        <Card.Content class="space-y-4">
          <div class="space-y-2">
            <Label for="negative-allowance-handling">Handling</Label>
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
            <p class="text-muted-foreground text-xs">"Allow with strong warning" shows a prominent warning and recovery suggestions without blocking.</p>
          </div>

          <div class="space-y-4 border-t border-border pt-4">
            <h3 class="text-sm font-medium">Envelope borrowing limits</h3>
            <p class="text-muted-foreground text-xs">When you use "Borrow from other categories", these limits apply.</p>
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="space-y-2">
                <Label for="envelope-borrow-max-pct">Max borrow per category (% of next period)</Label>
                <Input id="envelope-borrow-max-pct" type="number" min="0" max="100" bind:value={envelopeBorrowMaxPerCategoryPercent} class="max-w-[120px]" />
              </div>
              <div class="space-y-2">
                <Label for="envelope-borrow-repayment">Repayment periods</Label>
                <Input id="envelope-borrow-repayment" type="number" min="1" max="6" bind:value={envelopeBorrowRepaymentPeriods} class="max-w-[80px]" />
              </div>
            </div>
            <div class="space-y-2">
              <Label for="envelope-borrow-total-limit">Total borrowing limit (optional)</Label>
              <Input id="envelope-borrow-total-limit" type="number" min="0" placeholder="No limit" bind:value={envelopeBorrowTotalLimit} class="max-w-[140px]" />
            </div>
            <div class="flex items-center gap-2">
              <input type="checkbox" id="envelope-borrow-confirm-repeated" bind:checked={envelopeBorrowRequireConfirmationRepeated} class="rounded border-input" />
              <Label for="envelope-borrow-confirm-repeated">Require confirmation for repeated borrowing</Label>
            </div>
          </div>

          <div class="space-y-4 border-t border-border pt-4">
            <h3 class="text-sm font-medium">Rollover (period end)</h3>
            <p class="text-muted-foreground text-xs">What to do with leftover or overspent allowance at the end of each period.</p>
            <div class="space-y-2">
              <Label for="rollover-surplus">Surplus (unspent)</Label>
              <Select type="single" value={rolloverSurplusBehavior} onValueChange={(v) => v && (rolloverSurplusBehavior = v as typeof rolloverSurplusBehavior)}>
                <SelectTrigger id="rollover-surplus" class="max-w-md">
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
              <div class="space-y-2">
                <Label for="rollover-hybrid-ratio">Share to next period (%)</Label>
                <Input id="rollover-hybrid-ratio" type="number" min="0" max="100" bind:value={rolloverSurplusHybridRatio} class="max-w-[80px]" />
              </div>
            {/if}
            <div class="space-y-2">
              <Label for="rollover-deficit">Deficit (overspent)</Label>
              <Select type="single" value={rolloverDeficitBehavior} onValueChange={(v) => v && (rolloverDeficitBehavior = v as typeof rolloverDeficitBehavior)}>
                <SelectTrigger id="rollover-deficit" class="max-w-md">
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

          <div class="space-y-4 border-t border-border pt-4">
            <h3 class="text-sm font-medium">Savings opportunities</h3>
            <p class="text-muted-foreground text-xs">Suggest contributing surplus to goals when projected surplus exceeds this amount.</p>
            <div class="space-y-2">
              <Label for="savings-opportunity-threshold">Minimum surplus to suggest</Label>
              <Input id="savings-opportunity-threshold" type="number" min="0" step="10" placeholder="50" bind:value={savingsOpportunityMinSurplus} class="max-w-[140px]" />
            </div>
          </div>

          <div class="border-t border-border pt-4">
            <p class="text-muted-foreground mb-2 text-sm">Occasion awareness uses recurring spending events to adjust your allowance.</p>
            <Button.Root variant="outline" size="sm" onclick={() => goto('/settings/occasions')}>
              Manage occasions
            </Button.Root>
          </div>
        </Card.Content>
      </Card.Root>

      <Button.Root variant="ghost" class="mt-4" onclick={() => goto('/settings')}>← Back to Settings</Button.Root>
    {/if}
  </div>
</PageLayout>
