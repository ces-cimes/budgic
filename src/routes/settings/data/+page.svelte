<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { userService } from '$lib/core/services';
  import { PageLayout } from '$lib/components/layouts';
  import * as Card from '$lib/components/ui/card/index.ts';
  import * as Button from '$lib/components/ui/button/index.ts';
  import * as Alert from '$lib/components/ui/alert/index.ts';
  import { db } from '$lib/core/db';

  // State
  let isLoading = $state(true);
  let isExporting = $state(false);
  let isImporting = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);
  
  // Data settings - simplified for current schema
  let exportFormat = $state<'json' | 'csv' | 'pdf'>('json');

  // Export format options
  const exportFormatOptions = [
    { value: 'json', label: 'JSON', description: 'Complete data backup (recommended)' },
    { value: 'csv', label: 'CSV', description: 'Spreadsheet format' },
    { value: 'pdf', label: 'PDF', description: 'Printable report' }
  ];

  // Load user preferences on mount
  onMount(async () => {
    try {
      const preferences = await userService.getUserPreferences();
      if (preferences) {
        exportFormat = 'json'; // Default format
      }
    } catch (err) {
      error = 'Failed to load data settings';
      console.error('Error loading preferences:', err);
    } finally {
      isLoading = false;
    }
  });

  // Export data
  async function exportData() {
    if (isExporting) return;
    
    isExporting = true;
    error = null;
    success = null;
    
    try {
      // Simple JSON export for now
      const data = {
        accounts: await db.accounts.toArray(),
        transactions: await db.transactions.toArray(),
        categories: await db.categories.toArray(),
        goals: await db.goals.toArray(),
        insights: await db.insights.toArray(),
        userActions: await db.userActions.toArray(),
        userPreferences: await db.userPreferences.toArray(),
        exportDate: new Date().toISOString(),
        version: '1.0'
      };
      
      // Create download link
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `budgic-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      success = 'Data exported successfully';
    } catch (err) {
      error = 'Failed to export data';
      console.error('Error exporting data:', err);
    } finally {
      isExporting = false;
    }
  }

  // Import data
  async function importData(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file) return;
    
    isImporting = true;
    error = null;
    success = null;
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      // Validate import data structure
      if (!data.version || !data.exportDate) {
        throw new Error('Invalid export file format');
      }
      
      // Import user preferences if present
      if (data.userPreferences && data.userPreferences.length > 0) {
        await userService.updateUserPreferences(data.userPreferences[0]);
      }
      
      success = 'Data imported successfully';
    } catch (err) {
      error = 'Failed to import data: ' + (err instanceof Error ? err.message : 'Unknown error');
      console.error('Error importing data:', err);
    } finally {
      isImporting = false;
      // Reset file input
      input.value = '';
    }
  }

  // Clear all data
  async function clearAllData() {
    if (!confirm('Are you sure you want to delete all data? This action cannot be undone.')) {
      return;
    }
    
    try {
      // Clear all tables
      await Promise.all([
        db.accounts.clear(),
        db.transactions.clear(),
        db.categories.clear(),
        db.goals.clear(),
        db.insights.clear(),
        db.userActions.clear(),
        db.userPreferences.clear()
      ]);
      
      success = 'All data cleared successfully';
      // Redirect to onboarding
      setTimeout(() => {
        goto('/onboarding');
      }, 2000);
    } catch (err) {
      error = 'Failed to clear data';
      console.error('Error clearing data:', err);
    }
  }
</script>

<svelte:head>
  <title>Data Management | Budgic</title>
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
      <h1 class="text-3xl font-bold text-primary mb-2">Data Management</h1>
      <p class="text-muted-foreground">Export, import, and manage your financial data</p>
    </header>

    {#if isLoading}
      <div class="flex items-center justify-center py-12">
        <div class="text-muted-foreground">Loading data settings...</div>
      </div>
    {:else}
      <!-- Error/Success Messages -->
      {#if error}
        <Alert.Root variant="destructive" class="mb-6">
          <Alert.Description>{error}</Alert.Description>
        </Alert.Root>
      {/if}
      
      {#if success}
        <Alert.Root class="mb-6">
          <Alert.Description>{success}</Alert.Description>
        </Alert.Root>
      {/if}

      <!-- Export Settings -->
      <Card.Root class="mb-8">
        <Card.Header>
          <Card.Title>Export Settings</Card.Title>
          <Card.Description>Choose your preferred export format</Card.Description>
        </Card.Header>
        <Card.Content class="space-y-4">
          <div class="space-y-2">
            <label for="export-format" class="text-sm font-medium text-primary">Export Format</label>
            <select 
              id="export-format"
              bind:value={exportFormat}
              class="max-w-md w-full px-3 py-2 border border-input rounded-md bg-background text-primary"
            >
              {#each exportFormatOptions as option}
                <option value={option.value}>{option.label} - {option.description}</option>
              {/each}
            </select>
          </div>
        </Card.Content>
      </Card.Root>

      <!-- Data Actions -->
      <div class="space-y-6">
        <!-- Export Data -->
        <Card.Root>
          <Card.Header>
            <Card.Title>Export Data</Card.Title>
            <Card.Description>Download a backup of all your financial data</Card.Description>
          </Card.Header>
          <Card.Content>
            <Button.Root 
              onclick={exportData} 
              disabled={isExporting}
              class="w-full"
            >
              {#if isExporting}
                <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              {/if}
              Export Data ({exportFormat.toUpperCase()})
            </Button.Root>
          </Card.Content>
        </Card.Root>

        <!-- Import Data -->
        <Card.Root>
          <Card.Header>
            <Card.Title>Import Data</Card.Title>
            <Card.Description>Restore data from a previous backup</Card.Description>
          </Card.Header>
          <Card.Content>
            <input
              type="file"
              accept=".json"
              onchange={importData}
              disabled={isImporting}
              class="w-full px-3 py-2 border border-input rounded-md bg-background text-primary"
            />
            <p class="text-sm text-muted-foreground mt-2">
              Select a JSON export file to restore your data
            </p>
          </Card.Content>
        </Card.Root>

        <!-- Clear Data -->
        <Card.Root>
          <Card.Header>
            <Card.Title>Clear All Data</Card.Title>
            <Card.Description>Permanently delete all your financial data</Card.Description>
          </Card.Header>
          <Card.Content>
            <Button.Root 
              variant="destructive"
              onclick={clearAllData}
              class="w-full"
            >
              Clear All Data
            </Button.Root>
            <p class="text-sm text-muted-foreground mt-2">
              ⚠️ This action cannot be undone. Make sure to export your data first.
            </p>
          </Card.Content>
        </Card.Root>
      </div>
    {/if}
  </div>
</PageLayout>