import { insightsService } from './insights-service';
import { goalService } from '../core/goal-service';
import { budgetService } from '../core/budget-service';
import { analyticsService } from './analytics-service';
import { transactionService } from '../core/transaction-service';
import { balanceProjectionService } from './balance-projection-service';
import { db } from '../../db';
import type { Goal, Transaction, Category, Insight } from '../../db';

interface SyncEvent {
    type: 'goal_created' | 'goal_updated' | 'goal_deleted' | 'goal_completed' | 
          'transaction_created' | 'transaction_updated' | 'transaction_deleted' |
          'budget_updated' | 'category_updated';
    entityId: string;
    entityType: 'goal' | 'transaction' | 'budget' | 'category';
    data?: any;
    timestamp: string;
}

interface SyncContext {
    userId?: string;
    sourceRoute: 'goals' | 'plan' | 'analyze' | 'budget' | 'transactions';
    triggerEvent: SyncEvent;
}

class CrossRouteSyncService {
    private syncQueue: SyncEvent[] = [];
    private isProcessing = false;
    private syncInterval: NodeJS.Timeout | null = null;
    private eventListeners: Map<string, ((event: SyncEvent) => Promise<void>)[]> = new Map();

    constructor() {
        this.setupEventListeners();
    }

    // ============================================================================
    // EVENT MANAGEMENT
    // ============================================================================

    /**
     * Emit a sync event
     */
    async emitSyncEvent(event: SyncEvent): Promise<void> {
        this.syncQueue.push(event);
        
        // Process immediately for critical events
        if (this.isCriticalEvent(event)) {
            await this.processSyncEvent(event);
        } else {
            // Queue for batch processing
            this.scheduleBatchProcessing();
        }
    }

    /**
     * Register event listener
     */
    on(eventType: string, listener: (event: SyncEvent) => Promise<void>): void {
        if (!this.eventListeners.has(eventType)) {
            this.eventListeners.set(eventType, []);
        }
        this.eventListeners.get(eventType)!.push(listener);
    }

    /**
     * Remove event listener
     */
    off(eventType: string, listener: (event: SyncEvent) => Promise<void>): void {
        const listeners = this.eventListeners.get(eventType);
        if (listeners) {
            const index = listeners.indexOf(listener);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    // ============================================================================
    // GOAL SYNCHRONIZATION
    // ============================================================================

    /**
     * Handle goal creation
     */
    async onGoalCreated(goal: Goal): Promise<void> {
        await this.emitSyncEvent({
            type: 'goal_created',
            entityId: goal.id,
            entityType: 'goal',
            data: goal,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Handle goal update
     */
    async onGoalUpdated(goal: Goal, changes: Partial<Goal>): Promise<void> {
        await this.emitSyncEvent({
            type: 'goal_updated',
            entityId: goal.id,
            entityType: 'goal',
            data: { goal, changes },
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Handle goal deletion
     */
    async onGoalDeleted(goalId: string): Promise<void> {
        await this.emitSyncEvent({
            type: 'goal_deleted',
            entityId: goalId,
            entityType: 'goal',
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Handle goal completion
     */
    async onGoalCompleted(goal: Goal): Promise<void> {
        await this.emitSyncEvent({
            type: 'goal_completed',
            entityId: goal.id,
            entityType: 'goal',
            data: goal,
            timestamp: new Date().toISOString()
        });
    }

    // ============================================================================
    // TRANSACTION SYNCHRONIZATION
    // ============================================================================

    /**
     * Handle transaction creation
     */
    async onTransactionCreated(transaction: Transaction): Promise<void> {
        // Clear balance projection cache for affected accounts
        const affectedAccountIds: string[] = [];
        if (transaction.accountId) {
            affectedAccountIds.push(transaction.accountId);
        }
        if (transaction.type === 'transfer' && transaction.transferDetails?.toAccountId) {
            affectedAccountIds.push(transaction.transferDetails.toAccountId);
        }
        if (affectedAccountIds.length > 0) {
            balanceProjectionService.clearCacheForAccounts(affectedAccountIds);
        }
        await this.emitSyncEvent({
            type: 'transaction_created',
            entityId: transaction.id,
            entityType: 'transaction',
            data: transaction,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Handle transaction update
     */
    async onTransactionUpdated(transaction: Transaction, changes: Partial<Transaction>): Promise<void> {
        // Clear balance projection cache for affected accounts
        const affectedAccountIds = new Set<string>();
        if (transaction.accountId) {
            affectedAccountIds.add(transaction.accountId);
        }
        if (changes.accountId) {
            affectedAccountIds.add(changes.accountId);
        }
        if (transaction.type === 'transfer' && transaction.transferDetails?.toAccountId) {
            affectedAccountIds.add(transaction.transferDetails.toAccountId);
        }
        if (changes.transferDetails && 'toAccountId' in changes.transferDetails) {
            affectedAccountIds.add(changes.transferDetails.toAccountId as string);
        }
        if (affectedAccountIds.size > 0) {
            balanceProjectionService.clearCacheForAccounts(Array.from(affectedAccountIds));
        }
        await this.emitSyncEvent({
            type: 'transaction_updated',
            entityId: transaction.id,
            entityType: 'transaction',
            data: { transaction, changes },
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Handle transaction deletion
     */
    async onTransactionDeleted(transactionId: string): Promise<void> {
        // Get transaction to find affected accounts before it's deleted
        const transaction = await db.transactions.get(transactionId);
        if (transaction) {
            const affectedAccountIds: string[] = [];
            if (transaction.accountId) {
                affectedAccountIds.push(transaction.accountId);
            }
            if (transaction.type === 'transfer' && transaction.transferDetails?.toAccountId) {
                affectedAccountIds.push(transaction.transferDetails.toAccountId);
            }
            if (affectedAccountIds.length > 0) {
                balanceProjectionService.clearCacheForAccounts(affectedAccountIds);
            }
        }
        await this.emitSyncEvent({
            type: 'transaction_deleted',
            entityId: transactionId,
            entityType: 'transaction',
            timestamp: new Date().toISOString()
        });
    }

    // ============================================================================
    // BUDGET SYNCHRONIZATION
    // ============================================================================

    /**
     * Handle budget update
     */
    async onBudgetUpdated(categoryId: string, budgetData: any): Promise<void> {
        await this.emitSyncEvent({
            type: 'budget_updated',
            entityId: categoryId,
            entityType: 'budget',
            data: budgetData,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Handle category update
     */
    async onCategoryUpdated(category: Category, changes: Partial<Category>): Promise<void> {
        await this.emitSyncEvent({
            type: 'category_updated',
            entityId: category.id,
            entityType: 'category',
            data: { category, changes },
            timestamp: new Date().toISOString()
        });
    }

    // ============================================================================
    // SYNC PROCESSING
    // ============================================================================

    /**
     * Process a single sync event
     */
    private async processSyncEvent(event: SyncEvent): Promise<void> {
        try {
            const context: SyncContext = {
                triggerEvent: event,
                sourceRoute: this.determineSourceRoute(event)
            };

            // Update insights based on the event
            await this.updateInsightsForEvent(event, context);

            // Update related data across routes
            await this.updateRelatedData(event, context);

            // Notify listeners
            await this.notifyListeners(event);

        } catch (error) {
            console.error('Error processing sync event:', error);
        }
    }

    /**
     * Update insights based on sync event
     */
    private async updateInsightsForEvent(event: SyncEvent, context: SyncContext): Promise<void> {
        switch (event.type) {
            case 'goal_created':
            case 'goal_updated':
            case 'goal_completed':
                await this.updateGoalInsights(event.entityId);
                break;
            
            case 'transaction_created':
            case 'transaction_updated':
            case 'transaction_deleted':
                await this.updateTransactionInsights(event.entityId);
                break;
            
            case 'budget_updated':
            case 'category_updated':
                await this.updateBudgetInsights(event.entityId);
                break;
        }

        // Regenerate cross-route insights (skip expensive balance projections on every sync)
        // Balance projections will be generated on insights page load or manual refresh
        await insightsService.generateCrossRouteInsights({
            timeRange: 'month',
            includePredictions: false, // Skip expensive predictions on sync events
            includeBehavioral: true
        });
        // Phase 5: refresh fee-risk and negative-allowance alerts into unified Insight store
        const { refreshFeeAndNegativeAllowanceInsights } = await import(
            '../alerts-aggregation-service'
        );
        await refreshFeeAndNegativeAllowanceInsights();
    }

    /**
     * Update related data across routes
     */
    private async updateRelatedData(event: SyncEvent, context: SyncContext): Promise<void> {
        switch (event.type) {
            case 'goal_updated':
                await this.updatePlanningCalculations(event.entityId);
                break;
            
            case 'transaction_created':
            case 'transaction_updated':
                await this.updateGoalProgress(event.data?.categoryId);
                break;
            
            case 'budget_updated':
                await this.updateBudgetAlerts(event.entityId);
                break;
        }
    }

    /**
     * Update goal-specific insights
     */
    private async updateGoalInsights(goalId: string): Promise<void> {
        const goal = await goalService.getGoal(goalId);
        if (!goal) return;

        // Remove old goal insights
        const oldInsights = await insightsService.getInsightsByType('goal_milestone');
        for (const insight of oldInsights) {
            if (insight.goalId === goalId) {
                await insightsService.dismissInsight(insight.id);
            }
        }

        // Generate new goal insights
        const goalInsights = await this.generateGoalInsights([goal]);
        for (const insight of goalInsights) {
            await insightsService.createInsight({
                type: insight.type,
                severity: insight.severity,
                title: insight.title,
                message: insight.message,
                goalId: insight.goalId,
                percentage: insight.percentage,
                confidence: insight.confidence,
                actionable: insight.actionable,
                actionText: insight.actionText
            });
        }
    }

    /**
     * Update transaction-related insights
     */
    private async updateTransactionInsights(transactionId: string): Promise<void> {
        const transaction = await db.transactions.get(transactionId);
        if (!transaction) return;

        // Update spending pattern insights
        await this.updateSpendingPatternInsights(transaction);
    }

    /**
     * Update budget-related insights
     */
    private async updateBudgetInsights(categoryId: string): Promise<void> {
        const category = await db.categories.get(categoryId);
        if (!category) return;

        // Update budget alerts
        await this.updateBudgetAlerts(categoryId);
    }

    /**
     * Update planning calculations when goals change
     */
    private async updatePlanningCalculations(goalId: string): Promise<void> {
        // This would integrate with the planning service
        // For now, we'll just regenerate insights
        await insightsService.generateCrossRouteInsights({
            timeRange: 'month',
            includePredictions: true,
            includeBehavioral: false
        });
    }

    /**
     * Update goal progress based on transactions
     */
    private async updateGoalProgress(categoryId?: string): Promise<void> {
        if (!categoryId) return;

        // Find goals related to this category
        const goals = await goalService.getGoals();
        const relatedGoals = goals.filter(goal => goal.category === categoryId);

        for (const goal of relatedGoals) {
            await goalService.updateGoalProgress(goal.id);
        }
    }

    /**
     * Update budget alerts
     */
    private async updateBudgetAlerts(categoryId: string): Promise<void> {
        const category = await db.categories.get(categoryId);
        if (!category || !category.budgetAmount) return;

        // Calculate current spending for this category
        const transactions = await db.getTransactionsByCategory(categoryId);
        const spentAmount = transactions
            .filter(tx => tx.status === 'cleared' && tx.type === 'expense')
            .reduce((sum, tx) => sum + (tx.amount || 0), 0);

        const budgetPercentage = (spentAmount / category.budgetAmount) * 100;

        // Remove old budget insights for this category
        const oldInsights = await insightsService.getInsightsByType('budget_approaching');
        for (const insight of oldInsights) {
            if (insight.categoryId === categoryId) {
                await insightsService.dismissInsight(insight.id);
            }
        }

        // Create new budget insights if needed
        if (budgetPercentage >= 80 && budgetPercentage < 100) {
            await insightsService.createInsight({
                type: 'budget_approaching',
                severity: 'warning',
                title: `${category.name} Budget - 80% Used`,
                message: `You've used 80% of your ${category.name} budget. Consider reducing spending in this category.`,
                categoryId: category.id,
                percentage: budgetPercentage,
                threshold: 80,
                confidence: 95,
                actionable: true,
                actionText: 'Review Budget'
            });
        }

        if (budgetPercentage >= 100) {
            await insightsService.createInsight({
                type: 'budget_exceeded',
                severity: 'alert',
                title: `${category.name} Budget Exceeded`,
                message: `You've exceeded your ${category.name} budget. Immediate action needed.`,
                categoryId: category.id,
                percentage: budgetPercentage,
                threshold: 100,
                confidence: 100,
                actionable: true,
                actionText: 'Adjust Budget'
            });
        }
    }

    /**
     * Update spending pattern insights
     */
    private async updateSpendingPatternInsights(transaction: Transaction): Promise<void> {
        // This would analyze spending patterns and create behavioral insights
        // For now, we'll just trigger a general update
        await insightsService.generateCrossRouteInsights({
            timeRange: 'month',
            includePredictions: false,
            includeBehavioral: true
        });
    }

    // ============================================================================
    // HELPER METHODS
    // ============================================================================

    /**
     * Determine source route from event
     */
    private determineSourceRoute(event: SyncEvent): SyncContext['sourceRoute'] {
        switch (event.entityType) {
            case 'goal':
                return 'goals';
            case 'transaction':
                return 'transactions';
            case 'budget':
            case 'category':
                return 'budget';
            default:
                return 'analyze';
        }
    }

    /**
     * Check if event is critical and needs immediate processing
     */
    private isCriticalEvent(event: SyncEvent): boolean {
        return event.type === 'goal_completed' || 
               event.type === 'budget_updated' ||
               event.type === 'transaction_deleted';
    }

    /**
     * Schedule batch processing of sync events
     */
    private scheduleBatchProcessing(): void {
        if (this.syncInterval) return;

        this.syncInterval = setTimeout(async () => {
            await this.processBatchSyncEvents();
            this.syncInterval = null;
        }, 1000); // Process batch after 1 second
    }

    /**
     * Process batch sync events
     */
    private async processBatchSyncEvents(): Promise<void> {
        if (this.isProcessing || this.syncQueue.length === 0) return;

        this.isProcessing = true;

        try {
            const events = [...this.syncQueue];
            this.syncQueue = [];

            for (const event of events) {
                await this.processSyncEvent(event);
            }
        } catch (error) {
            console.error('Error processing batch sync events:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Notify registered listeners
     */
    private async notifyListeners(event: SyncEvent): Promise<void> {
        const listeners = this.eventListeners.get(event.type) || [];
        for (const listener of listeners) {
            try {
                await listener(event);
            } catch (error) {
                console.error('Error in sync event listener:', error);
            }
        }
    }

    /**
     * Generate goal insights (reused from insights service)
     */
    private async generateGoalInsights(goals: Goal[]): Promise<Insight[]> {
        const insights: Insight[] = [];

        for (const goal of goals) {
            const progress = goal.currentAmount / goal.targetAmount;
            
            if (progress >= 0.25 && progress < 0.5) {
                insights.push({
                    id: crypto.randomUUID(),
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
        }

        return insights;
    }

    // ============================================================================
    // LIFECYCLE MANAGEMENT
    // ============================================================================

    /**
     * Setup event listeners for database changes
     */
    private setupEventListeners(): void {
        // This would hook into database change events
        // For now, we'll rely on manual event emission from services
    }

    /**
     * Start the sync service
     */
    start(): void {
        console.log('Cross-route sync service started');
    }

    /**
     * Stop the sync service
     */
    stop(): void {
        if (this.syncInterval) {
            clearTimeout(this.syncInterval);
            this.syncInterval = null;
        }
        console.log('Cross-route sync service stopped');
    }
}

export const crossRouteSyncService = new CrossRouteSyncService();
