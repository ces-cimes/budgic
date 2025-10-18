<script lang="ts">
  import type { ReportsTabProps } from '../types.js';
  import { ActionButton } from '../shared/index.js';
  import * as Card from '$lib/components/ui/card/index.ts';
  import { Button } from '$lib/components/ui/button/index.ts';
  import { FileText, Download, BarChart3, PieChart, TrendingUp } from '@lucide/svelte';

  interface Props extends ReportsTabProps {
    children?: any;
  }

  const { 
    recentReports, 
    onGenerateReport, 
    onDownloadReport, 
    settings, 
    onUpdateSettings,
    children 
  }: Props = $props();

  function formatTimestamp(timestamp: string) {
    const now = new Date();
    const reportTime = new Date(timestamp);
    const diff = now.getTime() - reportTime.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return `${Math.floor(days / 30)} months ago`;
  }

  function getReportIcon(type: ReportsTabProps['recentReports'][0]['type']) {
    switch (type) {
      case 'monthly': return FileText;
      case 'spending': return BarChart3;
      case 'category': return PieChart;
      case 'trend': return TrendingUp;
      default: return FileText;
    }
  }
</script>

<div class="p-4 space-y-6">
  <!-- Report Generation -->
  <Card.Root class="p-6">
    <div class="flex items-center gap-4 mb-4">
      <div class="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
        <FileText class="w-5 h-5 text-primary" />
      </div>
      <div>
        <h3 class="text-lg font-semibold text-primary">Generate Report</h3>
        <p class="text-sm text-muted-foreground">Create detailed financial reports</p>
      </div>
    </div>
    
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <ActionButton
        icon={Download}
        label="Monthly Summary"
        subtitle="PDF Export"
        onclick={() => onGenerateReport('monthly')}
      />
      
      <ActionButton
        icon={BarChart3}
        label="Spending Analysis"
        subtitle="Detailed Charts"
        onclick={() => onGenerateReport('spending')}
      />
      
      <ActionButton
        icon={PieChart}
        label="Category Report"
        subtitle="Breakdown by Category"
        onclick={() => onGenerateReport('category')}
      />
      
      <ActionButton
        icon={TrendingUp}
        label="Trend Report"
        subtitle="Historical Analysis"
        onclick={() => onGenerateReport('trend')}
      />
    </div>
  </Card.Root>

  <!-- Recent Reports -->
  <Card.Root class="p-6">
    <h3 class="text-lg font-semibold text-primary mb-4">Recent Reports</h3>
    <div class="space-y-3">
      {#each recentReports as report (report.id)}
        {@const ReportIcon = getReportIcon(report.type)}
        <div class="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div class="flex items-center gap-3">
            <ReportIcon class="w-4 h-4 text-primary" />
            <div>
              <div class="text-sm font-medium text-primary">{report.title}</div>
              <div class="text-xs text-muted-foreground">{formatTimestamp(report.generatedAt)}</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onclick={() => onDownloadReport(report.id)}>
            <Download class="w-4 h-4" />
          </Button>
        </div>
      {/each}
    </div>
  </Card.Root>

  <!-- Report Settings -->
  <Card.Root class="p-6">
    <h3 class="text-lg font-semibold text-primary mb-4">Report Settings</h3>
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm font-medium text-primary">Auto-generate monthly reports</div>
          <div class="text-xs text-muted-foreground">Generate reports automatically at month end</div>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          onclick={() => onUpdateSettings({ autoGenerate: !settings.autoGenerate })}
        >
          {settings.autoGenerate ? 'Disable' : 'Enable'}
        </Button>
      </div>
      
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm font-medium text-primary">Email reports</div>
          <div class="text-xs text-muted-foreground">Send reports to your email</div>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          onclick={() => onUpdateSettings({ emailReports: !settings.emailReports })}
        >
          {settings.emailReports ? 'Disable' : 'Configure'}
        </Button>
      </div>
      
      <div class="flex items-center justify-between">
        <div>
          <div class="text-sm font-medium text-primary">Report format</div>
          <div class="text-xs text-muted-foreground">Choose default export format</div>
        </div>
        <Button variant="outline" size="sm">
          {settings.defaultFormat}
        </Button>
      </div>
    </div>
  </Card.Root>
  
  {#if children}
    {@render children()}
  {/if}
</div>

