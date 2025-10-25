import { analyticsService, transactionService } from '$lib/core/services';
import { simpleInsightsService } from '$lib/components/insights/simple-insights-service';
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
      const simpleInsights = simpleInsightsService.getInsights();
      // Transform SimpleInsight to Insight
      return simpleInsights.map(insight => ({
        id: insight.id,
        title: insight.title,
        message: insight.description,
        severity: insight.severity as 'alert' | 'warning' | 'success' | 'info',
        timestamp: insight.createdAt
      }));
    } catch (error) {
      console.error('Error loading insights:', error);
      return [];
    }
  }

  async loadAnalytics(timeRange: 'week' | 'month' | 'quarter' | 'year'): Promise<AnalyticsData | null> {
    try {
      // Calculate months based on time range
      let months: number;
      switch (timeRange) {
        case 'week':
          months = 1; // Use 1 month for week view
          break;
        case 'month':
          months = 1;
          break;
        case 'quarter':
          months = 3;
          break;
        case 'year':
          months = 12;
          break;
        default:
          months = 1;
      }
      
      const analytics = await analyticsService.getSpendingAnalysis(months);

      // Transform the analytics data to match our interface
      return {
        totalSpending: analytics.totalSpent || 0,
        savingsRate: 0, // Calculate savings rate separately if needed
        trends: [], // Empty for now, can be enhanced later
        categories: analytics.topCategories.map(cat => ({
          name: cat.categoryName,
          amount: cat.amount,
          percentage: cat.percentage,
          color: this.getCategoryColor(cat.categoryId)
        }))
      };
    } catch (error) {
      console.error('Error loading analytics:', error);
      return null;
    }
  }

  async loadTransactions(): Promise<any[]> {
    try {
      return await transactionService.getAllTransactions();
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
    
    // Filter transactions by date using our simplified schema
    const filteredTransactions = transactions.filter(t => {
      const transactionDate = new Date(t.clearedDate || t.plannedDate || t.createdAt);
      return transactionDate >= startDate;
    });
    
    // Calculate spending using our simplified schema (type field)
    const totalSpending = filteredTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
    
    const income = filteredTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    
    const savingsRate = income > 0 ? ((income - totalSpending) / income) * 100 : 0;
    
    return {
      totalSpending,
      savingsRate,
      transactionCount: filteredTransactions.length,
      averageTransaction: filteredTransactions.length > 0 ? totalSpending / filteredTransactions.length : 0
    };
  }

  generateCategoryData(transactions: any[], timeRange: string): CategoryData[] {
    // Generate real category data from transactions
    const categoryMap = new Map<string, { amount: number; count: number }>();
    
    // Process transactions to group by category
    transactions.forEach(tx => {
      if (tx.type === 'expense' && tx.categoryId) {
        const amount = Math.abs(tx.amount || 0);
        const existing = categoryMap.get(tx.categoryId) || { amount: 0, count: 0 };
        categoryMap.set(tx.categoryId, {
          amount: existing.amount + amount,
          count: existing.count + 1
        });
      }
    });
    
    // Calculate total spending for percentages
    const totalSpending = Array.from(categoryMap.values())
      .reduce((sum, cat) => sum + cat.amount, 0);
    
    // Convert to CategoryData format
    const categoryData: CategoryData[] = Array.from(categoryMap.entries()).map(([categoryId, data]) => {
      const percentage = totalSpending > 0 ? (data.amount / totalSpending) * 100 : 0;
      
      return {
        name: categoryId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), // Convert ID to readable name
        amount: data.amount,
        percentage: Math.round(percentage * 10) / 10, // Round to 1 decimal
        color: this.getCategoryColor(categoryId),
        trend: {
          label: categoryId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          value: Math.random() * 20 - 10, // Mock trend for now
          isPositive: Math.random() > 0.5
        }
      };
    });
    
    // Sort by amount descending
    return categoryData.sort((a, b) => b.amount - a.amount);
  }
  
  private getCategoryColor(categoryId: string): string {
    // Generate consistent colors based on category ID
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4', '#84CC16', '#F97316'];
    const hash = categoryId.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    return colors[Math.abs(hash) % colors.length];
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

