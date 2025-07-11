import { db } from './db';
import { budgetService } from './services/budget-service';
import { tagService } from './services/tag-service';
import { priorityLevelMappingService } from './services/priority-level-mapping-service';

async function testBudgetService() {
    console.log('Testing BudgetService...');

    try {
        // Initialize the database
        await db.open();

        // Test 1: Create why tags with waterfall categories
        console.log('\n1. Creating why tags with waterfall categories...');
        
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
            console.log(`  Created why tag: ${name} -> ${category}`);
        }

        // Test 2: Get why tags with categories
        console.log('\n2. Getting why tags with categories...');
        const whyTagsWithCategories = await budgetService.getWhyTagsWithCategories();
        console.log('Why tags with categories:', whyTagsWithCategories);

        // Test 3: Calculate optimal allocations
        console.log('\n3. Calculating optimal allocations...');
        const income = 5000;
        const allocations = await budgetService.calculateOptimalAllocations(income, []);
        console.log('Budget allocations:', allocations);

        // Test 4: Allocate to why tags
        console.log('\n4. Allocating budget to why tags...');
        const categoryBudgets = await budgetService.allocateToWhyTags(income, allocations);
        console.log('Category budgets:', categoryBudgets.map(budget => ({
            category: budget.waterfallCategory,
            totalAllocated: budget.totalAllocated,
            whyTagCount: budget.whyTagAllocations.size
        })));

        // Test 5: Generate recommendations
        console.log('\n5. Generating recommendations...');
        const recommendations = await budgetService.generateRecommendations(categoryBudgets);
        console.log('Recommendations:', recommendations);

        // Test 6: Generate insights
        console.log('\n6. Generating insights...');
        const insights = await budgetService.generateInsights(categoryBudgets);
        console.log('Insights:', insights);

        console.log('\n✅ BudgetService tests completed successfully!');

    } catch (error) {
        console.error('❌ BudgetService test failed:', error);
    } finally {
        await db.close();
    }
}

// Run the test if this file is executed directly
if (typeof window === 'undefined') {
    testBudgetService();
}

export { testBudgetService }; 