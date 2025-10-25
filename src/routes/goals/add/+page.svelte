<script lang="ts">
  import { goto } from '$app/navigation';
  import { PageLayout } from '$lib/components/layouts';
  import Header from '$lib/components/Header.svelte';
  import * as Card from '$lib/components/ui/card/index.ts';
  import * as Button from '$lib/components/ui/button/index.ts';
  import * as Input from '$lib/components/ui/input/index.ts';
  import * as Label from '$lib/components/ui/label/index.ts';
  import * as Textarea from '$lib/components/ui/textarea/index.ts';
  import * as Select from '$lib/components/ui/select/index.ts';
  import { ArrowLeft, Save } from '@lucide/svelte';
  import { goalsService } from '$lib/components/goals/goals-service';
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
  const goalCategories: { value: GoalCategory; label: string; icon: string }[] = [
    { value: 'emergency_fund', label: 'Emergency Fund', icon: '🛡️' },
    { value: 'vacation', label: 'Vacation', icon: '✈️' },
    { value: 'house_down_payment', label: 'House Down Payment', icon: '🏠' },
    { value: 'car_purchase', label: 'Car Purchase', icon: '🚗' },
    { value: 'education', label: 'Education', icon: '🎓' },
    { value: 'retirement', label: 'Retirement', icon: '💰' },
    { value: 'debt_payoff', label: 'Debt Payoff', icon: '💳' },
    { value: 'investment', label: 'Investment', icon: '📈' },
    { value: 'wedding', label: 'Wedding', icon: '💍' },
    { value: 'home_improvement', label: 'Home Improvement', icon: '🔨' },
    { value: 'other', label: 'Other', icon: '🎯' }
  ];

  // Goal priorities
  const goalPriorities: { value: GoalPriority; label: string; color: string }[] = [
    { value: 'low', label: 'Low', color: 'text-blue-600' },
    { value: 'medium', label: 'Medium', color: 'text-yellow-600' },
    { value: 'high', label: 'High', color: 'text-orange-600' },
    { value: 'critical', label: 'Critical', color: 'text-red-600' }
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
  <title>Add Goal | Budgic</title>
</svelte:head>

<PageLayout>
  {#snippet topBar()}
    <Header 
      title="Add Goal" 
      variant="default"
      buttonProps={[
        {
          onclick: handleCancel,
          size: "sm",
          icon: ArrowLeft,
          variant: "ghost"
        }
      ]}
    />
  {/snippet}

  {#snippet children()}
    <div class="p-6 max-w-2xl mx-auto">
      {#if success}
        <Card.Root class="mb-6">
          <Card.Content class="p-6 text-center">
            <div class="text-green-600 text-6xl mb-4">✅</div>
            <h3 class="text-xl font-semibold text-primary mb-2">Goal Created Successfully!</h3>
            <p class="text-muted-foreground">Redirecting to goals page...</p>
          </Card.Content>
        </Card.Root>
      {:else}
        <Card.Root>
          <Card.Header>
            <Card.Title>Create New Goal</Card.Title>
            <Card.Description>
              Set up a new financial goal to track your progress and stay motivated.
            </Card.Description>
          </Card.Header>
          <Card.Content class="space-y-6">
            {#if error}
              <div class="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p class="text-red-800 dark:text-red-200 text-sm">{error}</p>
              </div>
            {/if}

            <form onsubmit={handleSubmit} class="space-y-6">
              <!-- Goal Name -->
              <div class="space-y-2">
                <Label.Root for="name">Goal Name *</Label.Root>
                <Input.Root
                  id="name"
                  bind:value={formData.name}
                  placeholder="e.g., Emergency Fund, Vacation to Europe"
                  required
                />
              </div>

              <!-- Description -->
              <div class="space-y-2">
                <Label.Root for="description">Description</Label.Root>
                <Textarea.Root
                  id="description"
                  bind:value={formData.description}
                  placeholder="Optional description of your goal..."
                  rows={3}
                />
              </div>

              <!-- Target Amount and Currency -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="space-y-2">
                  <Label.Root for="targetAmount">Target Amount *</Label.Root>
                  <Input.Root
                    id="targetAmount"
                    type="number"
                    bind:value={formData.targetAmount}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    required
                  />
                </div>
                <div class="space-y-2">
                  <Label.Root for="currency">Currency</Label.Root>
                  <Select.Root type="single" bind:value={formData.currency}>
                    <Select.Trigger>
                      {formData.currency ? currencies.find(c => c.value === formData.currency)?.label : "Select currency"}
                    </Select.Trigger>
                    <Select.Content>
                      {#each currencies as currency}
                        <Select.Item value={currency.value}>{currency.label}</Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                </div>
              </div>

              <!-- Category and Priority -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="space-y-2">
                  <Label.Root for="category">Category</Label.Root>
                  <Select.Root type="single" bind:value={formData.category}>
                    <Select.Trigger>
                      {formData.category ? goalCategories.find(c => c.value === formData.category)?.label : "Select category"}
                    </Select.Trigger>
                    <Select.Content>
                      {#each goalCategories as category}
                        <Select.Item value={category.value}>
                          <span class="flex items-center gap-2">
                            <span>{category.icon}</span>
                            <span>{category.label}</span>
                          </span>
                        </Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                </div>
                <div class="space-y-2">
                  <Label.Root for="priority">Priority</Label.Root>
                  <Select.Root type="single" bind:value={formData.priority}>
                    <Select.Trigger>
                      {formData.priority ? goalPriorities.find(p => p.value === formData.priority)?.label : "Select priority"}
                    </Select.Trigger>
                    <Select.Content>
                      {#each goalPriorities as priority}
                        <Select.Item value={priority.value}>
                          <span class="flex items-center gap-2">
                            <span class={priority.color}>●</span>
                            <span>{priority.label}</span>
                          </span>
                        </Select.Item>
                      {/each}
                    </Select.Content>
                  </Select.Root>
                </div>
              </div>

              <!-- Target Date -->
              <div class="space-y-2">
                <Label.Root for="targetDate">Target Date</Label.Root>
                <Input.Root
                  id="targetDate"
                  type="date"
                  bind:value={formData.targetDate}
                />
                <p class="text-sm text-muted-foreground">Optional: When you want to achieve this goal</p>
              </div>

              <!-- Monthly Contribution -->
              <div class="space-y-2">
                <Label.Root for="monthlyContribution">Monthly Contribution</Label.Root>
                <Input.Root
                  id="monthlyContribution"
                  type="number"
                  bind:value={formData.monthlyContribution}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
                <p class="text-sm text-muted-foreground">Optional: How much you plan to contribute monthly</p>
              </div>

              <!-- Recurring Goal -->
              <div class="flex items-center space-x-2">
                <input
                  id="isRecurring"
                  type="checkbox"
                  bind:checked={formData.isRecurring}
                  class="rounded border-gray-300"
                />
                <Label.Root for="isRecurring">This is a recurring goal</Label.Root>
              </div>

              <!-- Action Buttons -->
              <div class="flex gap-3 pt-4">
                <Button.Root
                  type="submit"
                  disabled={isLoading}
                  class="flex-1"
                >
                  {#if isLoading}
                    <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Creating...
                  {:else}
                    <Save class="h-4 w-4 mr-2" />
                    Create Goal
                  {/if}
                </Button.Root>
                <Button.Root
                  type="button"
                  variant="outline"
                  onclick={handleCancel}
                  disabled={isLoading}
                >
                  Cancel
                </Button.Root>
              </div>
            </form>
          </Card.Content>
        </Card.Root>
      {/if}
    </div>
  {/snippet}
</PageLayout>
