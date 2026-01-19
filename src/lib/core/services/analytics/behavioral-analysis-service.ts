import { db, generateUUID } from '$lib/core/db';
import type { UserAction, Transaction } from '$lib/core/db';
import { userService } from '../core/user-service';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface BehaviorPattern {
	id: string;
	type: 'day_of_week' | 'weekly' | 'monthly' | 'seasonal' | 'transaction_timing' | 'category_preference' | 'spending_velocity';
	title: string;
	description: string;
	confidence: number; // 0-100
	frequency: 'daily' | 'weekly' | 'monthly' | 'irregular';
	pattern: Record<string, any>;
	metadata: {
		occurrences: number;
		minimumOccurrences: number;
		variance: number;
		coefficientOfVariation: number;
		timeframe: string;
		lastObserved: string;
		firstObserved: string;
	};
	actionable: boolean;
	recommendation?: string;
}

export interface DayOfWeekPattern {
	day: string; // 'monday', 'tuesday', etc.
	frequency: number;
	averageAmount?: number;
	percentage: number;
}

export interface SpendingCycle {
	type: 'weekly' | 'monthly' | 'seasonal';
	startDate: string;
	endDate: string;
	averageAmount: number;
	confidence: number;
	occurrences: number;
}

export interface TransactionTimingPattern {
	hour: number; // 0-23
	frequency: number;
	averageAmount?: number;
	percentage: number;
}

// ============================================================================
// BEHAVIORAL ANALYSIS SERVICE
// ============================================================================

class BehavioralAnalysisService {
	public get ready() {
		return Promise.resolve();
	}

	public isLoading() {
		return false;
	}

	// ============================================================================
	// PATTERN DETECTION METHODS
	// ============================================================================

	/**
	 * Detect day-of-week patterns in user behavior
	 * Minimum 3 occurrences, coefficient of variation < 0.3, confidence > 70%
	 */
	async detectDayOfWeekPatterns(
		actions: UserAction[],
		transactions?: Transaction[]
	): Promise<DayOfWeekPattern[]> {
		const dayCounts = new Map<string, { count: number; amounts: number[] }>();
		const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

		// Count actions by day of week
		actions.forEach(action => {
			const date = new Date(action.timestamp);
			const dayName = dayNames[date.getDay()];
			const current = dayCounts.get(dayName) || { count: 0, amounts: [] };
			current.count++;
			dayCounts.set(dayName, current);
		});

		// Count transactions by day of week if provided
		if (transactions) {
			transactions.forEach(tx => {
				const date = new Date(tx.clearedDate || tx.plannedDate || tx.createdAt);
				const dayName = dayNames[date.getDay()];
				const current = dayCounts.get(dayName) || { count: 0, amounts: [] };
				current.count++;
				if (tx.amount) {
					current.amounts.push(Math.abs(tx.amount));
				}
				dayCounts.set(dayName, current);
			});
		}

		const totalCount = Array.from(dayCounts.values()).reduce((sum, data) => sum + data.count, 0);
		if (totalCount < 3) {
			return []; // Not enough data
		}

		const patterns: DayOfWeekPattern[] = [];
		dayCounts.forEach((data, day) => {
			const percentage = (data.count / totalCount) * 100;
			const averageAmount = data.amounts.length > 0
				? data.amounts.reduce((sum, amt) => sum + amt, 0) / data.amounts.length
				: undefined;

			// Only include patterns with significant frequency (>10% of total)
			if (percentage >= 10) {
				patterns.push({
					day,
					frequency: data.count,
					averageAmount,
					percentage: Math.round(percentage * 100) / 100
				});
			}
		});

		return patterns.sort((a, b) => b.frequency - a.frequency);
	}

	/**
	 * Detect weekly spending cycles
	 * Requires minimum 3 weeks of data, coefficient of variation < 0.3
	 */
	async detectWeeklyCycles(transactions: Transaction[]): Promise<SpendingCycle[]> {
		if (transactions.length < 10) {
			return []; // Not enough data
		}

		const expenseTransactions = transactions.filter(
			tx => tx.type === 'expense' && tx.status === 'cleared' && tx.clearedDate
		);

		if (expenseTransactions.length < 10) {
			return [];
		}

		// Group by week
		const weeklySpending = new Map<string, { amount: number; count: number; dates: string[] }>();

		expenseTransactions.forEach(tx => {
			const date = new Date(tx.clearedDate!);
			const weekStart = this.getWeekStart(date);
			const weekKey = weekStart.toISOString().substring(0, 10);

			const current = weeklySpending.get(weekKey) || { amount: 0, count: 0, dates: [] };
			current.amount += Math.abs(tx.amount || 0);
			current.count++;
			current.dates.push(tx.clearedDate!);
			weeklySpending.set(weekKey, current);
		});

		if (weeklySpending.size < 3) {
			return []; // Need at least 3 weeks
		}

		const amounts = Array.from(weeklySpending.values()).map(w => w.amount);
		const avg = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
		const variance = amounts.reduce((sum, amt) => sum + Math.pow(amt - avg, 2), 0) / amounts.length;
		const stdDev = Math.sqrt(variance);
		const coefficientOfVariation = avg > 0 ? stdDev / avg : 0;

		// Pattern is significant if CV < 0.3 (low variance)
		if (coefficientOfVariation < 0.3 && weeklySpending.size >= 3) {
			const weeks = Array.from(weeklySpending.entries()).sort((a, b) => 
				new Date(a[0]).getTime() - new Date(b[0]).getTime()
			);

			return [{
				type: 'weekly',
				startDate: weeks[0][0],
				endDate: weeks[weeks.length - 1][0],
				averageAmount: avg,
				confidence: Math.min(100, Math.round((1 - coefficientOfVariation) * 100)),
				occurrences: weeklySpending.size
			}];
		}

		return [];
	}

	/**
	 * Detect monthly spending cycles
	 * Requires minimum 3 months of data
	 */
	async detectMonthlyCycles(transactions: Transaction[]): Promise<SpendingCycle[]> {
		if (transactions.length < 15) {
			return [];
		}

		const expenseTransactions = transactions.filter(
			tx => tx.type === 'expense' && tx.status === 'cleared' && tx.clearedDate
		);

		if (expenseTransactions.length < 15) {
			return [];
		}

		// Group by month
		const monthlySpending = new Map<string, { amount: number; count: number; dates: string[] }>();

		expenseTransactions.forEach(tx => {
			const date = new Date(tx.clearedDate!);
			const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

			const current = monthlySpending.get(monthKey) || { amount: 0, count: 0, dates: [] };
			current.amount += Math.abs(tx.amount || 0);
			current.count++;
			current.dates.push(tx.clearedDate!);
			monthlySpending.set(monthKey, current);
		});

		if (monthlySpending.size < 3) {
			return [];
		}

		const amounts = Array.from(monthlySpending.values()).map(m => m.amount);
		const avg = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
		const variance = amounts.reduce((sum, amt) => sum + Math.pow(amt - avg, 2), 0) / amounts.length;
		const stdDev = Math.sqrt(variance);
		const coefficientOfVariation = avg > 0 ? stdDev / avg : 0;

		if (coefficientOfVariation < 0.3 && monthlySpending.size >= 3) {
			const months = Array.from(monthlySpending.entries()).sort((a, b) => 
				a[0].localeCompare(b[0])
			);

			return [{
				type: 'monthly',
				startDate: months[0][0] + '-01',
				endDate: months[months.length - 1][0] + '-01',
				averageAmount: avg,
				confidence: Math.min(100, Math.round((1 - coefficientOfVariation) * 100)),
				occurrences: monthlySpending.size
			}];
		}

		return [];
	}

	/**
	 * Detect seasonal patterns (quarterly or yearly)
	 * Requires minimum 12 months of data
	 */
	async detectSeasonalPatterns(transactions: Transaction[]): Promise<SpendingCycle[]> {
		if (transactions.length < 30) {
			return [];
		}

		const expenseTransactions = transactions.filter(
			tx => tx.type === 'expense' && tx.status === 'cleared' && tx.clearedDate
		);

		if (expenseTransactions.length < 30) {
			return [];
		}

		// Group by quarter
		const quarterlySpending = new Map<string, { amount: number; count: number; dates: string[] }>();

		expenseTransactions.forEach(tx => {
			const date = new Date(tx.clearedDate!);
			const quarter = Math.floor(date.getMonth() / 3) + 1;
			const quarterKey = `Q${quarter}-${date.getFullYear()}`;

			const current = quarterlySpending.get(quarterKey) || { amount: 0, count: 0, dates: [] };
			current.amount += Math.abs(tx.amount || 0);
			current.count++;
			current.dates.push(tx.clearedDate!);
			quarterlySpending.set(quarterKey, current);
		});

		if (quarterlySpending.size < 4) {
			return []; // Need at least 4 quarters (1 year)
		}

		const amounts = Array.from(quarterlySpending.values()).map(q => q.amount);
		const avg = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
		const variance = amounts.reduce((sum, amt) => sum + Math.pow(amt - avg, 2), 0) / amounts.length;
		const stdDev = Math.sqrt(variance);
		const coefficientOfVariation = avg > 0 ? stdDev / avg : 0;

		if (coefficientOfVariation < 0.4 && quarterlySpending.size >= 4) {
			const quarters = Array.from(quarterlySpending.entries()).sort((a, b) => 
				a[0].localeCompare(b[0])
			);

			return [{
				type: 'seasonal',
				startDate: quarters[0][0],
				endDate: quarters[quarters.length - 1][0],
				averageAmount: avg,
				confidence: Math.min(100, Math.round((1 - coefficientOfVariation) * 100)),
				occurrences: quarterlySpending.size
			}];
		}

		return [];
	}

	/**
	 * Detect transaction timing patterns (hour of day)
	 */
	async detectTransactionTimingPatterns(transactions: Transaction[]): Promise<TransactionTimingPattern[]> {
		if (transactions.length < 5) {
			return [];
		}

		const hourCounts = new Map<number, { count: number; amounts: number[] }>();

		transactions.forEach(tx => {
			const date = new Date(tx.clearedDate || tx.plannedDate || tx.createdAt);
			const hour = date.getHours();
			const current = hourCounts.get(hour) || { count: 0, amounts: [] };
			current.count++;
			if (tx.amount) {
				current.amounts.push(Math.abs(tx.amount));
			}
			hourCounts.set(hour, current);
		});

		const totalCount = Array.from(hourCounts.values()).reduce((sum, data) => sum + data.count, 0);
		if (totalCount < 5) {
			return [];
		}

		const patterns: TransactionTimingPattern[] = [];
		hourCounts.forEach((data, hour) => {
			const percentage = (data.count / totalCount) * 100;
			const averageAmount = data.amounts.length > 0
				? data.amounts.reduce((sum, amt) => sum + amt, 0) / data.amounts.length
				: undefined;

			if (percentage >= 5) { // At least 5% of transactions
				patterns.push({
					hour,
					frequency: data.count,
					averageAmount,
					percentage: Math.round(percentage * 100) / 100
				});
			}
		});

		return patterns.sort((a, b) => b.frequency - a.frequency);
	}

	/**
	 * Comprehensive pattern detection - analyzes all behavior patterns
	 */
	async detectAllPatterns(days: number = 90): Promise<BehaviorPattern[]> {
		const actions = await userService.getUserActions(days);
		const transactions = await db.transactions
			.where('clearedDate')
			.above(new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
			.and(tx => !tx.deletedAt)
			.toArray();

		const patterns: BehaviorPattern[] = [];

		// Day-of-week patterns
		const dayOfWeekPatterns = await this.detectDayOfWeekPatterns(actions, transactions);
		if (dayOfWeekPatterns.length > 0) {
			const topDay = dayOfWeekPatterns[0];
			patterns.push({
				id: generateUUID(),
				type: 'day_of_week',
				title: `Most Active on ${this.capitalizeFirst(topDay.day)}`,
				description: `${topDay.percentage}% of your activity occurs on ${topDay.day}s`,
				confidence: Math.min(100, Math.round(topDay.percentage * 1.2)),
				frequency: 'weekly',
				pattern: { dayOfWeek: dayOfWeekPatterns },
				metadata: {
					occurrences: topDay.frequency,
					minimumOccurrences: 3,
					variance: 0,
					coefficientOfVariation: 0,
					timeframe: `${days} days`,
					lastObserved: new Date().toISOString(),
					firstObserved: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
				},
				actionable: true,
				recommendation: `Consider scheduling budget reviews on ${topDay.day}s when you're most active`
			});
		}

		// Weekly cycles
		const weeklyCycles = await this.detectWeeklyCycles(transactions);
		weeklyCycles.forEach(cycle => {
			patterns.push({
				id: generateUUID(),
				type: 'weekly',
				title: 'Weekly Spending Pattern Detected',
				description: `Your spending follows a consistent weekly pattern averaging ${this.formatCurrency(cycle.averageAmount)} per week`,
				confidence: cycle.confidence,
				frequency: 'weekly',
				pattern: { cycle },
				metadata: {
					occurrences: cycle.occurrences,
					minimumOccurrences: 3,
					variance: 0,
					coefficientOfVariation: 0,
					timeframe: `${cycle.occurrences} weeks`,
					lastObserved: cycle.endDate,
					firstObserved: cycle.startDate
				},
				actionable: true,
				recommendation: 'Use this pattern to plan your weekly budget more accurately'
			});
		});

		// Monthly cycles
		const monthlyCycles = await this.detectMonthlyCycles(transactions);
		monthlyCycles.forEach(cycle => {
			patterns.push({
				id: generateUUID(),
				type: 'monthly',
				title: 'Monthly Spending Pattern Detected',
				description: `Your spending follows a consistent monthly pattern averaging ${this.formatCurrency(cycle.averageAmount)} per month`,
				confidence: cycle.confidence,
				frequency: 'monthly',
				pattern: { cycle },
				metadata: {
					occurrences: cycle.occurrences,
					minimumOccurrences: 3,
					variance: 0,
					coefficientOfVariation: 0,
					timeframe: `${cycle.occurrences} months`,
					lastObserved: cycle.endDate,
					firstObserved: cycle.startDate
				},
				actionable: true,
				recommendation: 'Consider setting up monthly budget allocations based on this pattern'
			});
		});

		// Seasonal patterns
		const seasonalPatterns = await this.detectSeasonalPatterns(transactions);
		seasonalPatterns.forEach(cycle => {
			patterns.push({
				id: generateUUID(),
				type: 'seasonal',
				title: 'Seasonal Spending Pattern Detected',
				description: `Your spending shows seasonal variations averaging ${this.formatCurrency(cycle.averageAmount)} per quarter`,
				confidence: cycle.confidence,
				frequency: 'monthly',
				pattern: { cycle },
				metadata: {
					occurrences: cycle.occurrences,
					minimumOccurrences: 4,
					variance: 0,
					coefficientOfVariation: 0,
					timeframe: `${cycle.occurrences} quarters`,
					lastObserved: cycle.endDate,
					firstObserved: cycle.startDate
				},
				actionable: true,
				recommendation: 'Plan for seasonal variations in your annual budget'
			});
		});

		// Transaction timing patterns
		const timingPatterns = await this.detectTransactionTimingPatterns(transactions);
		if (timingPatterns.length > 0) {
			const topTiming = timingPatterns[0];
			patterns.push({
				id: generateUUID(),
				type: 'transaction_timing',
				title: `Most Transactions at ${this.formatHour(topTiming.hour)}`,
				description: `${topTiming.percentage}% of your transactions occur around ${this.formatHour(topTiming.hour)}`,
				confidence: Math.min(100, Math.round(topTiming.percentage * 1.5)),
				frequency: 'daily',
				pattern: { timing: timingPatterns },
				metadata: {
					occurrences: topTiming.frequency,
					minimumOccurrences: 5,
					variance: 0,
					coefficientOfVariation: 0,
					timeframe: `${days} days`,
					lastObserved: new Date().toISOString(),
					firstObserved: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
				},
				actionable: false,
				recommendation: undefined
			});
		}

		return patterns;
	}

	// ============================================================================
	// PRIVATE HELPER METHODS
	// ============================================================================

	private getWeekStart(date: Date): Date {
		const d = new Date(date);
		const day = d.getDay();
		const diff = d.getDate() - day; // Sunday = 0
		return new Date(d.setDate(diff));
	}

	private capitalizeFirst(str: string): string {
		return str.charAt(0).toUpperCase() + str.slice(1);
	}

	private formatCurrency(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(amount);
	}

	private formatHour(hour: number): string {
		const period = hour >= 12 ? 'PM' : 'AM';
		const displayHour = hour % 12 || 12;
		return `${displayHour}:00 ${period}`;
	}
}

export const behavioralAnalysisService = new BehavioralAnalysisService();
