<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { settingsService } from '$lib/core/services/settings-service';
  import { PageLayout } from '$lib/components/layouts';
  import * as Card from '$lib/components/ui/card/index.ts';
  import * as Button from '$lib/components/ui/button/index.ts';
  import { Switch } from '$lib/components/ui/switch/index.ts';
  import * as Alert from '$lib/components/ui/alert/index.ts';
  import { db } from '$lib/core/db';
  import type { UserPreferences } from '$lib/core/db';

  // State
  let isLoading = $state(true);
  let isSaving = $state(false);
  let isExporting = $state(false);
  let isImporting = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);
  
  // Data settings
  let autoImportEnabled = $state(false);
  let exportFormat = $state<'json' | 'csv' | 'pdf'>('json');
  let cacheEnabled = $state(true);
  let offlineModeEnabled = $state(false);


  // Export format options
  const exportFormatOptions = [
    { value: 'json', label: 'JSON', description: 'Complete data backup (recommended)' },
    { value: 'csv', label: 'CSV', description: 'Spreadsheet format for transactions' },
    { value: 'pdf', label: 'PDF', description: 'Readable report format' }
  ];

  // Load user preferences on mount
  onMount(async () => {
    try {
      const preferences = await settingsService.getUserPreferences();
      if (preferences) {
        autoImportEnabled = preferences.autoImportEnabled ?? false;
        exportFormat = preferences.exportFormat || 'json';
        cacheEnabled = preferences.cacheEnabled ?? true;
        offlineModeEnabled = preferences.offlineModeEnabled ?? false;
      }
    } catch (err) {
      error = 'Failed to load data settings';
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
      await settingsService.updateUserPreferences({
        autoImportEnabled,
        exportFormat,
        cacheEnabled,
        offlineModeEnabled
      });
      success = 'Data settings saved successfully';
    } catch (err) {
      error = 'Failed to save data settings';
      console.error('Error saving preferences:', err);
    } finally {
      isSaving = false;
    }
  }

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
        tags: await db.tags.toArray(),
        budgetCategories: await db.budgetCategories.toArray(),
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
      
      // Import settings if present
      if (data.settings) {
        await settingsService.importSettings(data.settings);
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
        db.bankTransactions.clear(),
        db.tags.clear(),
        db.budgetCategories.clear(),
        db.userPreferences.clear(),
        db.dynamicSettings.clear(),
        db.userActions.clear()
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

  // Reset to defaults
  function resetToDefaults() {
    autoImportEnabled = false;
    exportFormat = 'json';
    cacheEnabled = true;
    offlineModeEnabled = false;
  }
</script>

<svelte:head>
  <title>Data Management | Budgic</title>
</svelte:head>

<PageLayout>
  {#snippet bottomBar()}
    <!-- Bottom bar content can be added here if needed -->
  {/snippet}

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

      <!-- Data Settings -->
      <form onsubmit={(e) => { e.preventDefault(); savePreferences(); }} class="space-y-8">
        <!-- Data Preferences -->
        <Card.Root>
          <Card.Header>
            <Card.Title>Data Preferences</Card.Title>
            <Card.Description>Configure how your data is handled</Card.Description>
          </Card.Header>
          <Card.Content class="space-y-6">
            <div class="flex items-center justify-between space-x-4">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 min-w-10 min-h-10 bg-accent rounded-lg flex items-center justify-center text-accent-foreground">
                  📥
                </div>
                <div>
                  <div class="font-medium text-primary">Auto Import</div>
                  <div class="text-sm text-muted-foreground">Automatically import data from connected accounts</div>
                </div>
              </div>
              <Switch
                bind:checked={autoImportEnabled}
                aria-label="Toggle auto import"
              />
            </div>

            <div class="flex items-center justify-between space-x-4">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 min-w-10 min-h-10 bg-accent rounded-lg flex items-center justify-center text-accent-foreground">
                  💾
                </div>
                <div>
                  <div class="font-medium text-primary">Cache Enabled</div>
                  <div class="text-sm text-muted-foreground">Store frequently accessed data for faster performance</div>
                </div>
              </div>
              <Switch
                bind:checked={cacheEnabled}
                aria-label="Toggle cache"
              />
            </div>

            <div class="flex items-center justify-between space-x-4">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 min-w-10 min-h-10 bg-accent rounded-lg flex items-center justify-center text-accent-foreground">
                  📱
                </div>
                <div>
                  <div class="font-medium text-primary">Offline Mode</div>
                  <div class="text-sm text-muted-foreground">Work without internet connection</div>
                </div>
              </div>
              <Switch
                bind:checked={offlineModeEnabled}
                aria-label="Toggle offline mode"
              />
            </div>

            <div class="space-y-2">
              <label for="export-format-select" class="text-sm font-medium text-primary">Default Export Format</label>
              <select 
                id="export-format-select"
                bind:value={exportFormat}
                class="max-w-md w-full px-3 py-2 border border-input rounded-md bg-background text-primary"
              >
                {#each exportFormatOptions as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </div>
          </Card.Content>
        </Card.Root>

        <!-- Export Data -->
        <Card.Root>
          <Card.Header>
            <Card.Title>Export Data</Card.Title>
            <Card.Description>Download your financial data for backup or migration</Card.Description>
          </Card.Header>
          <Card.Content class="space-y-4">
            <div class="flex items-center gap-4">
              <Button.Root 
                type="button" 
                onclick={exportData}
                disabled={isExporting}
              >
                {#if isExporting}
                  <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                {/if}
                Export Data
              </Button.Root>
              <span class="text-sm text-muted-foreground">
                Downloads all your data in {exportFormat.toUpperCase()} format
              </span>
            </div>
          </Card.Content>
        </Card.Root>

        <!-- Import Data -->
        <Card.Root>
          <Card.Header>
            <Card.Title>Import Data</Card.Title>
            <Card.Description>Restore data from a previous export</Card.Description>
          </Card.Header>
          <Card.Content class="space-y-4">
            <div class="flex items-center gap-4">
              <input
                type="file"
                accept=".json"
                onchange={importData}
                disabled={isImporting}
                class="hidden"
                id="import-file"
              />
              <Button.Root 
                type="button" 
                variant="outline"
                onclick={() => document.getElementById('import-file')?.click()}
                disabled={isImporting}
              >
                {#if isImporting}
                  <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                {/if}
                Import Data
              </Button.Root>
              <span class="text-sm text-muted-foreground">
                Select a JSON export file to restore
              </span>
            </div>
          </Card.Content>
        </Card.Root>

        <!-- Account Management -->
        <Card.Root>
          <Card.Header>
            <Card.Title>Account Management</Card.Title>
            <Card.Description>Manage your accounts and financial data</Card.Description>
          </Card.Header>
          <Card.Content class="space-y-4">
            <div class="flex items-center gap-4">
              <Button.Root 
                type="button" 
                variant="outline"
                onclick={() => goto('/accounts')}
              >
                Manage Accounts
              </Button.Root>
              <span class="text-sm text-muted-foreground">
                Add, edit, or remove your financial accounts
              </span>
            </div>
            
            <div class="flex items-center gap-4">
              <Button.Root 
                type="button" 
                variant="outline"
                onclick={() => goto('/budget')}
              >
                Manage Categories
              </Button.Root>
              <span class="text-sm text-muted-foreground">
                Organize your budget categories and tags
              </span>
            </div>
          </Card.Content>
        </Card.Root>

        <!-- Danger Zone -->
        <Card.Root>
          <Card.Header>
            <Card.Title class="text-destructive">Danger Zone</Card.Title>
            <Card.Description>Irreversible actions that will permanently delete data</Card.Description>
          </Card.Header>
          <Card.Content class="space-y-4">
            <div class="flex items-center gap-4">
              <Button.Root 
                type="button" 
                variant="destructive"
                onclick={clearAllData}
              >
                Delete All Data
              </Button.Root>
              <span class="text-sm text-destructive/80">
                Permanently delete all accounts, transactions, and settings
              </span>
            </div>
          </Card.Content>
        </Card.Root>

        <!-- Actions -->
        <div class="flex gap-4">
          <Button.Root type="submit" disabled={isSaving}>
            {#if isSaving}
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
            {/if}
            Save Changes
          </Button.Root>
          
          <Button.Root type="button" variant="outline" onclick={resetToDefaults}>
            Reset to Defaults
          </Button.Root>
        </div>
      </form>
    {/if}
  </div>
</PageLayout>
