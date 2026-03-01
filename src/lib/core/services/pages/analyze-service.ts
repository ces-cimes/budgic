import { analyticsService, transactionService, insightsService } from '$lib/core/services';
import type { 
  AnalyticsData, 
  Insight, 
  CategoryData, 
  PeriodData, 
  Report, 
  ReportType 
} from '$lib/components/reports/types.js';

export class AnalyzeService {
  async loadInsights(): Promise<Insight[]> {
    try {
      // Use the new insights service instead of simple insights
      const dbInsights = await insightsService.getInsights();
      
      // Transform database insights to component format
      return dbInsights.map(insight => ({
        id: insight.id,
        title: insight.title,
        message: insight.message,
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
    // First filter out null/undefined transactions, then filter by date
    const filteredTransactions = transactions
      .filter(t => t != null) // Remove null/undefined transactions
      .filter(t => {
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
    const categoryMap = new Map<string, { amount: number; count: number; currentPeriod: number; previousPeriod: number }>();
    
    const now = new Date();
    let currentStart: Date;
    let previousStart: Date;
    
    // Define period boundaries
    switch (timeRange) {
      case 'week':
        currentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        previousStart = new Date(currentStart.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
        previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        break;
      case 'quarter':
        const quarterStart = Math.floor(now.getMonth() / 3) * 3;
        currentStart = new Date(now.getFullYear(), quarterStart, 1);
        previousStart = new Date(now.getFullYear(), quarterStart - 3, 1);
        break;
      case 'year':
        currentStart = new Date(now.getFullYear(), 0, 1);
        previousStart = new Date(now.getFullYear() - 1, 0, 1);
        break;
      default:
        currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
        previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    }
    
    // Process transactions to group by category and period
    // First filter out null/undefined transactions
    transactions
      .filter(tx => tx != null) // Remove null/undefined transactions
      .forEach(tx => {
        if (tx.type === 'expense' && tx.categoryId) {
        const transactionDate = new Date(tx.clearedDate || tx.plannedDate || tx.createdAt);
        const amount = Math.abs(tx.amount || 0);
        
        const existing = categoryMap.get(tx.categoryId) || { 
          amount: 0, 
          count: 0, 
          currentPeriod: 0, 
          previousPeriod: 0 
        };
        
        let updatedData = { ...existing };
        
        if (transactionDate >= currentStart) {
          updatedData.amount += amount;
          updatedData.count += 1;
          updatedData.currentPeriod += amount;
        } else if (transactionDate >= previousStart) {
          updatedData.previousPeriod += amount;
        }
        
        categoryMap.set(tx.categoryId, updatedData);
      }
    });
    
    // Calculate total spending for percentages
    const totalSpending = Array.from(categoryMap.values())
      .reduce((sum, cat) => sum + cat.amount, 0);
    
    // Convert to CategoryData format with real trend calculation
    const categoryData: CategoryData[] = Array.from(categoryMap.entries()).map(([categoryId, data]) => {
      const percentage = totalSpending > 0 ? (data.amount / totalSpending) * 100 : 0;
      
      // Calculate real trend percentage change
      let trendValue = 0;
      let isPositive = true;
      
      if (data.previousPeriod > 0) {
        trendValue = ((data.currentPeriod - data.previousPeriod) / data.previousPeriod) * 100;
        isPositive = trendValue >= 0;
      } else if (data.currentPeriod > 0) {
        // New category, mark as increase
        trendValue = 100;
        isPositive = true;
      }
      
      return {
        name: categoryId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), // Convert ID to readable name
        amount: data.amount,
        percentage: Math.round(percentage * 10) / 10, // Round to 1 decimal
        color: this.getCategoryColor(categoryId),
        trend: {
          label: categoryId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          value: Math.round(trendValue * 10) / 10, // Real trend calculation
          isPositive
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
    try {
      // Generate actual report data
      const transactions = await this.loadTransactions();
      const reportId = `report-${Date.now()}`;
      
      // Create report HTML
      const reportHtml = this.createReportHTML(type, transactions);
      
      // Create blob and URL
      const blob = new Blob([reportHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      
      const report: Report = {
        id: reportId,
        title: `${type.charAt(0).toUpperCase() + type.slice(1)} Report - ${new Date().toLocaleDateString()}`,
        type,
        generatedAt: new Date().toISOString(),
        downloadUrl: url
      };
      
      return report;
    } catch (error) {
      console.error('Error generating report:', error);
      // Return fallback report
      return {
        id: `report-${Date.now()}`,
        title: `${type.charAt(0).toUpperCase() + type.slice(1)} Report - ${new Date().toLocaleDateString()}`,
        type,
        generatedAt: new Date().toISOString(),
        downloadUrl: ''
      };
    }
  }

  async downloadReport(reportId: string, downloadUrl: string): Promise<void> {
    try {
      // Create anchor element and trigger download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${reportId}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the blob URL
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Error downloading report:', error);
    }
  }

  private createReportHTML(type: ReportType, transactions: any[]): string {
    const now = new Date();
    const totalSpending = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
    
    const totalIncome = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    
    const categoryBreakdown = this.generateCategoryData(transactions, type === 'monthly' ? 'month' : 'year');
    
    return `
<!DOCTYPE html>
<html>
<head>
  <title>${type.charAt(0).toUpperCase() + type.slice(1)} Report - ${now.toLocaleDateString()}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 40px; }
    h1 { color: #1A1D23; border-bottom: 2px solid #4A7C59; padding-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background-color: #242831; color: #F5F1E8; }
    .amount { text-align: right; font-weight: 600; }
    .total { background-color: #242831; color: #F5F1E8; font-weight: bold; }
  </style>
</head>
<body>
  <h1>${type.charAt(0).toUpperCase() + type.slice(1)} Financial Report</h1>
  <p>Generated: ${now.toLocaleString()}</p>
  
  <h2>Summary</h2>
  <table>
    <tr>
      <th>Total Income</th>
      <th>Total Spending</th>
      <th>Net Change</th>
      <th>Transactions</th>
    </tr>
    <tr>
      <td class="amount">$${totalIncome.toFixed(2)}</td>
      <td class="amount">$${totalSpending.toFixed(2)}</td>
      <td class="amount">$${(totalIncome - totalSpending).toFixed(2)}</td>
      <td class="amount">${transactions.length}</td>
    </tr>
  </table>
  
  <h2>Category Breakdown</h2>
  <table>
    <tr>
      <th>Category</th>
      <th>Amount</th>
      <th>Percentage</th>
    </tr>
    ${categoryBreakdown.map(cat => `
    <tr>
      <td>${cat.name}</td>
      <td class="amount">$${cat.amount.toFixed(2)}</td>
      <td class="amount">${cat.percentage.toFixed(1)}%</td>
    </tr>
    `).join('')}
    <tr class="total">
      <td>Total</td>
      <td class="amount">$${totalSpending.toFixed(2)}</td>
      <td class="amount">100%</td>
    </tr>
  </table>
</body>
</html>
    `;
  }
}

export const analyzeService = new AnalyzeService();
