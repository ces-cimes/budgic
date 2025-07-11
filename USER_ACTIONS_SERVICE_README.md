# User Actions Service - Behavioral Tracking & Insights

## Overview

The User Actions Service is a privacy-first behavioral tracking system that monitors user interactions with the Budgic app to provide personalized insights and recommendations. It adheres to the design specifications for enhanced user experience while maintaining strict privacy controls.

## Features

### 🎯 **Core Tracking Capabilities**
- **Transaction Entry Behavior**: Tracks how users create transactions (manual, quick-add, import, split)
- **Budget Interaction Patterns**: Monitors budget checking frequency and engagement
- **Spending Pattern Detection**: Identifies unusual spending, impulse purchases, and seasonal patterns
- **Budget Management Behavior**: Tracks budget adjustments and waterfall violations
- **Progress Checking Patterns**: Monitors how users review their financial progress

### 🧠 **Intelligent Insights**
- **Predictive Insights**: Forecasts future spending and budget needs
- **Behavioral Insights**: Identifies patterns in user behavior
- **Recommendations**: Suggests budget optimizations and habit improvements
- **Anomaly Detection**: Flags unusual spending patterns

### 🔒 **Privacy-First Design**
- **Local Processing**: All analysis happens client-side
- **User Control**: Complete control over what gets tracked
- **Data Minimization**: Only tracks actionable patterns
- **Auto-Purge**: Automatic data cleanup after retention period

## Quick Start

### 1. Basic Usage

```typescript
import { userActionsService, PrivacyUtils } from '$lib/core/services';

// Enable tracking
PrivacyUtils.setTrackingEnabled(true);

// Track a transaction creation
await userActionsService.trackTransactionCreated(
    transaction,
    'manual',
    45, // timeToComplete in seconds
    2   // categoryChangeCount
);

// Track budget checking
await userActionsService.trackBudgetChecked(
    'user',
    30, // timeSpent in seconds
    ['survival', 'security'],
    false // adjustmentsMade
);
```

### 2. Generate Insights

```typescript
// Get predictive insights
const predictiveInsights = await userActionsService.generateInsights('predictive');

// Analyze behavior patterns
const patterns = await userActionsService.analyzePatterns('month');

// Get recommendations
const recommendations = await userActionsService.generateInsights('recommendation');
```

### 3. Privacy Controls

```typescript
// Check if tracking is enabled
const isEnabled = PrivacyUtils.isTrackingEnabled();

// Set tracking preferences
PrivacyUtils.setTrackingPreferences({
    transaction_timing: true,
    budget_adherence: true,
    spending_patterns: false,
    habit_formation: true
});

// Get purgeable data (for GDPR compliance)
const oldData = await userActionsService.getPurgeableData(365); // 1 year retention
```

## Service Architecture

### UserActionsService Class

The main service class that handles all tracking and analysis:

```typescript
class UserActionsService {
    // Core tracking methods
    async track(action: string, metadata: Record<string, any>, context?: Record<string, any>): Promise<string>
    async trackTransactionCreated(transaction: Transaction, entryMethod: string, timeToComplete?: number, categoryChangeCount?: number): Promise<string>
    async trackBudgetChecked(triggeredBy: string, timeSpent?: number, categoriesViewed?: string[], adjustmentsMade?: boolean): Promise<string>
    async trackSpendingPattern(transaction: Transaction, patternFlags: object): Promise<string>
    async trackBudgetModified(changedCategory: string, changeAmount: number, movedTo?: string, triggerReason: string): Promise<string>
    async trackWaterfallViolation(spentOnLower: string, whileHigherNeeded: string, amount: number): Promise<string>
    async trackProgressViewed(triggeredBy: string, timeSpent?: number, categoriesViewed?: string[], actionTaken?: string): Promise<string>

    // Analysis methods
    async analyzePatterns(timeframe: 'week' | 'month' | 'quarter' | 'year', categories?: string[]): Promise<BehaviorPattern[]>
    async generateInsights(insightType: 'predictive' | 'behavioral' | 'recommendation' | 'anomaly'): Promise<PredictiveInsight[]>
    async getPurgeableData(retentionDays: number): Promise<UserAction[]>
}
```

### PatternEngine Class

Advanced pattern recognition and prediction:

```typescript
class PatternEngine {
    async detectSpendingCycles(transactions: Transaction[], actions: UserAction[]): Promise<BehaviorPattern[]>
    async predictBudgetNeeds(historicalData: any[], currentTrends: any[]): Promise<PredictiveInsight[]>
    async detectAnomalies(baseline: any[], current: any[]): Promise<PredictiveInsight[]>
    async recommendBudgetAdjustments(patterns: BehaviorPattern[], goals: any[]): Promise<PredictiveInsight[]>
}
```

## Data Models

### UserAction Schema

```typescript
interface UserAction {
    id: string;
    userId?: string;
    action: string;
    metadata: Record<string, any>;
    context?: Record<string, any>;
    timestamp: string;
    sessionId?: string;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
}
```

### Action Types

1. **transaction_created**: Tracks transaction entry behavior
2. **budget_checked**: Monitors budget interaction patterns
3. **spending_pattern**: Detects spending behavior signals
4. **budget_behavior**: Tracks budget management behavior
5. **progress_viewed**: Monitors progress checking patterns
6. **split_transaction_created**: Tracks split transaction complexity
7. **waterfall_violation**: Tracks priority violations
8. **budget_modified**: Tracks budget adjustments

### Insight Types

```typescript
interface PredictiveInsight {
    insightType: 'spending_prediction' | 'budget_recommendation' | 'habit_improvement' | 'anomaly_detection';
    confidence: number; // 0-1
    title: string;
    description: string;
    actionable: boolean;
    priority: 'low' | 'medium' | 'high';
    metadata: Record<string, any>;
    expiresAt?: string;
}
```

## Integration Examples

### 1. Transaction Service Integration

The service is already integrated with the transaction service to automatically track transaction creation:

```typescript
// In transaction-service.ts
async createNewTransaction(transactionData: Partial<Transaction>): Promise<Transaction> {
    const newTransaction = await db.transactions.add(transactionData);
    
    // Track user action if tracking is enabled
    if (PrivacyUtils.isTrackingEnabled()) {
        await userActionsService.trackTransactionCreated(
            newTransaction,
            'manual',
            undefined,
            undefined
        );
    }
    
    return newTransaction;
}
```

### 2. UI Component Integration

```svelte
<script lang="ts">
    import { userActionsService, PrivacyUtils } from '$lib/core/services';
    
    async function handleBudgetCheck() {
        const startTime = Date.now();
        
        // User checks budget...
        
        const timeSpent = (Date.now() - startTime) / 1000;
        
        await userActionsService.trackBudgetChecked(
            'user',
            timeSpent,
            ['survival', 'security'],
            false
        );
    }
</script>
```

### 3. Behavioral Insights Component

```svelte
<script lang="ts">
    import { userActionsService } from '$lib/core/services';
    import BehavioralInsight from '$lib/components/layout/BehavioralInsight.svelte';
</script>

<BehavioralInsight showPrivacyControls={true} autoRefresh={true} />
```

## Privacy & Security

### Data Protection

- **Local Storage**: All data is stored locally in IndexedDB
- **No External Calls**: No data is sent to external services
- **User Control**: Users can disable tracking entirely
- **Granular Control**: Users can choose what to track

### Data Retention

- **Auto-Purge**: Data is automatically purged after 12 months
- **Manual Cleanup**: Users can manually delete tracking data
- **GDPR Compliance**: Supports data export and deletion

### Transparency

- **Clear Dashboard**: Shows exactly what's being tracked
- **Export Data**: Users can export their tracking data
- **Plain English**: Insights are explained in simple terms

## Configuration

### Tracking Preferences

```typescript
const preferences = {
    transaction_timing: true,      // Track when transactions are created
    budget_adherence: true,        // Track budget checking patterns
    spending_patterns: true,       // Track spending behavior
    habit_formation: true          // Track habit development
};
```

### Retention Settings

```typescript
// Set retention period (in days)
const retentionDays = 365; // 1 year

// Get data that can be purged
const purgeableData = await userActionsService.getPurgeableData(retentionDays);
```

## Best Practices

### 1. Respect User Privacy

```typescript
// Always check if tracking is enabled
if (PrivacyUtils.isTrackingEnabled()) {
    await userActionsService.track('action', metadata);
}
```

### 2. Handle Errors Gracefully

```typescript
try {
    await userActionsService.trackTransactionCreated(transaction, 'manual');
} catch (error) {
    // Don't fail the main operation if tracking fails
    console.warn('Failed to track user action:', error);
}
```

### 3. Provide User Control

```typescript
// Give users control over tracking
const trackingEnabled = PrivacyUtils.isTrackingEnabled();
const preferences = PrivacyUtils.getTrackingPreferences();
```

### 4. Use Insights Responsibly

```typescript
// Only show insights if they're actionable and relevant
const insights = await userActionsService.generateInsights('recommendation');
const actionableInsights = insights.filter(insight => insight.actionable && insight.confidence > 0.6);
```

## Future Enhancements

### Planned Features

1. **Advanced Pattern Recognition**: Machine learning for better pattern detection
2. **Predictive Budgeting**: AI-powered budget recommendations
3. **Habit Formation Tracking**: Monitor progress toward financial goals
4. **Social Comparison**: Anonymous benchmarking (with user consent)
5. **Integration APIs**: Connect with other financial apps

### Extensibility

The service is designed to be easily extensible:

```typescript
// Add new action types
await userActionsService.track('new_action_type', {
    customField: 'value',
    anotherField: 123
});

// Add new insight types
const customInsights = await userActionsService.generateInsights('custom_type');
```

## Troubleshooting

### Common Issues

1. **Tracking Not Working**: Check if tracking is enabled with `PrivacyUtils.isTrackingEnabled()`
2. **No Insights**: Ensure there's enough data (at least 7 days of usage)
3. **Performance Issues**: Consider reducing tracking frequency or data retention period
4. **Storage Issues**: Check IndexedDB storage limits and purge old data

### Debug Mode

```typescript
// Enable debug logging
localStorage.setItem('budgic_debug_tracking', 'true');

// Check tracking data
const actions = await db.userActions.toArray();
console.log('Tracking data:', actions);
```

## Support

For questions or issues with the User Actions Service:

1. Check the privacy settings in the app
2. Review the tracking preferences
3. Export and review your tracking data
4. Contact support if issues persist

---

**Note**: This service is designed with privacy as a first principle. All data processing happens locally, and users have complete control over what gets tracked and for how long. 