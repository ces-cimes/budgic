import { db } from '$lib/core/db';
import { analyticsService } from './analytics-service';
import { goalService } from '../core/goal-service';
import { budgetService } from '../core/budget-service';
import { userService, exchangeRateService } from '../core';
import type { Transaction, Category, Goal, Account } from '$lib/core/db';

/**
 * Prediction Service
 * 
 * Implements real predictive analytics algorithms for:
 * - Spending forecasts
 * - Goal completion forecasting
 * - Budget risk analysis
 * - Seasonal pattern detection
 */

interface SpendingForecast {
    categoryId?: string;
    categoryName?: string;
    predictedAmount: number;
    confidence: number;
    timeframe: string;
    algorithm: string;
    factors: string[];
    historicalData: number[];
    riskLevel: 'low' | 'medium' | 'high';
}

interface GoalForecast {
    goalId: string;
    goalName: string;
    estimatedCompletionDate: Date;
    confidence: number;
    currentProgress: number;
    requiredMonthlyContribution: number;
    isOnTrack: boolean;
    riskFactors: string[];
}

interface BudgetRiskAnalysis {
    categoryId: string;
    categoryName: string;
    budgetAmount: number;
    predictedSpending: number;
    riskProbability: number; // 0-100
    riskLevel: 'low' | 'medium' | 'high';
    confidence: number;
    factors: string[];
    recommendedAction?: string;
}

interface SeasonalPattern {
    type: 'monthly' | 'quarterly' | 'annual';
    categoryId?: string;
    pattern: string;
    confidence: number;
    averageIncrease: number; // percentage
    months: number[]; // months where pattern occurs (1-12)
    historicalData: number[];
}

interface PredictionAccuracy {
    predictionId: string;
    predictionType: 'spending_forecast' | 'goal_completion' | 'budget_risk' | 'seasonal_pattern';
    predictedValue: number;
    actualValue: number;
    error: number;
    errorPercentage: number;
    confidence: number;
    algorithm: string;
    timestamp: string;
    categoryId?: string;
    goalId?: string;
}

interface PredictionMetrics {
    totalPredictions: number;
    averageError: number;
    averageErrorPercentage: number;
    accuracyByType: Record<string, { count: number; avgError: number; avgErrorPercent: number }>;
    accuracyByAlgorithm: Record<string, { count: number; avgError: number; avgErrorPercent: number }>;
    recentAccuracy: {
        last30Days: { count: number; avgError: number; avgErrorPercent: number };
        last90Days: { count: number; avgError: number; avgErrorPercent: number };
    };
}

class PredictionService {
    // Minimum data requirements for predictions
    private readonly MIN_MONTHS_FOR_PREDICTION = 3;
    private readonly MIN_MONTHS_FOR_SEASONAL = 12;
    private readonly CONFIDENCE_THRESHOLD = 0.7;

    // Accuracy tracking (stored in insights metadata)
    private accuracyCache: Map<string, PredictionAccuracy[]> = new Map();

    public get ready() {
        return Promise.resolve();
    }

    public isLoading() {
        return false;
    }

    // ============================================================================
    // SPENDING PREDICTION ALGORITHMS
    // ============================================================================

    /**
     * Predict spending for the next period using multiple algorithms
     */
    async predictSpending(
        categoryId?: string,
        months: number = 1
    ): Promise<SpendingForecast[]> {
        const transactions = await db.transactions.toArray();
        const categories = await db.getActiveCategories();
        const preferences = await userService.getUserPreferences();
        const mainCurrency = preferences?.currency || 'USD';

        // Filter transactions
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - 12); // Use last 12 months

        let relevantTransactions = transactions.filter(
            (tx) =>
                tx.type === 'expense' &&
                tx.status === 'cleared' &&
                tx.clearedDate &&
                new Date(tx.clearedDate) >= cutoffDate &&
                (!categoryId || tx.categoryId === categoryId) &&
                // Ensure transaction has a valid amount
                tx.amount !== null &&
                tx.amount !== undefined &&
                !isNaN(tx.amount) &&
                Math.abs(tx.amount) > 0
        );
        
        // Handle split transactions: if we have grouped transactions, we should use the total
        // For now, we'll include all transactions (split parts are fine as they represent actual spending)
        // But we'll log if we detect potential double-counting
        const groupIds = new Set<string>();
        const transactionsByGroup = new Map<string, Transaction[]>();
        for (const tx of relevantTransactions) {
            if (tx.groupId) {
                if (!transactionsByGroup.has(tx.groupId)) {
                    transactionsByGroup.set(tx.groupId, []);
                }
                transactionsByGroup.get(tx.groupId)!.push(tx);
            }
        }
        
        // Log if we find split transactions (for debugging)
        if (transactionsByGroup.size > 0) {
            console.log(
                `[PredictionService] Found ${transactionsByGroup.size} transaction groups ` +
                `with ${relevantTransactions.filter(tx => tx.groupId).length} split transactions`
            );
        }

        // Debug: Log filtering results
        const totalBeforeConversion = relevantTransactions.reduce(
            (sum, tx) => sum + Math.abs(tx.amount || 0),
            0
        );
        console.log(
            `[PredictionService] Filtered ${relevantTransactions.length} transactions ` +
            `(total: ${totalBeforeConversion.toFixed(2)}) for prediction${categoryId ? ` (category: ${categoryId})` : ''}`
        );

        // Convert to main currency
        relevantTransactions = await this.convertTransactionsToMainCurrency(
            relevantTransactions,
            mainCurrency
        );

        // Debug: Log after conversion
        const totalAfterConversion = relevantTransactions.reduce(
            (sum, tx) => sum + Math.abs(tx.amount || 0),
            0
        );
        if (Math.abs(totalBeforeConversion - totalAfterConversion) > 0.01 && totalBeforeConversion > 0) {
            console.warn(
                `[PredictionService] Currency conversion changed total: ` +
                `${totalBeforeConversion.toFixed(2)} -> ${totalAfterConversion.toFixed(2)}. ` +
                `This is expected if transactions are in different currencies.`
            );
        }

        if (relevantTransactions.length < 10) {
            // Not enough data
            console.log(
                `[PredictionService] Not enough transactions (${relevantTransactions.length} < 10) for prediction`
            );
            return [];
        }

        const forecasts: SpendingForecast[] = [];

        if (categoryId) {
            // Single category prediction
            const category = categories.find((c) => c.id === categoryId);
            const forecast = await this.predictCategorySpending(
                relevantTransactions,
                category?.name || 'Category',
                months,
                mainCurrency
            );
            if (forecast) forecasts.push(forecast);
        } else {
            // Predict for all categories
            const categorySpending = new Map<string, Transaction[]>();
            for (const tx of relevantTransactions) {
                if (tx.categoryId) {
                    const existing = categorySpending.get(tx.categoryId) || [];
                    existing.push(tx);
                    categorySpending.set(tx.categoryId, existing);
                }
            }

            for (const [catId, catTransactions] of categorySpending.entries()) {
                if (catTransactions.length >= 5) {
                    const category = categories.find((c) => c.id === catId);
                    const forecast = await this.predictCategorySpending(
                        catTransactions,
                        category?.name || 'Category',
                        months,
                        mainCurrency
                    );
                    if (forecast) {
                        forecast.categoryId = catId;
                        forecasts.push(forecast);
                    }
                }
            }
        }

        return forecasts;
    }

    /**
     * Predict spending for a specific category using multiple algorithms
     */
    private async predictCategorySpending(
        transactions: Transaction[],
        categoryName: string,
        months: number,
        mainCurrency: string
    ): Promise<SpendingForecast | null> {
        if (transactions.length < this.MIN_MONTHS_FOR_PREDICTION) {
            return null;
        }

        // Debug: Log transaction amounts before grouping
        const totalBeforeGrouping = transactions.reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);
        const avgTransactionAmount = totalBeforeGrouping / transactions.length;

        // Group by month
        const monthlyData = this.groupTransactionsByMonth(transactions);
        const monthlyAmounts = Array.from(monthlyData.values()).sort(
            (a, b) => a.month.localeCompare(b.month)
        );

        if (monthlyAmounts.length < this.MIN_MONTHS_FOR_PREDICTION) {
            return null;
        }

        const amounts = monthlyAmounts.map((m) => m.amount);
        const historicalData = [...amounts];
        
        // Debug: Log monthly totals
        const totalMonthly = amounts.reduce((sum, amt) => sum + amt, 0);
        const avgMonthly = totalMonthly / amounts.length;
        
        // Calculate the actual time period covered
        const firstMonth = monthlyAmounts[0]?.month;
        const lastMonth = monthlyAmounts[monthlyAmounts.length - 1]?.month;
        const monthsCovered = monthlyAmounts.length;
        
        // Enhanced debug logging to identify issues
        console.log(
            `[PredictionService] ${categoryName}: ` +
            `Total transactions: ${transactions.length}, ` +
            `Total before grouping: ${totalBeforeGrouping.toFixed(2)} ${mainCurrency}, ` +
            `Avg transaction: ${avgTransactionAmount.toFixed(2)} ${mainCurrency}, ` +
            `Months with data: ${monthsCovered} (${firstMonth} to ${lastMonth}), ` +
            `Monthly totals: [${amounts.map(a => a.toFixed(2)).join(', ')}], ` +
            `Total monthly: ${totalMonthly.toFixed(2)} ${mainCurrency}, ` +
            `Avg monthly (of months with data): ${avgMonthly.toFixed(2)} ${mainCurrency}`
        );
        
        // Validate data consistency
        const totalFromMonthly = amounts.reduce((sum, amt) => sum + amt, 0);
        const discrepancy = Math.abs(totalBeforeGrouping - totalFromMonthly);
        if (discrepancy > 0.01 && totalBeforeGrouping > 0) {
            console.error(
                `[PredictionService] DATA INCONSISTENCY for ${categoryName}: ` +
                `Total before grouping (${totalBeforeGrouping.toFixed(2)}) does not match ` +
                `sum of monthly totals (${totalFromMonthly.toFixed(2)}). ` +
                `Difference: ${discrepancy.toFixed(2)} ${mainCurrency}`
            );
        }
        
        // Warn if there's a significant discrepancy between expected and actual averages
        if (avgMonthly > 0 && totalBeforeGrouping > 0 && monthsCovered > 0) {
            // Calculate expected average if data was spread evenly across all 12 months
            const expectedAvgMonthlyIfEven = totalBeforeGrouping / 12;
            // Calculate expected average based on actual months with data
            const expectedAvgMonthlyActual = totalBeforeGrouping / monthsCovered;
            
            // The actual average should be close to expectedAvgMonthlyActual
            const ratio = avgMonthly / expectedAvgMonthlyActual;
            if (ratio < 0.9 || ratio > 1.1) {
                console.warn(
                    `[PredictionService] Potential calculation issue for ${categoryName}: ` +
                    `Avg monthly (${avgMonthly.toFixed(2)}) differs from expected ` +
                    `(${expectedAvgMonthlyActual.toFixed(2)}) based on ${monthsCovered} months with data. ` +
                    `Ratio: ${ratio.toFixed(2)}. ` +
                    `If spread evenly across 12 months, would be ${expectedAvgMonthlyIfEven.toFixed(2)}.`
                );
            }
        }

        // Algorithm 1: Moving Average (simple and weighted)
        const movingAvg = this.calculateMovingAverage(amounts, 3);
        const weightedAvg = this.calculateWeightedMovingAverage(amounts, 3);

        // Algorithm 2: Exponential Smoothing
        const exponentialSmooth = this.calculateExponentialSmoothing(amounts, 0.3);

        // Algorithm 3: Linear Regression
        const linearRegression = this.calculateLinearRegression(amounts);

        // Combine predictions with weights
        const weights = {
            movingAvg: 0.3,
            weightedAvg: 0.3,
            exponential: 0.2,
            linear: 0.2
        };

        const predictedMonthly =
            movingAvg * weights.movingAvg +
            weightedAvg * weights.weightedAvg +
            exponentialSmooth * weights.exponential +
            linearRegression.predicted * weights.linear;

        // Ensure prediction is not negative or zero (unless we truly have no spending)
        let predictedMonthlyAdjusted = Math.max(0, predictedMonthly);
        
        // If prediction seems too low compared to historical average, use a weighted approach
        // that considers both the algorithm prediction and the historical average
        if (avgMonthly > 0 && predictedMonthlyAdjusted < avgMonthly * 0.3) {
            console.warn(
                `[PredictionService] Prediction for ${categoryName} seems unusually low: ` +
                `${predictedMonthlyAdjusted.toFixed(2)} vs historical avg ${avgMonthly.toFixed(2)}. ` +
                `Blending with historical average.`
            );
            // Blend prediction with historical average (70% prediction, 30% historical)
            predictedMonthlyAdjusted = predictedMonthlyAdjusted * 0.7 + avgMonthly * 0.3;
            
            console.log(
                `[PredictionService] ${categoryName}: Adjusted prediction to ${predictedMonthlyAdjusted.toFixed(2)} per month`
            );
        }
        
        const predictedAmount = predictedMonthlyAdjusted * months;

        // Calculate confidence based on data quality and variance
        const variance = this.calculateVariance(amounts);
        const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const coefficientOfVariation = mean > 0 ? Math.sqrt(variance) / mean : 1;

        // Higher confidence with lower variance and more data
        let confidence = Math.max(
            0.5,
            Math.min(
                0.95,
                1 - coefficientOfVariation * 0.5 + (amounts.length / 12) * 0.2
            )
        );

        // Determine risk level
        let riskLevel: 'low' | 'medium' | 'high' = 'low';
        if (coefficientOfVariation > 0.5) riskLevel = 'high';
        else if (coefficientOfVariation > 0.3) riskLevel = 'medium';

        // Determine which algorithm performed best
        const algorithm = this.determineBestAlgorithm(
            amounts,
            movingAvg,
            weightedAvg,
            exponentialSmooth,
            linearRegression.predicted
        );

        const factors = this.identifyPredictionFactors(
            amounts,
            coefficientOfVariation,
            monthlyAmounts
        );

        return {
            categoryName,
            predictedAmount,
            confidence: Math.round(confidence * 100),
            timeframe: months === 1 ? 'Next month' : `Next ${months} months`,
            algorithm,
            factors,
            historicalData,
            riskLevel
        };
    }

    // ============================================================================
    // GOAL COMPLETION FORECASTING
    // ============================================================================

    /**
     * Forecast goal completion dates and progress
     */
    async forecastGoalCompletion(): Promise<GoalForecast[]> {
        const goals = await db.getActiveGoals();
        const transactions = await db.transactions.toArray();
        const preferences = await userService.getUserPreferences();
        const mainCurrency = preferences?.currency || 'USD';

        const forecasts: GoalForecast[] = [];

        for (const goal of goals) {
            if (goal.status !== 'active') continue;

            // Get transactions contributing to this goal
            // Note: Transactions don't have goalId field directly, we'll use category matching
            // For now, we'll calculate based on goal's category and currentAmount
            const goalTransactions: Transaction[] = []; // Empty for now - goal tracking is separate

            // Convert to goal currency
            let totalContributed = 0;
            for (const tx of goalTransactions) {
                const amount = Math.abs(tx.amount || 0);
                const txCurrency = tx.currency || mainCurrency;
                let convertedAmount = amount;

                if (txCurrency !== goal.currency) {
                    const converted = await exchangeRateService.convertAmount(
                        amount,
                        txCurrency,
                        goal.currency,
                        tx.clearedDate ? new Date(tx.clearedDate) : undefined
                    );
                    if (converted !== null) {
                        convertedAmount = converted;
                    }
                }
                totalContributed += convertedAmount;
            }

            const remaining = goal.targetAmount - (goal.currentAmount || 0);
            const currentProgress = goal.currentAmount || 0;

            // Calculate average monthly contribution
            const monthlyContributions = await this.calculateMonthlyContributions(
                goalTransactions,
                goal.currency,
                mainCurrency
            );

            let estimatedCompletionDate: Date;
            let requiredMonthlyContribution: number;
            let isOnTrack: boolean;
            let confidence: number;
            const riskFactors: string[] = [];

            if (monthlyContributions.length >= 3) {
                // Use historical average
                const avgMonthly = this.calculateAverage(monthlyContributions);
                const monthsRemaining = remaining / avgMonthly;
                estimatedCompletionDate = new Date();
                estimatedCompletionDate.setMonth(
                    estimatedCompletionDate.getMonth() + Math.ceil(monthsRemaining)
                );

                requiredMonthlyContribution = avgMonthly;
                confidence = Math.min(0.9, 0.5 + monthlyContributions.length * 0.1);

                // Check if on track
                if (goal.targetDate) {
                    const targetDate = new Date(goal.targetDate);
                    const daysUntilTarget =
                        (targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
                    const monthsUntilTarget = daysUntilTarget / 30.44;
                    const requiredRate = remaining / monthsUntilTarget;

                    isOnTrack = avgMonthly >= requiredRate * 0.9; // 90% threshold

                    if (!isOnTrack) {
                        riskFactors.push('Current contribution rate below target');
                        if (avgMonthly < requiredRate * 0.7) {
                            riskFactors.push('Significantly behind schedule');
                        }
                    }
                } else {
                    isOnTrack = true; // No target date, assume on track
                }
            } else if (goal.monthlyContribution) {
                // Use planned monthly contribution
                const monthsRemaining = remaining / goal.monthlyContribution;
                estimatedCompletionDate = new Date();
                estimatedCompletionDate.setMonth(
                    estimatedCompletionDate.getMonth() + Math.ceil(monthsRemaining)
                );

                requiredMonthlyContribution = goal.monthlyContribution;
                isOnTrack = true; // Assume on track if following plan
                confidence = 0.6; // Lower confidence without historical data

                if (goal.targetDate) {
                    const targetDate = new Date(goal.targetDate);
                    const daysUntilTarget =
                        (targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
                    const monthsUntilTarget = daysUntilTarget / 30.44;
                    const requiredRate = remaining / monthsUntilTarget;

                    if (goal.monthlyContribution < requiredRate * 0.9) {
                        isOnTrack = false;
                        riskFactors.push('Planned contribution may be insufficient');
                    }
                }
            } else {
                // No data, can't forecast
                continue;
            }

            // Additional risk factors
            if (remaining > goal.targetAmount * 0.8) {
                riskFactors.push('Less than 20% progress made');
            }

            if (goal.targetDate) {
                const targetDate = new Date(goal.targetDate);
                const daysUntilTarget =
                    (targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
                if (daysUntilTarget < 30) {
                    riskFactors.push('Target date approaching soon');
                }
            }

            forecasts.push({
                goalId: goal.id,
                goalName: goal.name,
                estimatedCompletionDate,
                confidence: Math.round(confidence * 100),
                currentProgress,
                requiredMonthlyContribution,
                isOnTrack,
                riskFactors
            });
        }

        return forecasts;
    }

    // ============================================================================
    // BUDGET RISK ANALYSIS
    // ============================================================================

    /**
     * Analyze budget risk for all categories
     */
    async analyzeBudgetRisk(): Promise<BudgetRiskAnalysis[]> {
        const budgetData = await budgetService.getBudgetSummary();
        const transactions = await db.transactions.toArray();
        const categories = await db.getActiveCategories();
        const preferences = await userService.getUserPreferences();
        const mainCurrency = preferences?.currency || 'USD';

        const analyses: BudgetRiskAnalysis[] = [];

        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        // Get current month spending
        const currentMonthTransactions = transactions.filter(
            (tx) =>
                tx.type === 'expense' &&
                tx.status === 'cleared' &&
                tx.clearedDate &&
                new Date(tx.clearedDate) >= currentMonthStart &&
                new Date(tx.clearedDate) <= currentMonthEnd
        );

        // Convert to main currency
        const convertedTransactions = await this.convertTransactionsToMainCurrency(
            currentMonthTransactions,
            mainCurrency
        );

        // Group by category
        const categorySpending = new Map<string, number>();
        for (const tx of convertedTransactions) {
            if (tx.categoryId) {
                const current = categorySpending.get(tx.categoryId) || 0;
                categorySpending.set(tx.categoryId, current + Math.abs(tx.amount || 0));
            }
        }

        // Analyze each category with budget
        for (const category of categories) {
            const budgetAllocation = budgetData.allocations?.find(
                (alloc: any) => alloc.categoryId === category.id
            );
            // BudgetAllocation has allocatedAmount field, or use category's budgetAmount
            const budgetAmount = budgetAllocation?.allocatedAmount || category.budgetAmount || 0;

            if (!budgetAmount || budgetAmount <= 0) continue;

            const spentSoFar = categorySpending.get(category.id) || 0;
            const daysElapsed = Math.floor(
                (now.getTime() - currentMonthStart.getTime()) / (1000 * 60 * 60 * 24)
            );
            const daysInMonth = currentMonthEnd.getDate();
            const daysRemaining = daysInMonth - daysElapsed;

            // Predict end-of-month spending
            let predictedSpending: number;
            let confidence: number;
            const factors: string[] = [];

            if (daysElapsed > 0) {
                // Project based on current velocity
                const dailyRate = spentSoFar / daysElapsed;
                predictedSpending = spentSoFar + dailyRate * daysRemaining;
                factors.push('Current spending velocity');

                // Get historical data for better prediction
                const historicalTransactions = transactions.filter(
                    (tx) =>
                        tx.type === 'expense' &&
                        tx.categoryId === category.id &&
                        tx.status === 'cleared' &&
                        tx.clearedDate &&
                        new Date(tx.clearedDate) < currentMonthStart
                );

                if (historicalTransactions.length >= 3) {
                    // Use historical average for this month
                    const historicalMonthly = await this.calculateHistoricalMonthlyAverage(
                        historicalTransactions,
                        mainCurrency
                    );
                    const historicalPrediction = historicalMonthly;

                    // Blend velocity-based and historical predictions
                    const velocityWeight = Math.min(0.7, daysElapsed / daysInMonth);
                    predictedSpending =
                        predictedSpending * velocityWeight +
                        historicalPrediction * (1 - velocityWeight);

                    factors.push('Historical spending patterns');
                    confidence = 0.7 + velocityWeight * 0.2;
                } else {
                    confidence = 0.6;
                }
            } else {
                // No spending yet, use historical average
                const historicalTransactions = transactions.filter(
                    (tx) =>
                        tx.type === 'expense' &&
                        tx.categoryId === category.id &&
                        tx.status === 'cleared'
                );

                if (historicalTransactions.length >= 3) {
                    predictedSpending = await this.calculateHistoricalMonthlyAverage(
                        historicalTransactions,
                        mainCurrency
                    );
                    factors.push('Historical spending patterns');
                    confidence = 0.65;
                } else {
                    // No data, can't predict
                    continue;
                }
            }

            // Calculate risk probability
            const overage = predictedSpending - budgetAmount;
            const riskProbability = this.calculateRiskProbability(
                budgetAmount,
                predictedSpending,
                spentSoFar,
                daysElapsed,
                daysInMonth
            );

            // Determine risk level
            let riskLevel: 'low' | 'medium' | 'high' = 'low';
            if (riskProbability > 70) riskLevel = 'high';
            else if (riskProbability > 40) riskLevel = 'medium';

            // Generate recommended action
            let recommendedAction: string | undefined;
            if (riskProbability > 50) {
                const reductionNeeded = overage / daysRemaining;
                recommendedAction = `Reduce daily spending by ${this.formatCurrency(
                    reductionNeeded,
                    mainCurrency
                )} to stay within budget`;
            } else if (riskProbability > 30) {
                recommendedAction = 'Monitor spending closely to avoid exceeding budget';
            }

            analyses.push({
                categoryId: category.id,
                categoryName: category.name,
                budgetAmount,
                predictedSpending,
                riskProbability: Math.round(riskProbability),
                riskLevel,
                confidence: Math.round(confidence * 100),
                factors,
                recommendedAction
            });
        }

        return analyses.sort((a, b) => b.riskProbability - a.riskProbability);
    }

    // ============================================================================
    // SEASONAL PATTERN DETECTION
    // ============================================================================

    /**
     * Detect seasonal spending patterns
     */
    async detectSeasonalPatterns(categoryId?: string): Promise<SeasonalPattern[]> {
        const transactions = await db.transactions.toArray();
        const categories = await db.getActiveCategories();
        const preferences = await userService.getUserPreferences();
        const mainCurrency = preferences?.currency || 'USD';

        const cutoffDate = new Date();
        cutoffDate.setFullYear(cutoffDate.getFullYear() - 2); // Need 2 years for annual patterns

        let relevantTransactions = transactions.filter(
            (tx) =>
                tx.type === 'expense' &&
                tx.status === 'cleared' &&
                tx.clearedDate &&
                new Date(tx.clearedDate) >= cutoffDate &&
                (!categoryId || tx.categoryId === categoryId)
        );

        // Convert to main currency
        relevantTransactions = await this.convertTransactionsToMainCurrency(
            relevantTransactions,
            mainCurrency
        );

        if (relevantTransactions.length < 24) {
            // Need at least 24 months of data
            return [];
        }

        const patterns: SeasonalPattern[] = [];

        if (categoryId) {
            // Analyze single category
            const category = categories.find((c) => c.id === categoryId);
            const categoryPatterns = await this.analyzeCategorySeasonalPatterns(
                relevantTransactions,
                category?.name
            );
            patterns.push(...categoryPatterns);
        } else {
            // Analyze all categories
            const categoryGroups = new Map<string, Transaction[]>();
            for (const tx of relevantTransactions) {
                if (tx.categoryId) {
                    const existing = categoryGroups.get(tx.categoryId) || [];
                    existing.push(tx);
                    categoryGroups.set(tx.categoryId, existing);
                }
            }

            for (const [catId, catTransactions] of categoryGroups.entries()) {
                if (catTransactions.length >= 12) {
                    const category = categories.find((c) => c.id === catId);
                    const categoryPatterns = await this.analyzeCategorySeasonalPatterns(
                        catTransactions,
                        category?.name
                    );
                    patterns.push(...categoryPatterns);
                }
            }
        }

        return patterns.filter((p) => p.confidence >= this.CONFIDENCE_THRESHOLD);
    }

    /**
     * Analyze seasonal patterns for a category
     */
    private async analyzeCategorySeasonalPatterns(
        transactions: Transaction[],
        categoryName?: string
    ): Promise<SeasonalPattern[]> {
        const patterns: SeasonalPattern[] = [];

        // Group by month
        const monthlyData = new Map<number, number[]>();
        for (const tx of transactions) {
            if (tx.clearedDate) {
                const month = new Date(tx.clearedDate).getMonth() + 1; // 1-12
                const amount = Math.abs(tx.amount || 0);
                const existing = monthlyData.get(month) || [];
                existing.push(amount);
                monthlyData.set(month, existing);
            }
        }

        if (monthlyData.size < 6) {
            return patterns; // Not enough data
        }

        // Calculate average for each month
        const monthlyAverages = new Map<number, number>();
        for (const [month, amounts] of monthlyData.entries()) {
            monthlyAverages.set(month, this.calculateAverage(amounts));
        }

        const overallAverage = this.calculateAverage(
            Array.from(monthlyAverages.values())
        );

        // Detect monthly patterns (specific months with higher spending)
        const monthlyPattern = this.detectMonthlyPattern(
            monthlyAverages,
            overallAverage
        );
        if (monthlyPattern) {
            patterns.push({
                type: 'monthly',
                categoryId: transactions[0]?.categoryId,
                pattern: monthlyPattern.description,
                confidence: monthlyPattern.confidence,
                averageIncrease: monthlyPattern.increase,
                months: monthlyPattern.months,
                historicalData: Array.from(monthlyAverages.values())
            });
        }

        // Detect quarterly patterns
        const quarterlyPattern = this.detectQuarterlyPattern(
            monthlyAverages,
            overallAverage
        );
        if (quarterlyPattern) {
            patterns.push({
                type: 'quarterly',
                categoryId: transactions[0]?.categoryId,
                pattern: quarterlyPattern.description,
                confidence: quarterlyPattern.confidence,
                averageIncrease: quarterlyPattern.increase,
                months: quarterlyPattern.months,
                historicalData: Array.from(monthlyAverages.values())
            });
        }

        // Detect annual patterns (same month each year)
        if (transactions.length >= 24) {
            const annualPattern = this.detectAnnualPattern(
                transactions,
                overallAverage
            );
            if (annualPattern) {
                patterns.push({
                    type: 'annual',
                    categoryId: transactions[0]?.categoryId,
                    pattern: annualPattern.description,
                    confidence: annualPattern.confidence,
                    averageIncrease: annualPattern.increase,
                    months: annualPattern.months,
                    historicalData: annualPattern.historicalData
                });
            }
        }

        return patterns;
    }

    // ============================================================================
    // PREDICTION ALGORITHMS
    // ============================================================================

    /**
     * Calculate simple moving average
     */
    private calculateMovingAverage(values: number[], period: number): number {
        if (values.length < period) {
            return values.length > 0
                ? values.reduce((a, b) => a + b, 0) / values.length
                : 0;
        }

        const recent = values.slice(-period);
        return recent.reduce((a, b) => a + b, 0) / recent.length;
    }

    /**
     * Calculate weighted moving average (more recent = higher weight)
     */
    private calculateWeightedMovingAverage(
        values: number[],
        period: number
    ): number {
        if (values.length < period) {
            return this.calculateMovingAverage(values, values.length);
        }

        const recent = values.slice(-period);
        let weightedSum = 0;
        let weightSum = 0;

        for (let i = 0; i < recent.length; i++) {
            const weight = i + 1; // Linear weights
            weightedSum += recent[i] * weight;
            weightSum += weight;
        }

        return weightSum > 0 ? weightedSum / weightSum : 0;
    }

    /**
     * Calculate exponential smoothing
     */
    private calculateExponentialSmoothing(
        values: number[],
        alpha: number
    ): number {
        if (values.length === 0) return 0;
        if (values.length === 1) return values[0];

        let smoothed = values[0];
        for (let i = 1; i < values.length; i++) {
            smoothed = alpha * values[i] + (1 - alpha) * smoothed;
        }

        return smoothed;
    }

    /**
     * Calculate linear regression and predict next value
     */
    private calculateLinearRegression(values: number[]): {
        predicted: number;
        slope: number;
        intercept: number;
    } {
        if (values.length < 2) {
            return {
                predicted: values.length > 0 ? values[0] : 0,
                slope: 0,
                intercept: values.length > 0 ? values[0] : 0
            };
        }

        const n = values.length;
        const x = Array.from({ length: n }, (_, i) => i + 1);
        const y = values;

        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
        const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        const predicted = slope * (n + 1) + intercept;

        return { predicted, slope, intercept };
    }

    /**
     * Calculate variance
     */
    private calculateVariance(values: number[]): number {
        if (values.length < 2) return 0;

        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
        return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    }

    /**
     * Determine which algorithm performed best historically
     */
    private determineBestAlgorithm(
        historical: number[],
        movingAvg: number,
        weightedAvg: number,
        exponential: number,
        linear: number
    ): string {
        if (historical.length < 2) return 'Moving Average';

        // Test each algorithm's accuracy on recent data
        const testSize = Math.min(3, Math.floor(historical.length / 2));
        const testData = historical.slice(-testSize);
        const trainingData = historical.slice(0, -testSize);

        const errors: Record<string, number> = {};

        // Moving average error
        const maPred = this.calculateMovingAverage(trainingData, 3);
        errors['Moving Average'] = this.calculateMeanAbsoluteError(
            testData,
            maPred
        );

        // Weighted moving average error
        const wmaPred = this.calculateWeightedMovingAverage(trainingData, 3);
        errors['Weighted Moving Average'] = this.calculateMeanAbsoluteError(
            testData,
            wmaPred
        );

        // Exponential smoothing error
        const expPred = this.calculateExponentialSmoothing(trainingData, 0.3);
        errors['Exponential Smoothing'] = this.calculateMeanAbsoluteError(
            testData,
            expPred
        );

        // Linear regression error
        const linReg = this.calculateLinearRegression(trainingData);
        errors['Linear Regression'] = this.calculateMeanAbsoluteError(
            testData,
            linReg.predicted
        );

        // Return algorithm with lowest error
        return Object.entries(errors).reduce((a, b) =>
            a[1] < b[1] ? a : b
        )[0];
    }

    /**
     * Calculate mean absolute error
     */
    private calculateMeanAbsoluteError(
        actual: number[],
        predicted: number
    ): number {
        if (actual.length === 0) return Infinity;
        const errors = actual.map((a) => Math.abs(a - predicted));
        return errors.reduce((a, b) => a + b, 0) / errors.length;
    }

    // ============================================================================
    // HELPER METHODS
    // ============================================================================

    /**
     * Group transactions by month
     */
    private groupTransactionsByMonth(
        transactions: Transaction[]
    ): Map<string, { month: string; amount: number }> {
        const monthlyData = new Map<string, { month: string; amount: number }>();

        for (const tx of transactions) {
            if (tx.clearedDate) {
                const month = new Date(tx.clearedDate).toISOString().substring(0, 7); // YYYY-MM
                const current = monthlyData.get(month) || { month, amount: 0 };
                const txAmount = Math.abs(tx.amount || 0);
                
                // Validate transaction amount
                if (isNaN(txAmount) || txAmount < 0) {
                    console.warn(
                        `[PredictionService] Invalid transaction amount for ${tx.id}: ${tx.amount}. Skipping.`
                    );
                    continue;
                }
                
                current.amount += txAmount;
                monthlyData.set(month, current);
            } else {
                console.warn(
                    `[PredictionService] Transaction ${tx.id} missing clearedDate. Skipping.`
                );
            }
        }

        return monthlyData;
    }

    /**
     * Convert transactions to main currency
     * For expenses, we always work with positive amounts for calculations
     */
    private async convertTransactionsToMainCurrency(
        transactions: Transaction[],
        mainCurrency: string
    ): Promise<Transaction[]> {
        const converted: Transaction[] = [];

        for (const tx of transactions) {
            // Get the absolute amount for conversion (expenses can be stored as negative)
            const originalAmount = tx.amount || 0;
            const absAmount = Math.abs(originalAmount);
            const txCurrency = tx.currency || mainCurrency;

            if (absAmount === 0) {
                // Skip zero-amount transactions
                continue;
            }

            if (txCurrency === mainCurrency) {
                // Already in main currency - normalize expense amounts to positive
                converted.push({
                    ...tx,
                    amount: tx.type === 'expense' ? absAmount : originalAmount
                });
            } else {
                // Need currency conversion
                const convertedAmount = await exchangeRateService.convertAmount(
                    absAmount,
                    txCurrency,
                    mainCurrency,
                    tx.clearedDate ? new Date(tx.clearedDate) : undefined
                );

                if (convertedAmount !== null && convertedAmount > 0) {
                    // For expenses, always store as positive for spending calculations
                    // For income, preserve the original sign
                    const finalAmount = tx.type === 'expense' 
                        ? Math.abs(convertedAmount)
                        : (originalAmount < 0 ? -Math.abs(convertedAmount) : Math.abs(convertedAmount));
                    
                    converted.push({
                        ...tx,
                        amount: finalAmount,
                        currency: mainCurrency
                    });
                } else {
                    // Conversion failed - log warning but include with original amount
                    console.warn(
                        `Failed to convert ${absAmount} ${txCurrency} to ${mainCurrency} for transaction ${tx.id}. ` +
                        `Using original amount.`
                    );
                    // Still include it with normalized amount
                    converted.push({
                        ...tx,
                        amount: tx.type === 'expense' ? absAmount : originalAmount
                    });
                }
            }
        }

        return converted;
    }

    /**
     * Calculate average
     */
    private calculateAverage(values: number[]): number {
        if (values.length === 0) return 0;
        return values.reduce((a, b) => a + b, 0) / values.length;
    }

    /**
     * Calculate monthly contributions for a goal
     */
    private async calculateMonthlyContributions(
        transactions: Transaction[],
        goalCurrency: string,
        mainCurrency: string
    ): Promise<number[]> {
        const monthlyContributions = new Map<string, number>();

        for (const tx of transactions) {
            if (tx.clearedDate) {
                const month = new Date(tx.clearedDate).toISOString().substring(0, 7);
                const amount = Math.abs(tx.amount || 0);
                const txCurrency = tx.currency || mainCurrency;

                let convertedAmount = amount;
                if (txCurrency !== goalCurrency) {
                    const converted = await exchangeRateService.convertAmount(
                        amount,
                        txCurrency,
                        goalCurrency,
                        new Date(tx.clearedDate)
                    );
                    if (converted !== null) {
                        convertedAmount = converted;
                    }
                }

                const current = monthlyContributions.get(month) || 0;
                monthlyContributions.set(month, current + convertedAmount);
            }
        }

        return Array.from(monthlyContributions.values()).sort();
    }

    /**
     * Calculate historical monthly average
     */
    private async calculateHistoricalMonthlyAverage(
        transactions: Transaction[],
        mainCurrency: string
    ): Promise<number> {
        const monthlyData = this.groupTransactionsByMonth(transactions);
        const monthlyAmounts = Array.from(monthlyData.values()).map((m) => m.amount);

        if (monthlyAmounts.length === 0) return 0;

        return this.calculateAverage(monthlyAmounts);
    }

    /**
     * Calculate risk probability of exceeding budget
     */
    private calculateRiskProbability(
        budgetAmount: number,
        predictedSpending: number,
        spentSoFar: number,
        daysElapsed: number,
        daysInMonth: number
    ): number {
        if (budgetAmount <= 0) return 0;

        const overage = predictedSpending - budgetAmount;
        const overagePercent = (overage / budgetAmount) * 100;

        // Base probability on predicted overage
        let probability = 0;

        if (overage > 0) {
            // Higher probability with larger overage
            probability = Math.min(95, 50 + overagePercent * 2);

            // Adjust based on how much of month has passed
            const monthProgress = daysElapsed / daysInMonth;
            if (monthProgress > 0.5) {
                // More than halfway through, predictions more reliable
                probability += 10;
            } else {
                // Early in month, less reliable
                probability -= 10;
            }

            // Adjust based on current spending rate
            if (daysElapsed > 0) {
                const currentDailyRate = spentSoFar / daysElapsed;
                const budgetDailyRate = budgetAmount / daysInMonth;

                if (currentDailyRate > budgetDailyRate * 1.2) {
                    // Spending 20%+ above budget rate
                    probability += 15;
                }
            }
        } else {
            // Under budget, but check if trending upward
            if (daysElapsed > 0) {
                const currentDailyRate = spentSoFar / daysElapsed;
                const budgetDailyRate = budgetAmount / daysInMonth;

                if (currentDailyRate > budgetDailyRate * 1.1) {
                    // Spending above budget rate but still under total
                    probability = 30;
                } else {
                    probability = 10;
                }
            } else {
                probability = 5;
            }
        }

        return Math.max(0, Math.min(100, probability));
    }

    /**
     * Identify factors affecting prediction
     */
    private identifyPredictionFactors(
        amounts: number[],
        coefficientOfVariation: number,
        monthlyData: { month: string; amount: number }[]
    ): string[] {
        const factors: string[] = [];

        if (coefficientOfVariation < 0.2) {
            factors.push('Stable spending pattern');
        } else if (coefficientOfVariation > 0.5) {
            factors.push('High spending variability');
        }

        // Check for trend
        if (amounts.length >= 3) {
            const recent = amounts.slice(-3);
            const earlier = amounts.slice(0, 3);
            const recentAvg = this.calculateAverage(recent);
            const earlierAvg = this.calculateAverage(earlier);

            if (recentAvg > earlierAvg * 1.1) {
                factors.push('Increasing trend');
            } else if (recentAvg < earlierAvg * 0.9) {
                factors.push('Decreasing trend');
            }
        }

        // Check for seasonality
        if (monthlyData.length >= 12) {
            factors.push('Seasonal patterns considered');
        }

        return factors;
    }

    /**
     * Detect monthly patterns
     */
    private detectMonthlyPattern(
        monthlyAverages: Map<number, number>,
        overallAverage: number
    ): {
        description: string;
        confidence: number;
        increase: number;
        months: number[];
    } | null {
        const highMonths: number[] = [];
        let totalIncrease = 0;

        for (const [month, avg] of monthlyAverages.entries()) {
            if (avg > overallAverage * 1.15) {
                // 15% above average
                highMonths.push(month);
                totalIncrease += ((avg - overallAverage) / overallAverage) * 100;
            }
        }

        if (highMonths.length === 0) return null;

        const avgIncrease = totalIncrease / highMonths.length;
        const monthNames = highMonths.map((m) => {
            const date = new Date(2024, m - 1, 1);
            return date.toLocaleString('default', { month: 'long' });
        });

        // Confidence based on consistency
        const confidence = Math.min(0.9, 0.6 + highMonths.length * 0.1);

        return {
            description: `Higher spending in ${monthNames.join(', ')}`,
            confidence,
            increase: Math.round(avgIncrease),
            months: highMonths
        };
    }

    /**
     * Detect quarterly patterns
     */
    private detectQuarterlyPattern(
        monthlyAverages: Map<number, number>,
        overallAverage: number
    ): {
        description: string;
        confidence: number;
        increase: number;
        months: number[];
    } | null {
        const quarters = [
            [1, 2, 3],
            [4, 5, 6],
            [7, 8, 9],
            [10, 11, 12]
        ];

        const quarterAverages = quarters.map((months) => {
            const quarterTotal = months.reduce((sum, month) => {
                return sum + (monthlyAverages.get(month) || 0);
            }, 0);
            return quarterTotal / months.length;
        });

        const overallQuarterAvg = this.calculateAverage(quarterAverages);
        let highestQuarter = -1;
        let highestAvg = 0;

        for (let i = 0; i < quarterAverages.length; i++) {
            if (quarterAverages[i] > highestAvg) {
                highestAvg = quarterAverages[i];
                highestQuarter = i;
            }
        }

        if (highestAvg <= overallQuarterAvg * 1.1) {
            return null; // Not significant enough
        }

        const increase = ((highestAvg - overallQuarterAvg) / overallQuarterAvg) * 100;
        const quarterNames = ['Q1', 'Q2', 'Q3', 'Q4'];

        return {
            description: `Higher spending in ${quarterNames[highestQuarter]}`,
            confidence: 0.7,
            increase: Math.round(increase),
            months: quarters[highestQuarter]
        };
    }

    /**
     * Detect annual patterns (same month each year)
     */
    private detectAnnualPattern(
        transactions: Transaction[],
        overallAverage: number
    ): {
        description: string;
        confidence: number;
        increase: number;
        months: number[];
        historicalData: number[];
    } | null {
        // Group by year-month
        const yearMonthData = new Map<string, number[]>();

        for (const tx of transactions) {
            if (tx.clearedDate) {
                const date = new Date(tx.clearedDate);
                const yearMonth = `${date.getFullYear()}-${String(
                    date.getMonth() + 1
                ).padStart(2, '0')}`;
                const amount = Math.abs(tx.amount || 0);

                const existing = yearMonthData.get(yearMonth) || [];
                existing.push(amount);
                yearMonthData.set(yearMonth, existing);
            }
        }

        // Group by month across years
        const monthData = new Map<number, number[]>();

        for (const [yearMonth, amounts] of yearMonthData.entries()) {
            const month = parseInt(yearMonth.split('-')[1]);
            const total = amounts.reduce((a, b) => a + b, 0);

            const existing = monthData.get(month) || [];
            existing.push(total);
            monthData.set(month, existing);
        }

        // Find months with consistent high spending
        const highMonths: number[] = [];
        const historicalData: number[] = [];

        for (const [month, amounts] of monthData.entries()) {
            if (amounts.length >= 2) {
                // Need at least 2 years of data
                const avg = this.calculateAverage(amounts);
                historicalData.push(avg);

                if (avg > overallAverage * 1.2) {
                    // 20% above average
                    highMonths.push(month);
                }
            }
        }

        if (highMonths.length === 0) return null;

        const monthNames = highMonths.map((m) => {
            const date = new Date(2024, m - 1, 1);
            return date.toLocaleString('default', { month: 'long' });
        });

        const avgIncrease = 20; // Simplified
        const confidence = Math.min(0.9, 0.6 + highMonths.length * 0.1);

        return {
            description: `Consistently higher spending in ${monthNames.join(', ')}`,
            confidence,
            increase: avgIncrease,
            months: highMonths,
            historicalData
        };
    }

    /**
     * Format currency
     */
    private formatCurrency(amount: number, currency: string): string {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency
        }).format(amount);
    }

    // ============================================================================
    // PREDICTION ACCURACY TRACKING
    // ============================================================================

    /**
     * Record prediction accuracy when actual values are known
     */
    async recordPredictionAccuracy(
        predictionId: string,
        predictionType: 'spending_forecast' | 'goal_completion' | 'budget_risk' | 'seasonal_pattern',
        predictedValue: number,
        actualValue: number,
        confidence: number,
        algorithm: string,
        categoryId?: string,
        goalId?: string
    ): Promise<void> {
        const error = Math.abs(predictedValue - actualValue);
        const errorPercentage = actualValue > 0 ? (error / actualValue) * 100 : 0;

        const accuracy: PredictionAccuracy = {
            predictionId,
            predictionType,
            predictedValue,
            actualValue,
            error,
            errorPercentage,
            confidence,
            algorithm,
            timestamp: new Date().toISOString(),
            categoryId,
            goalId
        };

        // Store in cache (in production, this could be stored in database)
        const key = `${predictionType}_${categoryId || goalId || 'overall'}`;
        const existing = this.accuracyCache.get(key) || [];
        existing.push(accuracy);
        
        // Keep only last 100 records per key
        if (existing.length > 100) {
            existing.shift();
        }
        
        this.accuracyCache.set(key, existing);

        // Also store in insights metadata for persistence
        try {
            const insights = await db.insights
                .where('id')
                .equals(predictionId)
                .toArray();

            if (insights.length > 0) {
                const insight = insights[0];
                const metadata = insight.metadata ? JSON.parse(insight.metadata) : {};
                metadata.accuracy = {
                    actualValue,
                    error,
                    errorPercentage,
                    recordedAt: accuracy.timestamp
                };

                await db.insights.update(predictionId, {
                    metadata: JSON.stringify(metadata),
                    updatedAt: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('Error storing prediction accuracy:', error);
        }
    }

    /**
     * Get prediction accuracy metrics
     */
    async getPredictionMetrics(
        predictionType?: string,
        categoryId?: string,
        goalId?: string
    ): Promise<PredictionMetrics> {
        // Load accuracy data from insights
        const allInsights = await db.insights
            .where('type')
            .equals('prediction')
            .toArray();

        const accuracyRecords: PredictionAccuracy[] = [];

        for (const insight of allInsights) {
            if (insight.metadata) {
                try {
                    const metadata = JSON.parse(insight.metadata);
                    if (metadata.accuracy && metadata.predictedAmount !== undefined) {
                        // Check filters
                        if (predictionType && metadata.algorithm !== predictionType) continue;
                        if (categoryId && insight.categoryId !== categoryId) continue;
                        if (goalId && insight.goalId !== goalId) continue;

                        accuracyRecords.push({
                            predictionId: insight.id,
                            predictionType: this.determinePredictionTypeFromMetadata(metadata),
                            predictedValue: metadata.predictedAmount || metadata.predictedValue || 0,
                            actualValue: metadata.accuracy.actualValue,
                            error: metadata.accuracy.error,
                            errorPercentage: metadata.accuracy.errorPercentage,
                            confidence: insight.confidence || 0,
                            algorithm: metadata.algorithm || 'Unknown',
                            timestamp: metadata.accuracy.recordedAt || insight.createdAt,
                            categoryId: insight.categoryId,
                            goalId: insight.goalId
                        });
                    }
                } catch (error) {
                    // Skip invalid metadata
                }
            }
        }

        // Merge with cache
        for (const records of this.accuracyCache.values()) {
            accuracyRecords.push(...records);
        }

        // Calculate metrics
        const totalPredictions = accuracyRecords.length;

        if (totalPredictions === 0) {
            return {
                totalPredictions: 0,
                averageError: 0,
                averageErrorPercentage: 0,
                accuracyByType: {},
                accuracyByAlgorithm: {},
                recentAccuracy: {
                    last30Days: { count: 0, avgError: 0, avgErrorPercent: 0 },
                    last90Days: { count: 0, avgError: 0, avgErrorPercent: 0 }
                }
            };
        }

        const averageError = accuracyRecords.reduce((sum, r) => sum + r.error, 0) / totalPredictions;
        const averageErrorPercentage = accuracyRecords.reduce((sum, r) => sum + r.errorPercentage, 0) / totalPredictions;

        // Group by type
        const accuracyByType: Record<string, { count: number; avgError: number; avgErrorPercent: number }> = {};
        for (const record of accuracyRecords) {
            if (!accuracyByType[record.predictionType]) {
                accuracyByType[record.predictionType] = { count: 0, avgError: 0, avgErrorPercent: 0 };
            }
            const type = accuracyByType[record.predictionType];
            type.count++;
            type.avgError += record.error;
            type.avgErrorPercent += record.errorPercentage;
        }

        for (const type in accuracyByType) {
            accuracyByType[type].avgError /= accuracyByType[type].count;
            accuracyByType[type].avgErrorPercent /= accuracyByType[type].count;
        }

        // Group by algorithm
        const accuracyByAlgorithm: Record<string, { count: number; avgError: number; avgErrorPercent: number }> = {};
        for (const record of accuracyRecords) {
            if (!accuracyByAlgorithm[record.algorithm]) {
                accuracyByAlgorithm[record.algorithm] = { count: 0, avgError: 0, avgErrorPercent: 0 };
            }
            const algo = accuracyByAlgorithm[record.algorithm];
            algo.count++;
            algo.avgError += record.error;
            algo.avgErrorPercent += record.errorPercentage;
        }

        for (const algo in accuracyByAlgorithm) {
            accuracyByAlgorithm[algo].avgError /= accuracyByAlgorithm[algo].count;
            accuracyByAlgorithm[algo].avgErrorPercent /= accuracyByAlgorithm[algo].count;
        }

        // Recent accuracy
        const now = Date.now();
        const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
        const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;

        const last30Days = accuracyRecords.filter(
            (r) => new Date(r.timestamp).getTime() > thirtyDaysAgo
        );
        const last90Days = accuracyRecords.filter(
            (r) => new Date(r.timestamp).getTime() > ninetyDaysAgo
        );

        return {
            totalPredictions,
            averageError,
            averageErrorPercentage,
            accuracyByType,
            accuracyByAlgorithm,
            recentAccuracy: {
                last30Days: {
                    count: last30Days.length,
                    avgError: last30Days.length > 0
                        ? last30Days.reduce((sum, r) => sum + r.error, 0) / last30Days.length
                        : 0,
                    avgErrorPercent: last30Days.length > 0
                        ? last30Days.reduce((sum, r) => sum + r.errorPercentage, 0) / last30Days.length
                        : 0
                },
                last90Days: {
                    count: last90Days.length,
                    avgError: last90Days.length > 0
                        ? last90Days.reduce((sum, r) => sum + r.error, 0) / last90Days.length
                        : 0,
                    avgErrorPercent: last90Days.length > 0
                        ? last90Days.reduce((sum, r) => sum + r.errorPercentage, 0) / last90Days.length
                        : 0
                }
            }
        };
    }

    /**
     * Evaluate prediction performance and suggest improvements
     */
    async evaluatePredictionPerformance(): Promise<{
        overallAccuracy: number;
        bestAlgorithm: string;
        worstAlgorithm: string;
        recommendations: string[];
    }> {
        const metrics = await this.getPredictionMetrics();

        if (metrics.totalPredictions === 0) {
            return {
                overallAccuracy: 0,
                bestAlgorithm: 'N/A',
                worstAlgorithm: 'N/A',
                recommendations: ['Need more prediction data to evaluate performance']
            };
        }

        const overallAccuracy = 100 - metrics.averageErrorPercentage;

        // Find best and worst algorithms
        let bestAlgorithm = '';
        let bestAccuracy = Infinity;
        let worstAlgorithm = '';
        let worstAccuracy = -Infinity;

        for (const [algo, data] of Object.entries(metrics.accuracyByAlgorithm)) {
            if (data.avgErrorPercent < bestAccuracy) {
                bestAccuracy = data.avgErrorPercent;
                bestAlgorithm = algo;
            }
            if (data.avgErrorPercent > worstAccuracy) {
                worstAccuracy = data.avgErrorPercent;
                worstAlgorithm = algo;
            }
        }

        const recommendations: string[] = [];

        if (metrics.averageErrorPercentage > 20) {
            recommendations.push('Prediction accuracy is below target. Consider collecting more historical data.');
        }

        if (bestAlgorithm && worstAlgorithm && bestAlgorithm !== worstAlgorithm) {
            const improvement = worstAccuracy - bestAccuracy;
            if (improvement > 10) {
                recommendations.push(
                    `Consider using ${bestAlgorithm} more frequently. It performs ${improvement.toFixed(1)}% better than ${worstAlgorithm}.`
                );
            }
        }

        if (metrics.recentAccuracy.last30Days.count < 10) {
            recommendations.push('Limited recent prediction data. More data needed for reliable accuracy metrics.');
        }

        if (metrics.recentAccuracy.last30Days.avgErrorPercent > metrics.recentAccuracy.last90Days.avgErrorPercent * 1.2) {
            recommendations.push('Recent prediction accuracy has declined. Review prediction algorithms.');
        }

        return {
            overallAccuracy: Math.round(overallAccuracy * 100) / 100,
            bestAlgorithm: bestAlgorithm || 'N/A',
            worstAlgorithm: worstAlgorithm || 'N/A',
            recommendations
        };
    }

    /**
     * Helper to determine prediction type from metadata
     */
    private determinePredictionTypeFromMetadata(metadata: any): 'spending_forecast' | 'goal_completion' | 'budget_risk' | 'seasonal_pattern' {
        if (metadata.algorithm?.includes('Goal') || metadata.goalId) return 'goal_completion';
        if (metadata.algorithm?.includes('Budget') || metadata.riskProbability) return 'budget_risk';
        if (metadata.algorithm?.includes('Seasonal') || metadata.type === 'annual') return 'seasonal_pattern';
        return 'spending_forecast';
    }
}

export const predictionService = new PredictionService();
