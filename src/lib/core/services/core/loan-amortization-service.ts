import { addMonths, addWeeks } from 'date-fns';
import { db, generateUUID } from '$lib/core/db';
import type { Account, Transaction } from '$lib/core/db';

export type ActiveLoanObligation = {
	accountId: string;
	label: string;
	balance: number;
	currency: string;
	monthlyPaymentPace: number;
	lastScheduleDate: string | null;
	originalPrincipal: number;
};

class LoanAmortizationService {
	private computeMonthlyPayment(
		principal: number,
		annualRate: number,
		termMonths: number
	): number {
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
			.filter(
				(tx) =>
					tx.status === 'planned' && !!tx.plannedDate && new Date(tx.plannedDate) >= now
			)
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

	/** Read-only: active loan accounts with remaining balance and schedule metadata. */
	async getActiveObligations(): Promise<ActiveLoanObligation[]> {
		const accounts = await db.getActiveAccounts();
		const loanAccounts = accounts.filter((a) => a.type === 'loan' && a.loanDetails != null);
		if (loanAccounts.length === 0) return [];

		const obligations: ActiveLoanObligation[] = [];
		for (const account of loanAccounts) {
			const mapped = await this.mapAccountToObligation(account);
			if (mapped && mapped.balance > 0.005) obligations.push(mapped);
		}
		return obligations;
	}

	private async mapAccountToObligation(account: Account): Promise<ActiveLoanObligation | null> {
		if (account.type !== 'loan' || !account.loanDetails) return null;
		const { principal, annualRate, termMonths } = account.loanDetails;
		const monthlyPaymentPace = this.computeMonthlyPayment(principal, annualRate, termMonths);

		const scheduleTxs = await db.transactions
			.where('reference')
			.startsWith(`loan_schedule:${account.id}:`)
			.filter((tx) => !tx.deletedAt && tx.status === 'planned')
			.toArray();

		const futureSchedule = scheduleTxs
			.filter((tx) => tx.plannedDate && new Date(tx.plannedDate) >= new Date())
			.sort(
				(a, b) => new Date(a.plannedDate!).getTime() - new Date(b.plannedDate!).getTime()
			);

		let balance: number;
		let lastScheduleDate: string | null = null;

		if (futureSchedule.length > 0) {
			balance = futureSchedule.reduce((sum, tx) => sum + (tx.amount ?? 0), 0);
			lastScheduleDate = futureSchedule.at(-1)?.plannedDate ?? null;
		} else {
			const payments = await db.transactions
				.where('accountId')
				.equals(account.id)
				.filter(
					(tx) =>
						!tx.deletedAt &&
						tx.type === 'expense' &&
						tx.status === 'cleared' &&
						(tx.reference?.startsWith(`loan_schedule:${account.id}:`) ?? false)
				)
				.toArray();
			const paid = payments.reduce((sum, tx) => sum + (tx.amount ?? 0), 0);
			balance = Math.max(0, principal - paid);
		}

		return {
			accountId: account.id,
			label: account.name,
			balance,
			currency: account.currency,
			monthlyPaymentPace,
			lastScheduleDate,
			originalPrincipal: principal
		};
	}

	/**
	 * Project ISO clearance date from balance and weekly surplus.
	 * Uses last schedule date when surplus covers monthly payment pace; else extrapolates.
	 */
	projectClearanceDate(
		balance: number,
		weeklySurplus: number,
		opts?: { lastScheduleDate?: string | null; monthlyPaymentPace?: number }
	): string | null {
		if (balance <= 0.005) return new Date().toISOString();
		const monthlyPace = opts?.monthlyPaymentPace ?? 0;
		const weeklyPaceNeeded = monthlyPace / 4.33;
		if (
			opts?.lastScheduleDate &&
			weeklySurplus >= weeklyPaceNeeded - 0.005 &&
			weeklyPaceNeeded > 0
		) {
			return opts.lastScheduleDate;
		}
		if (weeklySurplus <= 0.005) return null;
		const weeks = balance / weeklySurplus;
		return addWeeks(new Date(), weeks).toISOString();
	}
}

export const loanAmortizationService = new LoanAmortizationService();
