import { db, generateUUID } from '$lib/core/db';
import { analyticsService } from './analytics-service';
import { predictionService } from './prediction-service';
import { goalService } from '../core/goal-service';
import { budgetService } from '../core/budget-service';
import { accountService } from '../core/account-service';
import { transactionService } from '../core/transaction-service';
import { getBufferStatus, getBufferAmount, getBufferDeficit } from '$lib/utils/account-metadata-utils';
import type { Insight, Goal, Transaction, Category, Account } from '$lib/core/db';

interface CrossRouteInsightData {
    goals: Goal[];
    transactions: Transaction[];
    categories: Category[];
    budgetData: any;
    analyticsData: any;
    accounts: Account[];
}

interface InsightGenerationContext {
    userId?: string;
    timeRange: 'week' | 'month' | 'quarter' | 'year';
    includePredictions: boolean;
    includeBehavioral: boolean;
}

class InsightsService {
    private lastUpdate = 0;
    private updateFrequency = 5 * 60 * 1000; // 5 minutes
    private isUpdating = false;

    public get ready() {
        return Promise.resolve();
    }

    public isLoading() {
        return this.isUpdating;
    }

    // ============================================================================
    // INSIGHT MANAGEMENT
    // ============================================================================

    /**
     * Get all active insights
     */
    async getInsights(): Promise<Insight[]> {
        return await db.getActiveInsights();
    }

    /**
     * Get insights by type
     */
    async getInsightsByType(type: Insight['type']): Promise<Insight[]> {
        return await db.getInsightsByType(type);
    }

    /**
     * Get insights by severity
     */
    async getInsightsBySeverity(severity: Insight['severity']): Promise<Insight[]> {
        return await db.getInsightsBySeverity(severity);
    }

    /**
     * Get insights count by severity
     */
    async getInsightsCount(): Promise<{ total: number; info: number; warning: number; alert: number; success: number }> {
        const insights = await this.getInsights();
        return {
            total: insights.length,
            info: insights.filter(i => i.severity === 'info').length,
            warning: insights.filter(i => i.severity === 'warning').length,
            alert: insights.filter(i => i.severity === 'alert').length,
            success: insights.filter(i => i.severity === 'success').length
        };
    }

    /**
     * Dismiss an insight
     */
    async dismissInsight(insightId: string): Promise<void> {
        await db.softDeleteInsight(insightId);
    }

    /**
     * Get unread insights
     */
    async getUnreadInsights(): Promise<Insight[]> {
        return await db.getUnreadInsights();
    }

    /**
     * Get unread count
     */
    async getUnreadCount(): Promise<number> {
        return await db.getUnreadCount();
    }

    /**
     * Get unread insights by severity
     */
    async getUnreadBySeverity(severity: Insight['severity']): Promise<Insight[]> {
        return await db.getUnreadBySeverity(severity);
    }

    /**
     * Mark an insight as read
     */
    async markAsRead(insightId: string): Promise<void> {
        await db.markInsightAsRead(insightId);
    }

    /**
     * Mark all insights as read
     */
    async markAllAsRead(): Promise<void> {
        await db.markAllInsightsAsRead();
    }

    /**
     * Get unread alerts count (severity === 'alert')
     */
    async getUnreadAlertsCount(): Promise<number> {
        const alerts = await this.getUnreadBySeverity('alert');
        return alerts.length;
    }

    /**
     * Create a new insight
     */
    async createInsight(data: {
        type: Insight['type'];
        severity: Insight['severity'];
        title: string;
        message: string;
        categoryId?: string;
        goalId?: string;
        percentage?: number;
        amount?: number;
        remaining?: number;
        threshold?: number;
        confidence?: number;
        actionable?: boolean;
        actionText?: string;
        actionUrl?: string;
        expiresAt?: string;
        metadata?: Record<string, any>;
    }): Promise<Insight> {
        const insight: Insight = {
            id: generateUUID(),
            type: data.type,
            severity: data.severity,
            title: data.title,
            message: data.message,
            categoryId: data.categoryId,
            goalId: data.goalId,
            percentage: data.percentage,
            amount: data.amount,
            remaining: data.remaining,
            threshold: data.threshold,
            confidence: data.confidence,
            actionable: data.actionable || false,
            actionText: data.actionText,
            actionUrl: data.actionUrl,
            dismissedAt: undefined,
            expiresAt: data.expiresAt,
            isActive: true,
            metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null
        };

        await db.insights.add(insight);
        return insight;
    }

    // ============================================================================
    // CROSS-ROUTE INSIGHT GENERATION
    // ============================================================================

    /**
     * Generate insights from all routes (goals, budget, analytics)
     */
    async generateCrossRouteInsights(context: InsightGenerationContext = {
        timeRange: 'month',
        includePredictions: true,
        includeBehavioral: true
    }, force: boolean = false): Promise<void> {
        const now = Date.now();
        if (!force && now - this.lastUpdate < this.updateFrequency) {
            return; // Too soon to update
        }

        if (this.isUpdating) {
            return; // Already updating
        }

        this.isUpdating = true;

        try {
            // Clean up expired insights first
            await this.cleanupExpiredInsights();

            // Gather data from all routes
            const crossRouteData = await this.gatherCrossRouteData(context);

            // Generate insights from each route
            const newInsights: Insight[] = [];

            // Goals insights
            const goalInsights = await this.generateGoalInsights(crossRouteData.goals);
            newInsights.push(...goalInsights);

            // Budget insights
            const budgetInsights = await this.generateBudgetInsights(crossRouteData.budgetData, crossRouteData.categories);
            newInsights.push(...budgetInsights);

            // Analytics insights
            const analyticsInsights = await this.generateAnalyticsInsights(crossRouteData.analyticsData, crossRouteData.transactions);
            newInsights.push(...analyticsInsights);

            // Buffer insights
            const bufferInsights = await this.generateBufferInsights(crossRouteData.accounts, crossRouteData.transactions);
            newInsights.push(...bufferInsights);

            // Behavioral insights (if enabled)
            if (context.includeBehavioral) {
                const behavioralInsights = await this.generateBehavioralInsights(crossRouteData);
                newInsights.push(...behavioralInsights);
            }

            // Prediction insights (if enabled)
            if (context.includePredictions) {
                const predictionInsights = await this.generatePredictionInsights(crossRouteData);
                newInsights.push(...predictionInsights);
            }

            // Save new insights to database
            await this.saveInsights(newInsights);

            this.lastUpdate = now;
        } catch (error) {
            console.error('Error generating cross-route insights:', error);
        } finally {
            this.isUpdating = false;
        }
    }

    /**
     * Gather data from all routes
     */
    private async gatherCrossRouteData(context: InsightGenerationContext): Promise<CrossRouteInsightData> {
        const [goals, transactions, categories, budgetData, analyticsData, accounts] = await Promise.all([
            goalService.getGoals(),
            db.getActiveTransactions(),
            db.getActiveCategories(),
            budgetService.getBudgetSummary(),
            analyticsService.getSpendingAnalysis(1), // Current month
            accountService.getAccounts()
        ]);

        return {
            goals,
            transactions,
            categories,
            budgetData,
            analyticsData,
            accounts
        };
    }

    // ============================================================================
    // GOAL INSIGHTS GENERATION
    // ============================================================================

    /**
     * Generate insights from goals data
     */
    private async generateGoalInsights(goals: Goal[]): Promise<Insight[]> {
        const insights: Insight[] = [];

        for (const goal of goals) {
            const progress = goal.currentAmount / goal.targetAmount;
            
            // Milestone insights
            if (progress >= 0.25 && progress < 0.5) {
                insights.push({
                    id: generateUUID(),
                    type: 'goal_milestone',
                    severity: 'success',
                    title: `${goal.name} - 25% Complete!`,
                    message: `You've reached 25% of your ${goal.name} goal. Keep up the great work!`,
                    goalId: goal.id,
                    percentage: 25,
                    confidence: 100,
                    actionable: false,
                    isActive: true,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    deletedAt: null
                });
            }

            if (progress >= 0.5 && progress < 0.75) {
                insights.push({
                    id: generateUUID(),
                    type: 'goal_milestone',
                    severity: 'success',
                    title: `${goal.name} - Halfway There!`,
                    message: `You've reached 50% of your ${goal.name} goal. You're making excellent progress!`,
                    goalId: goal.id,
                    percentage: 50,
                    confidence: 100,
                    actionable: false,
                    isActive: true,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    deletedAt: null
                });
            }

            if (progress >= 0.75 && progress < 1) {
                insights.push({
                    id: generateUUID(),
                    type: 'goal_milestone',
                    severity: 'success',
                    title: `${goal.name} - Almost There!`,
                    message: `You're 75% complete with your ${goal.name} goal. The finish line is in sight!`,
                    goalId: goal.id,
                    percentage: 75,
                    confidence: 100,
                    actionable: false,
                    isActive: true,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    deletedAt: null
                });
            }

            // Behind schedule insights
            if (goal.targetDate && goal.status === 'active') {
                const targetDate = new Date(goal.targetDate);
                const now = new Date();
                const timeRemaining = targetDate.getTime() - now.getTime();
                const daysRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60 * 24));

                if (daysRemaining > 0) {
                    const dailyRequiredAmount = (goal.targetAmount - goal.currentAmount) / daysRemaining;
                    const averageDailyContribution = goal.currentAmount / Math.max(1, Math.ceil((now.getTime() - new Date(goal.createdAt).getTime()) / (1000 * 60 * 60 * 24)));
                    
                    if (averageDailyContribution < dailyRequiredAmount * 0.8) {
                        insights.push({
                            id: generateUUID(),
                            type: 'goal_milestone',
                            severity: 'warning',
                            title: `${goal.name} - Behind Schedule`,
                            message: `You're behind schedule on your ${goal.name} goal. Consider increasing your contributions.`,
                            goalId: goal.id,
                            percentage: progress * 100,
                            confidence: 85,
                            actionable: true,
                            actionText: 'Adjust Goal Timeline',
                            isActive: true,
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                            deletedAt: null
                        });
                    }
                }
            }
        }

        return insights;
    }

    // ============================================================================
    // BUDGET INSIGHTS GENERATION
    // ============================================================================

    /**
     * Generate insights from budget data
     */
    private async generateBudgetInsights(budgetData: any, categories: Category[]): Promise<Insight[]> {
        const insights: Insight[] = [];

        // Budget approaching insights
        for (const category of categories) {
            if (category.budgetAmount && category.budgetAmount > 0) {
                // This would need to be calculated based on actual spending
                // For now, we'll create a placeholder structure
                const spentAmount = 0; // Would be calculated from transactions
                const budgetPercentage = (spentAmount / category.budgetAmount) * 100;

                if (budgetPercentage >= 80 && budgetPercentage < 100) {
                    insights.push({
                        id: generateUUID(),
                        type: 'budget_approaching',
                        severity: 'warning',
                        title: `${category.name} Budget - 80% Used`,
                        message: `You've used 80% of your ${category.name} budget. Consider reducing spending in this category.`,
                        categoryId: category.id,
                        percentage: budgetPercentage,
                        threshold: 80,
                        confidence: 95,
                        actionable: true,
                        actionText: 'Review Budget',
                        isActive: true,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        deletedAt: null
                    });
                }

                if (budgetPercentage >= 100) {
                    insights.push({
                        id: generateUUID(),
                        type: 'budget_exceeded',
                        severity: 'alert',
                        title: `${category.name} Budget Exceeded`,
                        message: `You've exceeded your ${category.name} budget. Immediate action needed.`,
                        categoryId: category.id,
                        percentage: budgetPercentage,
                        threshold: 100,
                        confidence: 100,
                        actionable: true,
                        actionText: 'Adjust Budget',
                        isActive: true,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        deletedAt: null
                    });
                }
            }
        }

        return insights;
    }

    // ============================================================================
    // BUFFER INSIGHTS GENERATION
    // ============================================================================

    /**
     * Generate insights for account buffer management
     */
    private async generateBufferInsights(accounts: Account[], transactions: Transaction[]): Promise<Insight[]> {
        const insights: Insight[] = [];

        for (const account of accounts) {
            // Only check buffer for checking and savings accounts
            if (account.type !== 'checking' && account.type !== 'savings') {
                continue;
            }

            const bufferAmount = getBufferAmount(account);
            if (bufferAmount === 0) {
                continue; // No buffer set
            }

            const bufferStatus = getBufferStatus(account);
            const deficit = getBufferDeficit(account);

            // Critical buffer alert
            if (bufferStatus === 'critical') {
                insights.push({
                    id: generateUUID(),
                    type: 'budget_exceeded',
                    severity: 'alert',
                    title: `Critical: ${account.name} Below Buffer`,
                    message: `${account.name} is ${deficit.toFixed(2)} ${account.currency} below the recommended buffer of ${bufferAmount.toFixed(2)} ${account.currency}. Consider transferring funds to maintain your safety buffer.`,
                    amount: deficit,
                    threshold: bufferAmount,
                    confidence: 100,
                    actionable: true,
                    actionText: 'View Account',
                    actionUrl: `/accounts/${account.id}`,
                    metadata: JSON.stringify({
                        accountId: account.id,
                        accountName: account.name,
                        bufferAmount,
                        currentBalance: account.currentBalance,
                        deficit
                    }),
                    isActive: true,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    deletedAt: null
                });
            }
            // Warning buffer alert
            else if (bufferStatus === 'warning') {
                insights.push({
                    id: generateUUID(),
                    type: 'budget_exceeded',
                    severity: 'warning',
                    title: `Warning: ${account.name} Approaching Buffer`,
                    message: `${account.name} is approaching the buffer threshold. Current balance: ${account.currentBalance.toFixed(2)} ${account.currency}, Buffer: ${bufferAmount.toFixed(2)} ${account.currency}.`,
                    amount: account.currentBalance,
                    threshold: bufferAmount,
                    confidence: 90,
                    actionable: true,
                    actionText: 'View Account',
                    actionUrl: `/accounts/${account.id}`,
                    metadata: JSON.stringify({
                        accountId: account.id,
                        accountName: account.name,
                        bufferAmount,
                        currentBalance: account.currentBalance
                    }),
                    isActive: true,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    deletedAt: null
                });
            }
            // Positive insight for optimal buffer
            else if (bufferStatus === 'optimal' && account.currentBalance >= bufferAmount * 1.5) {
                // Only create positive insights occasionally to avoid spam
                const shouldCreate = Math.random() < 0.1; // 10% chance
                if (shouldCreate) {
                    insights.push({
                        id: generateUUID(),
                        type: 'achievement',
                        severity: 'success',
                        title: `${account.name} Has Healthy Buffer`,
                        message: `Great job! ${account.name} has a healthy buffer above the recommended amount.`,
                        amount: account.currentBalance,
                        threshold: bufferAmount,
                        confidence: 100,
                        actionable: false,
                        metadata: JSON.stringify({
                            accountId: account.id,
                            accountName: account.name,
                            bufferAmount,
                            currentBalance: account.currentBalance
                        }),
                        isActive: true,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        deletedAt: null
                    });
                }
            }
        }

        return insights;
    }

    // ============================================================================
    // ANALYTICS INSIGHTS GENERATION
    // ============================================================================

    /**
     * Generate insights from analytics data
     */
    private async generateAnalyticsInsights(analyticsData: any, transactions: Transaction[]): Promise<Insight[]> {
        const insights: Insight[] = [];

        // Spending pattern insights
        if (analyticsData.topCategories && analyticsData.topCategories.length > 0) {
            const topCategory = analyticsData.topCategories[0];
            insights.push({
                id: generateUUID(),
                type: 'spending_velocity',
                severity: 'info',
                title: 'Top Spending Category',
                message: `Your highest spending category is ${topCategory.categoryName} with $${topCategory.amount.toFixed(2)}`,
                amount: topCategory.amount,
                percentage: topCategory.percentage,
                confidence: 85,
                actionable: false,
                metadata: JSON.stringify({
                    categoryName: topCategory.categoryName,
                    amount: topCategory.amount,
                    percentage: topCategory.percentage
                }),
                isActive: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                deletedAt: null
            });
        }

        // Trend insights
        if (analyticsData.totalSpent > 0) {
            // This would need historical data for comparison
            // For now, we'll create a basic structure
            insights.push({
                id: generateUUID(),
                type: 'trend',
                severity: 'info',
                title: 'Monthly Spending Summary',
                message: `You spent $${analyticsData.totalSpent.toFixed(2)} this month across ${analyticsData.topCategories?.length || 0} categories`,
                amount: analyticsData.totalSpent,
                confidence: 90,
                actionable: false,
                isActive: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                deletedAt: null
            });
        }

        return insights;
    }

    // ============================================================================
    // BEHAVIORAL INSIGHTS GENERATION
    // ============================================================================

    /**
     * Generate behavioral pattern insights
     */
    private async generateBehavioralInsights(data: CrossRouteInsightData): Promise<Insight[]> {
        const insights: Insight[] = [];

        // Analyze spending patterns
        const spendingPatterns = this.analyzeSpendingPatterns(data.transactions);
        
        if (spendingPatterns.hasUnusualSpending) {
            insights.push({
                id: generateUUID(),
                type: 'behavioral',
                severity: 'warning',
                title: 'Unusual Spending Pattern Detected',
                message: spendingPatterns.message,
                confidence: spendingPatterns.confidence,
                actionable: true,
                actionText: 'Review Transactions',
                metadata: JSON.stringify(spendingPatterns.metadata),
                isActive: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                deletedAt: null
            });
        }

        return insights;
    }

    // ============================================================================
    // PREDICTION INSIGHTS GENERATION
    // ============================================================================

    /**
     * Generate prediction-based insights using real prediction algorithms
     */
    private async generatePredictionInsights(data: CrossRouteInsightData): Promise<Insight[]> {
        const insights: Insight[] = [];

        try {
            console.log('[InsightsService] Generating prediction insights...');
            // 1. Predict budget outcomes (budget risk analysis)
            const budgetPredictions = await this.predictBudgetOutcomes(data);
            
            // Ensure budgetPredictions is an array
            if (!Array.isArray(budgetPredictions)) {
                console.error('predictBudgetOutcomes did not return an array:', budgetPredictions);
                // Continue with empty array
            } else {
                for (const prediction of budgetPredictions) {
                    insights.push({
                        id: generateUUID(),
                        type: 'prediction',
                        severity: prediction.severity,
                        title: prediction.title,
                        message: prediction.message,
                        categoryId: prediction.categoryId,
                        percentage: prediction.percentage,
                        confidence: prediction.confidence,
                        actionable: prediction.actionable,
                        actionText: prediction.actionText,
                        metadata: JSON.stringify(prediction.metadata),
                        isActive: true,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        deletedAt: null
                    });
                }
            }

            // 2. Goal completion forecasting
            const goalForecasts = await predictionService.forecastGoalCompletion();
            
            for (const forecast of goalForecasts) {
                if (!forecast.isOnTrack || forecast.riskFactors.length > 0) {
                    const severity: Insight['severity'] = forecast.riskFactors.length > 2 ? 'alert' : 
                                                          forecast.riskFactors.length > 0 ? 'warning' : 'info';
                    
                    const riskMessage = forecast.riskFactors.length > 0 
                        ? ` Risk factors: ${forecast.riskFactors.join(', ')}.`
                        : '';
                    
                    insights.push({
                        id: generateUUID(),
                        type: 'prediction',
                        severity,
                        title: `${forecast.goalName} Completion Forecast`,
                        message: `Goal is ${forecast.isOnTrack ? 'on track' : 'behind schedule'}. Estimated completion: ${forecast.estimatedCompletionDate.toLocaleDateString()}. Required monthly contribution: ${Math.round(forecast.requiredMonthlyContribution)}.${riskMessage}`,
                        goalId: forecast.goalId,
                        confidence: forecast.confidence,
                        actionable: !forecast.isOnTrack,
                        actionText: !forecast.isOnTrack ? 'Increase Contributions' : undefined,
                        metadata: JSON.stringify({
                            estimatedCompletionDate: forecast.estimatedCompletionDate.toISOString(),
                            currentProgress: forecast.currentProgress,
                            requiredMonthlyContribution: forecast.requiredMonthlyContribution,
                            isOnTrack: forecast.isOnTrack,
                            riskFactors: forecast.riskFactors,
                            algorithm: 'Goal Completion Forecasting'
                        }),
                        isActive: true,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        deletedAt: null
                    });
                }
            }

            // 3. Spending forecasts - show all predictions for debugging, but prioritize high-risk/high-value
            const spendingForecasts = await predictionService.predictSpending(undefined, 1);
            
            console.log(`[InsightsService] Generated ${spendingForecasts.length} spending forecasts`);
            
            // Sort by risk and confidence, then take top 25 (increased to see more predictions)
            const sortedForecasts = spendingForecasts
                // Removed filter to show all predictions for debugging
                .sort((a, b) => {
                    // Prioritize high risk
                    if (a.riskLevel === 'high' && b.riskLevel !== 'high') return -1;
                    if (b.riskLevel === 'high' && a.riskLevel !== 'high') return 1;
                    // Then by confidence
                    return b.confidence - a.confidence;
                })
                .slice(0, 25); // Increased limit to see more predictions
            
            for (const forecast of sortedForecasts) {
                console.log(`[InsightsService] Creating insight for ${forecast.categoryName}: predictedAmount=${forecast.predictedAmount}, currency should be main currency`);
                insights.push({
                    id: generateUUID(),
                    type: 'prediction',
                    severity: forecast.riskLevel === 'high' ? 'warning' : 'info',
                    title: `${forecast.categoryName || 'Spending'} Forecast`,
                    message: `Predicted spending for next month: ${Math.round(forecast.predictedAmount)}. Confidence: ${forecast.confidence}%. Factors: ${forecast.factors.join(', ')}.`,
                    categoryId: forecast.categoryId,
                    amount: forecast.predictedAmount, // Also store in amount field for easier retrieval
                    confidence: forecast.confidence,
                    actionable: forecast.riskLevel === 'high',
                    actionText: forecast.riskLevel === 'high' ? 'Review Budget' : undefined,
                    metadata: JSON.stringify({
                        predictedAmount: forecast.predictedAmount,
                        algorithm: forecast.algorithm,
                        factors: forecast.factors,
                        historicalData: forecast.historicalData,
                        riskLevel: forecast.riskLevel,
                        timeframe: forecast.timeframe
                    }),
                    isActive: true,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    deletedAt: null
                });
            }
            
            console.log(`[InsightsService] Created ${insights.length} total prediction insights`);

            // 4. Seasonal pattern detection - only high-confidence, significant patterns
            const seasonalPatterns = await predictionService.detectSeasonalPatterns();
            
            // Filter and limit seasonal patterns
            const significantPatterns = seasonalPatterns
                .filter(p => p.confidence >= 0.8 && p.averageIncrease > 15) // High confidence, significant increase
                .slice(0, 3); // Limit to top 3 seasonal patterns
            
            for (const pattern of significantPatterns) {
                insights.push({
                    id: generateUUID(),
                    type: 'prediction',
                    severity: 'info',
                    title: `Seasonal Pattern: ${pattern.categoryId ? 'Category' : 'Overall'} Spending`,
                    message: `${pattern.pattern}. Average increase: ${pattern.averageIncrease}%. Confidence: ${Math.round(pattern.confidence * 100)}%.`,
                    categoryId: pattern.categoryId,
                    confidence: Math.round(pattern.confidence * 100),
                    actionable: false,
                    metadata: JSON.stringify({
                        type: pattern.type,
                        pattern: pattern.pattern,
                        averageIncrease: pattern.averageIncrease,
                        months: pattern.months,
                        historicalData: pattern.historicalData,
                        algorithm: 'Seasonal Pattern Detection'
                    }),
                    isActive: true,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    deletedAt: null
                });
            }
        } catch (error) {
            console.error('Error generating prediction insights:', error);
            // Continue with basic predictions if advanced ones fail
        }

        // Prioritize and limit insights to prevent notification overload
        // Sort by: severity (alert > warning > info), then confidence, then actionable
        const severityOrder: Record<string, number> = { alert: 0, warning: 1, info: 2, success: 3 };
        const prioritizedInsights = insights.sort((a, b) => {
            // First by severity
            const severityDiff = (severityOrder[a.severity] || 99) - (severityOrder[b.severity] || 99);
            if (severityDiff !== 0) return severityDiff;
            
            // Then by actionable
            if (a.actionable && !b.actionable) return -1;
            if (!a.actionable && b.actionable) return 1;
            
            // Then by confidence
            const confA = a.confidence || 0;
            const confB = b.confidence || 0;
            return confB - confA;
        });

        // Limit total insights to prevent overwhelming the user
        // Keep all alerts and warnings, but limit info insights
        const criticalInsights = prioritizedInsights.filter(i => i.severity === 'alert' || i.severity === 'warning');
        const infoInsights = prioritizedInsights.filter(i => i.severity === 'info' || i.severity === 'success');
        
        // Return all critical + up to 5 info insights
        return [...criticalInsights, ...infoInsights.slice(0, 5)];
    }

    // ============================================================================
    // HELPER METHODS
    // ============================================================================

    /**
     * Save insights to database
     */
    private async saveInsights(insights: Insight[]): Promise<void> {
        if (insights.length === 0) return;

        await db.transaction('rw', [db.insights], async () => {
            for (const insight of insights) {
                // Check if similar insight already exists based on type, goalId/categoryId, and title
                let existingInsight = null;
                
                // For insights with goalId, check using the composite index [type+goalId]
                if (insight.goalId) {
                    existingInsight = await db.insights
                        .where('[type+goalId]')
                        .equals([insight.type, insight.goalId])
                        .filter(i => i.isActive && !i.dismissedAt && i.title === insight.title)
                        .first();
                }
                
                // For insights with categoryId, check using type index and filter by categoryId
                if (!existingInsight && insight.categoryId) {
                    existingInsight = await db.insights
                        .where('type')
                        .equals(insight.type)
                        .filter(i => 
                            i.isActive && 
                            !i.dismissedAt && 
                            i.title === insight.title &&
                            i.categoryId === insight.categoryId
                        )
                        .first();
                }
                
                // For insights without specific identifiers, check by type and title within last 24 hours
                if (!existingInsight) {
                    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
                    existingInsight = await db.insights
                        .where('type')
                        .equals(insight.type)
                        .filter(i => 
                            i.isActive && 
                            !i.dismissedAt && 
                            i.title === insight.title &&
                            i.createdAt > oneDayAgo
                        )
                        .first();
                }

                if (existingInsight) {
                    // Update existing insight with new data (especially important for predictions when currency changes)
                    await db.insights.update(existingInsight.id, {
                        ...insight,
                        id: existingInsight.id, // Keep the same ID
                        createdAt: existingInsight.createdAt, // Keep original creation date
                        updatedAt: new Date().toISOString()
                    });
                } else {
                    await db.insights.add(insight);
                }
            }
        });
    }

    /**
     * Clean up expired insights
     */
    private async cleanupExpiredInsights(): Promise<void> {
        const now = new Date().toISOString();
        const expiredInsights = await db.insights
            .filter(insight => insight.expiresAt !== undefined && insight.expiresAt < now)
            .toArray();

        for (const insight of expiredInsights) {
            await db.softDeleteInsight(insight.id);
        }
    }

    /**
     * Analyze spending patterns for behavioral insights
     */
    private analyzeSpendingPatterns(transactions: Transaction[]): {
        hasUnusualSpending: boolean;
        message: string;
        confidence: number;
        metadata: Record<string, any>;
    } {
        if (transactions.length === 0) {
            return {
                hasUnusualSpending: false,
                message: '',
                confidence: 0,
                metadata: {}
            };
        }

        // Get transactions from the last 7 and 30 days
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        
        const recentTransactions = transactions.filter(tx => 
            tx.status === 'cleared' && 
            new Date(tx.clearedDate || tx.createdAt).getTime() > sevenDaysAgo
        );

        const historicalTransactions = transactions.filter(tx => 
            tx.status === 'cleared' && 
            new Date(tx.clearedDate || tx.createdAt).getTime() > thirtyDaysAgo &&
            new Date(tx.clearedDate || tx.createdAt).getTime() <= sevenDaysAgo
        );

        const totalSpent = recentTransactions
            .filter(tx => tx.type === 'expense')
            .reduce((sum, tx) => sum + (tx.amount || 0), 0);

        const historicalTotal = historicalTransactions
            .filter(tx => tx.type === 'expense')
            .reduce((sum, tx) => sum + (tx.amount || 0), 0);

        // Calculate average weekly spending over the last 30 days (excluding this week)
        const averageWeeklySpending = historicalTotal / 3; // Approximately 3 weeks in 30 days

        // Only flag as unusual if spending is significantly higher than historical average
        // and if we have enough historical data to make a comparison
        if (averageWeeklySpending > 0 && recentTransactions.length > 3) {
            const spendingRatio = totalSpent / averageWeeklySpending;
            
            // Flag if spending is 50% higher than average
            if (spendingRatio > 1.5) {
                return {
                    hasUnusualSpending: true,
                    message: `Your spending this week is ${Math.round((spendingRatio - 1) * 100)}% higher than your average. Consider reviewing your expenses.`,
                    confidence: 75,
                    metadata: {
                        totalSpent,
                        averageWeeklySpending,
                        spendingRatio,
                        transactionCount: recentTransactions.length,
                        averageTransaction: totalSpent / recentTransactions.length
                    }
                };
            }
        }

        return {
            hasUnusualSpending: false,
            message: '',
            confidence: 0,
            metadata: {}
        };
    }

    /**
     * Predict budget outcomes using real prediction algorithms
     */
    private async predictBudgetOutcomes(data: CrossRouteInsightData): Promise<Array<{
        severity: Insight['severity'];
        title: string;
        message: string;
        categoryId?: string;
        percentage?: number;
        confidence: number;
        actionable: boolean;
        actionText?: string;
        metadata: Record<string, any>;
    }>> {
        const predictions: Array<{
            severity: Insight['severity'];
            title: string;
            message: string;
            categoryId?: string;
            percentage?: number;
            confidence: number;
            actionable: boolean;
            actionText?: string;
            metadata: Record<string, any>;
        }> = [];

        // Use real prediction service for budget risk analysis
        try {
            const riskAnalyses = await predictionService.analyzeBudgetRisk();
            
            // Ensure riskAnalyses is an array
            if (!Array.isArray(riskAnalyses)) {
                console.error('analyzeBudgetRisk did not return an array:', riskAnalyses);
                throw new Error('analyzeBudgetRisk returned non-array value');
            }

            // Filter and sort budget risks - prioritize high risk, high confidence
            const significantRisks = riskAnalyses
                .filter(analysis => 
                    analysis.riskProbability > 50 || 
                    (analysis.riskProbability > 30 && analysis.confidence > 85 && analysis.riskLevel === 'high')
                )
                .sort((a, b) => {
                    // Sort by risk probability (highest first)
                    if (b.riskProbability !== a.riskProbability) {
                        return b.riskProbability - a.riskProbability;
                    }
                    // Then by confidence
                    return b.confidence - a.confidence;
                })
                .slice(0, 15); // Limit to top 15 budget risks

            for (const analysis of significantRisks) {
                const percentage = Math.round(
                    (analysis.predictedSpending / analysis.budgetAmount) * 100
                );

                let severity: Insight['severity'] = 'info';
                if (analysis.riskProbability > 70) severity = 'alert';
                else if (analysis.riskProbability > 40) severity = 'warning';

                predictions.push({
                    severity,
                    title: `${analysis.categoryName} Budget Risk`,
                    message: `Based on current spending patterns, you have a ${analysis.riskProbability}% chance of exceeding your ${analysis.categoryName} budget. Predicted spending: ${Math.round(analysis.predictedSpending)} vs budget: ${Math.round(analysis.budgetAmount)}.`,
                    categoryId: analysis.categoryId,
                    percentage,
                    confidence: analysis.confidence,
                    actionable: true,
                    actionText: analysis.recommendedAction || 'Review Spending',
                    metadata: {
                        predictedAmount: analysis.predictedSpending,
                        budgetAmount: analysis.budgetAmount,
                        variance: analysis.predictedSpending - analysis.budgetAmount,
                        riskProbability: analysis.riskProbability,
                        riskLevel: analysis.riskLevel,
                        factors: analysis.factors,
                        algorithm: 'Budget Risk Analysis'
                    }
                });
            }
        } catch (error) {
            console.error('Error in budget prediction:', error);
            // Fallback to simple logic if prediction service fails
            try {
                for (const category of data.categories) {
                    if (category.budgetAmount && category.budgetAmount > 0) {
                        const predictedSpending = category.budgetAmount * 1.1;
                        if (predictedSpending > category.budgetAmount) {
                            predictions.push({
                                severity: 'warning',
                                title: `${category.name} Budget Prediction`,
                                message: `Based on current trends, you may exceed your ${category.name} budget this month.`,
                                categoryId: category.id,
                                percentage: 110,
                                confidence: 70,
                                actionable: true,
                                actionText: 'Adjust Spending',
                                metadata: {
                                    predictedAmount: predictedSpending,
                                    budgetAmount: category.budgetAmount,
                                    variance: predictedSpending - category.budgetAmount
                                }
                            });
                        }
                    }
                }
            } catch (fallbackError) {
                console.error('Error in fallback budget prediction:', fallbackError);
                // Return empty array if even fallback fails
            }
        }

        // Always return an array, even if empty
        return Array.isArray(predictions) ? predictions : [];
    }

    // ============================================================================
    // AUTO-UPDATE MANAGEMENT
    // ============================================================================

    /**
     * Start automatic insight updates
     */
    startAutoUpdates(): void {
        // Update immediately
        this.generateCrossRouteInsights();
        
        // Then update every 5 minutes
        setInterval(() => {
            this.generateCrossRouteInsights();
        }, this.updateFrequency);
    }

    /**
     * Stop automatic updates
     */
    stopAutoUpdates(): void {
        // In a real implementation, we'd track and clear intervals
    }

    /**
     * Force update insights
     */
    async forceUpdate(): Promise<void> {
        this.lastUpdate = 0; // Reset update timer
        await this.generateCrossRouteInsights();
    }

    /**
     * Invalidate prediction insights (soft delete them)
     * Used when currency changes to force regeneration with new currency
     */
    async invalidatePredictionInsights(): Promise<void> {
        // Get all prediction insights including already inactive ones to ensure complete cleanup
        const allPredictionInsights = await db.insights
            .where('type')
            .equals('prediction')
            .toArray();
        
        const activePredictions = allPredictionInsights.filter(i => i.isActive && !i.dismissedAt);
        console.log(`[InsightsService] Found ${allPredictionInsights.length} total prediction insights, ${activePredictions.length} active`);
        console.log(`[InsightsService] Invalidating ${activePredictions.length} active prediction insights due to currency change`);
        
        // Delete all prediction insights (both active and inactive) to ensure clean slate
        for (const insight of allPredictionInsights) {
            await db.insights.update(insight.id, {
                dismissedAt: new Date().toISOString(),
                isActive: false,
                deletedAt: new Date().toISOString(), // Permanent deletion for currency change
                updatedAt: new Date().toISOString()
            });
        }
        
        console.log(`[InsightsService] Successfully invalidated ${allPredictionInsights.length} prediction insights (marked as deleted)`);
    }

    // ============================================================================
    // PREDICTION AND PATTERN RETRIEVAL
    // ============================================================================

    /**
     * Get prediction insights for the PredictionsTab
     */
    async getPredictionInsights(): Promise<Array<{
        id: string;
        type: 'spending_forecast' | 'goal_completion' | 'budget_risk' | 'income_timing' | 'seasonal_pattern' | 'anomaly_detection';
        title: string;
        description: string;
        confidence: number;
        timeframe: string;
        predictedValue?: number;
        currentValue?: number;
        variance?: number;
        riskLevel: 'low' | 'medium' | 'high';
        actionable: boolean;
        actionText?: string;
        actionUrl?: string;
        metadata: {
            algorithm?: string;
            factors?: string[];
            historicalData?: number[];
            category?: 'survival' | 'security' | 'growth' | 'lifestyle' | 'system';
        };
        createdAt: string;
        expiresAt: string;
    }>> {
        const predictionInsights = await this.getInsightsByType('prediction');
        
        // Transform insights to PredictionInsight format
        return predictionInsights.map(insight => {
            const metadata = insight.metadata ? JSON.parse(insight.metadata) : {};
            
            // Determine risk level based on severity
            let riskLevel: 'low' | 'medium' | 'high' = 'medium';
            if (insight.severity === 'alert') riskLevel = 'high';
            else if (insight.severity === 'success' || insight.severity === 'info') riskLevel = 'low';
            
            // Parse metadata for values
            const predictedValue = metadata.predictedAmount || metadata.predictedValue || insight.amount;
            const currentValue = metadata.currentAmount || metadata.currentValue;
            const variance = predictedValue && currentValue ? predictedValue - currentValue : metadata.variance;
            
            // Debug logging to track value retrieval
            if (insight.title && insight.title.includes('Forecast')) {
                console.log(`[InsightsService] Retrieving prediction for ${insight.title}:`, {
                    metadataPredictedAmount: metadata.predictedAmount,
                    metadataPredictedValue: metadata.predictedValue,
                    insightAmount: insight.amount,
                    finalPredictedValue: predictedValue,
                    rawMetadata: insight.metadata
                });
            }
            
            return {
                id: insight.id,
                type: this.determinePredictionType(insight) as any,
                title: insight.title,
                description: insight.message,
                confidence: insight.confidence || 70,
                timeframe: this.extractTimeframe(insight) || 'This month',
                predictedValue,
                currentValue,
                variance,
                riskLevel,
                actionable: insight.actionable || false,
                actionText: insight.actionText,
                actionUrl: insight.actionUrl,
                metadata: {
                    algorithm: metadata.algorithm || 'Pattern Analysis',
                    factors: metadata.factors || [],
                    historicalData: metadata.historicalData || [],
                    category: metadata.category as 'survival' | 'security' | 'growth' | 'lifestyle' | 'system' | undefined
                },
                createdAt: insight.createdAt,
                expiresAt: insight.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            };
        });
    }

    /**
     * Get behavioral pattern insights for the PatternsTab
     */
    async getBehavioralPatternInsights(): Promise<Array<{
        id: string;
        type: 'transaction_timing' | 'budget_adherence' | 'engagement' | 'spending_timing' | 'app_usage' | 'category_usage' | 'alert_response';
        title: string;
        description: string;
        confidence: number;
        frequency: 'daily' | 'weekly' | 'monthly' | 'irregular';
        impact: 'low' | 'medium' | 'high';
        actionable: boolean;
        recommendation?: string;
        metadata: {
            pattern?: string;
            percentage?: number;
            timeframe?: string;
            category?: 'survival' | 'security' | 'growth' | 'lifestyle' | 'system';
        };
        createdAt: string;
        lastObserved: string;
    }>> {
        const behavioralInsights = await this.getInsightsByType('behavioral');
        
        return behavioralInsights.map(insight => {
            const metadata = insight.metadata ? JSON.parse(insight.metadata) : {};
            
            // Determine impact based on severity
            let impact: 'low' | 'medium' | 'high' = 'medium';
            if (insight.severity === 'alert' || insight.severity === 'warning') impact = 'high';
            else if (insight.severity === 'success' || insight.severity === 'info') impact = 'low';
            
            // Extract recommendation from actionText or message
            const recommendation = insight.actionText || this._extractRecommendation(insight.message);
            
            return {
                id: insight.id,
                type: this.determinePatternType(insight) as any,
                title: insight.title,
                description: insight.message,
                confidence: insight.confidence || 70,
                frequency: this.determineFrequency(metadata) as any,
                impact,
                actionable: insight.actionable || false,
                recommendation,
                metadata: {
                    pattern: metadata.pattern || 'User behavior',
                    percentage: metadata.percentage,
                    timeframe: metadata.timeframe,
                    category: metadata.category as 'survival' | 'security' | 'growth' | 'lifestyle' | 'system' | undefined
                },
                createdAt: insight.createdAt,
                lastObserved: insight.updatedAt || insight.createdAt
            };
        });
    }

    // ============================================================================
    // PRIVATE HELPER METHODS
    // ============================================================================
    
    private _extractRecommendation(message: string): string | undefined {
        // Try to extract actionable recommendation from message
        if (message.includes('consider')) {
            return message.substring(message.indexOf('consider'));
        }
        if (message.includes('recommend')) {
            return message.substring(message.indexOf('recommend'));
        }
        return undefined;
    }

    private determinePredictionType(insight: Insight): string {
        const title = insight.title.toLowerCase();
        if (title.includes('budget') || title.includes('spending')) return 'spending_forecast';
        if (title.includes('goal')) return 'goal_completion';
        if (title.includes('risk') || title.includes('exceed')) return 'budget_risk';
        if (title.includes('income')) return 'income_timing';
        if (title.includes('seasonal') || title.includes('trend')) return 'seasonal_pattern';
        if (title.includes('unusual') || title.includes('anomaly')) return 'anomaly_detection';
        return 'spending_forecast';
    }

    private determinePatternType(insight: Insight): string {
        const title = insight.title.toLowerCase();
        if (title.includes('transaction') || title.includes('timing')) return 'transaction_timing';
        if (title.includes('budget') || title.includes('adherence')) return 'budget_adherence';
        if (title.includes('engagement') || title.includes('usage')) return 'engagement';
        if (title.includes('spending')) return 'spending_timing';
        if (title.includes('app')) return 'app_usage';
        if (title.includes('category')) return 'category_usage';
        if (title.includes('alert') || title.includes('response')) return 'alert_response';
        return 'engagement';
    }

    private determineFrequency(metadata: Record<string, any>): string {
        const pattern = metadata.pattern?.toLowerCase() || '';
        if (pattern.includes('daily') || pattern.includes('day')) return 'daily';
        if (pattern.includes('weekly') || pattern.includes('week')) return 'weekly';
        if (pattern.includes('monthly') || pattern.includes('month')) return 'monthly';
        return 'irregular';
    }

    private extractTimeframe(insight: Insight): string | undefined {
        const metadata = insight.metadata ? JSON.parse(insight.metadata) : {};
        return metadata.timeframe || metadata.period;
    }

    // ============================================================================
    // COMPREHENSIVE SPENDING PATTERN ANALYSIS
    // ============================================================================

    /**
     * Analyze comprehensive spending patterns
     */
    async analyzeSpendingPatterns(days: number = 90): Promise<{
        categoryPatterns: Array<{
            categoryId: string;
            categoryName: string;
            averageAmount: number;
            frequency: number;
            trend: 'increasing' | 'decreasing' | 'stable';
            percentageOfTotal: number;
        }>;
        timingPatterns: {
            mostActiveDay: string;
            mostActiveHour: number;
            weekendVsWeekday: { weekend: number; weekday: number };
        };
        velocityPatterns: {
            averageTransactionAmount: number;
            transactionFrequency: number;
            spendingVelocity: 'low' | 'medium' | 'high';
        };
        anomalyPatterns: Array<{
            type: 'unusual_amount' | 'unusual_timing' | 'unusual_category';
            description: string;
            transactionId: string;
            confidence: number;
        }>;
    }> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const transactions = await db.transactions
            .filter(tx => 
                tx.type === 'expense' && 
                tx.status === 'cleared' && 
                tx.clearedDate &&
                new Date(tx.clearedDate) >= cutoffDate &&
                !tx.deletedAt
            )
            .toArray();

        const categories = await db.getActiveCategories();
        const categoryMap = new Map(categories.map(cat => [cat.id, cat]));

        // Category patterns
        const categoryPatterns = this.analyzeCategoryPatterns(transactions, categoryMap, days);

        // Timing patterns
        const timingPatterns = this.analyzeTimingPatterns(transactions);

        // Velocity patterns
        const velocityPatterns = this.analyzeVelocityPatterns(transactions, days);

        // Anomaly detection
        const anomalyPatterns = this.detectAnomalies(transactions, categoryMap);

        return {
            categoryPatterns,
            timingPatterns,
            velocityPatterns,
            anomalyPatterns
        };
    }

    /**
     * Analyze category spending patterns
     */
    private analyzeCategoryPatterns(
        transactions: Transaction[],
        categoryMap: Map<string, Category>,
        days: number
    ): Array<{
        categoryId: string;
        categoryName: string;
        averageAmount: number;
        frequency: number;
        trend: 'increasing' | 'decreasing' | 'stable';
        percentageOfTotal: number;
    }> {
        const categoryData = new Map<string, {
            amounts: number[];
            dates: string[];
            total: number;
        }>();

        transactions.forEach(tx => {
            if (!tx.categoryId) return;
            const data = categoryData.get(tx.categoryId) || { amounts: [], dates: [], total: 0 };
            const amount = Math.abs(tx.amount || 0);
            data.amounts.push(amount);
            data.dates.push(tx.clearedDate || tx.createdAt);
            data.total += amount;
            categoryData.set(tx.categoryId, data);
        });

        const totalSpending = transactions.reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);

        const patterns: Array<{
            categoryId: string;
            categoryName: string;
            averageAmount: number;
            frequency: number;
            trend: 'increasing' | 'decreasing' | 'stable';
            percentageOfTotal: number;
        }> = [];

        categoryData.forEach((data, categoryId) => {
            const category = categoryMap.get(categoryId);
            if (!category) return;

            const averageAmount = data.amounts.length > 0
                ? data.amounts.reduce((sum, amt) => sum + amt, 0) / data.amounts.length
                : 0;

            // Calculate trend by comparing first half vs second half
            const sortedDates = data.dates.sort();
            const midpoint = Math.floor(sortedDates.length / 2);
            const firstHalf = data.amounts.slice(0, midpoint);
            const secondHalf = data.amounts.slice(midpoint);

            const firstHalfAvg = firstHalf.length > 0
                ? firstHalf.reduce((sum, amt) => sum + amt, 0) / firstHalf.length
                : 0;
            const secondHalfAvg = secondHalf.length > 0
                ? secondHalf.reduce((sum, amt) => sum + amt, 0) / secondHalf.length
                : 0;

            let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
            const changePercent = firstHalfAvg > 0
                ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100
                : 0;

            if (changePercent > 10) {
                trend = 'increasing';
            } else if (changePercent < -10) {
                trend = 'decreasing';
            }

            patterns.push({
                categoryId,
                categoryName: category.name,
                averageAmount: Math.round(averageAmount * 100) / 100,
                frequency: data.amounts.length,
                trend,
                percentageOfTotal: totalSpending > 0
                    ? Math.round((data.total / totalSpending) * 10000) / 100
                    : 0
            });
        });

        return patterns.sort((a, b) => b.percentageOfTotal - a.percentageOfTotal);
    }

    /**
     * Analyze timing patterns
     */
    private analyzeTimingPatterns(transactions: Transaction[]): {
        mostActiveDay: string;
        mostActiveHour: number;
        weekendVsWeekday: { weekend: number; weekday: number };
    } {
        const dayCounts = new Map<string, number>();
        const hourCounts = new Map<number, number>();
        let weekendTotal = 0;
        let weekdayTotal = 0;

        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        transactions.forEach(tx => {
            const date = new Date(tx.clearedDate || tx.createdAt);
            const dayName = dayNames[date.getDay()];
            const hour = date.getHours();
            const dayOfWeek = date.getDay();

            dayCounts.set(dayName, (dayCounts.get(dayName) || 0) + 1);
            hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);

            if (dayOfWeek === 0 || dayOfWeek === 6) {
                weekendTotal += Math.abs(tx.amount || 0);
            } else {
                weekdayTotal += Math.abs(tx.amount || 0);
            }
        });

        const mostActiveDay = Array.from(dayCounts.entries())
            .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';

        const mostActiveHour = Array.from(hourCounts.entries())
            .sort((a, b) => b[1] - a[1])[0]?.[0] || 12;

        return {
            mostActiveDay,
            mostActiveHour,
            weekendVsWeekday: {
                weekend: Math.round(weekendTotal * 100) / 100,
                weekday: Math.round(weekdayTotal * 100) / 100
            }
        };
    }

    /**
     * Analyze spending velocity patterns
     */
    private analyzeVelocityPatterns(
        transactions: Transaction[],
        days: number
    ): {
        averageTransactionAmount: number;
        transactionFrequency: number;
        spendingVelocity: 'low' | 'medium' | 'high';
    } {
        if (transactions.length === 0) {
            return {
                averageTransactionAmount: 0,
                transactionFrequency: 0,
                spendingVelocity: 'low'
            };
        }

        const totalAmount = transactions.reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);
        const averageTransactionAmount = totalAmount / transactions.length;
        const transactionFrequency = transactions.length / days;

        // Determine velocity based on frequency and average amount
        let spendingVelocity: 'low' | 'medium' | 'high' = 'low';
        if (transactionFrequency > 0.5 && averageTransactionAmount > 50) {
            spendingVelocity = 'high';
        } else if (transactionFrequency > 0.2 || averageTransactionAmount > 30) {
            spendingVelocity = 'medium';
        }

        return {
            averageTransactionAmount: Math.round(averageTransactionAmount * 100) / 100,
            transactionFrequency: Math.round(transactionFrequency * 100) / 100,
            spendingVelocity
        };
    }

    /**
     * Detect spending anomalies
     */
    private detectAnomalies(
        transactions: Transaction[],
        categoryMap: Map<string, Category>
    ): Array<{
        type: 'unusual_amount' | 'unusual_timing' | 'unusual_category';
        description: string;
        transactionId: string;
        confidence: number;
    }> {
        if (transactions.length < 5) {
            return [];
        }

        const anomalies: Array<{
            type: 'unusual_amount' | 'unusual_timing' | 'unusual_category';
            description: string;
            transactionId: string;
            confidence: number;
        }> = [];

        // Calculate statistics
        const amounts = transactions.map(tx => Math.abs(tx.amount || 0));
        const avgAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
        const variance = amounts.reduce((sum, amt) => sum + Math.pow(amt - avgAmount, 2), 0) / amounts.length;
        const stdDev = Math.sqrt(variance);

        // Detect unusual amounts (more than 2 standard deviations)
        transactions.forEach(tx => {
            const amount = Math.abs(tx.amount || 0);
            if (amount > avgAmount + 2 * stdDev) {
                const category = tx.categoryId ? categoryMap.get(tx.categoryId) : null;
                anomalies.push({
                    type: 'unusual_amount',
                    description: `Unusually large transaction: ${this.formatCurrency(amount)} in ${category?.name || 'Unknown'}`,
                    transactionId: tx.id,
                    confidence: Math.min(100, Math.round(((amount - avgAmount) / stdDev) * 20))
                });
            }
        });

        // Detect unusual timing (transactions at odd hours)
        const hourCounts = new Map<number, number>();
        transactions.forEach(tx => {
            const date = new Date(tx.clearedDate || tx.createdAt);
            const hour = date.getHours();
            hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
        });

        const avgHourCount = Array.from(hourCounts.values()).reduce((sum, count) => sum + count, 0) / hourCounts.size;
        transactions.forEach(tx => {
            const date = new Date(tx.clearedDate || tx.createdAt);
            const hour = date.getHours();
            const hourCount = hourCounts.get(hour) || 0;

            // Flag transactions at hours with very low activity (less than 10% of average)
            if (hourCount < avgHourCount * 0.1 && (hour < 6 || hour > 22)) {
                anomalies.push({
                    type: 'unusual_timing',
                    description: `Transaction at unusual time: ${hour}:00`,
                    transactionId: tx.id,
                    confidence: 60
                });
            }
        });

        return anomalies.slice(0, 10); // Limit to top 10 anomalies
    }

    private formatCurrency(amount: number): string {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    }
}

export const insightsService = new InsightsService();
