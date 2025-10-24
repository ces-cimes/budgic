<script lang="ts">
  import { goto } from '$app/navigation';
  import * as Button from '$lib/components/ui/button/index.ts';
  import { accountService } from '$lib/core/services/account-service';
  import AccountForm from '$lib/components/AccountForm.svelte';
  import type { Account } from '$lib/core/db';
  import Header from '$lib/components/Header.svelte';
  import { PageLayout } from '$lib/components/layouts';

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

</script>

<svelte:head>
  <title>Add Account | Budgic</title>
</svelte:head>

<PageLayout>
  {#snippet topBar()}
    <!-- Header -->
    <Header title="Add Account" showBackButton={true} backButtonLink="/accounts" />
  {/snippet}

  

  <div class="container mx-auto px-4 py-6 max-w-2xl">

  <!-- Account Form -->
  <AccountForm 
    onSubmit={handleSubmit}
    onCancel={handleCancel}
    submitLabel="Create Account"
    cancelLabel="Cancel"
  />
  </div>
</PageLayout> 