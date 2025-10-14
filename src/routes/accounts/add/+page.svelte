<script lang="ts">
  import { goto } from '$app/navigation';
  import * as Button from '$lib/components/ui/button/index.ts';
  import { accountService } from '$lib/core/services/account-service';
  import AccountForm from '$lib/components/AccountForm.svelte';
  import type { Account } from '$lib/core/db';
  import { PageLayout, MobileNavigation } from '$lib/components/layouts';
  import * as Sidebar from '$lib/components/ui/sidebar/index.ts';

  async function handleSubmit(accountData: Partial<Account>) {
    // Create account using the account service
    const newAccount = await accountService.createAccount(accountData);
    console.log('Account created successfully:', newAccount);
    
    // Navigate back to accounts page
    goto('/accounts');
  }

  function handleCancel() {
    goto('/accounts');
  }

  // Sidebar context for mobile detection
  const sidebar = Sidebar.useSidebar();
</script>

<svelte:head>
  <title>Add Account | Budgic</title>
</svelte:head>

<PageLayout>
  {#snippet bottomBar()}
    <!-- Mobile Navigation -->
    {#if sidebar.isMobile}
      <MobileNavigation />
    {/if}
  {/snippet}

  <div class="container mx-auto px-4 py-6 max-w-2xl">
  <!-- Header -->
  <header class="mb-8">
    <Button.Root 
      variant="ghost"
      onclick={handleCancel}
      class="flex items-center space-x-2 text-muted-foreground hover:text-primary mb-4"
    >
      <span>←</span>
      <span>Back to Accounts</span>
    </Button.Root>
    <h1 class="text-3xl font-bold text-primary mb-2">Add New Account</h1>
    <p class="text-muted-foreground">Create a new financial account to track</p>
  </header>

  <!-- Account Form -->
  <AccountForm 
    onSubmit={handleSubmit}
    onCancel={handleCancel}
    submitLabel="Create Account"
    cancelLabel="Cancel"
  />
  </div>
</PageLayout> 