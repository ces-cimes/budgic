import { db, generateUUID, isSpendingTransaction, isIncomeTransaction } from '$lib/core/db';
import type { Transaction, Tag, PriorityLevelMapping } from '$lib/core/db';
import { tagService } from './tag-service';
import { priorityLevelMappingService } from './priority-level-mapping-service';
import { transactionService } from './transaction-service';
import { validationService } from './validation-service';

// ============================================================================
// ENHANCED BUDGET SYSTEM TYPES
// ============================================================================

export interface WhyTag {
    id: string;
    name: string;
    waterfallCategory: 'survival' | 'security' | 'growth' | 'lifestyle';
    isActive: boolean;
}

export interface TagBudget {
    tagId: string;
    tagName: string;
    waterfallCategory: 'survival' | 'security' | 'growth' | 'lifestyle';
    allocatedAmount: number;
    targetAmount?: number; // For goal-based tags like emergency fund
    spent: number;
    remaining: number;
    priority: number; // Priority within category (1 = highest)
    isGoalBased: boolean;
    goalType?: 'monthly' | 'target' | 'recurring';
    goalTarget?: number; // For target-based goals
    goalProgress?: number; // Current progress toward goal
    isComplete: boolean;
    rolloverAmount: number;
    borrowedAmount: number;
}

export interface CategoryBudget {
    waterfallCategory: string;
    totalAllocated: number;
    targetAmount: number;
    spent: number;
    remaining: number;
    rolloverAmount: number;
    borrowedAmount: number;
    isComplete: boolean;
    completionPercentage: number;
    tagBudgets: TagBudget[];
}

export interface BudgetAllocation {
    survival: { amount: number; targetAmount: number; isComplete: boolean };
    security: { amount: number; targetAmount: number; isComplete: boolean };
    growth: { amount: number; targetAmount: number; isComplete: boolean };
    lifestyle: { amount: number; targetAmount: number; isComplete: boolean };
}

export interface FinancialNeeds {
    survival: {
        housing: number;
        utilities: number;
        food: number;
        transport: number;
        healthcare: number;
        buffer: number;
    };
    security: {
        emergencyFundTarget: number;
        monthlyContribution: number;
        insurance: number;
        debtPayments: number;
    };
    growth: {
        minimumInvestment: number;
        education: number;
        skills: number;
    };
    lifestyle: {
        entertainment: number;
        hobbies: number;
        discretionary: number;
    };
}

export interface IncomeLevel {
    level: 'low' | 'medium' | 'high';
    range: { min: number; max: number };
    survivalBuffer: number;
    securityMultiplier: number;
    growthMultiplier: number;
}

export interface TagBudgetSuggestion {
    tagId: string;
    tagName: string;
    suggestedAmount: number;
    reason: string;
    priority: 'high' | 'medium' | 'low';
    category: 'survival' | 'security' | 'growth' | 'lifestyle';
}

export interface BudgetRecommendation {
    type: 'reallocate' | 'boost_category' | 'reduce_category' | 'create_why_tag' | 'goal_complete' | 'tag_adjustment';
    priority: 'low' | 'medium' | 'high';
    title: string;
    description: string;
    action: {
        category?: string;
        whyTagId?: string;
        amount?: number;
        reason: string;
    };
}

export interface BudgetInsight {
    type: 'spending_trend' | 'category_overspend' | 'surplus_detected' | 'rollover_opportunity' | 'goal_milestone' | 'tag_overspend';
    title: string;
    description: string;
    severity: 'info' | 'warning' | 'alert' | 'success';
    data: Record<string, any>;
}

// ============================================================================
// BUDGET SERVICE IMPLEMENTATION
// ============================================================================

class BudgetService {
    private readonly INCOME_LEVELS: IncomeLevel[] = [
        {
            level: 'low',
            range: { min: 0, max: 3000 },
            survivalBuffer: 0.05, // 5% buffer
            securityMultiplier: 0.8, // 80% of standard
            growthMultiplier: 0.6 // 60% of standard
        },
        {
            level: 'medium',
            range: { min: 3001, max: 8000 },
            survivalBuffer: 0.1, // 10% buffer
            securityMultiplier: 1.0, // Standard
            growthMultiplier: 1.0 // Standard
        },
        {
            level: 'high',
            range: { min: 8001, max: Infinity },
            survivalBuffer: 0.15, // 15% buffer
            securityMultiplier: 1.2, // 120% of standard
            growthMultiplier: 1.3 // 130% of standard
        }
    ];

    private readonly DEFAULT_TAG_BUDGETS: Record<string, { amount: number; priority: number; isGoalBased: boolean; goalType?: 'monthly' | 'target' | 'recurring'; goalTarget?: number }> = {
        // Survival tags
        'rent': { amount: 1200, priority: 1, isGoalBased: false },
        'utilities': { amount: 200, priority: 2, isGoalBased: false },
        'groceries': { amount: 400, priority: 3, isGoalBased: false },
        'transport': { amount: 300, priority: 4, isGoalBased: false },
        'healthcare': { amount: 150, priority: 5, isGoalBased: false },
        'essential': { amount: 200, priority: 6, isGoalBased: false },
        
        // Security tags
        'emergency': { amount: 500, priority: 1, isGoalBased: true, goalType: 'target', goalTarget: 15000 },
        'insurance': { amount: 200, priority: 2, isGoalBased: false },
        'debt': { amount: 300, priority: 3, isGoalBased: false },
        'savings': { amount: 200, priority: 4, isGoalBased: true, goalType: 'monthly' },
        
        // Growth tags
        'investment': { amount: 300, priority: 1, isGoalBased: true, goalType: 'monthly' },
        'education': { amount: 200, priority: 2, isGoalBased: false },
        'skills': { amount: 100, priority: 3, isGoalBased: false },
        
        // Lifestyle tags
        'entertainment': { amount: 200, priority: 1, isGoalBased: false },
        'hobbies': { amount: 100, priority: 2, isGoalBased: false },
        'discretionary': { amount: 100, priority: 3, isGoalBased: false }
    };

    private readonly STANDARD_NEEDS: FinancialNeeds = {
        survival: {
            housing: 1200,
            utilities: 200,
            food: 400,
            transport: 300,
            healthcare: 150,
            buffer: 0 // Will be calculated based on income level
        },
        security: {
            emergencyFundTarget: 15000, // 6 months of $2500 expenses
            monthlyContribution: 500,
            insurance: 200,
            debtPayments: 300
        },
        growth: {
            minimumInvestment: 300,
            education: 200,
            skills: 100
        },
        lifestyle: {
            entertainment: 200,
            hobbies: 100,
            discretionary: 100
        }
    };

    public get ready() {
        return Promise.resolve();
    }

    // ============================================================================
    // TAG-LEVEL BUDGET MANAGEMENT
    // ============================================================================

    /**
     * Create or update a tag budget
     */
    async createTagBudget(tagName: string, waterfallCategory: WhyTag['waterfallCategory'], amount: number, options?: {
        priority?: number;
        isGoalBased?: boolean;
        goalType?: 'monthly' | 'target' | 'recurring';
        goalTarget?: number;
    }): Promise<TagBudget> {
        // Validate input data
        const validation = await validationService.validateTagBudgetCreation({
            tagName,
            waterfallCategory,
            allocatedAmount: amount,
            priority: options?.priority,
            isGoalBased: options?.isGoalBased,
            goalType: options?.goalType,
            goalTarget: options?.goalTarget
        });

        if (!validation.isValid) {
            throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
        }

        // Create the why tag if it doesn't exist
        const whyTag = await this.createWhyTag(tagName, waterfallCategory);
        
        // Get default settings for this tag
        const defaults = this.DEFAULT_TAG_BUDGETS[tagName.toLowerCase()] || {
            amount: 0,
            priority: 999,
            isGoalBased: false
        };

        const tagBudget: TagBudget = {
            tagId: whyTag.id,
            tagName: whyTag.name,
            waterfallCategory,
            allocatedAmount: amount,
            targetAmount: options?.goalTarget || defaults.goalTarget,
            spent: 0,
            remaining: amount,
            priority: options?.priority || defaults.priority,
            isGoalBased: options?.isGoalBased ?? defaults.isGoalBased,
            goalType: options?.goalType || defaults.goalType,
            goalTarget: options?.goalTarget || defaults.goalTarget,
            goalProgress: 0,
            isComplete: false,
            rolloverAmount: 0,
            borrowedAmount: 0
        };

        // Store the tag budget (in a real implementation, this would be in the database)
        await this.saveTagBudget(tagBudget);
        
        return tagBudget;
    }

    /**
     * Get all tag budgets for a category
     */
    async getTagBudgets(category?: 'survival' | 'security' | 'growth' | 'lifestyle'): Promise<TagBudget[]> {
        // In a real implementation, this would fetch from database
        // For now, return mock data based on default tag budgets
        const tagBudgets: TagBudget[] = [];
        
        for (const [tagName, defaults] of Object.entries(this.DEFAULT_TAG_BUDGETS)) {
            if (!category || this.getTagCategory(tagName) === category) {
                const whyTag = await this.getWhyTagByName(tagName);
                if (whyTag) {
                    tagBudgets.push({
                        tagId: whyTag.id,
                        tagName: whyTag.name,
                        waterfallCategory: whyTag.waterfallCategory,
                        allocatedAmount: defaults.amount,
                        targetAmount: defaults.goalTarget,
                        spent: 0,
                        remaining: defaults.amount,
                        priority: defaults.priority,
                        isGoalBased: defaults.isGoalBased,
                        goalType: defaults.goalType,
                        goalTarget: defaults.goalTarget,
                        goalProgress: 0,
                        isComplete: false,
                        rolloverAmount: 0,
                        borrowedAmount: 0
                    });
                }
            }
        }
        
        return tagBudgets.sort((a, b) => a.priority - b.priority);
    }

    /**
     * Update a tag budget amount
     */
    async updateTagBudget(tagId: string, updates: Partial<TagBudget>): Promise<TagBudget> {
        // Validate updates
        const validation = await validationService.validateTagBudgetUpdate(tagId, {
            allocatedAmount: updates.allocatedAmount,
            priority: updates.priority,
            isGoalBased: updates.isGoalBased,
            goalType: updates.goalType,
            goalTarget: updates.goalTarget
        });

        if (!validation.isValid) {
            throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
        }

        const tagBudgets = await this.getTagBudgets();
        const tagBudget = tagBudgets.find(tb => tb.tagId === tagId);
        
        if (!tagBudget) {
            throw new Error(`Tag budget not found for tag ID: ${tagId}`);
        }

        const updatedBudget = { ...tagBudget, ...updates };
        
        // Recalculate remaining amount
        updatedBudget.remaining = updatedBudget.allocatedAmount - updatedBudget.spent;
        
        // Update goal progress if applicable
        if (updatedBudget.isGoalBased && updatedBudget.goalTarget) {
            updatedBudget.goalProgress = Math.min(updatedBudget.spent, updatedBudget.goalTarget);
            updatedBudget.isComplete = updatedBudget.goalProgress >= updatedBudget.goalTarget;
        }
        
        await this.saveTagBudget(updatedBudget);
        return updatedBudget;
    }

    /**
     * Calculate category totals from tag budgets
     */
    async calculateCategoryBudgets(): Promise<CategoryBudget[]> {
        const categories: CategoryBudget[] = [];
        const categoryNames: ('survival' | 'security' | 'growth' | 'lifestyle')[] = ['survival', 'security', 'growth', 'lifestyle'];
        
        for (const category of categoryNames) {
            const tagBudgets = await this.getTagBudgets(category);
            
            const totalAllocated = tagBudgets.reduce((sum, tb) => sum + tb.allocatedAmount, 0);
            const totalSpent = tagBudgets.reduce((sum, tb) => sum + tb.spent, 0);
            const totalRemaining = tagBudgets.reduce((sum, tb) => sum + tb.remaining, 0);
            const totalRollover = tagBudgets.reduce((sum, tb) => sum + tb.rolloverAmount, 0);
            const totalBorrowed = tagBudgets.reduce((sum, tb) => sum + tb.borrowedAmount, 0);
            const targetAmount = tagBudgets.reduce((sum, tb) => sum + (tb.targetAmount || 0), 0);
            
            const completionPercentage = targetAmount > 0 ? Math.min((totalAllocated / targetAmount) * 100, 100) : 0;
            const isComplete = tagBudgets.every(tb => tb.isComplete);
            
            categories.push({
                waterfallCategory: category,
                totalAllocated,
                targetAmount,
                spent: totalSpent,
                remaining: totalRemaining,
                rolloverAmount: totalRollover,
                borrowedAmount: totalBorrowed,
                isComplete,
                completionPercentage,
                tagBudgets
            });
        }
        
        return categories;
    }

    /**
     * Generate tag-level budget suggestions for new income
     */
    async generateTagBudgetSuggestions(availableIncome: number, currentTagBudgets: TagBudget[]): Promise<TagBudgetSuggestion[]> {
        const suggestions: TagBudgetSuggestion[] = [];
        let remainingIncome = availableIncome;
        
        // Sort tags by waterfall priority and then by priority within category
        const sortedTags = currentTagBudgets.sort((a, b) => {
            const categoryPriority = { survival: 1, security: 2, growth: 3, lifestyle: 4 };
            const aPriority = categoryPriority[a.waterfallCategory];
            const bPriority = categoryPriority[b.waterfallCategory];
            
            if (aPriority !== bPriority) {
                return aPriority - bPriority;
            }
            
            return a.priority - b.priority;
        });
        
        for (const tagBudget of sortedTags) {
            if (remainingIncome <= 0) break;
            
            // Calculate suggested amount based on tag type and current status
            let suggestedAmount = 0;
            let reason = '';
            
            if (tagBudget.isGoalBased && tagBudget.goalTarget) {
                // Goal-based tags: suggest amount needed to reach goal
                const goalProgress = tagBudget.goalProgress || 0;
                const remainingToGoal = tagBudget.goalTarget - goalProgress;
                suggestedAmount = Math.min(remainingToGoal, remainingIncome);
                reason = `Goal progress: ${goalProgress}/${tagBudget.goalTarget}`;
            } else {
                // Regular tags: suggest based on historical spending or current allocation
                const historicalAverage = await this.getHistoricalSpendingAverage(tagBudget.tagName);
                const currentUtilization = tagBudget.allocatedAmount > 0 ? (tagBudget.spent / tagBudget.allocatedAmount) : 0;
                
                if (currentUtilization > 1.1) {
                    // Overspending detected - suggest increase
                    const overspendAmount = tagBudget.spent - tagBudget.allocatedAmount;
                    suggestedAmount = Math.min(overspendAmount * 1.2, remainingIncome); // 20% buffer
                    reason = `Overspending detected: ${((currentUtilization - 1) * 100).toFixed(1)}% over budget`;
                } else if (historicalAverage > tagBudget.allocatedAmount) {
                    // Historical average higher than current allocation
                    const suggestedIncrease = historicalAverage - tagBudget.allocatedAmount;
                    suggestedAmount = Math.min(suggestedIncrease, remainingIncome);
                    reason = `Historical average: $${historicalAverage}`;
                } else if (remainingIncome > 0) {
                    // Small boost to maintain or improve current allocation
                    suggestedAmount = Math.min(remainingIncome * 0.1, 100); // 10% of remaining or $100 max
                    reason = `Small boost to maintain budget`;
                }
            }
            
            if (suggestedAmount > 0) {
                suggestions.push({
                    tagId: tagBudget.tagId,
                    tagName: tagBudget.tagName,
                    suggestedAmount,
                    reason,
                    priority: this.getSuggestionPriority(tagBudget.waterfallCategory),
                    category: tagBudget.waterfallCategory
                });
                
                remainingIncome -= suggestedAmount;
            }
        }
        
        return suggestions;
    }

    // ============================================================================
    // CORE BUDGET CALCULATION METHODS (Enhanced for tag-level)
    // ============================================================================

    /**
     * Calculate optimal budget allocations based on actual financial needs (income-agnostic)
     */
    async calculateOptimalAllocations(spendingHistory: Transaction[]): Promise<BudgetAllocation> {
        // Calculate actual financial needs based on spending patterns and goals
        const financialNeeds = this.calculateActualFinancialNeeds(spendingHistory);
        
        // Return needs without income constraints - let users fund as they can
        return {
            survival: { 
                amount: financialNeeds.survival.total,
                targetAmount: financialNeeds.survival.total,
                isComplete: false
            },
            security: { 
                amount: financialNeeds.security.total,
                targetAmount: financialNeeds.security.total,
                isComplete: false
            },
            growth: { 
                amount: financialNeeds.growth.total,
                targetAmount: financialNeeds.growth.total,
                isComplete: false
            },
            lifestyle: { 
                amount: financialNeeds.lifestyle.total,
                targetAmount: financialNeeds.lifestyle.total,
                isComplete: false
            }
        };
    }

    /**
     * Calculate actual financial needs based on spending history and goals (income-agnostic)
     */
    private calculateActualFinancialNeeds(spendingHistory: Transaction[]): {
        survival: { total: number; breakdown: Record<string, number> };
        security: { total: number; breakdown: Record<string, number> };
        growth: { total: number; breakdown: Record<string, number> };
        lifestyle: { total: number; breakdown: Record<string, number> };
    } {
        // Analyze spending patterns to determine actual needs
        const monthlyAverages = this.calculateMonthlySpendingAverages(spendingHistory);
        
        // Calculate survival needs based on actual spending patterns
        const survivalNeeds = {
            housing: Math.max(monthlyAverages.housing || 0, 800), // Minimum reasonable housing
            utilities: Math.max(monthlyAverages.utilities || 0, 150),
            food: Math.max(monthlyAverages.food || 0, 300),
            transport: Math.max(monthlyAverages.transport || 0, 200),
            healthcare: Math.max(monthlyAverages.healthcare || 0, 100),
            essential: Math.max(monthlyAverages.essential || 0, 100)
        };
        
        // Calculate security needs based on goals and actual patterns
        const securityNeeds = {
            emergencyFund: this.calculateEmergencyFundTarget(spendingHistory) / 12, // Monthly contribution needed
            insurance: Math.max(monthlyAverages.insurance || 0, 150),
            debtPayments: Math.max(monthlyAverages.debt || 0, 200),
            savings: Math.max(monthlyAverages.savings || 0, 100)
        };
        
        // Calculate growth needs based on aspirations and current patterns
        const growthNeeds = {
            investment: Math.max(monthlyAverages.investment || 0, 200),
            education: Math.max(monthlyAverages.education || 0, 150),
            skills: Math.max(monthlyAverages.skills || 0, 100)
        };
        
        // Calculate lifestyle needs based on actual spending
        const lifestyleNeeds = {
            entertainment: Math.max(monthlyAverages.entertainment || 0, 150),
            hobbies: Math.max(monthlyAverages.hobbies || 0, 100),
            discretionary: Math.max(monthlyAverages.discretionary || 0, 100)
        };
        
        return {
            survival: {
                total: Object.values(survivalNeeds).reduce((sum, amount) => sum + amount, 0),
                breakdown: survivalNeeds
            },
            security: {
                total: Object.values(securityNeeds).reduce((sum, amount) => sum + amount, 0),
                breakdown: securityNeeds
            },
            growth: {
                total: Object.values(growthNeeds).reduce((sum, amount) => sum + amount, 0),
                breakdown: growthNeeds
            },
            lifestyle: {
                total: Object.values(lifestyleNeeds).reduce((sum, amount) => sum + amount, 0),
                breakdown: lifestyleNeeds
            }
        };
    }

    /**
     * Calculate monthly spending averages from transaction history
     */
    private calculateMonthlySpendingAverages(spendingHistory: Transaction[]): Record<string, number> {
        const categorySpending: Record<string, number[]> = {};
        
        // Group spending by category over the last 6 months
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        
        const recentTransactions = spendingHistory.filter(tx => 
            (tx.clearedDate && new Date(tx.clearedDate) >= sixMonthsAgo) && isSpendingTransaction(tx)
        );
        
        // Group by month and category
        const monthlyCategorySpending: Record<string, Record<string, number[]>> = {};
        
        for (const transaction of recentTransactions) {
            if (!transaction.whyTag) continue;
            
            const transactionDate = transaction.clearedDate || transaction.plannedDate;
            if (!transactionDate) continue;
            
            const month = new Date(transactionDate).toISOString().slice(0, 7); // YYYY-MM
            const category = this.getTagCategory(transaction.whyTag);
            
            if (!monthlyCategorySpending[month]) {
                monthlyCategorySpending[month] = {};
            }
            if (!monthlyCategorySpending[month][category]) {
                monthlyCategorySpending[month][category] = [];
            }
            
            monthlyCategorySpending[month][category].push(transaction.amount);
        }
        
        // Calculate monthly totals for each category
        const categoryMonthlyTotals: Record<string, number[]> = {};
        
        for (const [month, categories] of Object.entries(monthlyCategorySpending)) {
            for (const [category, amounts] of Object.entries(categories)) {
                if (!categoryMonthlyTotals[category]) {
                    categoryMonthlyTotals[category] = [];
                }
                const monthlyTotal = amounts.reduce((sum, amount) => sum + amount, 0);
                categoryMonthlyTotals[category].push(monthlyTotal);
            }
        }
        
        // Calculate final averages
        const finalAverages: Record<string, number> = {};
        for (const [category, monthlyTotals] of Object.entries(categoryMonthlyTotals)) {
            if (monthlyTotals.length > 0) {
                finalAverages[category] = monthlyTotals.reduce((sum, total) => sum + total, 0) / monthlyTotals.length;
            }
        }
        
        return finalAverages;
    }

    /**
     * Calculate emergency fund target based on actual spending patterns
     */
    private calculateEmergencyFundTarget(spendingHistory: Transaction[]): number {
        const monthlyAverages = this.calculateMonthlySpendingAverages(spendingHistory);
        
        // Calculate essential monthly expenses (survival category)
        const essentialExpenses = (monthlyAverages.housing || 800) + 
                                 (monthlyAverages.utilities || 150) + 
                                 (monthlyAverages.food || 300) + 
                                 (monthlyAverages.transport || 200) + 
                                 (monthlyAverages.healthcare || 100);
        
        // Target: 6 months of essential expenses, minimum $10,000
        return Math.max(essentialExpenses * 6, 10000);
    }

    // ============================================================================
    // HELPER METHODS
    // ============================================================================

    /**
     * Determine income level for scaling calculations
     */
    private determineIncomeLevel(income: number): IncomeLevel {
        return this.INCOME_LEVELS.find(level => 
            income >= level.range.min && income <= level.range.max
        ) || this.INCOME_LEVELS[1]; // Default to medium
    }



    /**
     * Calculate monthly essential expenses from spending history
     */
    private calculateMonthlyEssentialExpenses(spendingHistory: Transaction[]): number {
        const essentialCategories = ['housing', 'utilities', 'food', 'transport', 'healthcare'];
        const monthlyExpenses = essentialCategories.reduce((sum, category) => {
            const categorySpending = spendingHistory
                .filter(tx => tx.whyTag && this.isEssentialCategory(tx.whyTag))
                .reduce((catSum, tx) => catSum + tx.amount, 0);
            return sum + (categorySpending / 12); // Average monthly
        }, 0);
        
        return Math.max(monthlyExpenses, 2000); // Minimum $2000
    }

    /**
     * Check if emergency fund goal is complete
     */
    private isEmergencyFundComplete(target: number): boolean {
        // TODO: Implement actual emergency fund tracking
        // For now, return false to continue security contributions
        return false;
    }

    /**
     * Helper methods to sum category needs
     */
    private sumSurvivalNeeds(survival: FinancialNeeds['survival']): number {
        return survival.housing + survival.utilities + survival.food + 
               survival.transport + survival.healthcare + survival.buffer;
    }

    private sumSecurityNeeds(security: FinancialNeeds['security']): number {
        return security.monthlyContribution + security.insurance + security.debtPayments;
    }

    private sumGrowthNeeds(growth: FinancialNeeds['growth']): number {
        return growth.minimumInvestment + growth.education + growth.skills;
    }

    private sumLifestyleNeeds(lifestyle: FinancialNeeds['lifestyle']): number {
        return lifestyle.entertainment + lifestyle.hobbies + lifestyle.discretionary;
    }

    /**
     * Check if a why tag belongs to essential categories
     */
    private isEssentialCategory(whyTag: string): boolean {
        const essentialTags = ['housing', 'utilities', 'food', 'transport', 'healthcare', 'essential'];
        return essentialTags.some(tag => whyTag.toLowerCase().includes(tag));
    }

    /**
     * Get the category for a tag name
     */
    private getTagCategory(tagName: string): 'survival' | 'security' | 'growth' | 'lifestyle' {
        const categoryMapping: Record<string, 'survival' | 'security' | 'growth' | 'lifestyle'> = {
            'rent': 'survival',
            'utilities': 'survival',
            'groceries': 'survival',
            'transport': 'survival',
            'healthcare': 'survival',
            'essential': 'survival',
            'emergency': 'security',
            'insurance': 'security',
            'debt': 'security',
            'savings': 'security',
            'investment': 'growth',
            'education': 'growth',
            'skills': 'growth',
            'entertainment': 'lifestyle',
            'hobbies': 'lifestyle',
            'discretionary': 'lifestyle'
        };
        
        return categoryMapping[tagName.toLowerCase()] || 'lifestyle';
    }

    /**
     * Get suggestion priority based on category
     */
    private getSuggestionPriority(category: 'survival' | 'security' | 'growth' | 'lifestyle'): 'high' | 'medium' | 'low' {
        const priorities: Record<'survival' | 'security' | 'growth' | 'lifestyle', 'high' | 'medium' | 'low'> = { 
            survival: 'high', 
            security: 'high', 
            growth: 'medium', 
            lifestyle: 'low' 
        };
        return priorities[category];
    }

    /**
     * Get historical spending average for a tag
     */
    private async getHistoricalSpendingAverage(tagName: string): Promise<number> {
        // TODO: Implement actual historical spending analysis
        // For now, return default amounts
        const defaults = this.DEFAULT_TAG_BUDGETS[tagName.toLowerCase()];
        return defaults ? defaults.amount : 100;
    }

    /**
     * Get why tag by name
     */
    private async getWhyTagByName(name: string): Promise<WhyTag | null> {
        const whyTags = await this.getWhyTagsWithCategories();
        return whyTags.find(tag => tag.name.toLowerCase() === name.toLowerCase()) || null;
    }

    /**
     * Save tag budget (placeholder for database implementation)
     */
    private async saveTagBudget(tagBudget: TagBudget): Promise<void> {
        // TODO: Implement database storage
        console.log('Saving tag budget:', tagBudget);
    }

    // ============================================================================
    // WHY TAG MANAGEMENT
    // ============================================================================

    /**
     * Get all why tags with their waterfall categories
     */
    async getWhyTagsWithCategories(): Promise<WhyTag[]> {
        const whyTags = await tagService.getWhyTags();
        const mappings = await priorityLevelMappingService.getAllMappings();
        
        return whyTags.map(tag => {
            const mapping = mappings.find(m => m.whyTag === tag.name);
            return {
                id: tag.id,
                name: tag.name,
                waterfallCategory: mapping?.priorityLevel as WhyTag['waterfallCategory'] || 'lifestyle',
                isActive: tag.isActive
            };
        });
    }

    /**
     * Create or update a why tag with waterfall category
     */
    async createWhyTag(name: string, waterfallCategory: WhyTag['waterfallCategory']): Promise<WhyTag> {
        // Validate why tag creation
        const validation = await validationService.validateWhyTagCreation({
            name,
            waterfallCategory
        });

        if (!validation.isValid) {
            throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
        }

        // Create the tag
        const tag = await tagService.createTag({
            name,
            dimension: 'why',
            isActive: true
        });
        
        // Create the priority level mapping
        await priorityLevelMappingService.createMapping({
            whyTag: name,
            priorityLevel: waterfallCategory,
            isActive: true
        });
        
        return {
            id: tag.id,
            name: tag.name,
            waterfallCategory,
            isActive: tag.isActive
        };
    }

    /**
     * Update a why tag's waterfall category
     */
    async updateWhyTagCategory(whyTagId: string, waterfallCategory: WhyTag['waterfallCategory']): Promise<void> {
        // Validate why tag category update
        const validation = await validationService.validateWhyTagCategoryUpdate(whyTagId, waterfallCategory);

        if (!validation.isValid) {
            throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
        }

        const whyTags = await this.getWhyTagsWithCategories();
        const whyTag = whyTags.find(tag => tag.id === whyTagId);
        
        if (whyTag) {
            const mappings = await priorityLevelMappingService.getMappingsByWhyTag(whyTag.name);
            for (const mapping of mappings) {
                await priorityLevelMappingService.updateMapping(mapping.id, {
                    priorityLevel: waterfallCategory
                });
            }
        }
    }

    // ============================================================================
    // SPENDING TRACKING
    // ============================================================================

    /**
     * Track spending against tag budgets
     */
    async trackSpending(tagBudgets: TagBudget[], transactions: Transaction[]): Promise<TagBudget[]> {
        const updatedBudgets = [...tagBudgets];
        const mappings = await priorityLevelMappingService.getAllMappings();
        const whyTagToCategory = new Map(mappings.map(m => [m.whyTag, m.priorityLevel]));

        for (const transaction of transactions) {
            if (isSpendingTransaction(transaction) && transaction.whyTag) {
                const tagBudget = updatedBudgets.find(tb => tb.tagName === transaction.whyTag);
                if (tagBudget) {
                    tagBudget.spent += transaction.amount;
                    tagBudget.remaining = tagBudget.allocatedAmount - tagBudget.spent;
                    
                    // Update goal progress if applicable
                    if (tagBudget.isGoalBased && tagBudget.goalTarget) {
                        tagBudget.goalProgress = Math.min(tagBudget.spent, tagBudget.goalTarget);
                        tagBudget.isComplete = tagBudget.goalProgress >= tagBudget.goalTarget;
                    }
                }
            }
        }

        return updatedBudgets;
    }

    /**
     * Get current spending status for all categories
     */
    async getCurrentSpendingStatus(): Promise<CategoryBudget[]> {
        const currentMonth = new Date();
        const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

        const transactionGroups = await transactionService.getTransactionsByDateRange(
            startOfMonth.toISOString(),
            endOfMonth.toISOString()
        );

        // Flatten transaction groups to individual transactions
        const transactions: Transaction[] = [];
        for (const group of transactionGroups) {
            if ('splitId' in group && group.splitId) {
                // This is a transaction group, get individual transactions
                const splitTransactions = await db.getSplitTransactions(group.splitId);
                transactions.push(...splitTransactions);
            } else if (!('splitId' in group)) {
                // This is a single transaction
                transactions.push(group as Transaction);
            }
        }

        // Get tag budgets and track spending
        const tagBudgets = await this.getTagBudgets();
        const updatedTagBudgets = await this.trackSpending(tagBudgets, transactions);
        
        // Calculate category budgets from tag budgets
        return await this.calculateCategoryBudgets();
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
                        category: categoryBudget.waterfallCategory,
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
                        category: categoryBudget.waterfallCategory,
                        reason: 'Underutilization detected'
                    }
                });
            }

            // Check for tag-level recommendations
            for (const tagBudget of categoryBudget.tagBudgets) {
                const tagUtilizationRate = tagBudget.spent / tagBudget.allocatedAmount;
                
                if (tagUtilizationRate > 1.2) {
                    recommendations.push({
                        type: 'tag_adjustment',
                        priority: 'high',
                        title: `${tagBudget.tagName} Overspending`,
                        description: `Consider increasing ${tagBudget.tagName} budget from $${tagBudget.allocatedAmount} to $${Math.round(tagBudget.spent * 1.1)}`,
                        action: {
                            whyTagId: tagBudget.tagId,
                            amount: Math.round(tagBudget.spent * 1.1) - tagBudget.allocatedAmount,
                            reason: 'Tag overspending detected'
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

            if (categoryBudget.rolloverAmount > 0) {
                insights.push({
                    type: 'rollover_opportunity',
                    title: `${categoryBudget.waterfallCategory} Rollover Available`,
                    description: `You have $${categoryBudget.rolloverAmount.toFixed(0)} available to roll over`,
                    severity: 'info',
                    data: { category: categoryBudget.waterfallCategory, rolloverAmount: categoryBudget.rolloverAmount }
                });
            }

            // Tag-level insights
            for (const tagBudget of categoryBudget.tagBudgets) {
                const tagUtilizationRate = tagBudget.spent / tagBudget.allocatedAmount;
                
                if (tagUtilizationRate > 0.95) {
                    insights.push({
                        type: 'tag_overspend',
                        title: `${tagBudget.tagName} Budget Alert`,
                        description: `You're approaching your ${tagBudget.tagName} budget limit`,
                        severity: 'warning',
                        data: { tagName: tagBudget.tagName, utilizationRate: tagUtilizationRate }
                    });
                }

                if (tagBudget.isGoalBased && tagBudget.goalProgress && tagBudget.goalTarget) {
                    const goalProgress = (tagBudget.goalProgress / tagBudget.goalTarget) * 100;
                    if (goalProgress >= 100) {
                        insights.push({
                            type: 'goal_milestone',
                            title: `${tagBudget.tagName} Goal Complete!`,
                            description: `Congratulations! You've reached your ${tagBudget.tagName} goal`,
                            severity: 'success',
                            data: { tagName: tagBudget.tagName, goalProgress }
                        });
                    }
                }
            }
        }

        return insights;
    }

    // ============================================================================
    // LEGACY SUPPORT METHODS
    // ============================================================================

    /**
     * Legacy method for backward compatibility
     */
    private analyzeSpendingPatterns(transactions: Transaction[]): Record<string, number> {
        // This would implement dynamic percentage calculation based on spending patterns
        // For now, return default allocations
        return { survival: 50, security: 20, growth: 20, lifestyle: 10 };
    }

    /**
     * Legacy method for backward compatibility
     */
    private calculateDynamicPercentages(spendingAnalysis: Record<string, number>, income: number): Record<'survival' | 'security' | 'growth' | 'lifestyle', number> {
        // This would implement dynamic percentage calculation based on spending patterns
        // For now, return default allocations
        return { survival: 50, security: 20, growth: 20, lifestyle: 10 };
    }

    // ============================================================================
    // LEGACY INTERFACES (for backward compatibility)
    // ============================================================================

    /**
     * Distribute budget across why tags within each category (legacy method)
     */
    async allocateToWhyTags(totalBudget: number, allocations: BudgetAllocation): Promise<CategoryBudget[]> {
        const categoryBudgets: CategoryBudget[] = [];
        const whyTags = await this.getWhyTagsWithCategories();

        for (const [category, allocation] of Object.entries(allocations)) {
            const categoryWhyTags = whyTags.filter(tag => tag.waterfallCategory === category);
            
            if (categoryWhyTags.length === 0) {
                // If no why tags exist for this category, create a default allocation
                categoryBudgets.push({
                    waterfallCategory: category,
                    totalAllocated: allocation.amount,
                    targetAmount: allocation.targetAmount,
                    spent: 0,
                    remaining: allocation.amount,
                    rolloverAmount: 0,
                    borrowedAmount: 0,
                    isComplete: allocation.isComplete,
                    completionPercentage: 0,
                    tagBudgets: []
                });
                continue;
            }

            // Get tag budgets for this category
            const tagBudgets = await this.getTagBudgets(category as any);
            
            categoryBudgets.push({
                waterfallCategory: category,
                totalAllocated: allocation.amount,
                targetAmount: allocation.targetAmount,
                spent: 0,
                remaining: allocation.amount,
                rolloverAmount: 0,
                borrowedAmount: 0,
                isComplete: allocation.isComplete,
                completionPercentage: 0,
                tagBudgets
            });
        }

        return categoryBudgets;
    }

    /**
     * Handle rollover/borrowing at category level (legacy method)
     */
    async processMonthlyRollover(previousBudget: CategoryBudget[], currentIncome: number): Promise<CategoryBudget[]> {
        const newAllocations = await this.calculateOptimalAllocations([]);
        const newCategoryBudgets = await this.allocateToWhyTags(currentIncome, newAllocations);

        // Apply rollover logic
        for (let i = 0; i < newCategoryBudgets.length; i++) {
            const newBudget = newCategoryBudgets[i];
            const previousBudgetItem = previousBudget.find(b => b.waterfallCategory === newBudget.waterfallCategory);

            if (previousBudgetItem) {
                // Calculate rollover (positive remaining becomes rollover)
                if (previousBudgetItem.remaining > 0) {
                    newBudget.rolloverAmount = previousBudgetItem.remaining;
                    newBudget.totalAllocated += newBudget.rolloverAmount;
                    newBudget.remaining += newBudget.rolloverAmount;
                }

                // Handle borrowing (negative remaining becomes debt)
                if (previousBudgetItem.remaining < 0) {
                    newBudget.borrowedAmount = Math.abs(previousBudgetItem.remaining);
                    newBudget.totalAllocated += newBudget.borrowedAmount;
                    newBudget.remaining += newBudget.borrowedAmount;
                }
            }
        }

        return newCategoryBudgets;
    }
}

// ============================================================================
// EXPORT SINGLETON INSTANCE
// ============================================================================

export const budgetService = new BudgetService(); 