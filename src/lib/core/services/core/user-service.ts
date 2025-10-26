import { db, generateUUID } from '$lib/core/db';
import type { UserPreferences, UserAction } from '$lib/core/db';

interface UserProfile {
    id: string;
    preferences: UserPreferences;
    maturityLevel: 'beginner' | 'intermediate' | 'advanced';
    onboardingComplete: boolean;
    lastActiveAt: string;
}

interface UserBehaviorPattern {
    action: string;
    frequency: number;
    lastPerformed: string;
    trend: 'increasing' | 'decreasing' | 'stable';
}

class UserService {
    public get ready() {
        return Promise.resolve();
    }

    public isLoading() {
        return false;
    }

    // ============================================================================
    // USER PREFERENCES MANAGEMENT
    // ============================================================================

    /**
     * Get user preferences
     */
    async getUserPreferences(): Promise<UserPreferences> {
        const preferences = await db.userPreferences.toCollection().first();
        if (!preferences) {
            // Create default preferences
            return await this.createDefaultPreferences();
        }
        return preferences;
    }

    /**
     * Update user preferences
     */
    async updateUserPreferences(updates: Partial<UserPreferences>): Promise<UserPreferences> {
        const existing = await db.userPreferences.toCollection().first();
        
        if (existing) {
            const updated = {
                ...existing,
                ...updates,
                updatedAt: new Date().toISOString()
            };
            await db.userPreferences.update(existing.id, updated);
            return updated;
        } else {
            const newPreferences: UserPreferences = {
                id: generateUUID(),
                username: 'User',
                defaultBudgetType: 'daily',
                allowGlobalBorrowing: true,
                maxGlobalBorrowPercentage: 0.1,
                theme: 'dark',
                language: 'en',
                currency: 'USD',
                userMaturityLevel: 'beginner',
                onboardingCompleted: false,
                enableAdvancedFeatures: false,
                enablePredictiveAnalytics: true,
                analyticsEnabled: true,
                backupEnabled: true,
                ...updates,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                deletedAt: null
            };
            await db.userPreferences.add(newPreferences);
            return newPreferences;
        }
    }

    /**
     * Reset user preferences to defaults
     */
    async resetUserPreferences(): Promise<UserPreferences> {
        await db.userPreferences.clear();
        return await this.createDefaultPreferences();
    }

    // ============================================================================
    // USER ACTIONS TRACKING
    // ============================================================================

    /**
     * Track a user action
     */
    async trackUserAction(action: {
        action: string;
        details?: string;
        sessionId?: string;
    }): Promise<void> {
        const userAction: UserAction = {
            id: generateUUID(),
            action: action.action,
            metadata: action.details || '{}',
            timestamp: new Date().toISOString(),
            sessionId: action.sessionId || this.generateSessionId(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null
        };

        await db.userActions.add(userAction);
    }

    /**
     * Get user actions for a specific time period
     */
    async getUserActions(days: number = 30): Promise<UserAction[]> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        return await db.userActions
            .where('timestamp')
            .above(cutoffDate.toISOString())
            .and(action => !action.deletedAt)
            .toArray();
    }

    /**
     * Get user behavior patterns
     */
    async getUserBehaviorPatterns(): Promise<UserBehaviorPattern[]> {
        const actions = await this.getUserActions(90); // Last 90 days
        const actionCounts = new Map<string, { count: number; lastPerformed: string }>();
        
        actions.forEach(action => {
            const current = actionCounts.get(action.action) || { count: 0, lastPerformed: action.timestamp };
            current.count++;
            if (new Date(action.timestamp) > new Date(current.lastPerformed)) {
                current.lastPerformed = action.timestamp;
            }
            actionCounts.set(action.action, current);
        });

        const patterns: UserBehaviorPattern[] = [];
        
        actionCounts.forEach((data, action) => {
            // Calculate trend (simplified)
            const recentActions = actions.filter(a => 
                a.action === action && 
                new Date(a.timestamp) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            );
            const olderActions = actions.filter(a => 
                a.action === action && 
                new Date(a.timestamp) >= new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) &&
                new Date(a.timestamp) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
            );
            
            let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
            if (recentActions.length > olderActions.length) {
                trend = 'increasing';
            } else if (recentActions.length < olderActions.length) {
                trend = 'decreasing';
            }

            patterns.push({
                action,
                frequency: data.count,
                lastPerformed: data.lastPerformed,
                trend
            });
        });

        return patterns.sort((a, b) => b.frequency - a.frequency);
    }

    // ============================================================================
    // USER PROFILE MANAGEMENT
    // ============================================================================

    /**
     * Get user profile
     */
    async getUserProfile(): Promise<UserProfile> {
        const preferences = await this.getUserPreferences();
        const actions = await this.getUserActions(30);
        
        // Calculate maturity level based on usage patterns
        const maturityLevel = this.calculateMaturityLevel(actions);
        
        // Check if onboarding is complete
        const onboardingComplete = this.isOnboardingComplete(preferences, actions);
        
        return {
            id: preferences.id,
            preferences,
            maturityLevel,
            onboardingComplete,
            lastActiveAt: actions.length > 0 ? actions[actions.length - 1].timestamp : preferences.updatedAt
        };
    }

    /**
     * Update user maturity level
     */
    async updateMaturityLevel(): Promise<'beginner' | 'intermediate' | 'advanced'> {
        const actions = await this.getUserActions(30);
        const maturityLevel = this.calculateMaturityLevel(actions);
        
        // Update preferences with maturity level
        await this.updateUserPreferences({ userMaturityLevel: maturityLevel });
        
        return maturityLevel;
    }

    /**
     * Complete onboarding
     */
    async completeOnboarding(): Promise<void> {
        await this.updateUserPreferences({ 
            onboardingCompleted: true
        });
    }

    // ============================================================================
    // ANALYTICS & INSIGHTS
    // ============================================================================

    /**
     * Get user engagement metrics
     */
    async getUserEngagementMetrics(): Promise<{
        totalActions: number;
        uniqueActions: number;
        averageActionsPerDay: number;
        mostActiveDay: string;
        engagementScore: number;
    }> {
        const actions = await this.getUserActions(30);
        const uniqueActions = new Set(actions.map(a => a.action));
        
        // Calculate daily activity
        const dailyActivity = new Map<string, number>();
        actions.forEach(action => {
            const day = action.timestamp.substring(0, 10); // YYYY-MM-DD
            dailyActivity.set(day, (dailyActivity.get(day) || 0) + 1);
        });
        
        const averageActionsPerDay = actions.length / 30;
        const mostActiveDay = Array.from(dailyActivity.entries())
            .sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
        
        // Calculate engagement score (0-100)
        const engagementScore = Math.min(100, Math.round(averageActionsPerDay * 10));
        
        return {
            totalActions: actions.length,
            uniqueActions: uniqueActions.size,
            averageActionsPerDay,
            mostActiveDay,
            engagementScore
        };
    }

    /**
     * Get user insights and recommendations
     */
    async getUserInsights(): Promise<{
        insights: string[];
        recommendations: string[];
    }> {
        const profile = await this.getUserProfile();
        const patterns = await this.getUserBehaviorPatterns();
        const metrics = await this.getUserEngagementMetrics();
        
        const insights: string[] = [];
        const recommendations: string[] = [];
        
        // Onboarding insights
        if (!profile.onboardingComplete) {
            insights.push('Complete the onboarding process to unlock all features');
            recommendations.push('Take the guided tour to learn about budgeting and goal setting');
        }
        
        // Engagement insights
        if (metrics.engagementScore < 30) {
            insights.push('Your app usage has been low recently');
            recommendations.push('Try setting up a budget or creating a financial goal to increase engagement');
        } else if (metrics.engagementScore > 70) {
            insights.push('You\'re actively using the app - great job!');
        }
        
        // Maturity level insights
        if (profile.maturityLevel === 'beginner') {
            insights.push('You\'re new to financial planning - start with basic budgeting');
            recommendations.push('Focus on tracking expenses and setting simple goals');
        } else if (profile.maturityLevel === 'advanced') {
            insights.push('You\'re an advanced user - consider exploring advanced features');
            recommendations.push('Try setting up complex budgets and long-term financial goals');
        }
        
        // Behavior pattern insights
        const topAction = patterns[0];
        if (topAction) {
            insights.push(`Your most common action is: ${topAction.action}`);
            if (topAction.trend === 'increasing') {
                recommendations.push(`Keep up the good work with ${topAction.action}`);
            }
        }
        
        return { insights, recommendations };
    }

    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================

    /**
     * Create default user preferences
     */
    private async createDefaultPreferences(): Promise<UserPreferences> {
        const preferences: UserPreferences = {
            id: generateUUID(),
            username: 'User',
            defaultBudgetType: 'daily',
            allowGlobalBorrowing: true,
            maxGlobalBorrowPercentage: 0.1,
            theme: 'dark',
            language: 'en',
            currency: 'USD',
            userMaturityLevel: 'beginner',
            onboardingCompleted: false,
            enableAdvancedFeatures: false,
            enablePredictiveAnalytics: true,
            analyticsEnabled: true,
            backupEnabled: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null
        };

        await db.userPreferences.add(preferences);
        return preferences;
    }

    /**
     * Generate a session ID
     */
    private generateSessionId(): string {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Calculate user maturity level based on actions
     */
    private calculateMaturityLevel(actions: UserAction[]): 'beginner' | 'intermediate' | 'advanced' {
        const actionTypes = new Set(actions.map(a => a.action));
        
        // Define maturity criteria
        const beginnerActions = new Set(['view_accounts', 'view_transactions', 'create_transaction']);
        const intermediateActions = new Set(['create_budget', 'set_goal', 'view_insights']);
        const advancedActions = new Set(['create_split_transaction', 'analyze_trends', 'export_data']);
        
        let score = 0;
        
        // Count action types
        actionTypes.forEach(action => {
            if (beginnerActions.has(action)) score += 1;
            if (intermediateActions.has(action)) score += 2;
            if (advancedActions.has(action)) score += 3;
        });
        
        if (score >= 10) return 'advanced';
        if (score >= 5) return 'intermediate';
        return 'beginner';
    }

    /**
     * Check if onboarding is complete
     */
    private isOnboardingComplete(preferences: UserPreferences, actions: UserAction[]): boolean {
        if (preferences.onboardingCompleted) return true;
        
        // Check if user has performed key onboarding actions
        const onboardingActions = ['create_account', 'create_transaction', 'view_dashboard'];
        const hasPerformedActions = onboardingActions.some(action => 
            actions.some(a => a.action === action)
        );
        
        return hasPerformedActions && actions.length >= 3;
    }
}

export const userService = new UserService();
