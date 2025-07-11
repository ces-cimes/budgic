import { db } from './db';
import { budgetService } from './services/budget-service';

async function testAbsoluteBudgetSystem() {
    console.log('Testing Absolute Amount Waterfall Budget System...');

    try {
        // Initialize the database
        await db.open();

        // Test 1: Calculate optimal allocations for different income levels
        console.log('\n1. Testing income-based allocations...');
        
        const testIncomes = [2500, 5000, 10000];
        
        for (const income of testIncomes) {
            console.log(`\nIncome: $${income}/month`);
            const allocations = await budgetService.calculateOptimalAllocations(income, []);
            
            console.log('  Survival:', {
                allocated: allocations.survival.amount,
                target: allocations.survival.targetAmount,
                complete: allocations.survival.isComplete
            });
            
            console.log('  Security:', {
                allocated: allocations.security.amount,
                target: allocations.security.targetAmount,
                complete: allocations.security.isComplete
            });
            
            console.log('  Growth:', {
                allocated: allocations.growth.amount,
                target: allocations.growth.targetAmount,
                complete: allocations.growth.isComplete
            });
            
            console.log('  Lifestyle:', {
                allocated: allocations.lifestyle.amount,
                target: allocations.lifestyle.targetAmount,
                complete: allocations.lifestyle.isComplete
            });
            
            const total = allocations.survival.amount + allocations.security.amount + 
                         allocations.growth.amount + allocations.lifestyle.amount;
            console.log(`  Total: $${total} (${total <= income ? '✅' : '❌'} within income)`);
        }

        // Test 2: Create why tags with waterfall categories
        console.log('\n2. Creating why tags with waterfall categories...');
        
        const whyTags = [
            { name: 'essential', category: 'survival' as const },
            { name: 'emergency', category: 'survival' as const },
            { name: 'health', category: 'survival' as const },
            { name: 'savings', category: 'security' as const },
            { name: 'investment', category: 'growth' as const },
            { name: 'education', category: 'growth' as const },
            { name: 'entertainment', category: 'lifestyle' as const },
            { name: 'convenience', category: 'lifestyle' as const }
        ];

        for (const { name, category } of whyTags) {
            await budgetService.createWhyTag(name, category);
            console.log(`  Created: ${name} -> ${category}`);
        }

        // Test 3: Get why tags with categories
        console.log('\n3. Getting why tags with categories...');
        const whyTagsWithCategories = await budgetService.getWhyTagsWithCategories();
        console.log('Why tags with categories:', whyTagsWithCategories);

        // Test 4: Allocate budget to why tags
        console.log('\n4. Allocating budget to why tags...');
        const income = 5000;
        const allocations = await budgetService.calculateOptimalAllocations(income, []);
        const categoryBudgets = await budgetService.allocateToWhyTags(income, allocations);
        
        console.log('Category budgets:', categoryBudgets.map(budget => ({
            category: budget.waterfallCategory,
            totalAllocated: budget.totalAllocated,
            whyTagCount: budget.whyTagAllocations.size
        })));

        // Test 5: Generate recommendations and insights
        console.log('\n5. Generating recommendations and insights...');
        const recommendations = await budgetService.generateRecommendations(categoryBudgets);
        const insights = await budgetService.generateInsights(categoryBudgets);
        
        console.log('Recommendations:', recommendations.length);
        console.log('Insights:', insights.length);

        console.log('\n✅ Absolute budget system test completed successfully!');

    } catch (error) {
        console.error('❌ Absolute budget system test failed:', error);
        console.error('Error details:', {
            name: (error as Error).name,
            message: (error as Error).message,
            stack: (error as Error).stack
        });
        throw error;
    }
}

// Run the test if this file is executed directly
if (typeof window === 'undefined') {
    testAbsoluteBudgetSystem().catch(console.error);
}

export { testAbsoluteBudgetSystem }; 