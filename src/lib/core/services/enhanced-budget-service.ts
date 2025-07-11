import { db, generateUUID, isSpendingTransaction, isIncomeTransaction } from '$lib/core/db';
import type { Transaction, Tag, PriorityLevelMapping } from '$lib/core/db';
import { tagService } from './tag-service';
import { priorityLevelMappingService } from './priority-level-mapping-service';
import { transactionService } from './transaction-service';
import { settingsService } from './settings-service';
import { validationService } from './validation-service';

// ============================================================================
// ENHANCED BUDGET SYSTEM TYPES
// ============================================================================

export interface LifeStage {
    stage: 'student' | 'early_career' | 'mid_career' | 'late_career' | 'pre_retirement' | 'retired';
    description: string;
    priorityWeights: {
        survival: number;
        security: number;
        growth: number;
        lifestyle: number;
    };
    defaultGoals: string[];
    stressFactors: string[];
}

export interface AdaptivePriority {
    id: string;
    userId: string;
    category: 'survival' | 'security' | 'growth' | 'lifestyle';
    baseWeight: number;
    currentWeight: number;
    seasonalAdjustments: {
        [season: string]: number;
    };
    // Removed lifeStageAdjustments - life stage only affects insights, not interface
    stressAdjustments: {
        [stressLevel: string]: number;
    };
    lastUpdated: string;
}

export interface UserMaturity {
    level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
    features: {
        basicNeeds: boolean;
        security: boolean;
        growth: boolean;
        lifestyle: boolean;
        tags: boolean;
        goals: boolean;
        scenarios: boolean;
        insights: boolean;
    };
    onboardingProgress: {
        completedSteps: string[];
        currentStep: string;
        nextStep: string;
    };
    lastActivity: string;
}

export interface ContextualSuggestion {
    id: string;
    type: 'allocation' | 'goal' | 'insight' | 'action';
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    context: {
        lifeStage: string; // Kept for analytics context only
        incomeVolatility: 'low' | 'medium' | 'high';
        stressLevel: 'low' | 'medium' | 'high';
        timeOfYear: string;
        recentEvents: string[];
    };
    action: {
        type: string;
        data: Record<string, any>;
    };
    confidence: number;
}

export interface EmotionalIntelligence {
    userId: string;
    overridePatterns: {
        category: string;
        frequency: number;
        averageOverride: number;
        lastOverride: string;
        suggestedAdjustment: number;
    }[];
    stressIndicators: {
        spendingSpikes: number;
        categoryOverspends: number;
        goalDeviations: number;
        lastStressPeriod: string;
    };
    preferenceRevelation: {
        category: string;
        revealedPreference: number;
        suggestedPreference: number;
        confidence: number;
    }[];
    lastAnalysis: string;
}

export interface HybridAllocation {
    totalIncome: number;
    allocatedAmount: number;
    holdingPool: number;
    categoryAllocations: {
        survival: { allocated: number; target: number; completion: number };
        security: { allocated: number; target: number; completion: number };
        growth: { allocated: number; target: number; completion: number };
        lifestyle: { allocated: number; target: number; completion: number };
    };
    surplusRecommendations: {
        category: string;
        amount: number;
        reason: string;
        priority: 'low' | 'medium' | 'high';
    }[];
    nextBestAction: {
        action: string;
        description: string;
        impact: number;
        confidence: number;
    };
}

export interface ProgressiveOnboarding {
    currentLevel: 'basic_needs' | 'security_intro' | 'growth_intro' | 'lifestyle_intro' | 'advanced_features';
    steps: {
        id: string;
        title: string;
        description: string;
        completed: boolean;
        required: boolean;
        estimatedTime: number; // minutes
    }[];
    recommendations: {
        nextFeature: string;
        reason: string;
        readinessScore: number;
    };
}

// ============================================================================
// ENHANCED BUDGET SERVICE IMPLEMENTATION
// ============================================================================

class EnhancedBudgetService {
    private readonly LIFE_STAGES: LifeStage[] = [
        {
            stage: 'student',
            description: 'Focus on basic needs and minimal debt',
            priorityWeights: { survival: 0.7, security: 0.2, growth: 0.05, lifestyle: 0.05 },
            defaultGoals: ['emergency_fund', 'debt_reduction'],
            stressFactors: ['exam_periods', 'holiday_spending', 'summer_break']
        },
        {
            stage: 'early_career',
            description: 'Building foundation and career growth',
            priorityWeights: { survival: 0.5, security: 0.3, growth: 0.15, lifestyle: 0.05 },
            defaultGoals: ['emergency_fund', 'career_development', 'debt_free'],
            stressFactors: ['job_search', 'moving_costs', 'career_transitions']
        },
        {
            stage: 'mid_career',
            description: 'Balancing family, career, and financial goals',
            priorityWeights: { survival: 0.4, security: 0.25, growth: 0.2, lifestyle: 0.15 },
            defaultGoals: ['retirement_savings', 'children_education', 'home_ownership'],
            stressFactors: ['family_expenses', 'career_pressure', 'health_concerns']
        },
        {
            stage: 'late_career',
            description: 'Maximizing wealth building and preparing for retirement',
            priorityWeights: { survival: 0.35, security: 0.2, growth: 0.3, lifestyle: 0.15 },
            defaultGoals: ['retirement_planning', 'wealth_building', 'legacy_planning'],
            stressFactors: ['retirement_preparation', 'health_costs', 'career_uncertainty']
        },
        {
            stage: 'pre_retirement',
            description: 'Final preparation and transition to retirement',
            priorityWeights: { survival: 0.3, security: 0.35, growth: 0.2, lifestyle: 0.15 },
            defaultGoals: ['retirement_readiness', 'health_care_funding', 'lifestyle_maintenance'],
            stressFactors: ['retirement_anxiety', 'health_concerns', 'income_reduction']
        },
        {
            stage: 'retired',
            description: 'Managing retirement income and legacy',
            priorityWeights: { survival: 0.4, security: 0.4, growth: 0.1, lifestyle: 0.1 },
            defaultGoals: ['income_sustainability', 'health_care', 'legacy_planning'],
            stressFactors: ['health_costs', 'income_volatility', 'inflation_concerns']
        }
    ];

    private readonly SEASONAL_ADJUSTMENTS: Record<string, Record<string, number>> = {
        'holiday_season': {
            lifestyle: 1.3,
            survival: 0.9,
            security: 0.8,
            growth: 0.7
        },
        'tax_season': {
            security: 1.2,
            growth: 0.9,
            survival: 1.0,
            lifestyle: 0.8
        },
        'back_to_school': {
            survival: 1.1,
            growth: 1.2,
            security: 0.9,
            lifestyle: 0.8
        },
        'summer_vacation': {
            lifestyle: 1.4,
            survival: 0.9,
            security: 0.8,
            growth: 0.7
        },
        'normal': {
            lifestyle: 1.0,
            survival: 1.0,
            security: 1.0,
            growth: 1.0
        }
    };

    public get ready() {
        return Promise.resolve();
    }

    // ============================================================================
    // ADAPTIVE PRIORITY SYSTEM
    // ============================================================================

    async getAdaptivePriorities(userId: string): Promise<AdaptivePriority[]> {
        const userPreferences = await settingsService.getUserPreferences();
        const currentSeason = this.getCurrentSeason();
        const stressLevel = await this.assessStressLevel(userId);

        // Use standard priority weights - life stage only affects insights, not interface
        const basePriorities = {
            survival: 0.4, security: 0.25, growth: 0.2, lifestyle: 0.15
        };

        const categories: ('survival' | 'security' | 'growth' | 'lifestyle')[] = ['survival', 'security', 'growth', 'lifestyle'];
        
        return categories.map(category => {
            const baseWeight = basePriorities[category];
            const seasonalAdjustment = this.SEASONAL_ADJUSTMENTS[currentSeason]?.[category] || 1.0;
            const stressAdjustment = this.getStressAdjustment(category, stressLevel);
            
            const currentWeight = baseWeight * seasonalAdjustment * stressAdjustment;

            return {
                id: generateUUID(),
                userId,
                category,
                baseWeight,
                currentWeight,
                seasonalAdjustments: {
                    holiday_season: this.SEASONAL_ADJUSTMENTS.holiday_season?.[category] || 1.0,
                    tax_season: this.SEASONAL_ADJUSTMENTS.tax_season?.[category] || 1.0,
                    back_to_school: this.SEASONAL_ADJUSTMENTS.back_to_school?.[category] || 1.0,
                    summer_vacation: this.SEASONAL_ADJUSTMENTS.summer_vacation?.[category] || 1.0,
                    normal: 1.0
                },
                // Removed lifeStageAdjustments
                stressAdjustments: this.getStressAdjustments(category),
                lastUpdated: new Date().toISOString()
            };
        });
    }

    private getCurrentSeason(): string {
        const month = new Date().getMonth();
        if (month >= 10 || month <= 1) return 'holiday_season';
        if (month >= 2 && month <= 4) return 'tax_season';
        if (month >= 8 && month <= 9) return 'back_to_school';
        if (month >= 5 && month <= 7) return 'summer_vacation';
        return 'normal';
    }

    private async assessStressLevel(userId: string): Promise<'low' | 'medium' | 'high'> {
        // Analyze recent spending patterns, goal deviations, and user behavior
        const recentTransactions = await transactionService.getTransactionsByDateRange(
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            new Date().toISOString(),
            true
        ) as Transaction[];

        const stressIndicators = {
            spendingSpikes: this.countSpendingSpikes(recentTransactions),
            categoryOverspends: await this.countCategoryOverspends(),
            goalDeviations: await this.countGoalDeviations()
        };

        const totalStress = stressIndicators.spendingSpikes + stressIndicators.categoryOverspends + stressIndicators.goalDeviations;
        
        if (totalStress > 5) return 'high';
        if (totalStress > 2) return 'medium';
        return 'low';
    }

    private getStressAdjustment(category: string, stressLevel: string): number {
        const adjustments = {
            survival: { low: 1.0, medium: 1.1, high: 1.2 },
            security: { low: 1.0, medium: 1.2, high: 1.3 },
            growth: { low: 1.0, medium: 0.9, high: 0.7 },
            lifestyle: { low: 1.0, medium: 0.8, high: 0.6 }
        };

        return adjustments[category as keyof typeof adjustments]?.[stressLevel as keyof typeof adjustments.survival] || 1.0;
    }

    private getStressAdjustments(category: string): Record<string, number> {
        return {
            low: this.getStressAdjustment(category, 'low'),
            medium: this.getStressAdjustment(category, 'medium'),
            high: this.getStressAdjustment(category, 'high')
        };
    }

    // ============================================================================
    // PROGRESSIVE ONBOARDING
    // ============================================================================

    async getProgressiveOnboarding(userId: string): Promise<ProgressiveOnboarding> {
        const userMaturity = await this.getUserMaturity(userId);
        const currentLevel = this.determineCurrentLevel(userMaturity);
        
        const steps = this.getOnboardingSteps(currentLevel);
        const recommendations = await this.getOnboardingRecommendations(userMaturity);

        return {
            currentLevel,
            steps,
            recommendations
        };
    }

    private async getUserMaturity(userId: string): Promise<UserMaturity> {
        // This would be stored in the database, but for now we'll create a default
        return {
            level: 'beginner',
            features: {
                basicNeeds: true,
                security: false,
                growth: false,
                lifestyle: false,
                tags: false,
                goals: false,
                scenarios: false,
                insights: false
            },
            onboardingProgress: {
                completedSteps: ['welcome', 'basic_setup'],
                currentStep: 'security_intro',
                nextStep: 'emergency_fund'
            },
            lastActivity: new Date().toISOString()
        };
    }

    private determineCurrentLevel(maturity: UserMaturity): ProgressiveOnboarding['currentLevel'] {
        if (!maturity.features.security) return 'security_intro';
        if (!maturity.features.growth) return 'growth_intro';
        if (!maturity.features.lifestyle) return 'lifestyle_intro';
        return 'advanced_features';
    }

    private getOnboardingSteps(level: ProgressiveOnboarding['currentLevel']) {
        const allSteps = {
            basic_needs: [
                { id: 'welcome', title: 'Welcome to Budgic', description: 'Learn about your new budgeting system', completed: true, required: true, estimatedTime: 2 },
                { id: 'basic_setup', title: 'Basic Setup', description: 'Set up your accounts and basic categories', completed: true, required: true, estimatedTime: 5 },
                { id: 'first_budget', title: 'Create Your First Budget', description: 'Allocate your income to basic needs', completed: false, required: true, estimatedTime: 10 }
            ],
            security_intro: [
                { id: 'emergency_fund', title: 'Emergency Fund', description: 'Start building your safety net', completed: false, required: true, estimatedTime: 5 },
                { id: 'insurance_basics', title: 'Insurance Basics', description: 'Understand your protection needs', completed: false, required: false, estimatedTime: 8 },
                { id: 'debt_strategy', title: 'Debt Strategy', description: 'Plan your debt repayment', completed: false, required: false, estimatedTime: 10 }
            ],
            growth_intro: [
                { id: 'investment_basics', title: 'Investment Basics', description: 'Start your wealth building journey', completed: false, required: true, estimatedTime: 15 },
                { id: 'retirement_planning', title: 'Retirement Planning', description: 'Plan for your future', completed: false, required: false, estimatedTime: 20 },
                { id: 'skill_development', title: 'Skill Development', description: 'Invest in yourself', completed: false, required: false, estimatedTime: 10 }
            ],
            lifestyle_intro: [
                { id: 'entertainment_budget', title: 'Entertainment Budget', description: 'Plan for fun and relaxation', completed: false, required: false, estimatedTime: 5 },
                { id: 'hobbies_funding', title: 'Hobbies & Interests', description: 'Fund your passions', completed: false, required: false, estimatedTime: 5 },
                { id: 'discretionary_spending', title: 'Discretionary Spending', description: 'Flexible spending categories', completed: false, required: false, estimatedTime: 5 }
            ],
            advanced_features: [
                { id: 'tag_system', title: 'Tag System', description: 'Organize with custom tags', completed: false, required: false, estimatedTime: 10 },
                { id: 'goal_tracking', title: 'Goal Tracking', description: 'Set and track financial goals', completed: false, required: false, estimatedTime: 15 },
                { id: 'scenario_planning', title: 'Scenario Planning', description: 'Plan for different financial scenarios', completed: false, required: false, estimatedTime: 20 },
                { id: 'insights_analytics', title: 'Insights & Analytics', description: 'Understand your financial patterns', completed: false, required: false, estimatedTime: 10 }
            ]
        };

        return allSteps[level] || allSteps.basic_needs;
    }

    private async getOnboardingRecommendations(maturity: UserMaturity) {
        const readinessScore = this.calculateReadinessScore(maturity);
        
        if (readinessScore > 80 && !maturity.features.goals) {
            return {
                nextFeature: 'goal_tracking',
                reason: 'You\'re ready to start setting and tracking financial goals',
                readinessScore
            };
        } else if (readinessScore > 60 && !maturity.features.tags) {
            return {
                nextFeature: 'tag_system',
                reason: 'Try organizing your transactions with custom tags',
                readinessScore
            };
        } else if (readinessScore > 40 && !maturity.features.lifestyle) {
            return {
                nextFeature: 'lifestyle_budgeting',
                reason: 'You\'re ready to add lifestyle categories to your budget',
                readinessScore
            };
        }

        return {
            nextFeature: 'continue_basics',
            reason: 'Keep practicing with your current setup',
            readinessScore
        };
    }

    private calculateReadinessScore(maturity: UserMaturity): number {
        const completedFeatures = Object.values(maturity.features).filter(Boolean).length;
        const totalFeatures = Object.keys(maturity.features).length;
        return (completedFeatures / totalFeatures) * 100;
    }

    // ============================================================================
    // CONTEXT-AWARE SUGGESTIONS
    // ============================================================================

    async generateContextualSuggestions(userId: string): Promise<ContextualSuggestion[]> {
        const userPreferences = await settingsService.getUserPreferences();
        const lifeStage = userPreferences?.lifeStage || 'mid_career';
        const incomeVolatility = await this.assessIncomeVolatility();
        const stressLevel = await this.assessStressLevel(userId);
        const timeOfYear = this.getCurrentSeason();
        const recentEvents = await this.getRecentLifeEvents(userId);

        const suggestions: ContextualSuggestion[] = [];

        // Life stage specific insights (analytics context only)
        suggestions.push(...this.getLifeStageSuggestions(lifeStage, incomeVolatility, stressLevel));

        // Seasonal suggestions
        suggestions.push(...this.getSeasonalSuggestions(timeOfYear, lifeStage));

        // Stress-based suggestions
        suggestions.push(...this.getStressBasedSuggestions(stressLevel, lifeStage));

        // Income volatility suggestions
        suggestions.push(...this.getIncomeVolatilitySuggestions(incomeVolatility, lifeStage));

        return suggestions.sort((a, b) => {
            const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
    }

    private async assessIncomeVolatility(): Promise<'low' | 'medium' | 'high'> {
        const recentTransactions = await transactionService.getTransactionsByDateRange(
            new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
            new Date().toISOString(),
            true
        ) as Transaction[];

        const incomeTransactions = recentTransactions.filter(t => isIncomeTransaction(t));
        const monthlyIncomes = this.groupByMonth(incomeTransactions);
        const monthlyValues = Object.values(monthlyIncomes);
        
        if (monthlyValues.length === 0) return 'low';
        
        const variations = monthlyValues.map(income => 
            Math.abs(income - this.calculateAverage(monthlyValues))
        );
        
        const averageVariation = this.calculateAverage(variations);
        const averageIncome = this.calculateAverage(monthlyValues);
        const volatilityRatio = averageVariation / averageIncome;

        if (volatilityRatio > 0.3) return 'high';
        if (volatilityRatio > 0.15) return 'medium';
        return 'low';
    }

    private getLifeStageSuggestions(lifeStage: string, incomeVolatility: string, stressLevel: string): ContextualSuggestion[] {
        const suggestions: ContextualSuggestion[] = [];

        switch (lifeStage) {
            case 'student':
                suggestions.push({
                    id: generateUUID(),
                    type: 'insight',
                    title: 'Student Financial Focus',
                    description: 'Consider prioritizing essential expenses and avoiding unnecessary debt.',
                    priority: 'high',
                    context: { lifeStage, incomeVolatility: incomeVolatility as 'low' | 'medium' | 'high', stressLevel: stressLevel as 'low' | 'medium' | 'high', timeOfYear: this.getCurrentSeason(), recentEvents: [] },
                    action: { type: 'insight', data: { category: 'survival', focus: 'essential_expenses' } },
                    confidence: 85
                });
                break;
            case 'early_career':
                suggestions.push({
                    id: generateUUID(),
                    type: 'insight',
                    title: 'Emergency Fund Priority',
                    description: 'Consider building a 3-6 month emergency fund for financial security.',
                    priority: 'high',
                    context: { lifeStage, incomeVolatility: incomeVolatility as 'low' | 'medium' | 'high', stressLevel: stressLevel as 'low' | 'medium' | 'high', timeOfYear: this.getCurrentSeason(), recentEvents: [] },
                    action: { type: 'insight', data: { goalType: 'emergency_fund', targetAmount: 15000 } },
                    confidence: 90
                });
                break;
            // Add more life stage specific insights
        }

        return suggestions;
    }

    private getSeasonalSuggestions(timeOfYear: string, lifeStage: string): ContextualSuggestion[] {
        const suggestions: ContextualSuggestion[] = [];

        switch (timeOfYear) {
            case 'holiday_season':
                suggestions.push({
                    id: generateUUID(),
                    type: 'insight',
                    title: 'Holiday Spending Plan',
                    description: 'Plan ahead for holiday expenses to avoid overspending.',
                    priority: 'medium',
                    context: { lifeStage, incomeVolatility: 'medium', stressLevel: 'medium', timeOfYear, recentEvents: [] },
                    action: { type: 'adjust_priority', data: { category: 'lifestyle', adjustment: 1.3 } },
                    confidence: 80
                });
                break;
            case 'tax_season':
                suggestions.push({
                    id: generateUUID(),
                    type: 'insight',
                    title: 'Tax Preparation',
                    description: 'Set aside funds for potential tax payments or plan for your refund.',
                    priority: 'high',
                    context: { lifeStage, incomeVolatility: 'medium', stressLevel: 'medium', timeOfYear, recentEvents: [] },
                    action: { type: 'allocate', data: { category: 'security', percentage: 25 } },
                    confidence: 85
                });
                break;
        }

        return suggestions;
    }

    private getStressBasedSuggestions(stressLevel: string, lifeStage: string): ContextualSuggestion[] {
        const suggestions: ContextualSuggestion[] = [];

        if (stressLevel === 'high') {
            suggestions.push({
                id: generateUUID(),
                type: 'insight',
                title: 'Stress Management Budget',
                description: 'Consider allocating more to lifestyle categories for stress relief while maintaining security.',
                priority: 'medium',
                context: { lifeStage, incomeVolatility: 'medium', stressLevel, timeOfYear: this.getCurrentSeason(), recentEvents: [] },
                action: { type: 'adjust_priority', data: { category: 'lifestyle', adjustment: 1.2 } },
                confidence: 75
            });
        }

        return suggestions;
    }

    private getIncomeVolatilitySuggestions(incomeVolatility: string, lifeStage: string): ContextualSuggestion[] {
        const suggestions: ContextualSuggestion[] = [];

        if (incomeVolatility === 'high') {
            suggestions.push({
                id: generateUUID(),
                type: 'allocation',
                title: 'Income Volatility Buffer',
                description: 'Build a larger emergency fund to handle income fluctuations.',
                priority: 'high',
                context: { lifeStage, incomeVolatility, stressLevel: 'medium', timeOfYear: this.getCurrentSeason(), recentEvents: [] },
                action: { type: 'allocate', data: { category: 'security', percentage: 35 } },
                confidence: 90
            });
        }

        return suggestions;
    }

    // ============================================================================
    // HYBRID ALLOCATION MODEL
    // ============================================================================

    async createHybridAllocation(totalIncome: number, userId: string): Promise<HybridAllocation> {
        const adaptivePriorities = await this.getAdaptivePriorities(userId);
        const currentBudgets = await this.getCurrentBudgetStatus();
        
        // Calculate allocations based on adaptive priorities
        const categoryAllocations = {
            survival: { allocated: 0, target: 0, completion: 0 },
            security: { allocated: 0, target: 0, completion: 0 },
            growth: { allocated: 0, target: 0, completion: 0 },
            lifestyle: { allocated: 0, target: 0, completion: 0 }
        };

        let allocatedAmount = 0;
        
        // Allocate based on priorities
        for (const priority of adaptivePriorities) {
            const targetAmount = totalIncome * priority.currentWeight;
            const currentAmount = currentBudgets.find(b => b.waterfallCategory === priority.category)?.totalAllocated || 0;
            
            categoryAllocations[priority.category] = {
                allocated: currentAmount,
                target: targetAmount,
                completion: targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0
            };
            
            allocatedAmount += currentAmount;
        }

        const holdingPool = totalIncome - allocatedAmount;
        
        // Generate surplus recommendations
        const surplusRecommendations = await this.generateSurplusRecommendations(
            holdingPool, 
            categoryAllocations, 
            userId
        );

        // Determine next best action
        const nextBestAction = await this.determineNextBestAction(
            categoryAllocations, 
            surplusRecommendations, 
            userId
        );

        return {
            totalIncome,
            allocatedAmount,
            holdingPool,
            categoryAllocations,
            surplusRecommendations,
            nextBestAction
        };
    }

    private async getCurrentBudgetStatus() {
        // This would integrate with the existing budget service
        // For now, return sample data structure
        return [
            { waterfallCategory: 'survival', totalAllocated: 0 },
            { waterfallCategory: 'security', totalAllocated: 0 },
            { waterfallCategory: 'growth', totalAllocated: 0 },
            { waterfallCategory: 'lifestyle', totalAllocated: 0 }
        ];
    }

    private async generateSurplusRecommendations(
        holdingPool: number, 
        categoryAllocations: HybridAllocation['categoryAllocations'], 
        userId: string
    ): Promise<HybridAllocation['surplusRecommendations']> {
        const recommendations: HybridAllocation['surplusRecommendations'] = [];

        // Find categories with lowest completion rates
        const categories = Object.entries(categoryAllocations) as [string, { allocated: number; target: number; completion: number }][];
        const sortedByCompletion = categories.sort((a, b) => a[1].completion - b[1].completion);

        for (const [category, allocation] of sortedByCompletion) {
            if (allocation.completion < 100 && holdingPool > 0) {
                const neededAmount = allocation.target - allocation.allocated;
                const recommendedAmount = Math.min(neededAmount, holdingPool * 0.5); // Use at most 50% of holding pool

                if (recommendedAmount > 0) {
                    recommendations.push({
                        category,
                        amount: recommendedAmount,
                        reason: `Boost ${category} completion from ${allocation.completion.toFixed(1)}% to ${((allocation.allocated + recommendedAmount) / allocation.target * 100).toFixed(1)}%`,
                        priority: allocation.completion < 50 ? 'high' : allocation.completion < 80 ? 'medium' : 'low'
                    });
                }
            }
        }

        return recommendations;
    }

    private async determineNextBestAction(
        categoryAllocations: HybridAllocation['categoryAllocations'],
        surplusRecommendations: HybridAllocation['surplusRecommendations'],
        userId: string
    ): Promise<HybridAllocation['nextBestAction']> {
        // Find the highest priority recommendation
        const highPriorityRec = surplusRecommendations.find(r => r.priority === 'high');
        if (highPriorityRec) {
            return {
                action: 'allocate_surplus',
                description: `Allocate $${highPriorityRec.amount.toFixed(2)} to ${highPriorityRec.category}`,
                impact: highPriorityRec.amount,
                confidence: 85
            };
        }

        // Check for urgent needs
        const urgentCategories = Object.entries(categoryAllocations).filter(([_, allocation]) => allocation.completion < 50);
        if (urgentCategories.length > 0) {
            const [category, allocation] = urgentCategories[0];
            return {
                action: 'address_urgent_need',
                description: `Focus on completing ${category} allocation (currently ${allocation.completion.toFixed(1)}%)`,
                impact: allocation.target - allocation.allocated,
                confidence: 90
            };
        }

        return {
            action: 'maintain_current',
            description: 'Your current allocation looks good. Consider reviewing your goals.',
            impact: 0,
            confidence: 70
        };
    }

    // ============================================================================
    // EMOTIONAL INTELLIGENCE
    // ============================================================================

    async analyzeEmotionalIntelligence(userId: string): Promise<EmotionalIntelligence> {
        const recentTransactions = await transactionService.getTransactionsByDateRange(
            new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
            new Date().toISOString(),
            true
        ) as Transaction[];

        const overridePatterns = await this.analyzeOverridePatterns(recentTransactions);
        const stressIndicators = await this.analyzeStressIndicators(recentTransactions);
        const preferenceRevelation = await this.analyzePreferenceRevelation(recentTransactions);

        return {
            userId,
            overridePatterns,
            stressIndicators,
            preferenceRevelation,
            lastAnalysis: new Date().toISOString()
        };
    }

    private async analyzeOverridePatterns(transactions: Transaction[]): Promise<EmotionalIntelligence['overridePatterns']> {
        // This would analyze when users consistently spend more than budgeted
        // For now, return sample data
        return [
            {
                category: 'lifestyle',
                frequency: 3,
                averageOverride: 150,
                lastOverride: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                suggestedAdjustment: 200
            }
        ];
    }

    private async analyzeStressIndicators(transactions: Transaction[]): Promise<EmotionalIntelligence['stressIndicators']> {
        return {
            spendingSpikes: this.countSpendingSpikes(transactions),
            categoryOverspends: await this.countCategoryOverspends(),
            goalDeviations: await this.countGoalDeviations(),
            lastStressPeriod: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
        };
    }

    private async analyzePreferenceRevelation(transactions: Transaction[]): Promise<EmotionalIntelligence['preferenceRevelation']> {
        // This would analyze revealed preferences vs. suggested preferences
        return [
            {
                category: 'lifestyle',
                revealedPreference: 250,
                suggestedPreference: 200,
                confidence: 75
            }
        ];
    }

    private countSpendingSpikes(transactions: Transaction[]): number {
        // Analyze spending patterns to detect spikes
        const dailySpending = new Map<string, number>();
        
        transactions.forEach(transaction => {
            if (isSpendingTransaction(transaction)) {
                const date = transaction.clearedDate?.split('T')[0] || transaction.plannedDate?.split('T')[0] || '';
                if (date) {
                    dailySpending.set(date, (dailySpending.get(date) || 0) + Math.abs(transaction.amount));
                }
            }
        });

        // Calculate average daily spending
        const amounts = Array.from(dailySpending.values());
        const average = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
        const threshold = average * 2; // Spike is 2x average

        return amounts.filter(amount => amount > threshold).length;
    }

    private async countCategoryOverspends(): Promise<number> {
        // This would check budget vs actual spending by category
        // For now, return a placeholder
        return 2;
    }

    private async countGoalDeviations(): Promise<number> {
        // This would check goal progress vs targets
        // For now, return a placeholder
        return 1;
    }

    // ============================================================================
    // HELPER METHODS
    // ============================================================================

    private groupByMonth(transactions: Transaction[]): Record<string, number> {
        const monthlyData: Record<string, number> = {};
        
        transactions.forEach(transaction => {
            const date = new Date(transaction.clearedDate || transaction.plannedDate || '');
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = 0;
            }
            
            monthlyData[monthKey] += Math.abs(transaction.amount);
        });
        
        return monthlyData;
    }

    private calculateAverage(values: number[]): number {
        if (values.length === 0) return 0;
        return values.reduce((sum, value) => sum + value, 0) / values.length;
    }

    private calculateVolatility(values: number[], average: number): number {
        if (values.length === 0) return 0;
        const variance = values.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) / values.length;
        return Math.sqrt(variance) / average;
    }

    private async getRecentLifeEvents(userId: string): Promise<string[]> {
        // This would analyze recent transactions for life events
        // For now, return empty array
        return [];
    }

    // ============================================================================
    // SIMPLIFIED DECISION FRAMEWORK
    // ============================================================================

    async getSimplifiedDecisionFramework(userId: string): Promise<{
        nextBestAction: string;
        alternatives: string[];
        impact: number;
        confidence: number;
        reasoning: string;
    }> {
        const hybridAllocation = await this.createHybridAllocation(5000, userId); // Example income
        const emotionalIntelligence = await this.analyzeEmotionalIntelligence(userId);
        const contextualSuggestions = await this.generateContextualSuggestions(userId);

        // Combine all insights to determine the best next action
        const action = hybridAllocation.nextBestAction;
        const alternatives = contextualSuggestions
            .slice(0, 3)
            .map(s => s.title);

        return {
            nextBestAction: action.action,
            alternatives,
            impact: action.impact,
            confidence: action.confidence,
            reasoning: `Based on your current allocation (${hybridAllocation.allocatedAmount.toFixed(2)}/${hybridAllocation.totalIncome.toFixed(2)} allocated) and recent spending patterns, the best next action is to ${action.action}.`
        };
    }

    // ============================================================================
    // CELEBRATION AND MOTIVATION
    // ============================================================================

    async generateMilestoneCelebrations(userId: string): Promise<{
        title: string;
        description: string;
        achievement: string;
        impact: number;
        nextMilestone: string;
    }[]> {
        const hybridAllocation = await this.createHybridAllocation(5000, userId);
        const emotionalIntelligence = await this.analyzeEmotionalIntelligence(userId);
        
        const celebrations: {
            title: string;
            description: string;
            achievement: string;
            impact: number;
            nextMilestone: string;
        }[] = [];

        // Check for budget completion milestones
        Object.entries(hybridAllocation.categoryAllocations).forEach(([category, allocation]) => {
            if (allocation.completion >= 100) {
                celebrations.push({
                    title: `${category.charAt(0).toUpperCase() + category.slice(1)} Budget Complete!`,
                    description: `You've successfully allocated your target amount to ${category}.`,
                    achievement: `${category}_complete`,
                    impact: allocation.target,
                    nextMilestone: `Increase ${category} target by 10%`
                });
            } else if (allocation.completion >= 80) {
                celebrations.push({
                    title: `${category.charAt(0).toUpperCase() + category.slice(1)} Budget Nearly Complete!`,
                    description: `You're ${allocation.completion.toFixed(1)}% of the way to your ${category} goal.`,
                    achievement: `${category}_near_complete`,
                    impact: allocation.target * 0.8,
                    nextMilestone: `Complete ${category} allocation`
                });
            }
        });

        // Check for stress management achievements
        if (emotionalIntelligence.stressIndicators.spendingSpikes === 0) {
            celebrations.push({
                title: 'Consistent Spending Pattern!',
                description: 'You\'ve maintained consistent spending without any spikes this month.',
                achievement: 'consistent_spending',
                impact: 100,
                nextMilestone: 'Maintain consistency for 3 months'
            });
        }

        return celebrations;
    }
}

export const enhancedBudgetService = new EnhancedBudgetService();