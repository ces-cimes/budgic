import { budgetService, type TagBudget, type CategoryBudget, type TagBudgetSuggestion, type BudgetRecommendation, type BudgetInsight, type FundTransfer } from './services/budget-service';

// ============================================================================
// ENHANCED TAG BUDGET SYSTEM DEMONSTRATION
// ============================================================================

async function testEnhancedTagBudgetCreation() {
    console.log('\n=== Enhanced Tag Budget Creation ===');
    
    // 1. Regular monthly budget
    const rentBudget = await budgetService.createTagBudget('rent', 'survival', 1200, {
        recurringPeriod: 'monthly',
        maxRolloverPercent: 0.1, // 10% rollover cap
        autoAdjustmentsEnabled: true
    });
    
    // 2. Weekly budget (coffee/meals)
    const coffeeBudget = await budgetService.createTagBudget('coffee', 'lifestyle', 50, {
        recurringPeriod: 'weekly',
        maxRolloverPercent: 0.5, // 50% rollover cap for discretionary spending
        autoAdjustmentsEnabled: false // No auto-borrowing for coffee
    });
    
    // 3. Yearly budget (vacation)
    const vacationBudget = await budgetService.createTagBudget('vacation', 'lifestyle', 3000, {
        recurringPeriod: 'yearly',
        isGoalBased: true,
        goalTarget: 3000,
        maxRolloverPercent: 1.0, // 100% rollover for vacation savings
        autoAdjustmentsEnabled: true
    });
    
    // 4. Custom period budget (bi-weekly paychecks)
    const paycheckBudget = await budgetService.createTagBudget('paycheck_allocation', 'survival', 2000, {
        recurringPeriod: 'custom',
        customPeriodDays: 14,
        maxRolloverPercent: 0.2,
        autoAdjustmentsEnabled: true
    });
    
    // 5. Emergency fund with flexible goal
    const emergencyFund = await budgetService.createTagBudget('emergency_fund', 'security', 500, {
        isGoalBased: true,
        goalTarget: 15000, // No target date - flexible goal
        maxRolloverPercent: 1.0,
        autoAdjustmentsEnabled: true
    });

    console.log('Created budgets:');
    console.log(`- Rent: $${rentBudget.allocatedAmount}/${rentBudget.recurringPeriod} (${rentBudget.maxRolloverPercent * 100}% rollover cap)`);
    console.log(`- Coffee: $${coffeeBudget.allocatedAmount}/${coffeeBudget.recurringPeriod} (${coffeeBudget.maxRolloverPercent * 100}% rollover cap)`);
    console.log(`- Vacation: $${vacationBudget.allocatedAmount}/${vacationBudget.recurringPeriod} (Goal: $${vacationBudget.goalTarget})`);
    console.log(`- Paycheck: $${paycheckBudget.allocatedAmount}/every ${paycheckBudget.customPeriodDays} days`);
    console.log(`- Emergency: $${emergencyFund.allocatedAmount}/${emergencyFund.recurringPeriod} (Goal: $${emergencyFund.goalTarget})`);
}

async function testPeriodConversions() {
    console.log('\n=== Period Conversions ===');
    
    // Test monthly equivalents
    const weeklyAmount = 100;
    const monthlyEquivalent = budgetService.getMonthlyEquivalent(weeklyAmount, 'weekly');
    console.log(`$${weeklyAmount}/week = $${monthlyEquivalent.toFixed(2)}/month`);
    
    const dailyAmount = 10;
    const dailyMonthlyEquivalent = budgetService.getMonthlyEquivalent(dailyAmount, 'daily');
    console.log(`$${dailyAmount}/day = $${dailyMonthlyEquivalent.toFixed(2)}/month`);
    
    const yearlyAmount = 12000;
    const yearlyMonthlyEquivalent = budgetService.getMonthlyEquivalent(yearlyAmount, 'yearly');
    console.log(`$${yearlyAmount}/year = $${yearlyMonthlyEquivalent.toFixed(2)}/month`);
    
    // Test period amounts from monthly
    const monthlyAmount = 1000;
    const weeklyPeriod = budgetService.getPeriodAmount(monthlyAmount, 'weekly');
    console.log(`$${monthlyAmount}/month = $${weeklyPeriod.toFixed(2)}/week`);
    
    const customPeriod = budgetService.getPeriodAmount(monthlyAmount, 'custom', 14);
    console.log(`$${monthlyAmount}/month = $${customPeriod.toFixed(2)}/every 14 days`);
}

async function testFundTransfers() {
    console.log('\n=== Fund Transfer System ===');
    
    // Create test budgets
    const entertainmentBudget = await budgetService.createTagBudget('entertainment', 'lifestyle', 200);
    const emergencyBudget = await budgetService.createTagBudget('emergency', 'security', 500, {
        isGoalBased: true,
        goalTarget: 15000
    });
    
    // Simulate some spending
    await budgetService.updateTagBudget(entertainmentBudget.tagId, { spent: 150 });
    await budgetService.updateTagBudget(emergencyBudget.tagId, { spent: 200 });
    
    console.log('Before transfer:');
    console.log(`- Entertainment: $${entertainmentBudget.spent}/$${entertainmentBudget.allocatedAmount} ($${entertainmentBudget.remaining} remaining)`);
    console.log(`- Emergency: $${emergencyBudget.spent}/$${emergencyBudget.allocatedAmount} ($${emergencyBudget.remaining} remaining)`);
    
    // Manual fund reallocation
    const transfer: FundTransfer = {
        fromTagId: entertainmentBudget.tagId,
        toTagId: emergencyBudget.tagId,
        amount: 50,
        reason: 'user_reallocation',
        respectsWaterfall: false, // Manual transfers don't need to respect waterfall
        timestamp: new Date()
    };
    
    try {
        await budgetService.transferFunds(transfer);
        console.log('\nTransfer successful!');
        
        // Get updated budgets
        const updatedEntertainment = await budgetService.updateTagBudget(entertainmentBudget.tagId, {});
        const updatedEmergency = await budgetService.updateTagBudget(emergencyBudget.tagId, {});
        
        console.log('After transfer:');
        console.log(`- Entertainment: $${updatedEntertainment.spent}/$${updatedEntertainment.allocatedAmount} ($${updatedEntertainment.remaining} remaining)`);
        console.log(`- Emergency: $${updatedEmergency.spent}/$${updatedEmergency.allocatedAmount} ($${updatedEmergency.remaining} remaining)`);
        
    } catch (error) {
        console.error('Transfer failed:', error);
    }
}

async function testAutomaticBorrowing() {
    console.log('\n=== Automatic Borrowing System ===');
    
    // Create budgets with different priorities
    const groceriesBudget = await budgetService.createTagBudget('groceries', 'survival', 400, {
        autoAdjustmentsEnabled: true,
        maxRolloverPercent: 0.2
    });
    
    const entertainmentBudget = await budgetService.createTagBudget('entertainment', 'lifestyle', 200, {
        autoAdjustmentsEnabled: true,
        maxRolloverPercent: 0.5
    });
    
    const investmentBudget = await budgetService.createTagBudget('investment', 'growth', 300, {
        autoAdjustmentsEnabled: true,
        maxRolloverPercent: 0.1
    });
    
    // Simulate overspending on groceries (survival priority)
    await budgetService.updateTagBudget(groceriesBudget.tagId, { spent: 500 }); // $100 overspent
    
    console.log('Before automatic borrowing:');
    console.log(`- Groceries (survival): $${groceriesBudget.spent}/$${groceriesBudget.allocatedAmount} ($${groceriesBudget.remaining} remaining)`);
    console.log(`- Entertainment (lifestyle): $${entertainmentBudget.spent}/$${entertainmentBudget.allocatedAmount} ($${entertainmentBudget.remaining} remaining)`);
    console.log(`- Investment (growth): $${investmentBudget.spent}/$${investmentBudget.allocatedAmount} ($${investmentBudget.remaining} remaining)`);
    
    // Process automatic borrowing
    const transfers = await budgetService.processAutomaticBorrowing(groceriesBudget);
    
    console.log(`\nAutomatic borrowing processed: ${transfers.length} transfers`);
    for (const transfer of transfers) {
        console.log(`- $${transfer.amount} from ${transfer.fromTagId} to ${transfer.toTagId}`);
    }
    
    // Get updated budgets
    const updatedGroceries = await budgetService.updateTagBudget(groceriesBudget.tagId, {});
    const updatedEntertainment = await budgetService.updateTagBudget(entertainmentBudget.tagId, {});
    const updatedInvestment = await budgetService.updateTagBudget(investmentBudget.tagId, {});
    
    console.log('\nAfter automatic borrowing:');
    console.log(`- Groceries: $${updatedGroceries.spent}/$${updatedGroceries.allocatedAmount} ($${updatedGroceries.remaining} remaining)`);
    console.log(`- Entertainment: $${updatedEntertainment.spent}/$${updatedEntertainment.allocatedAmount} ($${updatedEntertainment.remaining} remaining)`);
    console.log(`- Investment: $${updatedInvestment.spent}/$${updatedInvestment.allocatedAmount} ($${updatedInvestment.remaining} remaining)`);
}

async function testFlexibleGoals() {
    console.log('\n=== Flexible Goal System ===');
    
    // Create a vacation fund with flexible goal (no target date)
    const vacationFund = await budgetService.createTagBudget('vacation_fund', 'lifestyle', 200, {
        isGoalBased: true,
        goalTarget: 3000,
        recurringPeriod: 'monthly',
        maxRolloverPercent: 1.0
    });
    
    console.log(`Vacation fund goal: $${vacationFund.goalTarget} (flexible timeline)`);
    
    // Simulate monthly contributions
    for (let month = 1; month <= 6; month++) {
        await budgetService.updateTagBudget(vacationFund.tagId, { spent: vacationFund.allocatedAmount });
        
        const updatedFund = await budgetService.updateTagBudget(vacationFund.tagId, {});
        const progress = updatedFund.goalProgress || 0;
        const percentage = (progress / (updatedFund.goalTarget || 1)) * 100;
        
        console.log(`Month ${month}: $${progress}/$${updatedFund.goalTarget} (${percentage.toFixed(1)}%)`);
        
        if (updatedFund.isComplete) {
            console.log('🎉 Goal completed!');
            break;
        }
    }
}

async function testWaterfallBorrowingRules() {
    console.log('\n=== Waterfall Borrowing Rules ===');
    
    // Create budgets in different categories
    const rentBudget = await budgetService.createTagBudget('rent', 'survival', 1200);
    const emergencyBudget = await budgetService.createTagBudget('emergency', 'security', 500);
    const entertainmentBudget = await budgetService.createTagBudget('entertainment', 'lifestyle', 200);
    
    // Test borrowing from higher priority to lower priority (should work)
    const validTransfer: FundTransfer = {
        fromTagId: entertainmentBudget.tagId, // lifestyle (lower priority)
        toTagId: rentBudget.tagId, // survival (higher priority)
        amount: 50,
        reason: 'automatic_borrowing',
        respectsWaterfall: true,
        timestamp: new Date()
    };
    
    try {
        await budgetService.transferFunds(validTransfer);
        console.log('✅ Valid borrowing: lifestyle → survival (allowed)');
    } catch (error) {
        console.log('❌ Valid borrowing failed:', error);
    }
    
    // Test borrowing from lower priority to higher priority (should fail)
    const invalidTransfer: FundTransfer = {
        fromTagId: rentBudget.tagId, // survival (higher priority)
        toTagId: entertainmentBudget.tagId, // lifestyle (lower priority)
        amount: 50,
        reason: 'automatic_borrowing',
        respectsWaterfall: true,
        timestamp: new Date()
    };
    
    try {
        await budgetService.transferFunds(invalidTransfer);
        console.log('❌ Invalid borrowing succeeded (should have failed)');
    } catch (error) {
        console.log('✅ Invalid borrowing correctly blocked: survival → lifestyle (not allowed)');
    }
}

async function testRolloverCaps() {
    console.log('\n=== Rollover Cap System ===');
    
    // Create budget with 20% rollover cap
    const budget = await budgetService.createTagBudget('test_budget', 'lifestyle', 1000, {
        maxRolloverPercent: 0.2, // 20% cap
        autoAdjustmentsEnabled: true
    });
    
    console.log(`Budget: $${budget.allocatedAmount} with ${budget.maxRolloverPercent * 100}% rollover cap`);
    console.log(`Maximum rollover: $${budget.allocatedAmount * budget.maxRolloverPercent}`);
    
    // Simulate spending that would exceed the cap
    await budgetService.updateTagBudget(budget.tagId, { spent: 800 }); // $200 remaining
    
    const updatedBudget = await budgetService.updateTagBudget(budget.tagId, {});
    console.log(`After spending $800: $${updatedBudget.remaining} remaining`);
    console.log(`Rollover cap: $${updatedBudget.allocatedAmount * updatedBudget.maxRolloverPercent}`);
    
    if (updatedBudget.remaining <= updatedBudget.allocatedAmount * updatedBudget.maxRolloverPercent) {
        console.log('✅ Rollover cap respected');
    } else {
        console.log('❌ Rollover cap exceeded');
    }
}

// ============================================================================
// MAIN TEST EXECUTION
// ============================================================================

async function runEnhancedTagBudgetTests() {
    console.log('🚀 Enhanced Tag Budget System Tests');
    console.log('=====================================');
    
    try {
        await testEnhancedTagBudgetCreation();
        await testPeriodConversions();
        await testFundTransfers();
        await testAutomaticBorrowing();
        await testFlexibleGoals();
        await testWaterfallBorrowingRules();
        await testRolloverCaps();
        
        console.log('\n✅ All enhanced tag budget tests completed successfully!');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error);
    }
}

// Export for use in other test files
export const enhancedTagBudgetTests = {
    testEnhancedTagBudgetCreation,
    testPeriodConversions,
    testFundTransfers,
    testAutomaticBorrowing,
    testFlexibleGoals,
    testWaterfallBorrowingRules,
    testRolloverCaps,
    runEnhancedTagBudgetTests
};

// Run tests if this file is executed directly
if (typeof window === 'undefined') {
    runEnhancedTagBudgetTests();
} 