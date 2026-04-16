import { addMonths } from 'date-fns';
import { db, generateUUID } from '$lib/core/db';
import type { Account, Transaction } from '$lib/core/db';

class LoanAmortizationService {
	private computeMonthlyPayment(principal: number, annualRate: number, termMonths: number): number {
		if (termMonths <= 0) return principal;
		const monthlyRate = annualRate / 100 / 12;
		if (monthlyRate === 0) return principal / termMonths;
		return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths));
	}

	async generateSchedule(account: Account): Promise<Transaction[]> {
		if (account.type !== 'loan' || !account.loanDetails) return [];
		const { principal, annualRate, termMonths, startDate } = account.loanDetails;
		const monthlyPayment = this.computeMonthlyPayment(principal, annualRate, termMonths);
		const existingCategory = await db.categories
			.where('name')
			.equalsIgnoreCase('Loan Repayments')
			.first();
		const categoryId = existingCategory?.id;
		const start = new Date(startDate);
		const created: Transaction[] = [];
		for (let i = 0; i < termMonths; i++) {
			const plannedDate = addMonths(start, i).toISOString();
			const tx: Transaction = {
				id: generateUUID(),
				type: 'expense',
				status: 'planned',
				accountId: account.id,
				amount: monthlyPayment,
				currency: account.currency,
				description: `Loan repayment ${i + 1}/${termMonths}`,
				categoryId,
				plannedDate,
				reference: `loan_schedule:${account.id}:${i + 1}`,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				deletedAt: null
			};
			await db.transactions.add(tx);
			created.push(tx);
		}
		return created;
	}

	async recalculateSchedule(account: Account, extraPayment: number = 0): Promise<Transaction[]> {
		if (account.type !== 'loan' || !account.loanDetails) return [];
		const now = new Date();
		const oldFuture = await db.transactions
			.where('reference')
			.startsWith(`loan_schedule:${account.id}:`)
			.filter((tx) => tx.status === 'planned' && !!tx.plannedDate && new Date(tx.plannedDate) >= now)
			.toArray();
		for (const tx of oldFuture) {
			await db.transactions.update(tx.id, {
				deletedAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			});
		}

		const adjusted: Account = {
			...account,
			loanDetails: {
				...account.loanDetails,
				principal: Math.max(0, account.loanDetails.principal - Math.max(0, extraPayment))
			}
		};
		return await this.generateSchedule(adjusted);
	}
}

export const loanAmortizationService = new LoanAmortizationService();
