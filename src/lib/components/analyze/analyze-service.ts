import { insightsService, transactionService, analyticsCoreService } from '$lib/core/services';
import type { 
  AnalyticsData, 
  Insight, 
  CategoryData, 
  PeriodData, 
  Report, 
  ReportType 
} from '$lib/components/analyze/types.js';

export class AnalyzeService {
  async loadInsights(): Promise<Insight[]> {
    try {
      return insightsService.getInsights();
    } catch (error) {
      console.error('Error loading insights:', error);
      return [];
    }
  }

  async loadAnalytics(timeRange: 'week' | 'month' | 'quarter' | 'year'): Promise<AnalyticsData | null> {
    try {
      const now = new Date();
      let startDate: Date;
      let endDate = new Date();
      
      switch (timeRange) {
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'quarter':
          const quarterStart = Math.floor(now.getMonth() / 3) * 3;
          startDate = new Date(now.getFullYear(), quarterStart, 1);
          break;
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }
      
      const analytics = await analyticsCoreService.analyzeTransactions(
        startDate.toISOString(),
        endDate.toISOString()
      );

      // Transform the analytics data to match our interface
      return {
        totalSpending: analytics.totalSpending || 0,
        savingsRate: analytics.savingsRate || 0,
        trends: analytics.trends || [],
        categories: analytics.categories || []
      };
    } catch (error) {
      console.error('Error loading analytics:', error);
      return null;
    }
  }

  async loadTransactions(): Promise<any[]> {
    try {
      return await transactionService.getTransactions();
    } catch (error) {
      console.error('Error loading transactions:', error);
      return [];
    }
  }

  calculateSpendingData(transactions: any[], timeRange: 'week' | 'month' | 'quarter' | 'year') {
    const now = new Date();
    let startDate: Date;
    
    switch (timeRange) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        const quarterStart = Math.floor(now.getMonth() / 3) * 3;
        startDate = new Date(now.getFullYear(), quarterStart, 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    
    const filteredTransactions = transactions.filter(t => new Date(t.date) >= startDate);
    
    const totalSpending = filteredTransactions
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    const income = filteredTransactions
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);
    
    const savingsRate = income > 0 ? ((income - totalSpending) / income) * 100 : 0;
    
    return {
      totalSpending,
      savingsRate,
      transactionCount: filteredTransactions.length,
      averageTransaction: filteredTransactions.length > 0 ? totalSpending / filteredTransactions.length : 0
    };
  }

  generateCategoryData(transactions: any[], timeRange: string): CategoryData[] {
    // This would typically come from your analytics service
    // For now, returning mock data that matches the original structure
    return [
      {
        name: 'Housing',
        amount: 1200,
        percentage: 42.1,
        color: '#3B82F6',
        trend: { label: 'Housing', value: 2.3, isPositive: true }
      },
      {
        name: 'Food & Dining',
        amount: 680,
        percentage: 23.9,
        color: '#10B981',
        trend: { label: 'Food & Dining', value: 8.2, isPositive: true }
      },
      {
        name: 'Transportation',
        amount: 450,
        percentage: 15.8,
        color: '#F59E0B',
        trend: { label: 'Transportation', value: 15.7, isPositive: true }
      },
      {
        name: 'Entertainment',
        amount: 320,
        percentage: 11.2,
        color: '#8B5CF6',
        trend: { label: 'Entertainment', value: -5.3, isPositive: false }
      },
      {
        name: 'Other',
        amount: 197,
        percentage: 6.9,
        color: '#EF4444'
      }
    ];
  }

  async generateReport(type: ReportType): Promise<Report> {
    // Mock report generation - in real implementation, this would call your report service
    const report: Report = {
      id: `report-${Date.now()}`,
      title: `${type.charAt(0).toUpperCase() + type.slice(1)} Report - ${new Date().toLocaleDateString()}`,
      type,
      generatedAt: new Date().toISOString(),
      downloadUrl: `/reports/${type}-${Date.now()}.pdf`
    };
    
    return report;
  }

  async downloadReport(reportId: string): Promise<void> {
    // Mock download - in real implementation, this would trigger file download
    console.log(`Downloading report: ${reportId}`);
  }
}

export const analyzeService = new AnalyzeService();

