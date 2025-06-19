import { persistentStore } from '$lib/core/persistence.svelte';
import type { BudgetReport, CategoryBudget } from '$lib/core/models/types';
import { transactionService } from './transaction-service.svelte';
import { categoryService } from './category-service';

class BudgetService {
    private _store = persistentStore<Record<string, CategoryBudget>, 'id'>(
        'budgets',
        {},
        {
            isCollection: false,
            validate: (data) => typeof data === 'object'
        }
    );

    // Set budget for a category
    async setCategoryBudget(categoryId: string, amount: number): Promise<void> {
        const budgets = this._store.value;
        budgets[categoryId] = {
            categoryId,
            amount,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        await this._store.set(budgets);
    }

    // Get spending for a category in a specific month
    async getSpendingForCategory(categoryId: string, month: Date): Promise<number> {
        const start = new Date(month.getFullYear(), month.getMonth(), 1);
        const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
        
        const transactions = await transactionService.getTransactionsByCategory(categoryId);
        return transactions
            .filter(tx => {
                const txDate = new Date(tx.plannedDate);
                return txDate >= start && txDate <= end;
            })
            .reduce((sum, tx) => sum + (tx.actualAmount || tx.plannedAmount || 0), 0);
    }

    // Get remaining budget for a category
    async getRemainingBudget(categoryId: string): Promise<number> {
        const budget = this._store.value[categoryId];
        if (!budget) return 0;
        
        const spent = await this.getSpendingForCategory(categoryId, new Date());
        return budget.amount - spent;
    }

    // Generate budget report for a date range
    async generateBudgetReport(start: Date, end: Date): Promise<BudgetReport> {
        const budgets = this._store.value;
        const report: BudgetReport = {
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            categories: []
        };

        for (const categoryId in budgets) {
            const category = await categoryService.getCategoryById(categoryId);
            if (!category) continue;
            
            const spent = await this.getSpendingForCategory(categoryId, end);
            report.categories.push({
                category,
                budgeted: budgets[categoryId].amount,
                spent,
                remaining: budgets[categoryId].amount - spent
            });
        }

        return report;
    }
}

export const budgetService = new BudgetService();