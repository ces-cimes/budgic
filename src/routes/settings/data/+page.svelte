<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { userService } from '$lib/core/services';
  import { PageLayout } from '$lib/components/layouts';
  import * as Card from '$lib/components/ui/card/index.ts';
  import * as Button from '$lib/components/ui/button/index.ts';
  import * as Alert from '$lib/components/ui/alert/index.ts';
  import * as Select from '$lib/components/ui/select/index.ts';
  import { Checkbox } from '$lib/components/ui/checkbox/index.ts';
  import { Input } from '$lib/components/ui/input/index.ts';
  import { db } from '$lib/core/db';
  import { 
    MoneyManagerImporter, 
    readMultipleCSVFiles, 
    inspectSchema,
    type ImportResult,
    type ImportProgress,
    type DetectedSchema
  } from '$lib/core/services/import-export';
  import { pickFile, pickMultipleFiles } from '$lib/utils/file-picker-utils';

  // State
  let isLoading = $state(true);
  let isExporting = $state(false);
  let isImporting = $state(false);
  let isImportingMM = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);
  
  // Data settings - simplified for current schema
  let exportFormat = $state<'json' | 'csv' | 'pdf'>('json');

  // Money Manager import state
  let mmFiles = $state<File[]>([]);
  let mmSchema = $state<DetectedSchema | null>(null);
  let mmImportOptions = $state({
    importAccounts: true,
    importCategories: true,
    importTransactions: true,
    importCurrencies: true,
    importBudgets: false,
    conflictResolution: 'skip' as 'skip' | 'rename' | 'merge' | 'replace',
    transactionDateStart: '',
    transactionDateEnd: ''
  });
  let mmProgress = $state<ImportProgress | null>(null);
  let mmResult = $state<ImportResult | null>(null);
  let showMMImport = $state(false);

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
  async function importData() {
    isImporting = true;
    error = null;
    success = null;
    
    try {
      const file = await pickFile({
        types: ['application/json'],
        extensions: ['.json']
      });
      
      if (!file) {
        // User cancelled
        isImporting = false;
        return;
      }
      
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
    }
  }

  // Handle Money Manager file selection
  async function handleMMFileSelection() {
    if (mmFiles.length === 0) {
      mmSchema = null;
      return;
    }

    try {
      const csvFiles = await readMultipleCSVFiles(mmFiles);
      const schema = inspectSchema(csvFiles, 'money-manager-csv');
      mmSchema = schema;

      if (!schema.isValid) {
        error = `Missing required tables: ${schema.missingTables.join(', ')}`;
      } else {
        error = null;
      }
    } catch (err) {
      error = `Failed to analyze CSV files: ${err instanceof Error ? err.message : 'Unknown error'}`;
      mmSchema = null;
    }
  }

  // Pick Money Manager CSV files
  async function pickMMFiles() {
    try {
      console.log('Picking CSV files...');
      const files = await pickMultipleFiles({
        types: ['text/csv'],
        extensions: ['.csv']
      });
      
      console.log('Picked files:', files.length, files.map(f => ({ name: f.name, size: f.size })));
      
      if (files.length > 0) {
        mmFiles = files;
        console.log('mmFiles updated:', mmFiles.length, mmFiles.map(f => ({ name: f.name, size: f.size })));
        await handleMMFileSelection();
      } else {
        console.log('No files selected or user cancelled');
      }
    } catch (err) {
      error = `Failed to pick files: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error('Error picking files:', err);
    }
  }

  // Handle Money Manager import
  async function handleMMImport() {
    if (mmFiles.length === 0) {
      error = 'Please select CSV files to import';
      return;
    }

    if (mmSchema && !mmSchema.isValid) {
      error = 'Cannot import: missing required tables';
      return;
    }

    isImportingMM = true;
    error = null;
    success = null;
    mmResult = null;
    mmProgress = null;

    try {
      // Read CSV files
      const csvFiles = await readMultipleCSVFiles(mmFiles);
      
      // Create importer
      const importer = new MoneyManagerImporter({
        ...mmImportOptions,
        onProgress: (progress) => {
          mmProgress = progress;
        }
      });

      // Execute import
      const result = await importer.import(csvFiles);
      mmResult = result;

      if (result.success) {
        success = `Successfully imported ${result.statistics.accountsImported} accounts, ${result.statistics.categoriesImported} categories, and ${result.statistics.transactionsImported} transactions`;
        
        // Clear files after successful import
        mmFiles = [];
        mmSchema = null;
      } else {
        error = `Import completed with ${result.errors.length} error(s). Check details below.`;
      }
    } catch (err) {
      error = `Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
      console.error('Money Manager import error:', err);
    } finally {
      isImportingMM = false;
      mmProgress = null;
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
            <Card.Description>Restore data from a previous backup or import from Money Manager</Card.Description>
          </Card.Header>
          <Card.Content class="space-y-4">
            <!-- JSON Import (Existing) -->
            <div>
              <label class="text-sm font-medium text-primary mb-2 block">Import from Budgic Backup</label>
              <Button.Root
                onclick={importData}
                disabled={isImporting || isImportingMM}
                variant="outline"
                class="w-full"
              >
                Select JSON File
              </Button.Root>
              <p class="text-sm text-muted-foreground mt-2">
                Select a JSON export file to restore your data
              </p>
            </div>

            <!-- Money Manager Import -->
            <div class="border-t pt-4">
              <div class="flex items-center justify-between mb-2">
                <label class="text-sm font-medium text-primary">Import from Money Manager</label>
                <Button.Root
                  variant="outline"
                  size="sm"
                  onclick={() => showMMImport = !showMMImport}
                >
                  {showMMImport ? 'Hide' : 'Show'} Options
                </Button.Root>
              </div>
              
              <Button.Root
                onclick={pickMMFiles}
                disabled={isImporting || isImportingMM}
                variant="outline"
                class="w-full mb-2"
              >
                Select CSV Files
              </Button.Root>
              <p class="text-sm text-muted-foreground mb-4">
                Select CSV files exported from Money Manager (ASSETS.csv, ZCATEGORY.csv, INOUTCOME.csv, CURRENCY.csv, etc.)
              </p>

              {#if mmFiles.length > 0}
                <div class="bg-muted p-3 rounded-md mb-4">
                  <p class="text-sm font-medium mb-2">Selected files ({mmFiles.length}):</p>
                  <ul class="text-sm text-muted-foreground space-y-1">
                    {#each mmFiles as file}
                      <li>• {file.name}</li>
                    {/each}
                  </ul>
                </div>
              {/if}

              {#if mmSchema}
                <div class="bg-muted p-3 rounded-md mb-4">
                  <p class="text-sm font-medium mb-2">Detected Schema:</p>
                  {#if mmSchema.isValid}
                    <p class="text-sm text-green-600 dark:text-green-400 mb-2">✓ All required tables found</p>
                  {:else}
                    <p class="text-sm text-yellow-600 dark:text-yellow-400 mb-2">
                      ⚠ Missing tables: {mmSchema.missingTables.join(', ')}
                    </p>
                  {/if}
                  <p class="text-xs text-muted-foreground">
                    Found {mmSchema.tables.length} table(s)
                  </p>
                </div>
              {/if}

              {#if showMMImport}
                <div class="border rounded-md p-4 space-y-4 bg-muted/50">
                  <div>
                    <p class="text-sm font-medium mb-3">Import Options</p>
                    <div class="space-y-2">
                      <label class="flex items-center gap-2 cursor-pointer">
                        <Checkbox bind:checked={mmImportOptions.importAccounts} />
                        <span class="text-sm">Import Accounts</span>
                      </label>
                      <label class="flex items-center gap-2 cursor-pointer">
                        <Checkbox bind:checked={mmImportOptions.importCategories} />
                        <span class="text-sm">Import Categories</span>
                      </label>
                      <label class="flex items-center gap-2 cursor-pointer">
                        <Checkbox bind:checked={mmImportOptions.importTransactions} />
                        <span class="text-sm">Import Transactions</span>
                      </label>
                      <label class="flex items-center gap-2 cursor-pointer">
                        <Checkbox bind:checked={mmImportOptions.importCurrencies} />
                        <span class="text-sm">Import Currencies</span>
                      </label>
                      <label class="flex items-center gap-2 cursor-pointer">
                        <Checkbox bind:checked={mmImportOptions.importBudgets} />
                        <span class="text-sm">Import Budgets (optional)</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label class="text-sm font-medium mb-2 block">Conflict Resolution</label>
                    <Select.Root 
                      type="single" 
                      bind:value={mmImportOptions.conflictResolution}
                    >
                      <Select.Trigger class="w-full">
                        {mmImportOptions.conflictResolution === 'skip' ? 'Skip duplicates' :
                         mmImportOptions.conflictResolution === 'rename' ? 'Rename with suffix' :
                         mmImportOptions.conflictResolution === 'merge' ? 'Merge data' :
                         mmImportOptions.conflictResolution === 'replace' ? 'Replace existing' :
                         'Select conflict resolution strategy'}
                      </Select.Trigger>
                      <Select.Content>
                        <Select.Item value="skip">Skip duplicates</Select.Item>
                        <Select.Item value="rename">Rename with suffix</Select.Item>
                        <Select.Item value="merge">Merge data</Select.Item>
                        <Select.Item value="replace">Replace existing</Select.Item>
                      </Select.Content>
                    </Select.Root>
                    <p class="text-xs text-muted-foreground mt-1">
                      How to handle accounts/categories that already exist
                    </p>
                  </div>

                  {#if mmImportOptions.importTransactions}
                    <div class="grid grid-cols-2 gap-4">
                      <div>
                        <label class="text-sm font-medium mb-2 block">Transaction Date Start</label>
                        <Input
                          type="date"
                          bind:value={mmImportOptions.transactionDateStart}
                          class="w-full"
                        />
                      </div>
                      <div>
                        <label class="text-sm font-medium mb-2 block">Transaction Date End</label>
                        <Input
                          type="date"
                          bind:value={mmImportOptions.transactionDateEnd}
                          class="w-full"
                        />
                      </div>
                    </div>
                    <p class="text-xs text-muted-foreground">
                      Optional: Filter transactions by date range (leave empty to import all)
                    </p>
                  {/if}
                </div>
              {/if}

              {#if mmProgress}
                <div class="bg-muted p-4 rounded-md mb-4">
                  <div class="flex items-center justify-between mb-2">
                    <p class="text-sm font-medium">{mmProgress.step}</p>
                    <p class="text-sm text-muted-foreground">{mmProgress.percentage}%</p>
                  </div>
                  <div class="w-full bg-background rounded-full h-2 mb-2">
                    <div 
                      class="bg-primary h-2 rounded-full transition-all duration-300"
                      style="width: {mmProgress.percentage}%"
                    ></div>
                  </div>
                  {#if mmProgress.currentItem}
                    <p class="text-xs text-muted-foreground">{mmProgress.currentItem}</p>
                  {/if}
                  <p class="text-xs text-muted-foreground mt-1">
                    {mmProgress.itemsProcessed} of {mmProgress.totalItems} items
                  </p>
                </div>
              {/if}

              {#if mmResult}
                <div class="border rounded-md p-4 space-y-3">
                  <div class="flex items-center gap-2">
                    {#if mmResult.success}
                      <span class="text-green-600 dark:text-green-400 text-lg">✓</span>
                      <p class="font-medium text-green-600 dark:text-green-400">Import Completed Successfully</p>
                    {:else}
                      <span class="text-red-600 dark:text-red-400 text-lg">✗</span>
                      <p class="font-medium text-red-600 dark:text-red-400">Import Completed with Errors</p>
                    {/if}
                  </div>
                  
                  <div class="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p class="font-medium mb-1">Imported:</p>
                      <ul class="text-muted-foreground space-y-0.5">
                        <li>Accounts: {mmResult.statistics.accountsImported}</li>
                        <li>Categories: {mmResult.statistics.categoriesImported}</li>
                        <li>Transactions: {mmResult.statistics.transactionsImported}</li>
                        <li>Currencies: {mmResult.statistics.currenciesImported}</li>
                      </ul>
                    </div>
                    <div>
                      <p class="font-medium mb-1">Skipped:</p>
                      <ul class="text-muted-foreground space-y-0.5">
                        <li>Accounts: {mmResult.statistics.accountsSkipped}</li>
                        <li>Categories: {mmResult.statistics.categoriesSkipped}</li>
                        <li>Transactions: {mmResult.statistics.transactionsSkipped}</li>
                        <li>Currencies: {mmResult.statistics.currenciesSkipped}</li>
                      </ul>
                    </div>
                  </div>

                  {#if mmResult.errors.length > 0}
                    <div>
                      <p class="font-medium text-sm mb-2 text-red-600 dark:text-red-400">
                        Errors ({mmResult.errors.length}):
                      </p>
                      <div class="max-h-40 overflow-y-auto space-y-1">
                        {#each mmResult.errors.slice(0, 10) as err}
                          <p class="text-xs text-muted-foreground">
                            {err.entityType || 'Unknown'}: {err.message}
                          </p>
                        {/each}
                        {#if mmResult.errors.length > 10}
                          <p class="text-xs text-muted-foreground">
                            ... and {mmResult.errors.length - 10} more errors
                          </p>
                        {/if}
                      </div>
                    </div>
                  {/if}

                  {#if mmResult.warnings.length > 0}
                    <div>
                      <p class="font-medium text-sm mb-2 text-yellow-600 dark:text-yellow-400">
                        Warnings ({mmResult.warnings.length}):
                      </p>
                      <div class="max-h-40 overflow-y-auto space-y-1">
                        {#each mmResult.warnings.slice(0, 5) as warning}
                          <p class="text-xs text-muted-foreground">• {warning}</p>
                        {/each}
                        {#if mmResult.warnings.length > 5}
                          <p class="text-xs text-muted-foreground">
                            ... and {mmResult.warnings.length - 5} more warnings
                          </p>
                        {/if}
                      </div>
                    </div>
                  {/if}

                  <p class="text-xs text-muted-foreground">
                    Import completed in {(mmResult.duration / 1000).toFixed(2)}s
                  </p>
                </div>
              {/if}

              <Button.Root
                onclick={handleMMImport}
                disabled={isImporting || isImportingMM || mmFiles.length === 0}
                class="w-full mt-4"
              >
                {#if isImportingMM}
                  <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                {/if}
                Import from Money Manager
              </Button.Root>
            </div>
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