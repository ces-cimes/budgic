import type { ComponentType } from 'svelte';

// TabConfig is now shared - import from shared types
export type { TabConfig } from '$lib/components/shared/types';

export interface Insight {
  id: string;
  title: string;
  message: string;
  severity: 'alert' | 'warning' | 'success' | 'info';
  timestamp: string;
}

export interface AnalyticsData {
  totalSpending: number;
  savingsRate: number;
  trends: TrendData[];
  categories: CategoryData[];
}

export interface TrendData {
  label: string;
  value: number;
  isPositive: boolean;
  previousValue?: number;
}

export interface CategoryData {
  name: string;
  amount: number;
  percentage: number;
  color: string;
  trend?: TrendData;
}

export interface PeriodData {
  totalSpending: number;
  transactionCount: number;
  averageTransaction: number;
  savingsRate: number;
}

export interface Report {
  id: string;
  title: string;
  type: ReportType;
  generatedAt: string;
  downloadUrl?: string;
}

export type ReportType = 'monthly' | 'spending' | 'category' | 'trend';

export interface ReportSettings {
  autoGenerate: boolean;
  emailReports: boolean;
  defaultFormat: 'PDF' | 'CSV' | 'Excel';
}

export interface SwipeableTabContainerProps {
  tabs: TabConfig[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  contentHeight?: string;
  className?: string;
}

export interface TabPanelProps {
  tabId: string;
  isActive: boolean;
  className?: string;
}

export interface QuickStatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: any; // Changed from ComponentType to any for Lucide icons
  trend?: TrendData;
  className?: string;
}

export interface InsightAlertProps {
  insight: Insight;
  showTimestamp?: boolean;
  className?: string;
}

export interface InsightListProps {
  insights: Insight[];
  maxItems?: number;
  showViewAll?: boolean;
  onViewAll?: () => void;
  className?: string;
}

export interface TimeRangeSelectorProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}

export interface MetricCardProps {
  title: string;
  subtitle?: string;
  icon?: any; // Changed from ComponentType to any for Lucide icons
  value: string | number;
  trend?: TrendData;
  className?: string;
}

export interface ActionButtonProps {
  icon: any; // Changed from ComponentType to any for Lucide icons
  label: string;
  subtitle?: string;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'ghost';
  className?: string;
}

export interface OverviewTabProps {
  totalSpending: number;
  savingsRate: number;
  timeRange: string;
  insights: Insight[];
  userCurrency: string;
  onExportReport?: () => void;
  onSetReminder?: () => void;
}

export interface TrendsTabProps {
  timeRange: 'week' | 'month' | 'quarter' | 'year';
  onTimeRangeChange: (range: string) => void;
  analytics: AnalyticsData | null;
  userCurrency: string;
}

export interface CategoriesTabProps {
  categoryData: CategoryData[];
  userCurrency: string;
  timeRange: string;
}

export interface CompareTabProps {
  timeRange: 'month' | 'quarter' | 'year';
  onTimeRangeChange: (range: string) => void;
  currentPeriodData: PeriodData;
  previousPeriodData: PeriodData;
  userCurrency: string;
}

export interface ReportsTabProps {
  recentReports: Report[];
  onGenerateReport: (type: ReportType) => void;
  onDownloadReport: (reportId: string) => void;
  settings: ReportSettings;
  onUpdateSettings: (settings: Partial<ReportSettings>) => void;
}
