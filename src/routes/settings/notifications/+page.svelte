<script lang="ts">
  import { goto } from '$app/navigation';
  import { PageLayout } from '$lib/components/layouts';
  import * as Card from '$lib/components/ui/card/index.ts';
  import * as Button from '$lib/components/ui/button/index.ts';
  import * as Alert from '$lib/components/ui/alert/index.ts';

  // State
  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);
</script>

<svelte:head>
  <title>Notification Settings | Budgic</title>
</svelte:head>

<PageLayout>
  <div class="container mx-auto px-4 py-6 max-w-4xl">
    <!-- Header -->
    <header class="mb-8">
      <div class="flex items-center gap-4 mb-4">
        <Button.Root variant="ghost" size="sm" onclick={() => goto('/settings')}>
          ← Back to Settings
        </Button.Root>
      </div>
      <h1 class="text-3xl font-bold text-primary mb-2">Notification Settings</h1>
      <p class="text-muted-foreground">Configure your notification preferences</p>
    </header>

    <!-- Coming Soon Notice -->
    <Card.Root>
      <Card.Header>
        <Card.Title>Coming Soon</Card.Title>
        <Card.Description>Notification settings are not yet implemented in the simplified schema</Card.Description>
      </Card.Header>
      <Card.Content>
        <div class="text-center py-8">
          <div class="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
            <svg class="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-5 5v-5zM4.828 7l2.586-2.586A2 2 0 018.828 4h6.344a2 2 0 011.414.586L19.172 7M4.828 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-.828M4.828 7v10a2 2 0 002 2h10.344a2 2 0 002-2V7" />
            </svg>
          </div>
          <h3 class="text-lg font-medium text-foreground mb-2">Notification Settings</h3>
          <p class="text-sm text-muted-foreground mb-4">
            This feature will be available in a future update. For now, you can manage basic preferences in the main settings page.
          </p>
          <Button.Root onclick={() => goto('/settings')}>
            Back to Settings
          </Button.Root>
        </div>
      </Card.Content>
    </Card.Root>
  </div>
</PageLayout>