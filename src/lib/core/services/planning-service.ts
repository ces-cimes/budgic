import { db } from '$lib/core/db';
import { accountService } from './account-service';
import { transactionService } from './transaction-service';
import { settingsService } from './settings-service';
import type { Transaction, Account } from '$lib/core/db';

// ============================================================================
// PLANNING SERVICE TYPES
// ============================================================================

export interface DailyAllowance {
    currentBalance: number;
    plannedIncome: number;
    plannedExpenses: number;
    availableAmount: number;
    daysUntilNextIncome: number;
    dailyAllowance: number;
    weeklyAllowance: number;
    confidenceLevel: 'high' | 'medium' | 'low';
    bufferRecommendation: number;
}

export interface WeeklyProjection {
    weekStart: string;
    weekEnd: string;
    weekNumber: number;
    startingBalance: number;
    plannedIncome: number;
    plannedExpenses: number;
    endingBalance: number;
    riskLevel: 'safe' | 'caution' | 'danger';
    dailyAllowance: number;
    transactions: Transaction[];
}

export interface PlanningInsight {
    type: 'balance_warning' | 'income_timing' | 'expense_optimization' | 'buffer_recommendation';
    title: string;
    description: string;
    action?: string;
    impact?: number;
    priority: 'high' | 'medium' | 'low';
}

export interface PlanningData {
    dailyAllowance: DailyAllowance;
    weeklyProjections: WeeklyProjection[];
    insights: PlanningInsight[];
    totalPlannedIncome: number;
    totalPlannedExpenses: number;
    netProjectedChange: number;
}

// Week-based cache types
export type WeekKey = string; // ISO date string like "2024-10-14"

export interface CachedWeek {
    projection: WeeklyProjection;
    insights: PlanningInsight[];
    lastUpdated: Date;
}

export interface WeekLoadingState {
    isLoading: boolean;
    error?: string;
}

// ============================================================================
// WEEK CACHE IMPLEMENTATION
// ============================================================================

class WeekCache {
    private cache = new Map<WeekKey, CachedWeek>();
    private maxSize = 50; // Keep last 50 weeks accessed

    get(weekKey: WeekKey): CachedWeek | undefined {
        const item = this.cache.get(weekKey);
        if (item) {
            // Move to end (most recently used)
            this.cache.delete(weekKey);
            this.cache.set(weekKey, item);
        }
        return item;
    }

    set(weekKey: WeekKey, data: CachedWeek): void {
        if (this.cache.size >= this.maxSize) {
            // Remove least recently used (first item)
            const firstKey = this.cache.keys().next().value;
            if (firstKey) {
                this.cache.delete(firstKey);
            }
        }
        this.cache.set(weekKey, data);
    }

    has(weekKey: WeekKey): boolean {
        return this.cache.has(weekKey);
    }

    delete(weekKey: WeekKey): boolean {
        return this.cache.delete(weekKey);
    }

    // Invalidate week and all subsequent weeks
    invalidateFromWeek(weekKey: WeekKey): void {
        const keysToDelete: WeekKey[] = [];
        
        for (const key of this.cache.keys()) {
            if (key >= weekKey) {
                keysToDelete.push(key);
            }
        }
        
        keysToDelete.forEach(key => this.cache.delete(key));
    }

    clear(): void {
        this.cache.clear();
    }

    get size(): number {
        return this.cache.size;
    }
}

// ============================================================================
// PLANNING SERVICE IMPLEMENTATION
// ============================================================================

class PlanningService {
    private weekCache = new WeekCache();

    public get ready() {
        return db.isOpen();
    }

    /**
     * Get week key from date (ISO date string of week start)
     */
    getWeekKey(date: Date, firstDayOfWeek: number = 1): WeekKey {
        const weekStart = this.getWeekStart(date, firstDayOfWeek);
        return weekStart.toISOString().split('T')[0]; // "2024-10-14"
    }

    /**
     * Get week start date based on user preference
     */
    getWeekStart(date: Date, firstDayOfWeek: number = 1): Date {
        const dayOfWeek = date.getDay();
        const diff = dayOfWeek - firstDayOfWeek;
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - diff);
        weekStart.setHours(0, 0, 0, 0);
        return weekStart;
    }

    /**
     * Add weeks to a date
     */
    addWeeks(date: Date, weeks: number): Date {
        const result = new Date(date);
        result.setDate(date.getDate() + (weeks * 7));
        return result;
    }

    /**
     * Subtract weeks from a date
     */
    subtractWeeks(date: Date, weeks: number): Date {
        const result = new Date(date);
        result.setDate(date.getDate() - (weeks * 7));
        return result;
    }

    /**
     * Calculate daily allowance based on current balance and planned transactions
     */
    async calculateDailyAllowance(accountId: string): Promise<DailyAllowance> {
        const accounts = await accountService.getAccounts();
        const account = accounts.find(a => a.id === accountId);
        if (!account) {
            throw new Error(`Account not found: ${accountId}`);
        }

        const currentBalance = await accountService.getAccountBalanceRealTime(accountId);
        
        // Get all planned transactions for this account
        const plannedTransactions = await this.getPlannedTransactionsPrivate(accountId);
        
        const plannedIncome = plannedTransactions
            .filter(t => t.type === 'income' && t.amount !== undefined)
            .reduce((sum, t) => sum + t.amount!, 0);
            
        const plannedExpenses = plannedTransactions
            .filter(t => t.type === 'expense' && t.amount !== undefined)
            .reduce((sum, t) => sum + t.amount!, 0);

        const availableAmount = currentBalance + plannedIncome - plannedExpenses;
        
        // Find the next income transaction to calculate days until next income
        const nextIncomeTransaction = plannedTransactions
            .filter(t => t.type === 'income' && t.plannedDate)
            .sort((a, b) => new Date(a.plannedDate!).getTime() - new Date(b.plannedDate!).getTime())[0];

        const daysUntilNextIncome = nextIncomeTransaction 
            ? Math.ceil((new Date(nextIncomeTransaction.plannedDate!).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : 30; // Default to 30 days if no planned income

        const dailyAllowance = daysUntilNextIncome > 0 ? availableAmount / daysUntilNextIncome : 0;
        const weeklyAllowance = dailyAllowance * 7;

        // Calculate confidence level based on transaction confidence
        const confidenceLevel = this.calculateConfidenceLevel(plannedTransactions);
        
        // Recommend 10-20% buffer
        const bufferRecommendation = Math.max(availableAmount * 0.1, 100);

        return {
            currentBalance,
            plannedIncome,
            plannedExpenses,
            availableAmount,
            daysUntilNextIncome,
            dailyAllowance,
            weeklyAllowance,
            confidenceLevel,
            bufferRecommendation
        };
    }

    /**
     * Calculate weekly balance projections
     */
    async calculateWeeklyProjections(accountId: string, weeksAhead: number = 8): Promise<WeeklyProjection[]> {
        const accounts = await accountService.getAccounts();
        const account = accounts.find(a => a.id === accountId);
        if (!account) {
            throw new Error(`Account not found: ${accountId}`);
        }

        const currentBalance = await accountService.getAccountBalanceRealTime(accountId);
        const plannedTransactions = await this.getPlannedTransactionsPrivate(accountId);
        
        // Get user's preferred first day of week
        const userPreferences = await settingsService.getUserPreferences();
        const firstDayOfWeek = userPreferences?.firstDayOfWeek ?? 0; // Default to Sunday (0)
        
        const projections: WeeklyProjection[] = [];
        const today = new Date();
        
        // Calculate the start of the current week based on user preference
        const currentWeekStart = this.getWeekStart(today, firstDayOfWeek);
        
        for (let week = 0; week < weeksAhead; week++) {
            const weekStart = new Date(currentWeekStart);
            weekStart.setDate(currentWeekStart.getDate() + (week * 7));
            
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            
            // Get transactions for this week
            const weekTransactions = plannedTransactions.filter(t => {
                if (!t.plannedDate) return false;
                const transactionDate = new Date(t.plannedDate);
                return transactionDate >= weekStart && transactionDate <= weekEnd;
            });

            const weekIncome = weekTransactions
                .filter(t => t.type === 'income' && t.amount !== undefined)
                .reduce((sum, t) => sum + t.amount!, 0);
                
            const weekExpenses = weekTransactions
                .filter(t => t.type === 'expense' && t.amount !== undefined)
                .reduce((sum, t) => sum + t.amount!, 0);

            const startingBalance = week === 0 ? currentBalance : projections[week - 1].endingBalance;
            const endingBalance = startingBalance + weekIncome - weekExpenses;
            
            const riskLevel = this.calculateRiskLevel(endingBalance, account.initialBalance);
            const dailyAllowance = weekIncome > 0 ? (endingBalance / 7) : (endingBalance / Math.max(1, weekEnd.getDate() - weekStart.getDate() + 1));

            projections.push({
                weekStart: weekStart.toISOString(),
                weekEnd: weekEnd.toISOString(),
                weekNumber: week + 1,
                startingBalance,
                plannedIncome: weekIncome,
                plannedExpenses: weekExpenses,
                endingBalance,
                riskLevel,
                dailyAllowance,
                transactions: weekTransactions
            });
        }

        return projections;
    }

    /**
     * Generate planning insights and recommendations
     */
    async generatePlanningInsights(accountId: string): Promise<PlanningInsight[]> {
        const dailyAllowance = await this.calculateDailyAllowance(accountId);
        const weeklyProjections = await this.calculateWeeklyProjections(accountId);
        
        const insights: PlanningInsight[] = [];

        // Check for low balance warnings
        const lowBalanceWeeks = weeklyProjections.filter(w => w.riskLevel === 'danger');
        if (lowBalanceWeeks.length > 0) {
            insights.push({
                type: 'balance_warning',
                title: 'Low Balance Risk',
                description: `${lowBalanceWeeks.length} week(s) projected to have low balance`,
                action: 'Consider moving expenses or adding income',
                priority: 'high'
            });
        }

        // Check for income timing
        const incomeWeeks = weeklyProjections.filter(w => w.plannedIncome > 0);
        if (incomeWeeks.length > 0 && dailyAllowance.daysUntilNextIncome > 14) {
            insights.push({
                type: 'income_timing',
                title: 'Income Timing',
                description: `Next income in ${dailyAllowance.daysUntilNextIncome} days`,
                action: 'Consider requesting early payment',
                priority: 'medium'
            });
        }

        // Buffer recommendation
        if (dailyAllowance.availableAmount < dailyAllowance.bufferRecommendation) {
            insights.push({
                type: 'buffer_recommendation',
                title: 'Low Buffer',
                description: `Available amount is below recommended buffer`,
                action: 'Reduce planned expenses or add income',
                impact: dailyAllowance.bufferRecommendation - dailyAllowance.availableAmount,
                priority: 'high'
            });
        }

        // Expense optimization opportunities
        const highExpenseWeeks = weeklyProjections.filter(w => w.plannedExpenses > w.plannedIncome * 2);
        if (highExpenseWeeks.length > 0) {
            insights.push({
                type: 'expense_optimization',
                title: 'Expense Optimization',
                description: `${highExpenseWeeks.length} week(s) have high expense ratios`,
                action: 'Consider spreading large expenses across multiple weeks',
                priority: 'medium'
            });
        }

        return insights.sort((a, b) => {
            const priorityOrder = { high: 3, medium: 2, low: 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
    }

    /**
     * Get comprehensive planning data
     */
    async getPlanningData(accountId: string): Promise<PlanningData> {
        const dailyAllowance = await this.calculateDailyAllowance(accountId);
        const weeklyProjections = await this.calculateWeeklyProjections(accountId);
        const insights = await this.generatePlanningInsights(accountId);

        const totalPlannedIncome = dailyAllowance.plannedIncome;
        const totalPlannedExpenses = dailyAllowance.plannedExpenses;
        const netProjectedChange = totalPlannedIncome - totalPlannedExpenses;

        return {
            dailyAllowance,
            weeklyProjections,
            insights,
            totalPlannedIncome,
            totalPlannedExpenses,
            netProjectedChange
        };
    }

    /**
     * Clear account balance cache to ensure fresh data
     */
    clearAccountCache(accountId: string): void {
        accountService.clearBalanceCache(accountId);
    }

    /**
     * Get planned transactions for an account (public method)
     */
    async getPlannedTransactions(accountId: string): Promise<Transaction[]> {
        return await this.getPlannedTransactionsPrivate(accountId);
    }

    // ============================================================================
    // HELPER METHODS
    // ============================================================================

    private async getPlannedTransactionsPrivate(accountId: string): Promise<Transaction[]> {
        return await db.transactions
            .where('accountId')
            .equals(accountId)
            .and(t => t.status === 'planned')
            .toArray();
    }

    private calculateConfidenceLevel(transactions: Transaction[]): 'high' | 'medium' | 'low' {
        if (transactions.length === 0) return 'high';
        
        const confirmedCount = transactions.filter(t => t.confidence === 'confirmed').length;
        const totalCount = transactions.length;
        
        const confirmedRatio = confirmedCount / totalCount;
        
        if (confirmedRatio >= 0.8) return 'high';
        if (confirmedRatio >= 0.5) return 'medium';
        return 'low';
    }

    private calculateRiskLevel(balance: number, initialBalance: number): 'safe' | 'caution' | 'danger' {
        const ratio = balance / initialBalance;
        
        if (balance < 0) return 'danger';
        if (ratio < 0.2) return 'danger';
        if (ratio < 0.5) return 'caution';
        return 'safe';
    }

    // ============================================================================
    // NEW WEEK-BASED METHODS
    // ============================================================================

    /**
     * Get a single week projection with caching
     */
    async getWeekProjection(accountId: string, weekKey: WeekKey): Promise<WeeklyProjection> {
        // Check cache first
        const cached = this.weekCache.get(weekKey);
        if (cached) {
            return cached.projection;
        }

        // Generate the week projection
        const weekStart = new Date(weekKey);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);

        const accounts = await accountService.getAccounts();
        const account = accounts.find(a => a.id === accountId);
        if (!account) {
            throw new Error(`Account not found: ${accountId}`);
        }

        const plannedTransactions = await this.getPlannedTransactionsPrivate(accountId);
        
        // Get transactions for this week
        const weekTransactions = plannedTransactions.filter(t => {
            if (!t.plannedDate) return false;
            const transactionDate = new Date(t.plannedDate);
            return transactionDate >= weekStart && transactionDate <= weekEnd;
        });

        const weekIncome = weekTransactions
            .filter(t => t.type === 'income' && t.amount !== undefined)
            .reduce((sum, t) => sum + t.amount!, 0);
            
        const weekExpenses = weekTransactions
            .filter(t => t.type === 'expense' && t.amount !== undefined)
            .reduce((sum, t) => sum + t.amount!, 0);

        // Calculate starting balance - we need to get it from previous week or current balance
        let startingBalance: number;
        const currentWeekKey = this.getWeekKey(new Date());
        
        if (weekKey === currentWeekKey) {
            // Current week - use real-time balance
            startingBalance = await accountService.getAccountBalanceRealTime(accountId);
        } else if (weekKey > currentWeekKey) {
            // Future week - calculate from previous week
            const previousWeekKey = this.getWeekKey(this.subtractWeeks(weekStart, 1));
            const previousWeek = await this.getWeekProjection(accountId, previousWeekKey);
            startingBalance = previousWeek.endingBalance;
        } else {
            // Past week - work backwards from current balance
            // Calculate the net change from this week to current week by looking at all transactions
            const currentBalance = await accountService.getAccountBalanceRealTime(accountId);
            
            // Get all transactions from this week to current week
            const currentDate = new Date();
            const transactionsFromThisWeek = plannedTransactions.filter(t => {
                if (!t.plannedDate) return false;
                const transactionDate = new Date(t.plannedDate);
                return transactionDate >= weekStart && transactionDate <= currentDate;
            });
            
            // Calculate net change from this week to current
            const netChangeFromThisWeek = transactionsFromThisWeek.reduce((sum, t) => {
                if (t.type === 'income' && t.amount !== undefined) {
                    return sum + t.amount;
                } else if (t.type === 'expense' && t.amount !== undefined) {
                    return sum - t.amount;
                }
                return sum;
            }, 0);
            
            // Starting balance = current balance - net change from this week to current
            startingBalance = currentBalance - netChangeFromThisWeek;
        }

        const endingBalance = startingBalance + weekIncome - weekExpenses;
        const riskLevel = this.calculateRiskLevel(endingBalance, account.initialBalance);
        const dailyAllowance = weekIncome > 0 ? (endingBalance / 7) : (endingBalance / Math.max(1, weekEnd.getDate() - weekStart.getDate() + 1));

        const projection: WeeklyProjection = {
            weekStart: weekStart.toISOString(),
            weekEnd: weekEnd.toISOString(),
            weekNumber: Math.ceil((weekStart.getTime() - new Date().getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1,
            startingBalance,
            plannedIncome: weekIncome,
            plannedExpenses: weekExpenses,
            endingBalance,
            riskLevel,
            dailyAllowance,
            transactions: weekTransactions
        };

        // Cache the result
        this.weekCache.set(weekKey, {
            projection,
            insights: [], // Will be loaded separately
            lastUpdated: new Date()
        });

        return projection;
    }

    /**
     * Get insights for a specific week (rolling 5-week window)
     */
    async getWeekInsights(accountId: string, weekKey: WeekKey): Promise<PlanningInsight[]> {
        const weekStart = new Date(weekKey);
        const windowEnd = this.addWeeks(weekStart, 4); // 5-week window
        
        // Get projections for the insight window
        const windowProjections: WeeklyProjection[] = [];
        for (let i = 0; i < 5; i++) {
            const currentWeekKey = this.getWeekKey(this.addWeeks(weekStart, i));
            const projection = await this.getWeekProjection(accountId, currentWeekKey);
            windowProjections.push(projection);
        }
        
        // Generate insights based on this 5-week window
        return this.generateInsightsFromProjections(windowProjections);
    }

    /**
     * Generate insights from a set of projections
     */
    private generateInsightsFromProjections(projections: WeeklyProjection[]): PlanningInsight[] {
        const insights: PlanningInsight[] = [];

        // Check for low balance warnings
        const lowBalanceWeeks = projections.filter(w => w.riskLevel === 'danger');
        if (lowBalanceWeeks.length > 0) {
            insights.push({
                type: 'balance_warning',
                title: 'Low Balance Risk',
                description: `${lowBalanceWeeks.length} week(s) projected to have low balance`,
                action: 'Consider moving expenses or adding income',
                priority: 'high'
            });
        }

        // Check for expense optimization opportunities
        const highExpenseWeeks = projections.filter(w => w.plannedExpenses > w.plannedIncome * 2);
        if (highExpenseWeeks.length > 0) {
            insights.push({
                type: 'expense_optimization',
                title: 'Expense Optimization',
                description: `${highExpenseWeeks.length} week(s) have high expense ratios`,
                action: 'Consider spreading large expenses across multiple weeks',
                priority: 'medium'
            });
        }

        return insights.sort((a, b) => {
            const priorityOrder = { high: 3, medium: 2, low: 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
    }

    /**
     * Invalidate cache for a week and all subsequent weeks
     */
    invalidateWeekCache(weekKey: WeekKey): void {
        this.weekCache.invalidateFromWeek(weekKey);
    }

    /**
     * Clear all cached weeks
     */
    clearWeekCache(): void {
        this.weekCache.clear();
    }

    /**
     * Check if a week is cached
     */
    isWeekCached(weekKey: WeekKey): boolean {
        return this.weekCache.has(weekKey);
    }

    /**
     * Get cached week data
     */
    getCachedWeek(weekKey: WeekKey): CachedWeek | undefined {
        return this.weekCache.get(weekKey);
    }
}

export const planningService = new PlanningService();
