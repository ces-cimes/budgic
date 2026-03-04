<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { userService } from '$lib/core/services';
  import { PageLayout } from '$lib/components/layouts';
  import Header from '$lib/components/Header.svelte';
  import * as Select from '$lib/components/ui/select/index.ts';
  import { Checkbox } from '$lib/components/ui/checkbox/index.ts';
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
  import { formatPercentage } from '$lib/utils/currency-utils';

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
      
      success = 'Saved';
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
      
      success = 'Saved';
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
      
      success = 'Cleared';
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
  <title>Export & import | Budgic</title>
</svelte:head>

<PageLayout>
  {#snippet topBar()}
    <Header title="Export & import" backButtonLabel="Back to settings" backButtonLink="/settings" />
  {/snippet}

  <div class="mx-auto max-w-2xl px-4 py-6 space-y-6">
    {#if isLoading}
      <div class="h-36 animate-pulse rounded-2xl bg-[var(--color-bg-tertiary)]"></div>
    {:else}
      {#if error}
        <div class="rounded-xl border border-[var(--color-warm-coral)]/30 bg-[var(--color-warm-coral)]/8 px-5 py-3">
          <p class="text-sm text-[var(--color-warm-coral)]">{error}</p>
        </div>
      {/if}
      {#if success}
        <div class="rounded-xl border border-[var(--color-sage-green)]/30 bg-[var(--color-sage-green)]/8 px-5 py-3">
          <p class="text-sm text-[var(--color-sage-green)]">{success}</p>
        </div>
      {/if}

      <!-- Export -->
      <div class="rounded-2xl border border-border bg-[var(--color-bg-tertiary)] overflow-hidden">
        <div class="px-5 py-3 border-b border-border">
          <h2 class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Export</h2>
          <p class="text-xs text-[var(--color-text-tertiary)] mt-0.5">Download a backup of all your financial data</p>
        </div>
        <div class="px-5 py-4 space-y-3">
          <div class="space-y-1.5">
            <label for="export-format" class="text-sm font-medium text-[var(--color-text-primary)]">Format</label>
            <select
              id="export-format"
              bind:value={exportFormat}
              class="w-full max-w-xs rounded-xl border border-border bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]"
            >
              {#each exportFormatOptions as option}
                <option value={option.value}>{option.label} — {option.description}</option>
              {/each}
            </select>
          </div>
          <button
            onclick={exportData}
            disabled={isExporting}
            class="rounded-xl bg-[var(--color-amber)] px-5 py-2.5 text-sm font-semibold text-[var(--color-bg-primary)] transition-opacity disabled:opacity-60"
          >
            {isExporting ? 'Exporting…' : `Export ${exportFormat.toUpperCase()}`}
          </button>
        </div>
      </div>

      <!-- Import Budgic backup -->
      <div class="rounded-2xl border border-border bg-[var(--color-bg-tertiary)] overflow-hidden">
        <div class="px-5 py-3 border-b border-border">
          <h2 class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Import from Budgic backup</h2>
        </div>
        <div class="px-5 py-4 space-y-2">
          <button
            onclick={importData}
            disabled={isImporting || isImportingMM}
            class="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-surface)] disabled:opacity-50"
          >
            Select JSON file
          </button>
          <p class="text-xs text-[var(--color-text-tertiary)]">Restore from a previous Budgic JSON export</p>
        </div>
      </div>

      <!-- Import Money Manager -->
      <div class="rounded-2xl border border-border bg-[var(--color-bg-tertiary)] overflow-hidden">
        <div class="px-5 py-3 border-b border-border flex items-center justify-between">
          <div>
            <h2 class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Import from Money Manager</h2>
            <p class="text-xs text-[var(--color-text-tertiary)] mt-0.5">ASSETS.csv, ZCATEGORY.csv, INOUTCOME.csv, CURRENCY.csv…</p>
          </div>
          <button
            type="button"
            onclick={() => showMMImport = !showMMImport}
            class="text-xs text-[var(--color-amber)] font-medium"
          >
            {showMMImport ? 'Hide' : 'Options'}
          </button>
        </div>
        <div class="px-5 py-4 space-y-4">
          <button
            onclick={pickMMFiles}
            disabled={isImporting || isImportingMM}
            class="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-bg-surface)] disabled:opacity-50"
          >
            Select CSV files
          </button>

          {#if mmFiles.length > 0}
            <div class="rounded-xl bg-[var(--color-bg-surface)] p-3 space-y-1">
              <p class="text-xs font-medium text-[var(--color-text-secondary)]">{mmFiles.length} file{mmFiles.length > 1 ? 's' : ''} selected</p>
              {#each mmFiles as file}
                <p class="text-xs text-[var(--color-text-tertiary)]">• {file.name}</p>
              {/each}
            </div>
          {/if}

          {#if mmSchema}
            <div class="rounded-xl p-3 {mmSchema.isValid ? 'border border-[var(--color-sage-green)]/30 bg-[var(--color-sage-green)]/8' : 'border border-[var(--color-amber)]/30 bg-[var(--color-amber-subtle)]'}">
              {#if mmSchema.isValid}
                <p class="text-xs text-[var(--color-sage-green)]">All required tables found ({mmSchema.tables.length})</p>
              {:else}
                <p class="text-xs text-[var(--color-amber)]">Missing: {mmSchema.missingTables.join(', ')}</p>
              {/if}
            </div>
          {/if}

          {#if showMMImport}
            <div class="rounded-xl border border-border bg-[var(--color-bg-surface)] p-4 space-y-4">
              <p class="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Import options</p>
              <div class="space-y-2">
                {#each [
                  { key: 'importAccounts', label: 'Accounts' },
                  { key: 'importCategories', label: 'Categories' },
                  { key: 'importTransactions', label: 'Transactions' },
                  { key: 'importCurrencies', label: 'Currencies' },
                  { key: 'importBudgets', label: 'Budgets (optional)' }
                ] as opt}
                  <label class="flex items-center gap-2.5 cursor-pointer">
                    <Checkbox bind:checked={mmImportOptions[opt.key as keyof typeof mmImportOptions] as boolean} />
                    <span class="text-sm text-[var(--color-text-primary)]">Import {opt.label}</span>
                  </label>
                {/each}
              </div>
              <div class="space-y-1.5">
                <p class="text-xs font-medium text-[var(--color-text-secondary)]">Conflict resolution</p>
                <Select.Root type="single" bind:value={mmImportOptions.conflictResolution}>
                  <Select.Trigger class="w-full max-w-xs">
                    {mmImportOptions.conflictResolution === 'skip' ? 'Skip duplicates' :
                     mmImportOptions.conflictResolution === 'rename' ? 'Rename with suffix' :
                     mmImportOptions.conflictResolution === 'merge' ? 'Merge data' : 'Replace existing'}
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="skip">Skip duplicates</Select.Item>
                    <Select.Item value="rename">Rename with suffix</Select.Item>
                    <Select.Item value="merge">Merge data</Select.Item>
                    <Select.Item value="replace">Replace existing</Select.Item>
                  </Select.Content>
                </Select.Root>
              </div>
              {#if mmImportOptions.importTransactions}
                <div class="grid grid-cols-2 gap-3">
                  <div class="space-y-1.5">
                    <label for="mm-date-start" class="text-xs font-medium text-[var(--color-text-secondary)]">Date start</label>
                    <input id="mm-date-start" type="date" bind:value={mmImportOptions.transactionDateStart}
                      class="w-full rounded-xl border border-border bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]" />
                  </div>
                  <div class="space-y-1.5">
                    <label for="mm-date-end" class="text-xs font-medium text-[var(--color-text-secondary)]">Date end</label>
                    <input id="mm-date-end" type="date" bind:value={mmImportOptions.transactionDateEnd}
                      class="w-full rounded-xl border border-border bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-amber)]" />
                  </div>
                </div>
              {/if}
            </div>
          {/if}

          {#if mmProgress}
            <div class="rounded-xl bg-[var(--color-bg-surface)] p-4 space-y-2">
              <div class="flex items-center justify-between">
                <p class="text-xs font-medium text-[var(--color-text-primary)]">{mmProgress.step}</p>
                <p class="text-xs text-[var(--color-text-tertiary)]">{formatPercentage(mmProgress.percentage, { maxDecimals: 0 })}</p>
              </div>
              <div class="budget-progress">
                <div class="budget-progress-fill" style="width: {mmProgress.percentage}%"></div>
              </div>
              <p class="text-xs text-[var(--color-text-tertiary)]">{mmProgress.itemsProcessed} / {mmProgress.totalItems}</p>
            </div>
          {/if}

          {#if mmResult}
            <div class="rounded-xl border {mmResult.success ? 'border-[var(--color-sage-green)]/30 bg-[var(--color-sage-green)]/8' : 'border-[var(--color-warm-coral)]/30 bg-[var(--color-warm-coral)]/8'} p-4 space-y-3">
              <p class="text-sm font-medium {mmResult.success ? 'text-[var(--color-sage-green)]' : 'text-[var(--color-warm-coral)]'}">
                {mmResult.success ? 'Import complete' : 'Import completed with errors'}
              </p>
              <div class="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p class="font-medium text-[var(--color-text-secondary)] mb-1">Imported</p>
                  <p class="text-[var(--color-text-tertiary)]">Accounts: {mmResult.statistics.accountsImported}</p>
                  <p class="text-[var(--color-text-tertiary)]">Categories: {mmResult.statistics.categoriesImported}</p>
                  <p class="text-[var(--color-text-tertiary)]">Transactions: {mmResult.statistics.transactionsImported}</p>
                </div>
                <div>
                  <p class="font-medium text-[var(--color-text-secondary)] mb-1">Skipped</p>
                  <p class="text-[var(--color-text-tertiary)]">Accounts: {mmResult.statistics.accountsSkipped}</p>
                  <p class="text-[var(--color-text-tertiary)]">Categories: {mmResult.statistics.categoriesSkipped}</p>
                  <p class="text-[var(--color-text-tertiary)]">Transactions: {mmResult.statistics.transactionsSkipped}</p>
                </div>
              </div>
              {#if mmResult.errors.length > 0}
                <div class="max-h-32 overflow-y-auto space-y-1">
                  {#each mmResult.errors.slice(0, 8) as err}
                    <p class="text-xs text-[var(--color-warm-coral)]">{err.entityType || 'Unknown'}: {err.message}</p>
                  {/each}
                  {#if mmResult.errors.length > 8}
                    <p class="text-xs text-[var(--color-text-tertiary)]">…and {mmResult.errors.length - 8} more</p>
                  {/if}
                </div>
              {/if}
              <p class="text-xs text-[var(--color-text-tertiary)]">Completed in {(mmResult.duration / 1000).toFixed(2)}s</p>
            </div>
          {/if}

          <button
            onclick={handleMMImport}
            disabled={isImporting || isImportingMM || mmFiles.length === 0}
            class="rounded-xl bg-[var(--color-amber)] px-5 py-2.5 text-sm font-semibold text-[var(--color-bg-primary)] transition-opacity disabled:opacity-60"
          >
            {isImportingMM ? 'Importing…' : 'Import from Money Manager'}
          </button>
        </div>
      </div>

      <!-- Danger zone -->
      <div class="rounded-2xl border border-[var(--color-warm-coral)]/20 bg-[var(--color-warm-coral)]/5 overflow-hidden">
        <div class="px-5 py-3 border-b border-[var(--color-warm-coral)]/15">
          <h2 class="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-warm-coral)]">Danger zone</h2>
        </div>
        <div class="px-5 py-4 space-y-2">
          <button
            onclick={clearAllData}
            class="rounded-xl border border-[var(--color-warm-coral)]/30 bg-[var(--color-warm-coral)]/8 px-5 py-2.5 text-sm font-semibold text-[var(--color-warm-coral)] transition-colors hover:bg-[var(--color-warm-coral)]/12"
          >
            Clear all data
          </button>
          <p class="text-xs text-[var(--color-text-tertiary)]">Permanently deletes everything. Export first.</p>
        </div>
      </div>
    {/if}
  </div>
</PageLayout>
