import { analyticsService } from '$lib/core/services';
import type { Insight } from '$lib/core/db';
import type { UnifiedInsight } from './types';

export interface SimpleInsight extends UnifiedInsight {
    // Simplified version of UnifiedInsight for internal use
}

class SimpleInsightsService {
    private insights: SimpleInsight[] = [];
    private lastUpdate = 0;
    private updateFrequency = 5 * 60 * 1000; // 5 minutes

    public get ready() {
        return true; // Always ready since we're using simplified logic
    }

    public isLoading() {
        return false; // Simplified - no loading state needed
    }

    /**
     * Get all active insights
     */
    getInsights(): SimpleInsight[] {
        return this.insights.filter(insight => insight.isActive && !insight.dismissedAt);
    }

    /**
     * Get insights by type
     */
    getInsightsByType(type: SimpleInsight['type']): SimpleInsight[] {
        return this.getInsights().filter(insight => insight.type === type);
    }

    /**
     * Get insights by severity
     */
    getInsightsBySeverity(severity: SimpleInsight['severity']): SimpleInsight[] {
        return this.getInsights().filter(insight => insight.severity === severity);
    }

    /**
     * Get insights count
     */
    getInsightsCount(): { total: number; info: number; warning: number; alert: number; success: number } {
        const activeInsights = this.getInsights();
        return {
            total: activeInsights.length,
            info: activeInsights.filter(i => i.severity === 'info').length,
            warning: activeInsights.filter(i => i.severity === 'warning').length,
            alert: activeInsights.filter(i => i.severity === 'alert').length,
            success: activeInsights.filter(i => i.severity === 'success').length
        };
    }

    /**
     * Update insights (simplified version)
     */
    async updateInsights(): Promise<void> {
        const now = Date.now();
        if (now - this.lastUpdate < this.updateFrequency) {
            return; // Too soon to update
        }

        try {
            // Generate simple insights based on analytics
            const newInsights: SimpleInsight[] = [];

            // Get current and previous month data for comparison
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

            // Get spending analysis from analytics service
            const currentSpending = await analyticsService.getSpendingAnalysis(1); // Current month
            const previousSpending = await analyticsService.getSpendingAnalysis(2); // Last 2 months

            // Generate spending insights based on top categories
            if (currentSpending.topCategories && currentSpending.topCategories.length > 0) {
                const topCategory = currentSpending.topCategories[0];
                newInsights.push({
                    id: crypto.randomUUID(),
                    type: 'spending_pattern',
                    title: 'Top Spending Category',
                    description: `Your highest spending category is ${topCategory.categoryName} with $${topCategory.amount.toFixed(2)}`,
                    severity: 'info',
                        category: 'system',
                    actionable: false,
                    metadata: {
                        amount: topCategory.amount,
                        percentage: topCategory.percentage,
                        confidence: 85
                    },
                    createdAt: new Date().toISOString(),
                    isActive: true
                });
            }

            // Generate trend insights by comparing current and previous month
            if (previousSpending.totalSpent > 0) {
                const percentageChange = ((currentSpending.totalSpent - previousSpending.totalSpent) / previousSpending.totalSpent);
                if (percentageChange > 0.1) {
                    newInsights.push({
                        id: crypto.randomUUID(),
                        type: 'trend',
                        title: 'Spending Increase',
                        description: `Your spending increased by ${(percentageChange * 100).toFixed(1)}% compared to last month`,
                        severity: 'warning',
                        category: 'system',
                        actionable: true,
                        actionText: 'Review Budget',
                        metadata: {
                            percentage: percentageChange * 100,
                            confidence: 90
                        },
                        createdAt: new Date().toISOString(),
                        isActive: true
                    });
                } else if (percentageChange < -0.1) {
                    newInsights.push({
                        id: crypto.randomUUID(),
                        type: 'trend',
                        title: 'Spending Decrease',
                        description: `Great job! Your spending decreased by ${Math.abs(percentageChange * 100).toFixed(1)}% compared to last month`,
                        severity: 'success',
                        category: 'system',
                        actionable: false,
                        metadata: {
                            percentage: Math.abs(percentageChange * 100),
                            confidence: 90
                        },
                        createdAt: new Date().toISOString(),
                        isActive: true
                    });
                }
            }

            // Generate general insights
            if (currentSpending.totalSpent === 0) {
                newInsights.push({
                    id: crypto.randomUUID(),
                    type: 'app_usage',
                    title: 'Start Tracking',
                    description: 'Add your first transactions to get personalized insights',
                    severity: 'info',
                    category: 'system',
                    actionable: true,
                    actionText: 'Add Transaction',
                    metadata: {
                        confidence: 100
                    },
                    createdAt: new Date().toISOString(),
                    isActive: true
                });
            }

            // Add new insights
            this.insights.push(...newInsights);

            // Clean up old insights (older than 7 days)
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            this.insights = this.insights.filter(insight => {
                const createdAt = new Date(insight.createdAt);
                return createdAt > sevenDaysAgo || insight.isActive;
            });

            this.lastUpdate = Date.now();
        } catch (error) {
            console.error('Error updating insights:', error);
        }
    }

    /**
     * Dismiss an insight
     */
    dismissInsight(insightId: string): void {
        const insight = this.insights.find(i => i.id === insightId);
        if (insight) {
            insight.dismissedAt = new Date().toISOString();
        }
    }

    /**
     * Start automatic updates
     */
    startAutoUpdates(): void {
        // Update immediately
        this.updateInsights();
        
        // Then update every 5 minutes
        setInterval(() => {
            this.updateInsights();
        }, this.updateFrequency);
    }

    /**
     * Stop automatic updates
     */
    stopAutoUpdates(): void {
        // Simplified - no complex interval management needed
    }
}

// Export singleton instance
export const simpleInsightsService = new SimpleInsightsService();
