import { accountService, userService, transactionService, budgetService, crossRouteSyncService, insightsService } from '$lib/core/services';
import type { Account } from '$lib/core/db';

// Simplified types for planning
export interface PlanningData {
  totalPlannedIncome: number;
  totalPlannedExpenses: number;
  netProjectedChange: number;
  insights: PlanningInsight[];
}

export interface DailyAllowance {
  amount: number;
  currency: string;
  daysRemaining: number;
  projectedBalance: number;
}

export interface WeeklyProjection {
  weekKey: string;
  weekStart: Date;
  weekEnd: Date;
  projectedIncome: number;
  projectedExpenses: number;
  projectedBalance: number;
  insights: PlanningInsight[];
  // Additional properties for UI compatibility
  riskLevel?: 'safe' | 'caution' | 'danger';
  startingBalance?: number;
  endingBalance?: number;
  transactions?: any[];
  weekNumber?: number;
}

export interface PlanningInsight {
  id: string;
  type: 'balance_warning' | 'income_alert' | 'expense_alert' | 'goal_progress';
  message: string;
  severity: 'low' | 'medium' | 'high';
  actionable: boolean;
}

class PlanService {
  public get ready() {
    return Promise.resolve(true);
  }

  /**
   * Get all accounts
   */
  async getAccounts(): Promise<Account[]> {
    return await accountService.getAccounts();
  }

  /**
   * Get comprehensive planning data for an account
   */
  async getPlanningData(accountId: string): Promise<PlanningData> {
    try {
      // Get transactions for the account
      const transactions = await transactionService.getTransactionsByAccount(accountId);
      
      // Calculate planned income and expenses
      const totalPlannedIncome = transactions
        .filter(t => t.type === 'income' && t.status === 'planned')
        .reduce((sum, t) => sum + (t.amount || 0), 0);
      
      const totalPlannedExpenses = transactions
        .filter(t => t.type === 'expense' && t.status === 'planned')
        .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
      
      const netProjectedChange = totalPlannedIncome - totalPlannedExpenses;
      
      // Generate insights based on the data
      const insights: PlanningInsight[] = [];
      
      if (netProjectedChange < 0) {
        insights.push({
          id: 'negative-balance',
          type: 'balance_warning',
          message: `Projected negative balance of ${Math.abs(netProjectedChange).toFixed(2)}`,
          severity: 'high',
          actionable: true
        });
      }
      
      if (totalPlannedExpenses > totalPlannedIncome * 0.8) {
        insights.push({
          id: 'high-expenses',
          type: 'expense_alert',
          message: 'Planned expenses are high relative to income',
          severity: 'medium',
          actionable: true
        });
      }
      
      return {
        totalPlannedIncome,
        totalPlannedExpenses,
        netProjectedChange,
        insights
      };
    } catch (error) {
      console.error('Error getting planning data:', error);
      return {
        totalPlannedIncome: 0,
        totalPlannedExpenses: 0,
        netProjectedChange: 0,
        insights: []
      };
    }
  }

  /**
   * Get daily allowance for an account
   */
  async getDailyAllowance(accountId: string): Promise<DailyAllowance> {
    try {
      const preferences = await userService.getUserPreferences();
      const account = await accountService.getAccount(accountId);
      
      if (!account) {
        throw new Error('Account not found');
      }
      
      // Calculate daily allowance based on current balance and remaining days in month
      const now = new Date();
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const daysRemaining = Math.max(1, endOfMonth.getDate() - now.getDate());
      
      const dailyAllowanceAmount = account.currentBalance / daysRemaining;
      
      return {
        amount: Math.max(0, dailyAllowanceAmount),
        currency: preferences?.currency || 'USD',
        daysRemaining,
        projectedBalance: account.currentBalance
      };
    } catch (error) {
      console.error('Error getting daily allowance:', error);
      const preferences = await userService.getUserPreferences();
      return {
        amount: 0,
        currency: preferences?.currency || 'USD',
        daysRemaining: 30,
        projectedBalance: 0
      };
    }
  }

  /**
   * Get weekly projections for an account
   */
  async getWeeklyProjections(accountId: string, weeksAhead: number = 8): Promise<WeeklyProjection[]> {
    try {
      const projections: WeeklyProjection[] = [];
      const now = new Date();
      
      for (let i = 0; i < weeksAhead; i++) {
        const weekStart = this.getWeekStart(this.addWeeks(now, i));
        const weekEnd = this.addWeeks(weekStart, 1);
        const weekKey = this.getWeekKey(weekStart);
        
        // Get transactions for this week
        const transactions = await transactionService.getTransactionsByDateRange(
          weekStart.toISOString(),
          weekEnd.toISOString()
        );
        
        const accountTransactions = transactions.filter(t => t.accountId === accountId);
        
        const projectedIncome = accountTransactions
          .filter(t => t.type === 'income')
          .reduce((sum, t) => sum + (t.amount || 0), 0);
        
        const projectedExpenses = accountTransactions
          .filter(t => t.type === 'expense')
          .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
        
        const projectedBalance = projectedIncome - projectedExpenses;
        
        projections.push({
          weekKey,
          weekStart,
          weekEnd,
          projectedIncome,
          projectedExpenses,
          projectedBalance,
          insights: []
        });
      }
      
      return projections;
    } catch (error) {
      console.error('Error getting weekly projections:', error);
      return [];
    }
  }

  /**
   * Get planning insights for an account
   */
  async getPlanningInsights(accountId: string): Promise<PlanningInsight[]> {
    try {
      // Get planning data
      const planningData = await this.getPlanningData(accountId);
      const insights: PlanningInsight[] = [];

      // Generate insights based on planning data
      if (planningData.netProjectedChange < 0) {
        insights.push({
          id: 'negative-projection',
          type: 'balance_warning',
          message: `Projected negative balance of ${Math.abs(planningData.netProjectedChange).toFixed(2)}`,
          severity: 'high',
          actionable: true
        });
      }

      if (planningData.totalPlannedExpenses > planningData.totalPlannedIncome * 0.8) {
        insights.push({
          id: 'high-expense-ratio',
          type: 'expense_alert',
          message: 'Planned expenses are high relative to income',
          severity: 'medium',
          actionable: true
        });
      }

      // Emit sync event for planning insights generation
      await crossRouteSyncService.emitSyncEvent({
        type: 'budget_updated',
        entityId: accountId,
        entityType: 'budget',
        data: { planningData, insights },
        timestamp: new Date().toISOString()
      });

      return insights;
    } catch (error) {
      console.error('Error getting planning insights:', error);
      return [];
    }
  }

  /**
   * Get a single week projection with caching
   */
  async getWeekProjection(accountId: string, weekKey: string): Promise<WeeklyProjection> {
    try {
      // Parse week key to get the actual week dates
      const weekStart = this.parseWeekKey(weekKey);
      const weekEnd = this.addWeeks(weekStart, 1);
      
      // Get transactions for this week
      const transactions = await transactionService.getTransactionsByDateRange(
        weekStart.toISOString(),
        weekEnd.toISOString()
      );
      
      const accountTransactions = transactions.filter(t => t.accountId === accountId);
      
      const projectedIncome = accountTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + (t.amount || 0), 0);
      
      const projectedExpenses = accountTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
      
      const projectedBalance = projectedIncome - projectedExpenses;
      
      // Get account to calculate starting balance
      const account = await accountService.getAccount(accountId);
      const startingBalance = account?.currentBalance || 0;
      const endingBalance = startingBalance + projectedBalance;
      
      // Calculate risk level based on ending balance
      let riskLevel: 'safe' | 'caution' | 'danger' = 'safe';
      if (endingBalance < 0) {
        riskLevel = 'danger';
      } else if (endingBalance < startingBalance * 0.1) {
        riskLevel = 'caution';
      }
      
      // Generate insights
      const insights: PlanningInsight[] = [];
      if (endingBalance < 0) {
        insights.push({
          id: 'negative-balance',
          type: 'balance_warning',
          message: `Projected negative balance of ${Math.abs(endingBalance).toFixed(2)}`,
          severity: 'high',
          actionable: true
        });
      }
      
      return {
        weekKey,
        weekStart,
        weekEnd,
        projectedIncome,
        projectedExpenses,
        projectedBalance,
        insights,
        riskLevel,
        startingBalance,
        endingBalance,
        transactions: accountTransactions,
        weekNumber: this.getWeekNumber(weekStart)
      };
    } catch (error) {
      console.error('Error getting week projection:', error);
      return {
        weekKey,
        weekStart: new Date(),
        weekEnd: new Date(),
        projectedIncome: 0,
        projectedExpenses: 0,
        projectedBalance: 0,
        insights: [],
        riskLevel: 'safe',
        startingBalance: 0,
        endingBalance: 0,
        transactions: [],
        weekNumber: 1
      };
    }
  }

  /**
   * Create planning insights in the database
   */
  async createPlanningInsights(accountId: string): Promise<void> {
    try {
      const insights = await this.getPlanningInsights(accountId);
      
      // Create insights in the database
      for (const insight of insights) {
        await insightsService.createInsight({
          type: 'budget_approaching', // Map planning insight types to database types
          severity: insight.severity === 'high' ? 'alert' : 
                   insight.severity === 'medium' ? 'warning' : 'info',
          title: insight.message,
          message: insight.message,
          actionable: insight.actionable,
          metadata: {
            accountId,
            insightType: insight.type,
            sourceRoute: 'plan'
          }
        });
      }
    } catch (error) {
      console.error('Error creating planning insights:', error);
    }
  }

  /**
   * Clear account cache to ensure fresh data
   */
  clearAccountCache(accountId: string): void {
    // No-op for simplified service
  }

  /**
   * Clear week cache
   */
  clearWeekCache(): void {
    // No-op for simplified service
  }

  /**
   * Invalidate week cache from a specific week
   */
  invalidateWeekCache(weekKey: string): void {
    // No-op for simplified service
  }

  /**
   * Check if a week is cached
   */
  isWeekCached(weekKey: string): boolean {
    return false;
  }

  /**
   * Get cached week data
   */
  getCachedWeek(weekKey: string) {
    return null;
  }

  /**
   * Get user's preferred currency
   */
  async getUserCurrency(): Promise<string> {
    const preferences = await userService.getUserPreferences();
    return preferences?.currency || 'USD';
  }

  /**
   * Get user preferences
   */
  async getUserPreferences() {
    return await userService.getUserPreferences();
  }

  /**
   * Week utility methods
   */
  getWeekKey(date: Date, firstDayOfWeek: number = 1): string {
    const year = date.getFullYear();
    const week = this.getWeekNumber(date);
    return `${year}-W${week.toString().padStart(2, '0')}`;
  }

  getWeekStart(date: Date, firstDayOfWeek: number = 1): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : firstDayOfWeek);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  addWeeks(date: Date, weeks: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + (weeks * 7));
    return result;
  }

  subtractWeeks(date: Date, weeks: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() - (weeks * 7));
    return result;
  }

  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  private parseWeekKey(weekKey: string): Date {
    // Parse week key format like "2024-W01"
    const match = weekKey.match(/^(\d{4})-W(\d{2})$/);
    if (!match) {
      throw new Error(`Invalid week key format: ${weekKey}`);
    }
    
    const year = parseInt(match[1]);
    const week = parseInt(match[2]);
    
    // Create a date for the first day of the year
    const jan1 = new Date(year, 0, 1);
    const jan1Day = jan1.getDay();
    
    // Calculate the start of the first week (Monday)
    const firstWeekStart = new Date(jan1);
    firstWeekStart.setDate(jan1.getDate() - jan1Day + 1);
    
    // Add weeks to get to the target week
    const targetWeekStart = new Date(firstWeekStart);
    targetWeekStart.setDate(firstWeekStart.getDate() + (week - 1) * 7);
    
    return targetWeekStart;
  }
}

export const planningService = new PlanService();
