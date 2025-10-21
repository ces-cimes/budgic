import { planningService } from '$lib/core/services/planning-service';
import { accountService } from '$lib/core/services/account-service';
import { settingsService } from '$lib/core/services/settings-service';
import type { 
  PlanningData, 
  DailyAllowance, 
  WeeklyProjection, 
  PlanningInsight 
} from '$lib/core/services/planning-service';
import type { Account } from '$lib/core/db';

class PlanService {
  public get ready() {
    return planningService.ready;
  }

  /**
   * Get all accounts
   */
  async getAccounts(): Promise<Account[]> {
    return await accountService.getAccounts();
  }

  /**
   * Get comprehensive planning data for an account
   */
  async getPlanningData(accountId: string): Promise<PlanningData> {
    return await planningService.getPlanningData(accountId);
  }

  /**
   * Get daily allowance for an account
   */
  async getDailyAllowance(accountId: string): Promise<DailyAllowance> {
    return await planningService.calculateDailyAllowance(accountId);
  }

  /**
   * Get weekly projections for an account
   */
  async getWeeklyProjections(accountId: string, weeksAhead: number = 8): Promise<WeeklyProjection[]> {
    return await planningService.calculateWeeklyProjections(accountId, weeksAhead);
  }

  /**
   * Get planning insights for an account
   */
  async getPlanningInsights(accountId: string): Promise<PlanningInsight[]> {
    return await planningService.generatePlanningInsights(accountId);
  }

  /**
   * Get a single week projection with caching
   */
  async getWeekProjection(accountId: string, weekKey: string): Promise<WeeklyProjection> {
    return await planningService.getWeekProjection(accountId, weekKey);
  }

  /**
   * Get week insights for a specific week
   */
  async getWeekInsights(accountId: string, weekKey: string): Promise<PlanningInsight[]> {
    return await planningService.getWeekInsights(accountId, weekKey);
  }

  /**
   * Clear account cache to ensure fresh data
   */
  clearAccountCache(accountId: string): void {
    planningService.clearAccountCache(accountId);
  }

  /**
   * Clear week cache
   */
  clearWeekCache(): void {
    planningService.clearWeekCache();
  }

  /**
   * Invalidate week cache from a specific week
   */
  invalidateWeekCache(weekKey: string): void {
    planningService.invalidateWeekCache(weekKey);
  }

  /**
   * Check if a week is cached
   */
  isWeekCached(weekKey: string): boolean {
    return planningService.isWeekCached(weekKey);
  }

  /**
   * Get cached week data
   */
  getCachedWeek(weekKey: string) {
    return planningService.getCachedWeek(weekKey);
  }

  /**
   * Get user's preferred currency
   */
  async getUserCurrency(): Promise<string> {
    return await settingsService.getCurrency();
  }

  /**
   * Get user preferences
   */
  async getUserPreferences() {
    return await settingsService.getUserPreferences();
  }

  /**
   * Week utility methods
   */
  getWeekKey(date: Date, firstDayOfWeek: number = 1): string {
    return planningService.getWeekKey(date, firstDayOfWeek);
  }

  getWeekStart(date: Date, firstDayOfWeek: number = 1): Date {
    return planningService.getWeekStart(date, firstDayOfWeek);
  }

  addWeeks(date: Date, weeks: number): Date {
    return planningService.addWeeks(date, weeks);
  }

  subtractWeeks(date: Date, weeks: number): Date {
    return planningService.subtractWeeks(date, weeks);
  }
}

export const planService = new PlanService();
