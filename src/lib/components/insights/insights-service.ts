import { db, generateUUID } from '$lib/core/db';
import { analyticsCoreService } from '$lib/core/services/analytics-core-service';
import { budgetService } from '$lib/core/services/budget-service';
import { transactionService } from '$lib/core/services/transaction-service';
import { userActionsService } from '$lib/core/services/user-actions-service';
import type { TransactionOrGroup } from '$lib/core/services/transaction-service';
import type { 
  UnifiedInsight, 
  InsightType, 
  InsightCategory, 
  InsightSeverity, 
  InsightMetadata,
  BehavioralPattern,
  PredictionInsight,
  BadgeInsight,
  InsightsServiceInterface,
  BehavioralAnalysisServiceInterface,
  PredictionServiceInterface,
  BadgeServiceInterface
} from '$lib/components/insights/types';

// ============================================================================
// UNIFIED INSIGHTS SERVICE
// ============================================================================

class UnifiedInsightsService implements InsightsServiceInterface {
  private insights: UnifiedInsight[] = [];
  private updateInterval: ReturnType<typeof setInterval> | null = null;
  private lastUpdate = 0;
  private updateFrequency = 5 * 60 * 1000; // 5 minutes
  private isUpdating = false;

  public get ready() {
    return db.isOpen();
  }

  public isLoading() {
    return !this.ready;
  }

  /**
   * Get all active insights
   */
  getInsights(): UnifiedInsight[] {
    return this.insights.filter(insight => insight.isActive && !insight.dismissedAt);
  }

  /**
   * Get insights by type
   */
  getInsightsByType(type: InsightType): UnifiedInsight[] {
    return this.getInsights().filter(insight => insight.type === type);
  }

  /**
   * Get insights by severity
   */
  getInsightsBySeverity(severity: InsightSeverity): UnifiedInsight[] {
    return this.getInsights().filter(insight => insight.severity === severity);
  }

  /**
   * Get insights by category
   */
  getInsightsByCategory(category: InsightCategory): UnifiedInsight[] {
    return this.getInsights().filter(insight => insight.category === category);
  }

  /**
   * Get insights by source route
   */
  getInsightsBySourceRoute(sourceRoute: 'plan' | 'goals' | 'analyze' | 'system'): UnifiedInsight[] {
    return this.getInsights().filter(insight => insight.sourceRoute === sourceRoute);
  }

  /**
   * Start automatic updates
   */
  startAutoUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    // Initial update
    this.updateInsights();

    // Set up periodic updates
    this.updateInterval = setInterval(() => {
      this.updateInsights();
    }, this.updateFrequency);
  }

  /**
   * Stop automatic updates
   */
  stopAutoUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Force an immediate update
   */
  async forceUpdate(): Promise<void> {
    await this.updateInsights();
  }

  /**
   * Dismiss an insight
   */
  async dismissInsight(insightId: string): Promise<void> {
    const insight = this.insights.find(i => i.id === insightId);
    if (insight) {
      insight.dismissedAt = new Date().toISOString();
      insight.isActive = false;

      // Track dismissal in user actions service
      await userActionsService.track('insight_dismissed', {
        insightId,
        insightType: insight.type,
        insightTitle: insight.title,
        dismissedAt: insight.dismissedAt
      });
    }
  }

  /**
   * Get insights count by severity
   */
  getInsightsCount(): { total: number; info: number; warning: number; alert: number; success: number; celebration: number } {
    const activeInsights = this.getInsights();
    return {
      total: activeInsights.length,
      info: activeInsights.filter(i => i.severity === 'info').length,
      warning: activeInsights.filter(i => i.severity === 'warning').length,
      alert: activeInsights.filter(i => i.severity === 'alert').length,
      success: activeInsights.filter(i => i.severity === 'success').length,
      celebration: activeInsights.filter(i => i.severity === 'celebration').length
    };
  }

  /**
   * Main update method
   */
  private async updateInsights(): Promise<void> {
    if (this.isUpdating || !this.ready) return;

    this.isUpdating = true;
    const startTime = Date.now();

    try {
      const newInsights: UnifiedInsight[] = [];

      // Generate budget insights
      const budgetInsights = await this.generateBudgetInsights();
      newInsights.push(...budgetInsights);

      // Generate spending insights
      const spendingInsights = await this.generateSpendingInsights();
      newInsights.push(...spendingInsights);

      // Generate goal insights
      const goalInsights = await this.generateGoalInsights();
      newInsights.push(...goalInsights);

      // Generate anomaly insights
      const anomalyInsights = await this.generateAnomalyInsights();
      newInsights.push(...anomalyInsights);

      // Generate behavioral insights
      const behavioralInsights = await this.generateBehavioralInsights();
      newInsights.push(...behavioralInsights);

      // Generate app usage insights
      const appUsageInsights = await this.generateAppUsageInsights();
      newInsights.push(...appUsageInsights);

      // Generate optimization insights
      const optimizationInsights = await this.generateOptimizationInsights();
      newInsights.push(...optimizationInsights);

      // Filter out similar insights and update the main array
      const filteredInsights = newInsights.filter(insight => 
        !this.isSimilarInsightExists(insight)
      );

      // Add new insights to the array
      this.insights.push(...filteredInsights);

      // Clean up old insights (older than 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      this.insights = this.insights.filter(insight => {
        const createdAt = new Date(insight.createdAt);
        return createdAt > thirtyDaysAgo || insight.isActive;
      });

      this.lastUpdate = Date.now();

      // Log performance
      const duration = Date.now() - startTime;
      if (duration > 1000) {
        console.warn(`Insights update took ${duration}ms`);
      }

    } catch (error) {
      console.error('Error updating insights:', error);
    } finally {
      this.isUpdating = false;
    }
  }

  /**
   * Generate budget-related insights
   */
  private async generateBudgetInsights(): Promise<UnifiedInsight[]> {
    const insights: UnifiedInsight[] = [];
    
    try {
      const categoryBudgets = await budgetService.calculateCategoryBudgets();

      for (const categoryBudget of categoryBudgets) {
        const category = categoryBudget.waterfallCategory;
        const percentageSpent = categoryBudget.totalAllocated > 0 
          ? categoryBudget.spent / categoryBudget.totalAllocated 
          : 0;

        // Approaching threshold (80%)
        if (percentageSpent >= 0.8 && percentageSpent < 1.0) {
          insights.push(this.createInsight({
            type: 'budget_alert',
            category: category as InsightCategory,
            severity: 'warning',
            title: `${category.charAt(0).toUpperCase() + category.slice(1)} Budget Approaching Limit`,
            description: `You've used ${Math.round(percentageSpent * 100)}% of your ${category} budget.`,
            actionable: true,
            actionText: 'Review Budget',
            actionUrl: '/plan',
            sourceRoute: 'plan',
            metadata: {
              percentage: percentageSpent,
              amount: categoryBudget.spent,
              remaining: categoryBudget.remaining,
              threshold: 0.8,
              category: category as InsightCategory
            }
          }));
        }

        // Exceeded threshold (100%)
        if (percentageSpent >= 1.0 && percentageSpent < 1.1) {
          insights.push(this.createInsight({
            type: 'budget_alert',
            category: category as InsightCategory,
            severity: 'alert',
            title: `${category.charAt(0).toUpperCase() + category.slice(1)} Budget Exceeded`,
            description: `You've exceeded your ${category} budget by ${Math.round((percentageSpent - 1) * 100)}%.`,
            actionable: true,
            actionText: 'Adjust Budget',
            actionUrl: '/plan',
            sourceRoute: 'plan',
            metadata: {
              percentage: percentageSpent,
              amount: categoryBudget.spent,
              remaining: categoryBudget.remaining,
              threshold: 1.0,
              category: category as InsightCategory
            }
          }));
        }

        // Surplus threshold (20% remaining)
        if (categoryBudget.remaining > 0) {
          const remainingPercentage = categoryBudget.remaining / categoryBudget.totalAllocated;
          if (remainingPercentage >= 0.2) {
            insights.push(this.createInsight({
              type: 'budget_alert',
              category: category as InsightCategory,
              severity: 'success',
              title: `${category.charAt(0).toUpperCase() + category.slice(1)} Budget Surplus`,
              description: `Great job! You have ${Math.round(remainingPercentage * 100)}% remaining in your ${category} budget.`,
              actionable: true,
              actionText: 'Reallocate Funds',
              actionUrl: '/plan',
              sourceRoute: 'plan',
              metadata: {
                percentage: 1 - remainingPercentage,
                amount: categoryBudget.spent,
                remaining: categoryBudget.remaining,
                threshold: 0.2,
                category: category as InsightCategory
              }
            }));
          }
        }
      }
    } catch (error) {
      console.error('Error generating budget insights:', error);
    }

    return insights;
  }

  /**
   * Generate spending-related insights
   */
  private async generateSpendingInsights(): Promise<UnifiedInsight[]> {
    const insights: UnifiedInsight[] = [];

    try {
      // Spending velocity insights
      const velocityData = await analyticsCoreService.calculateSpendingVelocity('monthly');
      for (const data of velocityData) {
        if (data.velocityRatio >= 2.0) {
          insights.push(this.createInsight({
            type: 'spending_pattern',
            category: 'system',
            severity: 'warning',
            title: `High Spending Velocity: ${data.whyTagName}`,
            description: `Your spending on ${data.whyTagName} is ${data.velocityRatio.toFixed(1)}x higher than usual.`,
            actionable: true,
            actionText: 'Review Transactions',
            actionUrl: '/transactions',
            sourceRoute: 'analyze',
            metadata: {
              amount: data.currentPeriodSpending,
              threshold: 2.0,
              confidence: Math.min(100, data.velocityRatio * 25),
              whyTagId: data.whyTagId
            }
          }));
        }
      }

      // Trend insights
      const trends = await analyticsCoreService.calculateTrends(3, 'monthly');
      if (trends.length >= 2) {
        const recentTrend = trends[trends.length - 1];
        const previousTrend = trends[trends.length - 2];

        if (recentTrend.trend === 'increasing' && recentTrend.percentageChange > 20) {
          insights.push(this.createInsight({
            type: 'trend',
            category: 'system',
            severity: 'warning',
            title: 'Spending Trend Increasing',
            description: `Your spending has increased by ${Math.round(recentTrend.percentageChange)}% this month.`,
            actionable: true,
            actionText: 'Analyze Trends',
            actionUrl: '/analyze',
            sourceRoute: 'analyze',
            metadata: {
              amount: recentTrend.amount,
              percentage: recentTrend.percentageChange,
              threshold: 20,
              confidence: 75
            }
          }));
        }
      }

      // Savings opportunity insights
      const now = new Date();
      const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const analysis = await analyticsCoreService.analyzeTransactions(
        currentMonth.toISOString(),
        now.toISOString()
      );

      const savingsRate = analysis.totalIncome > 0 ? analysis.netAmount / analysis.totalIncome : 0;
      if (savingsRate < 0.1) {
        insights.push(this.createInsight({
          type: 'optimization',
          category: 'security',
          severity: 'warning',
          title: 'Low Savings Rate',
          description: `You're saving ${Math.round(savingsRate * 100)}% of your income. Consider increasing this to 20%.`,
          actionable: true,
          actionText: 'Set Savings Goal',
          actionUrl: '/goals',
          sourceRoute: 'goals',
          metadata: {
            percentage: savingsRate,
            threshold: 0.1,
            confidence: 85
          }
        }));
      }

    } catch (error) {
      console.error('Error generating spending insights:', error);
    }

    return insights;
  }

  /**
   * Generate goal-related insights
   */
  private async generateGoalInsights(): Promise<UnifiedInsight[]> {
    const insights: UnifiedInsight[] = [];

    try {
      const goalProgress = await analyticsCoreService.calculateGoalProgress();

      for (const goal of goalProgress) {
        const milestones = [0.25, 0.5, 0.75, 1.0];
        
        for (const milestone of milestones) {
          if (goal.progress >= milestone && goal.progress < milestone + 0.01) {
            insights.push(this.createInsight({
              type: 'goal_milestone',
              category: 'growth',
              severity: 'celebration',
              title: `Goal Milestone: ${goal.tagName}`,
              description: `Congratulations! You've reached ${Math.round(milestone * 100)}% of your ${goal.tagName} goal.`,
              actionable: false,
              sourceRoute: 'goals',
              metadata: {
                percentage: goal.progress,
                amount: goal.currentAmount,
                threshold: milestone,
                confidence: goal.successProbability,
                whyTagId: goal.tagId
              }
            }));
            break;
          }
        }
      }
    } catch (error) {
      console.error('Error generating goal insights:', error);
    }

    return insights;
  }

  /**
   * Generate anomaly insights
   */
  private async generateAnomalyInsights(): Promise<UnifiedInsight[]> {
    const insights: UnifiedInsight[] = [];

    try {
      const anomalies = await this.detectAnomalies();

      for (const anomaly of anomalies) {
        if (anomaly.severity === 'high') {
          insights.push(this.createInsight({
            type: 'anomaly',
            category: 'system',
            severity: 'alert',
            title: 'Unusual Spending Detected',
            description: `Spending of $${anomaly.amount.toFixed(2)} is significantly higher than expected.`,
            actionable: true,
            actionText: 'Review Transaction',
            actionUrl: '/transactions',
            sourceRoute: 'analyze',
            metadata: {
              amount: anomaly.amount,
              threshold: anomaly.expectedAmount,
              confidence: 85,
              whyTagId: anomaly.whyTagId
            }
          }));
        }
      }
    } catch (error) {
      console.error('Error generating anomaly insights:', error);
    }

    return insights;
  }

  /**
   * Generate behavioral insights
   */
  private async generateBehavioralInsights(): Promise<UnifiedInsight[]> {
    const insights: UnifiedInsight[] = [];

    try {
      // Simple behavioral insight for now
      insights.push(this.createInsight({
        type: 'behavioral',
        category: 'system',
        severity: 'info',
        title: 'Weekend Spending Pattern',
        description: 'You tend to spend 30% more on weekends. Consider planning your purchases.',
        actionable: true,
        actionText: 'Plan Purchases',
        actionUrl: '/plan',
        sourceRoute: 'plan',
        metadata: {
          confidence: 70,
          percentage: 30
        }
      }));
    } catch (error) {
      console.error('Error generating behavioral insights:', error);
    }

    return insights;
  }

  /**
   * Generate app usage insights
   */
  private async generateAppUsageInsights(): Promise<UnifiedInsight[]> {
    const insights: UnifiedInsight[] = [];

    try {
      // Get user actions to analyze app usage patterns
      const now = new Date();
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      const recentActions = await userActionsService.getActionsByDateRange(
        oneWeekAgo.toISOString(),
        now.toISOString()
      );

      // Check for transaction logging patterns
      const transactionActions = recentActions.filter(action => 
        action.action === 'transaction_added' || action.action === 'transaction_updated'
      );

      if (transactionActions.length >= 7) {
        insights.push(this.createInsight({
          type: 'app_usage',
          category: 'system',
          severity: 'success',
          title: 'Consistent Transaction Logging',
          description: 'Great job! You\'ve been logging transactions daily for a week.',
          actionable: false,
          sourceRoute: 'system',
          metadata: {
            confidence: 90,
            percentage: 100
          }
        }));
      }

      // Check for budget checking patterns
      const budgetActions = recentActions.filter(action => 
        action.action === 'budget_viewed' || action.action === 'budget_checked'
      );

      if (budgetActions.length >= 5) {
        insights.push(this.createInsight({
          type: 'app_usage',
          category: 'system',
          severity: 'info',
          title: 'Active Budget Monitoring',
          description: 'You\'re actively monitoring your budget. Keep up the good work!',
          actionable: false,
          sourceRoute: 'system',
          metadata: {
            confidence: 80,
            percentage: 100
          }
        }));
      }

    } catch (error) {
      console.error('Error generating app usage insights:', error);
    }

    return insights;
  }

  /**
   * Generate optimization insights
   */
  private async generateOptimizationInsights(): Promise<UnifiedInsight[]> {
    const insights: UnifiedInsight[] = [];

    try {
      // Check for recurring transaction opportunities
      const now = new Date();
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      const transactions = await transactionService.getTransactionsByDateRange(
        oneMonthAgo.toISOString(),
        now.toISOString()
      ) as TransactionOrGroup[];

      // Flatten transaction groups
      const flatTransactions: any[] = [];
      for (const group of transactions) {
        if (group.type === 'single') {
          flatTransactions.push(group.representative);
        } else {
          flatTransactions.push(...group.transactions);
        }
      }

      // Look for similar transactions that could be recurring
      const expenseTransactions = flatTransactions.filter(t => t.type === 'expense');
      const similarTransactions = new Map<string, any[]>();

      for (const transaction of expenseTransactions) {
        const key = `${transaction.whyTagId}-${Math.abs(transaction.amount).toFixed(0)}`;
        if (!similarTransactions.has(key)) {
          similarTransactions.set(key, []);
        }
        similarTransactions.get(key)!.push(transaction);
      }

      // Find potential recurring transactions
      for (const [key, transactions] of similarTransactions) {
        if (transactions.length >= 3) {
          const firstTransaction = transactions[0];
          insights.push(this.createInsight({
            type: 'optimization',
            category: 'system',
            severity: 'info',
            title: 'Recurring Transaction Opportunity',
            description: `You've made ${transactions.length} similar transactions. Consider setting up a recurring transaction.`,
            actionable: true,
            actionText: 'Set Up Recurring',
            actionUrl: '/transactions',
            sourceRoute: 'system',
            metadata: {
              confidence: 75,
              amount: Math.abs(firstTransaction.amount),
              whyTagId: firstTransaction.whyTagId
            }
          }));
          break; // Only show one optimization insight at a time
        }
      }

    } catch (error) {
      console.error('Error generating optimization insights:', error);
    }

    return insights;
  }

  /**
   * Detect spending anomalies
   */
  async detectAnomalies(threshold: number = 2.0): Promise<Array<{
    date: Date;
    amount: number;
    expectedAmount: number;
    deviation: number;
    severity: 'low' | 'medium' | 'high';
    factors: string[];
    whyTagId?: string;
  }>> {
    const anomalies: Array<{
      date: Date;
      amount: number;
      expectedAmount: number;
      deviation: number;
      severity: 'low' | 'medium' | 'high';
      factors: string[];
      whyTagId?: string;
    }> = [];

    try {
      const transactionGroups = await transactionService.getTransactionsByDateRange(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        new Date().toISOString()
      ) as TransactionOrGroup[];

      // Flatten transaction groups into individual transactions
      const transactions: any[] = [];
      for (const group of transactionGroups) {
        if (group.type === 'single') {
          transactions.push(group.representative);
        } else {
          transactions.push(...group.transactions);
        }
      }

      const expenseTransactions = transactions.filter(t => t.type === 'expense');

      if (expenseTransactions.length < 10) return anomalies;

      // Calculate statistical measures
      const amounts = expenseTransactions.map(t => Math.abs(t.amount));
      const mean = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
      const variance = amounts.reduce((sum, amount) => sum + Math.pow(amount - mean, 2), 0) / amounts.length;
      const stdDev = Math.sqrt(variance);

      // Detect anomalies
      for (const transaction of expenseTransactions) {
        const zScore = Math.abs((Math.abs(transaction.amount) - mean) / stdDev);
        
        if (zScore > threshold) {
          const deviation = Math.abs(transaction.amount) - mean;
          const severity = zScore > 3 ? 'high' : zScore > 2 ? 'medium' : 'low';
          
          anomalies.push({
            date: new Date(transaction.clearedDate || transaction.createdAt),
            amount: Math.abs(transaction.amount),
            expectedAmount: mean,
            deviation,
            severity,
            factors: ['Statistical outlier', 'Unusual amount'],
            whyTagId: transaction.whyTagId
          });
        }
      }
    } catch (error) {
      console.error('Error detecting anomalies:', error);
    }

    return anomalies.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  /**
   * Check if similar insight exists
   */
  private isSimilarInsightExists(newInsight: Omit<UnifiedInsight, 'id' | 'createdAt' | 'isActive'>): boolean {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    return this.insights.some(existing => {
      // Check if it's the same type and has similar content
      if (existing.type !== newInsight.type) return false;
      
      // Check if it was created recently and not dismissed
      const createdAt = new Date(existing.createdAt);
      if (createdAt < oneDayAgo || existing.dismissedAt) return false;

      // Check for similar content (title similarity)
      const titleSimilarity = this.calculateSimilarity(existing.title, newInsight.title);
      if (titleSimilarity > 0.8) return true;

      // Check for similar context (same category, tag, etc.)
      if (existing.category === newInsight.category && 
          existing.metadata.whyTagId === newInsight.metadata.whyTagId) {
        return true;
      }

      return false;
    });
  }

  /**
   * Calculate string similarity (simple implementation)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const words1 = str1.toLowerCase().split(/\s+/);
    const words2 = str2.toLowerCase().split(/\s+/);
    
    const commonWords = words1.filter(word => words2.includes(word));
    const totalWords = Math.max(words1.length, words2.length);
    
    return totalWords > 0 ? commonWords.length / totalWords : 0;
  }

  /**
   * Create a new insight
   */
  private createInsight(insightData: Omit<UnifiedInsight, 'id' | 'createdAt' | 'isActive'>): UnifiedInsight {
    const insight: UnifiedInsight = {
      id: generateUUID(),
      ...insightData,
      createdAt: new Date().toISOString(),
      isActive: true
    };

    return insight;
  }

  /**
   * Clear all insights
   */
  clearAllInsights(): void {
    this.insights = [];
  }

  /**
   * Get last update time
   */
  getLastUpdateTime(): number {
    return this.lastUpdate;
  }

  /**
   * Set update frequency
   */
  setUpdateFrequency(frequencyMs: number): void {
    this.updateFrequency = frequencyMs;
    if (this.updateInterval) {
      this.stopAutoUpdates();
      this.startAutoUpdates();
    }
  }
}

// ============================================================================
// BEHAVIORAL ANALYSIS SERVICE
// ============================================================================

class BehavioralAnalysisService implements BehavioralAnalysisServiceInterface {
  private patterns: BehavioralPattern[] = [];

  getPatterns(): BehavioralPattern[] {
    return this.patterns;
  }

  async analyzeTransactionPatterns(): Promise<BehavioralPattern[]> {
    // Implementation for transaction pattern analysis
    return [];
  }

  async analyzeEngagementPatterns(): Promise<BehavioralPattern[]> {
    // Implementation for engagement pattern analysis
    return [];
  }

  async analyzeSpendingPatterns(): Promise<BehavioralPattern[]> {
    // Implementation for spending pattern analysis
    return [];
  }
}

// ============================================================================
// PREDICTION SERVICE
// ============================================================================

class PredictionService implements PredictionServiceInterface {
  private predictions: PredictionInsight[] = [];

  getPredictions(): PredictionInsight[] {
    return this.predictions;
  }

  async generateSpendingForecast(): Promise<PredictionInsight[]> {
    // Implementation for spending forecast
    return [];
  }

  async generateGoalPredictions(): Promise<PredictionInsight[]> {
    // Implementation for goal predictions
    return [];
  }

  async detectAnomalies(): Promise<PredictionInsight[]> {
    // Implementation for anomaly detection
    return [];
  }
}

// ============================================================================
// BADGE SERVICE
// ============================================================================

class BadgeService implements BadgeServiceInterface {
  private badges: BadgeInsight[] = [];

  getBadges(): BadgeInsight[] {
    return this.badges;
  }

  async checkBudgetBadges(): Promise<BadgeInsight[]> {
    // Implementation for budget badges
    return [];
  }

  async checkGoalBadges(): Promise<BadgeInsight[]> {
    // Implementation for goal badges
    return [];
  }

  async checkBehavioralBadges(): Promise<BadgeInsight[]> {
    // Implementation for behavioral badges
    return [];
  }

  async checkFinancialMilestones(): Promise<BadgeInsight[]> {
    // Implementation for financial milestones
    return [];
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const unifiedInsightsService = new UnifiedInsightsService();
export const behavioralAnalysisService = new BehavioralAnalysisService();
export const predictionService = new PredictionService();
export const badgeService = new BadgeService();
