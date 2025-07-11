import type { Transaction } from '$lib/core/db';

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

/**
 * Standard financial needs for different income levels
 */
export const STANDARD_NEEDS: FinancialNeeds = {
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

/**
 * Income levels with their characteristics
 */
export const INCOME_LEVELS: IncomeLevel[] = [
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

/**
 * Determine income level based on monthly income
 */
export function determineIncomeLevel(income: number): IncomeLevel {
    return INCOME_LEVELS.find(level => 
        income >= level.range.min && income <= level.range.max
    ) || INCOME_LEVELS[1]; // Default to medium
}

/**
 * Calculate monthly essential expenses from spending history
 */
export function calculateMonthlyEssentialExpenses(spendingHistory: Transaction[]): number {
    const essentialTags = ['rent', 'mortgage', 'utilities', 'groceries', 'food', 'transport', 'healthcare', 'insurance'];
    
    const essentialTransactions = spendingHistory.filter(tx => 
        tx.whatTag && essentialTags.some(tag => 
            tx.whatTag.toLowerCase().includes(tag)
        )
    );
    
    const totalEssential = essentialTransactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    return totalEssential / 12; // Average monthly
}

/**
 * Calculate emergency fund target based on spending history
 */
export function calculateEmergencyFundTarget(spendingHistory: Transaction[]): number {
    const monthlyExpenses = calculateMonthlyEssentialExpenses(spendingHistory);
    return monthlyExpenses * 6; // 6 months of expenses
}

/**
 * Check if emergency fund is complete
 */
export function isEmergencyFundComplete(currentAmount: number, target: number): boolean {
    return currentAmount >= target;
}

/**
 * Calculate monthly spending averages by category
 */
export function calculateMonthlySpendingAverages(spendingHistory: Transaction[]): Record<string, number> {
    const categoryTotals: Record<string, number> = {};
    const categoryCounts: Record<string, number> = {};
    
    // Group transactions by month and category
    const monthlyGroups = new Map<string, Transaction[]>();
    
    for (const tx of spendingHistory) {
        if (!tx.clearedDate) continue;
        
        const monthKey = tx.clearedDate.substring(0, 7); // YYYY-MM
        if (!monthlyGroups.has(monthKey)) {
            monthlyGroups.set(monthKey, []);
        }
        monthlyGroups.get(monthKey)!.push(tx);
    }
    
    // Calculate totals for each category across all months
    for (const transactions of monthlyGroups.values()) {
        for (const tx of transactions) {
            const category = tx.whatTag && tx.whatTag.length > 0 ? tx.whatTag : 'uncategorized';
            categoryTotals[category] = (categoryTotals[category] || 0) + Math.abs(tx.amount);
            categoryCounts[category] = (categoryCounts[category] || 0) + 1;
        }
    }
    
    // Calculate averages
    const averages: Record<string, number> = {};
    const monthCount = monthlyGroups.size;
    
    for (const category in categoryTotals) {
        averages[category] = categoryTotals[category] / monthCount;
    }
    
    return averages;
}

/**
 * Calculate actual financial needs from spending history
 */
export function calculateActualFinancialNeeds(spendingHistory: Transaction[]): {
    survival: { total: number; breakdown: Record<string, number> };
    security: { total: number; breakdown: Record<string, number> };
    growth: { total: number; breakdown: Record<string, number> };
    lifestyle: { total: number; breakdown: Record<string, number> };
} {
    const monthlyAverages = calculateMonthlySpendingAverages(spendingHistory);
    
    const categories = {
        survival: ['rent', 'mortgage', 'utilities', 'groceries', 'food', 'transport', 'healthcare', 'insurance'],
        security: ['emergency', 'savings', 'debt', 'loan', 'credit', 'retirement', 'investment'],
        growth: ['education', 'learning', 'skills', 'training', 'course', 'book', 'business'],
        lifestyle: ['entertainment', 'hobbies', 'discretionary', 'luxury', 'vacation', 'travel', 'dining', 'shopping']
    };
    
    const result = {
        survival: { total: 0, breakdown: {} as Record<string, number> },
        security: { total: 0, breakdown: {} as Record<string, number> },
        growth: { total: 0, breakdown: {} as Record<string, number> },
        lifestyle: { total: 0, breakdown: {} as Record<string, number> }
    };
    
    for (const [category, keywords] of Object.entries(categories)) {
        for (const [tag, amount] of Object.entries(monthlyAverages)) {
            if (keywords.some(keyword => tag.toLowerCase().includes(keyword))) {
                result[category as keyof typeof result].total += amount;
                result[category as keyof typeof result].breakdown[tag] = amount;
            }
        }
    }
    
    return result;
}

/**
 * Sum survival needs
 */
export function sumSurvivalNeeds(survival: FinancialNeeds['survival']): number {
    return Object.values(survival).reduce((sum, value) => sum + value, 0);
}

/**
 * Sum security needs
 */
export function sumSecurityNeeds(security: FinancialNeeds['security']): number {
    return Object.values(security).reduce((sum, value) => sum + value, 0);
}

/**
 * Sum growth needs
 */
export function sumGrowthNeeds(growth: FinancialNeeds['growth']): number {
    return Object.values(growth).reduce((sum, value) => sum + value, 0);
}

/**
 * Sum lifestyle needs
 */
export function sumLifestyleNeeds(lifestyle: FinancialNeeds['lifestyle']): number {
    return Object.values(lifestyle).reduce((sum, value) => sum + value, 0);
}

/**
 * Calculate budget allocation percentages
 */
export function calculateBudgetAllocation(income: number, needs: FinancialNeeds): Record<string, number> {
    const survivalTotal = sumSurvivalNeeds(needs.survival);
    const securityTotal = sumSecurityNeeds(needs.security);
    const growthTotal = sumGrowthNeeds(needs.growth);
    const lifestyleTotal = sumLifestyleNeeds(needs.lifestyle);
    
    const totalNeeds = survivalTotal + securityTotal + growthTotal + lifestyleTotal;
    
    if (income < totalNeeds) {
        // Prioritize survival, then security, then growth, then lifestyle
        const survivalPercent = Math.min(100, (survivalTotal / income) * 100);
        const remainingIncome = income - survivalTotal;
        
        const securityPercent = remainingIncome > 0 ? Math.min(100, (securityTotal / remainingIncome) * 100) : 0;
        const growthPercent = remainingIncome > securityTotal ? Math.min(100, (growthTotal / (remainingIncome - securityTotal)) * 100) : 0;
        const lifestylePercent = 100 - survivalPercent - securityPercent - growthPercent;
        
        return {
            survival: survivalPercent,
            security: securityPercent,
            growth: growthPercent,
            lifestyle: Math.max(0, lifestylePercent)
        };
    } else {
        // Can afford all needs, distribute proportionally
        return {
            survival: (survivalTotal / totalNeeds) * 100,
            security: (securityTotal / totalNeeds) * 100,
            growth: (growthTotal / totalNeeds) * 100,
            lifestyle: (lifestyleTotal / totalNeeds) * 100
        };
    }
} 