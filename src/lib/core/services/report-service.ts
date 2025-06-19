import { readable } from 'svelte/store';
import { accountService } from './account-service';
import { transactionService } from './transaction-service.svelte';
import { categoryService } from './category-service';
import { budgetService } from './budget-service';
import type { Category } from '$lib/core/models/types';

class ReportService {
    // Get net worth trend over time
    getNetWorthTrend(start: Date, end: Date) {
        return readable<{ date: string; value: number }[]>([], (set) => {
            const loadData = async () => {
                const accounts = await accountService.getAccounts();
                const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                const data: { date: string; value: number }[] = [];

                for (let i = 0; i <= days; i++) {
                    const date = new Date(start);
                    date.setDate(date.getDate() + i);
                    const dateStr = date.toISOString().split('T')[0];

                    let total = 0;
                    for (const account of accounts) {
                        const balance = await accountService.getAccountBalance(account.id);
                        total += balance;
                    }

                    data.push({ date: dateStr, value: total });
                }

                set(data);
            };

            loadData();
            return () => {};
        });
    }

    // Get income vs expense comparison
    getIncomeVsExpense(start: Date, end: Date) {
        return readable<{ income: number; expense: number }>({ income: 0, expense: 0 }, (set) => {
            const loadData = async () => {
                const income = await transactionService.getTotalByType('income');
                const expense = await transactionService.getTotalByType('expense');
                set({ income, expense });
            };

            loadData();
            return () => {};
        });
    }

    // Get top spending categories
    getTopSpendingCategories(limit: number) {
        return readable<{ category: Category; amount: number }[]>([], (set) => {
            const loadData = async () => {
                const categories = (await categoryService.getCategories()).filter(c => c.type === 'expense');
                const results = await Promise.all(
                    categories.map(async (category) => {
                        const transactions = await transactionService.getTransactionsByCategory(category.id);
                        const amount = transactions.reduce((sum, tx) => sum + (tx.clearedAmount || 0), 0);
                        return { category, amount };
                    })
                );

                set(results
                    .sort((a, b) => b.amount - a.amount)
                    .slice(0, limit)
                );
            };

            loadData();
            return () => {};
        });
    }

    // Export data to CSV
    async exportToCSV(dataType: 'transactions' | 'budgets'): Promise<void> {
        let headers: string[] = [];
        let rows: string[][] = [];

        if (dataType === 'transactions') {
            const transactions = await transactionService.getTransactions();
            headers = ['Date', 'Description', 'Amount', 'Account', 'Category'];
            rows = transactions.map(async tx => [
                tx.pendingDate,
                tx.description || '',
                (tx.clearedAmount || tx.pendingAmount || 0).toString(),
                ((await accountService.getAccountById(tx.accountId)))?.name || '',
                tx.categoryId ? (await categoryService.getCategoryById(tx.categoryId))?.name || '' : ''
            ]);
        } else if (dataType === 'budgets') {
            const report = await budgetService.generateBudgetReport(
                new Date(new Date().getFullYear(), 0, 1),
                new Date()
            );
            headers = ['Category', 'Budgeted', 'Spent', 'Remaining'];
            rows = report.categories.map(item => [
                item.category.name,
                item.budgeted.toString(),
                item.spent.toString(),
                item.remaining.toString()
            ]);
        }

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `${dataType}_export_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

export const reportService = new ReportService();