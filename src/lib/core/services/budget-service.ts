import { db, generateUUID, isSpendingTransaction, isIncomeTransaction } from '$lib/core/db';
import type { Transaction, Tag, PriorityLevelMapping } from '$lib/core/db';
import { tagService } from './tag-service';
import { priorityLevelMappingService } from './priority-level-mapping-service';
import { transactionService } from './transaction-service';
import { validationService } from './validation-service';

// ============================================================================
// UNIFIED BUDGET SYSTEM TYPES
// ============================================================================

export type WaterfallCategory = 'survival' | 'security' | 'growth' | 'lifestyle';

/**
 * Unified Budget Category - replaces why tags entirely
 * This is the single source of truth for both categorization and budgeting
 */
export interface BudgetCategory {
    id: string;
    name: string;                    // e.g., "rent", "groceries", "entertainment"
    waterfallCategory: WaterfallCategory;
    priority: number;                // Priority within waterfall category (1 = highest)
    
    // Budget settings
    allocatedAmount: number;         // Monthly budget amount
    recurringPeriod: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' | 'custom';
    customPeriodDays?: number;
    
    // Current period tracking
    spent: number;                   // Current period spending
    remaining: number;               // allocatedAmount - spent
    
    // Goal system (optional)
    isGoalBased: boolean;
    goalTarget?: number;             // Target amount (no date = flexible)
    goalProgress: number;            // Total accumulated
    isComplete: boolean;
    
    // Automatic adjustments
    carryoverAmount: number;         // Rollover/borrowing amount
    maxCarryoverPercent: number;     // User-adjustable cap (default 20%)
    autoAdjustmentsEnabled: boolean;
    
    // Metadata
    color?: string;
    description?: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
}

/**
 * Simplified interface for transaction creation
 * Users only need to select a budget category (or none for income)
 */
export interface TransactionBudgetCategory {
    id: string;
    name: string;
    waterfallCategory: WaterfallCategory;
    priority: number;
    allocatedAmount: number;
    remaining: number;
    color?: string;
}

export interface FundTransfer {
    fromCategoryId: string;
    toCategoryId: string;
    amount: number;
    reason: 'user_reallocation' | 'automatic_borrowing' | 'goal_completion';
    respectsWaterfall: boolean;
    timestamp: Date;
}

export interface CategoryBudget {
    waterfallCategory: WaterfallCategory;
    totalAllocated: number;
    spent: number;
    remaining: number;
    carryoverAmount: number;
    isComplete: boolean;
    completionPercentage: number;
    budgetCategories: BudgetCategory[];
}

export interface BudgetAllocation {
    survival: { amount: number; targetAmount: number; isComplete: boolean };
    security: { amount: number; targetAmount: number; isComplete: boolean };
    growth: { amount: number; targetAmount: number; isComplete: boolean };
    lifestyle: { amount: number; targetAmount: number; isComplete: boolean };
}

export interface BudgetRecommendation {
    type: 'reallocate' | 'boost_category' | 'reduce_category' | 'create_category' | 'goal_complete' | 'category_adjustment';
    priority: 'low' | 'medium' | 'high';
    title: string;
    description: string;
    action: {
        categoryId?: string;
        amount?: number;
        reason: string;
    };
}

export interface BudgetInsight {
    type: 'spending_trend' | 'category_overspend' | 'surplus_detected' | 'carryover_opportunity' | 'goal_milestone' | 'category_overspend';
    title: string;
    description: string;
    severity: 'info' | 'warning' | 'alert' | 'success';
    data: Record<string, any>;
}

// ============================================================================
// UNIFIED BUDGET SERVICE IMPLEMENTATION
// ============================================================================

class BudgetService {
    private readonly DEFAULT_CATEGORIES: Record<string, {
        waterfallCategory: WaterfallCategory;
        priority: number;
        allocatedAmount: number;
        isGoalBased: boolean;
        goalTarget?: number;
        color: string;
    }> = {
        // Survival categories
        'rent': { waterfallCategory: 'survival', priority: 1, allocatedAmount: 1200, isGoalBased: false, color: '#EF4444' },
        'utilities': { waterfallCategory: 'survival', priority: 2, allocatedAmount: 200, isGoalBased: false, color: '#F97316' },
        'groceries': { waterfallCategory: 'survival', priority: 3, allocatedAmount: 400, isGoalBased: false, color: '#EAB308' },
        'transport': { waterfallCategory: 'survival', priority: 4, allocatedAmount: 300, isGoalBased: false, color: '#84CC16' },
        'healthcare': { waterfallCategory: 'survival', priority: 5, allocatedAmount: 150, isGoalBased: false, color: '#06B6D4' },
        'essential': { waterfallCategory: 'survival', priority: 6, allocatedAmount: 200, isGoalBased: false, color: '#8B5CF6' },
        
        // Security categories
        'emergency': { waterfallCategory: 'security', priority: 1, allocatedAmount: 500, isGoalBased: true, goalTarget: 15000, color: '#DC2626' },
        'insurance': { waterfallCategory: 'security', priority: 2, allocatedAmount: 200, isGoalBased: false, color: '#EA580C' },
        'debt': { waterfallCategory: 'security', priority: 3, allocatedAmount: 300, isGoalBased: false, color: '#D97706' },
        'savings': { waterfallCategory: 'security', priority: 4, allocatedAmount: 200, isGoalBased: true, color: '#65A30D' },
        
        // Growth categories
        'investment': { waterfallCategory: 'growth', priority: 1, allocatedAmount: 300, isGoalBased: true, color: '#059669' },
        'education': { waterfallCategory: 'growth', priority: 2, allocatedAmount: 200, isGoalBased: false, color: '#0D9488' },
        'skills': { waterfallCategory: 'growth', priority: 3, allocatedAmount: 100, isGoalBased: false, color: '#7C3AED' },
        
        // Lifestyle categories
        'entertainment': { waterfallCategory: 'lifestyle', priority: 1, allocatedAmount: 200, isGoalBased: false, color: '#EC4899' },
        'hobbies': { waterfallCategory: 'lifestyle', priority: 2, allocatedAmount: 100, isGoalBased: false, color: '#F43F5E' },
        'discretionary': { waterfallCategory: 'lifestyle', priority: 3, allocatedAmount: 100, isGoalBased: false, color: '#A855F7' }
    };

    public get ready() {
        return Promise.resolve();
    }

    // ============================================================================
    // BUDGET CATEGORY MANAGEMENT (Unified why tag + budget)
    // ============================================================================

    /**
     * Create or update a budget category (unified why tag + budget)
     */
    async createBudgetCategory(name: string, waterfallCategory: WaterfallCategory, amount: number, options?: {
        priority?: number;
        isGoalBased?: boolean;
        goalTarget?: number;
        recurringPeriod?: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' | 'custom';
        customPeriodDays?: number;
        maxCarryoverPercent?: number;
        autoAdjustmentsEnabled?: boolean;
        color?: string;
        description?: string;
    }): Promise<BudgetCategory> {
        // Validate input data
        const validation = await validationService.validateBudgetCategoryCreation({
            name,
            waterfallCategory,
            allocatedAmount: amount,
            priority: options?.priority,
            isGoalBased: options?.isGoalBased,
            goalTarget: options?.goalTarget
        });

        if (!validation.isValid) {
            throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
        }

        // Get default settings for this category
        const defaults = this.DEFAULT_CATEGORIES[name.toLowerCase()] || {
            waterfallCategory: 'lifestyle',
            priority: 999,
            allocatedAmount: 0,
            isGoalBased: false,
            color: '#6B7280'
        };

        const budgetCategory: BudgetCategory = {
            id: generateUUID(),
            name,
            waterfallCategory,
            priority: options?.priority || defaults.priority,
            allocatedAmount: amount,
            recurringPeriod: options?.recurringPeriod || 'monthly',
            customPeriodDays: options?.customPeriodDays,
            spent: 0,
            remaining: amount,
            isGoalBased: options?.isGoalBased ?? defaults.isGoalBased,
            goalTarget: options?.goalTarget || defaults.goalTarget,
            goalProgress: 0,
            isComplete: false,
            carryoverAmount: 0,
            maxCarryoverPercent: options?.maxCarryoverPercent ?? 0.2,
            autoAdjustmentsEnabled: options?.autoAdjustmentsEnabled ?? true,
            color: options?.color || defaults.color,
            description: options?.description,
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null
        };

        // Store the budget category
        await this.saveBudgetCategory(budgetCategory);
        
        return budgetCategory;
    }

    /**
     * Get all budget categories, optionally filtered by waterfall category
     */
    async getBudgetCategories(category?: WaterfallCategory): Promise<BudgetCategory[]> {
        try {
            // Get existing categories from the database
            const existingCategories = await db.budgetCategories
                .filter(cat => cat.isActive && !cat.deletedAt)
                .toArray();
            
            // Filter by waterfall category if specified
            const filtered = category 
                ? existingCategories.filter(cat => cat.waterfallCategory === category)
                : existingCategories;
            
            return filtered.sort((a, b) => a.priority - b.priority);
        } catch (error) {
            console.error('[BudgetService] Error getting budget categories:', error);
            throw new Error(`Failed to get budget categories: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get budget category by ID (active only)
     */
    async getBudgetCategoryById(categoryId: string): Promise<BudgetCategory | null> {
        try {
            const category = await db.budgetCategories.get(categoryId);
            return category && category.isActive ? category : null;
        } catch (error) {
            console.error('[BudgetService] Error getting budget category by ID:', error);
            return null;
        }
    }

    /**
     * Get budget category by ID (including inactive)
     */
    async getBudgetCategoryByIdAny(categoryId: string): Promise<BudgetCategory | null> {
        try {
            const category = await db.budgetCategories.get(categoryId);
            return category && !category.deletedAt ? category : null;
        } catch (error) {
            console.error('[BudgetService] Error getting budget category by ID:', error);
            return null;
        }
    }

    /**
     * Get budget category by name
     */
    async getBudgetCategoryByName(name: string): Promise<BudgetCategory | null> {
        // In a real implementation, this would fetch from database
        const categories = await this.getBudgetCategories();
        return categories.find(cat => cat.name === name) || null;
    }

    /**
     * Get budget categories for transaction creation (simplified interface)
     */
    async getTransactionBudgetCategories(): Promise<TransactionBudgetCategory[]> {
        const categories = await this.getBudgetCategories();
        
        return categories.map(cat => ({
            id: cat.id,
            name: cat.name,
            waterfallCategory: cat.waterfallCategory,
            priority: cat.priority,
            allocatedAmount: cat.allocatedAmount,
            remaining: cat.remaining,
            color: cat.color
        }));
    }


    /**
     * Calculate category totals from budget categories
     */
    async calculateCategoryBudgets(): Promise<CategoryBudget[]> {
        const categories: CategoryBudget[] = [];
        const categoryNames: WaterfallCategory[] = ['survival', 'security', 'growth', 'lifestyle'];
        
        for (const categoryName of categoryNames) {
            const budgetCategories = await this.getBudgetCategories(categoryName);
            
            const totalAllocated = budgetCategories.reduce((sum, cat) => sum + cat.allocatedAmount, 0);
            const totalSpent = budgetCategories.reduce((sum, cat) => sum + cat.spent, 0);
            const totalRemaining = budgetCategories.reduce((sum, cat) => sum + cat.remaining, 0);
            const totalCarryover = budgetCategories.reduce((sum, cat) => sum + cat.carryoverAmount, 0);
            
            const completionPercentage = totalAllocated > 0 ? Math.min((totalSpent / totalAllocated) * 100, 100) : 0;
            const isComplete = budgetCategories.every(cat => cat.isComplete);
            
            categories.push({
                waterfallCategory: categoryName,
                totalAllocated,
                spent: totalSpent,
                remaining: totalRemaining,
                carryoverAmount: totalCarryover,
                isComplete,
                completionPercentage,
                budgetCategories
            });
        }
        
        return categories;
    }

    // ============================================================================
    // TRANSACTION INTEGRATION (Unified approach)
    // ============================================================================

    /**
     * Track spending against budget categories when transactions are created
     * This is called automatically by the transaction service
     */
    async trackTransactionSpending(transaction: Transaction): Promise<void> {
        // Only track expenses (income doesn't affect budgets)
        if (!isSpendingTransaction(transaction) || !transaction.budgetCategoryId) {
            return;
        }

        const budgetCategory = await this.getBudgetCategoryById(transaction.budgetCategoryId);
        if (!budgetCategory) {
            console.warn(`Budget category not found: ${transaction.budgetCategoryId}`);
            return;
        }

        budgetCategory.spent += transaction.amount;
        budgetCategory.remaining = budgetCategory.allocatedAmount - budgetCategory.spent;
        
        // Update goal progress if applicable
        if (budgetCategory.isGoalBased && budgetCategory.goalTarget) {
            budgetCategory.goalProgress = Math.min(budgetCategory.spent, budgetCategory.goalTarget);
            budgetCategory.isComplete = budgetCategory.goalProgress >= budgetCategory.goalTarget;
        }

        // Process automatic borrowing if overspent and auto-adjustments are enabled
        if (budgetCategory.remaining < 0 && budgetCategory.autoAdjustmentsEnabled) {
            try {
                const transfers = await this.processAutomaticBorrowing(budgetCategory);
                if (transfers.length > 0) {
                    console.log(`Automatic borrowing processed for ${budgetCategory.name}: ${transfers.length} transfers`);
                }
            } catch (error) {
                console.warn(`Automatic borrowing failed for ${budgetCategory.name}:`, error);
            }
        }

        await this.saveBudgetCategory(budgetCategory);
    }

    /**
     * Process income through the waterfall system
     * This is called automatically when income transactions are created
     */
    async processIncome(amount: number): Promise<void> {
        const budgetCategories = await this.getBudgetCategories();
        
        // Calculate total allocated amount
        const totalAllocated = budgetCategories.reduce((sum, cat) => sum + cat.allocatedAmount, 0);
        
        if (amount >= totalAllocated) {
            // Income covers all allocations
            for (const category of budgetCategories) {
                category.remaining = category.allocatedAmount;
                await this.saveBudgetCategory(category);
            }
        } else {
            // Income is insufficient - prioritize survival categories
            const sortedCategories = budgetCategories.sort((a, b) => {
                const priorityOrder = { survival: 1, security: 2, growth: 3, lifestyle: 4 };
                return priorityOrder[a.waterfallCategory] - priorityOrder[b.waterfallCategory];
            });
            
            let remainingIncome = amount;
            for (const category of sortedCategories) {
                if (remainingIncome >= category.allocatedAmount) {
                    category.remaining = category.allocatedAmount;
                    remainingIncome -= category.allocatedAmount;
                } else {
                    category.remaining = remainingIncome;
                    remainingIncome = 0;
                }
                await this.saveBudgetCategory(category);
            }
        }
    }

    /**
     * Get budget status for a specific category (for transaction forms)
     */
    async getBudgetStatusForCategory(categoryName: string): Promise<{
        allocated: number;
        spent: number;
        remaining: number;
        isOverBudget: boolean;
        utilizationPercentage: number;
    } | null> {
        const budgetCategories = await this.getBudgetCategories();
        const category = budgetCategories.find(cat => cat.name === categoryName);
        
        if (!category) {
            return null;
        }

        const utilizationPercentage = category.allocatedAmount > 0 
            ? (category.spent / category.allocatedAmount) * 100 
            : 0;

        return {
            allocated: category.allocatedAmount,
            spent: category.spent,
            remaining: category.remaining,
            isOverBudget: category.remaining < 0,
            utilizationPercentage
        };
    }

    // ============================================================================
    // FUND TRANSFER SYSTEM
    // ============================================================================

    /**
     * Transfer funds between budget categories
     */
    async transferFunds(transfer: FundTransfer): Promise<void> {
        // Validate transfer
        if (transfer.amount <= 0) {
            throw new Error('Transfer amount must be positive');
        }

        const budgetCategories = await this.getBudgetCategories();
        const fromCategory = budgetCategories.find(cat => cat.id === transfer.fromCategoryId);
        const toCategory = budgetCategories.find(cat => cat.id === transfer.toCategoryId);

        if (!fromCategory || !toCategory) {
            throw new Error('Source or destination budget category not found');
        }

        // Check if source has sufficient funds
        if (fromCategory.remaining < transfer.amount) {
            throw new Error(`Insufficient funds in ${fromCategory.name}. Available: $${fromCategory.remaining}`);
        }

        // Validate waterfall rules for borrowing
        if (transfer.respectsWaterfall && transfer.reason === 'automatic_borrowing') {
            const isValidBorrowing = this.validateWaterfallBorrowing(fromCategory, toCategory);
            if (!isValidBorrowing) {
                throw new Error('Borrowing violates waterfall priority rules');
            }
        }

        // Perform the transfer
        fromCategory.spent += transfer.amount;
        fromCategory.remaining = fromCategory.allocatedAmount - fromCategory.spent;
        
        toCategory.allocatedAmount += transfer.amount;
        toCategory.remaining = toCategory.allocatedAmount - toCategory.spent;

        // Update goal progress if applicable
        if (toCategory.isGoalBased && toCategory.goalTarget) {
            toCategory.goalProgress = Math.min(toCategory.spent, toCategory.goalTarget);
            toCategory.isComplete = toCategory.goalProgress >= toCategory.goalTarget;
        }

        // Save both categories
        await this.saveBudgetCategory(fromCategory);
        await this.saveBudgetCategory(toCategory);

        console.log(`Fund transfer: $${transfer.amount} from ${fromCategory.name} to ${toCategory.name} (${transfer.reason})`);
    }

    /**
     * Process automatic borrowing when a category is overspent
     */
    async processAutomaticBorrowing(overspentCategory: BudgetCategory): Promise<FundTransfer[]> {
        if (!overspentCategory.autoAdjustmentsEnabled) {
            return [];
        }

        const transfers: FundTransfer[] = [];
        const budgetCategories = await this.getBudgetCategories();
        
        // Sort by waterfall priority (lifestyle first for borrowing)
        const sortedCategories = budgetCategories
            .filter(cat => cat.id !== overspentCategory.id && cat.remaining > 0)
            .sort((a, b) => {
                const categoryPriority = { lifestyle: 1, growth: 2, security: 3, survival: 4 };
                return categoryPriority[a.waterfallCategory] - categoryPriority[b.waterfallCategory];
            });

        let remainingNeeded = Math.abs(overspentCategory.remaining);
        
        for (const sourceCategory of sortedCategories) {
            if (remainingNeeded <= 0) break;

            // Check carryover cap
            const maxBorrowable = sourceCategory.allocatedAmount * sourceCategory.maxCarryoverPercent;
            const availableToBorrow = Math.min(sourceCategory.remaining, maxBorrowable);
            
            if (availableToBorrow > 0) {
                const transferAmount = Math.min(remainingNeeded, availableToBorrow);
                
                const transfer: FundTransfer = {
                    fromCategoryId: sourceCategory.id,
                    toCategoryId: overspentCategory.id,
                    amount: transferAmount,
                    reason: 'automatic_borrowing',
                    respectsWaterfall: true,
                    timestamp: new Date()
                };

                await this.transferFunds(transfer);
                transfers.push(transfer);
                remainingNeeded -= transferAmount;
            }
        }

        return transfers;
    }

    // ============================================================================
    // RECOMMENDATIONS & INSIGHTS
    // ============================================================================

    /**
     * Generate budget recommendations based on current status
     */
    async generateRecommendations(categoryBudgets: CategoryBudget[]): Promise<BudgetRecommendation[]> {
        const recommendations: BudgetRecommendation[] = [];

        for (const categoryBudget of categoryBudgets) {
            const utilizationRate = categoryBudget.spent / categoryBudget.totalAllocated;
            const remainingPercentage = (categoryBudget.remaining / categoryBudget.totalAllocated) * 100;

            // Check for overspending
            if (utilizationRate > 1.1) {
                recommendations.push({
                    type: 'reduce_category',
                    priority: 'high',
                    title: `${categoryBudget.waterfallCategory} Overspending`,
                    description: `You've exceeded your ${categoryBudget.waterfallCategory} budget by ${((utilizationRate - 1) * 100).toFixed(1)}%`,
                    action: {
                        reason: 'Overspending detected'
                    }
                });
            }

            // Check for underutilization
            if (utilizationRate < 0.7 && remainingPercentage > 20) {
                recommendations.push({
                    type: 'boost_category',
                    priority: 'medium',
                    title: `${categoryBudget.waterfallCategory} Underutilization`,
                    description: `You have ${remainingPercentage.toFixed(1)}% remaining in ${categoryBudget.waterfallCategory}`,
                    action: {
                        reason: 'Underutilization detected'
                    }
                });
            }

            // Check for category-level recommendations
            for (const budgetCategory of categoryBudget.budgetCategories) {
                const categoryUtilizationRate = budgetCategory.spent / budgetCategory.allocatedAmount;
                
                if (categoryUtilizationRate > 1.2) {
                    recommendations.push({
                        type: 'category_adjustment',
                        priority: 'high',
                        title: `${budgetCategory.name} Overspending`,
                        description: `Consider increasing ${budgetCategory.name} budget from $${budgetCategory.allocatedAmount} to $${Math.round(budgetCategory.spent * 1.1)}`,
                        action: {
                            categoryId: budgetCategory.id,
                            amount: Math.round(budgetCategory.spent * 1.1) - budgetCategory.allocatedAmount,
                            reason: 'Category overspending detected'
                        }
                    });
                }
            }
        }

        return recommendations;
    }

    /**
     * Generate budget insights and alerts
     */
    async generateInsights(categoryBudgets: CategoryBudget[]): Promise<BudgetInsight[]> {
        const insights: BudgetInsight[] = [];

        for (const categoryBudget of categoryBudgets) {
            const utilizationRate = categoryBudget.spent / categoryBudget.totalAllocated;

            if (utilizationRate > 0.9) {
                insights.push({
                    type: 'category_overspend',
                    title: `${categoryBudget.waterfallCategory} Budget Alert`,
                    description: `You're approaching your ${categoryBudget.waterfallCategory} budget limit`,
                    severity: 'warning',
                    data: { category: categoryBudget.waterfallCategory, utilizationRate }
                });
            }

            if (categoryBudget.carryoverAmount > 0) {
                insights.push({
                    type: 'carryover_opportunity',
                    title: `${categoryBudget.waterfallCategory} Carryover Available`,
                    description: `You have $${categoryBudget.carryoverAmount.toFixed(0)} available to carry over`,
                    severity: 'info',
                    data: { category: categoryBudget.waterfallCategory, carryoverAmount: categoryBudget.carryoverAmount }
                });
            }

            // Category-level insights
            for (const budgetCategory of categoryBudget.budgetCategories) {
                const categoryUtilizationRate = budgetCategory.spent / budgetCategory.allocatedAmount;
                
                if (categoryUtilizationRate > 0.95) {
                    insights.push({
                        type: 'category_overspend',
                        title: `${budgetCategory.name} Budget Alert`,
                        description: `You're approaching your ${budgetCategory.name} budget limit`,
                        severity: 'warning',
                        data: { categoryName: budgetCategory.name, utilizationRate: categoryUtilizationRate }
                    });
                }

                if (budgetCategory.isGoalBased && budgetCategory.goalProgress && budgetCategory.goalTarget) {
                    const goalProgress = (budgetCategory.goalProgress / budgetCategory.goalTarget) * 100;
                    if (goalProgress >= 100) {
                        insights.push({
                            type: 'goal_milestone',
                            title: `${budgetCategory.name} Goal Complete!`,
                            description: `Congratulations! You've reached your ${budgetCategory.name} goal`,
                            severity: 'success',
                            data: { categoryName: budgetCategory.name, goalProgress }
                        });
                    }
                }
            }
        }

        return insights;
    }

    // ============================================================================
    // HELPER METHODS
    // ============================================================================

    /**
     * Validate waterfall borrowing rules
     */
    private validateWaterfallBorrowing(fromCategory: BudgetCategory, toCategory: BudgetCategory): boolean {
        const categoryPriority = { survival: 1, security: 2, growth: 3, lifestyle: 4 };
        const fromPriority = categoryPriority[fromCategory.waterfallCategory];
        const toPriority = categoryPriority[toCategory.waterfallCategory];

        // Can only borrow from lower priority categories
        return fromPriority > toPriority;
    }

    /**
     * Save budget category to database
     */
    private async saveBudgetCategory(budgetCategory: BudgetCategory): Promise<void> {
        try {
            await db.budgetCategories.put(budgetCategory);
            console.log('Budget category saved successfully:', budgetCategory.name);
        } catch (error) {
            console.error('Error saving budget category:', error);
            throw new Error(`Failed to save budget category: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Update budget category
     */
    async updateBudgetCategory(categoryId: string, updates: Partial<BudgetCategory>): Promise<BudgetCategory> {
        try {
            const existingCategory = await this.getBudgetCategoryByIdAny(categoryId);
            if (!existingCategory) {
                throw new Error(`Budget category with ID ${categoryId} not found`);
            }

            const updatedCategory: BudgetCategory = {
                ...existingCategory,
                ...updates,
                id: categoryId, // Ensure ID doesn't change
                updatedAt: new Date().toISOString()
            };

            await db.budgetCategories.update(categoryId, updatedCategory);
            console.log('Budget category updated successfully:', updatedCategory.name);
            return updatedCategory;
        } catch (error) {
            console.error('Error updating budget category:', error);
            throw new Error(`Failed to update budget category: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Delete budget category (soft delete)
     */
    async deleteBudgetCategory(categoryId: string): Promise<void> {
        try {
            const existingCategory = await this.getBudgetCategoryByIdAny(categoryId);
            if (!existingCategory) {
                throw new Error(`Budget category with ID ${categoryId} not found`);
            }

            // Soft delete by setting deletedAt and isActive
            await db.budgetCategories.update(categoryId, {
                deletedAt: new Date().toISOString(),
                isActive: false,
                updatedAt: new Date().toISOString()
            });

            console.log('Budget category deleted successfully:', existingCategory.name);
        } catch (error) {
            console.error('Error deleting budget category:', error);
            throw new Error(`Failed to delete budget category: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get monthly equivalent amount for any recurring period
     */
    getMonthlyEquivalent(amount: number, period: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' | 'custom', customDays?: number): number {
        switch (period) {
            case 'daily':
                return amount * 30.44;
            case 'weekly':
                return amount * 4.33;
            case 'biweekly':
                return amount * 2.17;
            case 'monthly':
                return amount;
            case 'yearly':
                return amount / 12;
            case 'custom':
                if (!customDays || customDays <= 0) {
                    throw new Error('Custom period requires valid customDays');
                }
                return (amount / customDays) * 30.44;
            default:
                return amount;
        }
    }

    /**
     * Calculate period amount from monthly amount
     */
    getPeriodAmount(monthlyAmount: number, period: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' | 'custom', customDays?: number): number {
        switch (period) {
            case 'daily':
                return monthlyAmount / 30.44;
            case 'weekly':
                return monthlyAmount / 4.33;
            case 'biweekly':
                return monthlyAmount / 2.17;
            case 'monthly':
                return monthlyAmount;
            case 'yearly':
                return monthlyAmount * 12;
            case 'custom':
                if (!customDays || customDays <= 0) {
                    throw new Error('Custom period requires valid customDays');
                }
                return (monthlyAmount / 30.44) * customDays;
            default:
                return monthlyAmount;
        }
    }

    // ============================================================================
    // LEGACY SUPPORT METHODS (for backward compatibility)
    // ============================================================================

    /**
     * Legacy method for backward compatibility
     */
    async getTagBudgets(category?: WaterfallCategory): Promise<any[]> {
        const budgetCategories = await this.getBudgetCategories(category);
        // Convert to legacy format for backward compatibility
        return budgetCategories.map(cat => ({
            tagId: cat.id,
            tagName: cat.name,
            waterfallCategory: cat.waterfallCategory,
            allocatedAmount: cat.allocatedAmount,
            recurringPeriod: cat.recurringPeriod,
            customPeriodDays: cat.customPeriodDays,
            spent: cat.spent,
            remaining: cat.remaining,
            priority: cat.priority,
            isGoalBased: cat.isGoalBased,
            goalTarget: cat.goalTarget,
            goalProgress: cat.goalProgress,
            isComplete: cat.isComplete,
            carryoverAmount: cat.carryoverAmount,
            maxRolloverPercent: cat.maxCarryoverPercent,
            autoAdjustmentsEnabled: cat.autoAdjustmentsEnabled
        }));
    }

    /**
     * Legacy method for backward compatibility
     */
    async createTagBudget(tagName: string, waterfallCategory: WaterfallCategory, amount: number, options?: any): Promise<any> {
        return this.createBudgetCategory(tagName, waterfallCategory, amount, options);
    }

    /**
     * Legacy method for backward compatibility
     */
    async updateTagBudget(tagId: string, updates: any): Promise<any> {
        return this.updateBudgetCategory(tagId, updates);
    }


}

// ============================================================================
// EXPORT SINGLETON INSTANCE
// ============================================================================

export const budgetService = new BudgetService(); 