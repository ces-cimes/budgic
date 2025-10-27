import { db, generateUUID } from '$lib/core/db';
import { analyticsService } from './analytics-service';
import { goalService } from '../core/goal-service';
import { budgetService } from '../core/budget-service';
import type { Insight, Goal, Transaction, Category } from '$lib/core/db';

interface CrossRouteInsightData {
    goals: Goal[];
    transactions: Transaction[];
    categories: Category[];
    budgetData: any;
    analyticsData: any;
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
    }): Promise<void> {
        const now = Date.now();
        if (now - this.lastUpdate < this.updateFrequency) {
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
        const [goals, transactions, categories, budgetData, analyticsData] = await Promise.all([
            goalService.getGoals(),
            db.getActiveTransactions(),
            db.getActiveCategories(),
            budgetService.getBudgetSummary(),
            analyticsService.getSpendingAnalysis(1) // Current month
        ]);

        return {
            goals,
            transactions,
            categories,
            budgetData,
            analyticsData
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
     * Generate prediction-based insights
     */
    private async generatePredictionInsights(data: CrossRouteInsightData): Promise<Insight[]> {
        const insights: Insight[] = [];

        // Predict budget outcomes
        const budgetPredictions = this.predictBudgetOutcomes(data);
        
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

        return insights;
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

                if (!existingInsight) {
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
     * Predict budget outcomes
     */
    private predictBudgetOutcomes(data: CrossRouteInsightData): Array<{
        severity: Insight['severity'];
        title: string;
        message: string;
        categoryId?: string;
        percentage?: number;
        confidence: number;
        actionable: boolean;
        actionText?: string;
        metadata: Record<string, any>;
    }> {
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

        // Simple prediction logic - in a real implementation, this would use ML models
        for (const category of data.categories) {
            if (category.budgetAmount && category.budgetAmount > 0) {
                // Placeholder prediction logic
                const predictedSpending = category.budgetAmount * 1.1; // 10% over budget
                
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

        return predictions;
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
}

export const insightsService = new InsightsService();
