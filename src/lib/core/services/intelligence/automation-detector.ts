import { db } from '$lib/core/db';
import type { Account, Transaction } from '$lib/core/db';

export interface AutomationDetectionSummary {
	roundUpCount: number;
	roundUpAmount: number;
	interestCount: number;
	interestAmount: number;
	reconciliationAdjustmentCount: number;
}

const INTEREST_REGEX = /interest|interés|zinsen|процент|ставка|проц/i;

class AutomationDetector {
	constructor(private readonly microAmountThreshold: number = 10) {}

	async detect(transactions: Transaction[]): Promise<Transaction[]> {
		if (!transactions.length) return transactions;
		const byId = new Map(transactions.map((tx) => [tx.id, { ...tx }]));
		const accounts = await db.getActiveAccounts();
		const accountById = new Map(accounts.map((a) => [a.id, a]));

		this.applyRoundUpPairDetection(byId, accountById);
		this.applyMicroInterestDetection(byId);

		return Array.from(byId.values());
	}

	summarize(transactions: Transaction[]): AutomationDetectionSummary {
		return transactions.reduce<AutomationDetectionSummary>(
			(acc, tx) => {
				const amount = Math.abs(tx.amount || 0);
				if (tx.automation === 'round-up') {
					acc.roundUpCount += 1;
					acc.roundUpAmount += amount;
				} else if (
					tx.automation === 'interest-income' ||
					tx.automation === 'interest-charge'
				) {
					acc.interestCount += 1;
					acc.interestAmount += amount;
				} else if (tx.automation === 'reconciliation-adjustment') {
					acc.reconciliationAdjustmentCount += 1;
				}
				return acc;
			},
			{
				roundUpCount: 0,
				roundUpAmount: 0,
				interestCount: 0,
				interestAmount: 0,
				reconciliationAdjustmentCount: 0
			}
		);
	}

	private applyRoundUpPairDetection(
		byId: Map<string, Transaction>,
		accountById: Map<string, Account>
	): void {
		const txs = Array.from(byId.values());
		const expenses = txs.filter(
			(tx) => tx.type === 'expense' && tx.clearedDate && !!tx.accountId
		);
		const transfers = txs.filter(
			(tx) =>
				tx.type === 'transfer' &&
				tx.transferDetails?.toAccountId &&
				tx.clearedDate &&
				!!tx.accountId
		);

		for (const expense of expenses) {
			const expenseTs = Date.parse(expense.clearedDate!);
			if (Number.isNaN(expenseTs)) continue;
			const expenseAmount = Math.abs(expense.amount || 0);
			const roundUpDelta = Math.ceil(expenseAmount) - expenseAmount;
			if (!(roundUpDelta > 0 && roundUpDelta < 1)) continue;

			const match = transfers.find((transfer) => {
				if (transfer.accountId !== expense.accountId) return false;
				const toAccountId = transfer.transferDetails?.toAccountId;
				if (!toAccountId) return false;
				const destination = accountById.get(toAccountId);
				if (
					!destination ||
					(destination.type !== 'savings' && destination.type !== 'investment')
				)
					return false;
				const transferTs = Date.parse(transfer.clearedDate!);
				if (Number.isNaN(transferTs)) return false;
				// Allow small clock / ordering skew between purchase and round-up transfer (up to 5 minutes).
				if (Math.abs(transferTs - expenseTs) > 300_000) return false;
				const transferAmount = Math.abs(
					transfer.transferDetails?.transferAmount ?? transfer.amount ?? 0
				);
				return Math.abs(transferAmount - roundUpDelta) < 0.01;
			});

			if (!match) continue;
			const nextExpense = byId.get(expense.id);
			const nextTransfer = byId.get(match.id);
			if (nextExpense) nextExpense.automation = 'round-up';
			if (nextTransfer) nextTransfer.automation = 'round-up';
		}
	}

	private applyMicroInterestDetection(byId: Map<string, Transaction>): void {
		const txs = Array.from(byId.values()).filter((tx) => tx.clearedDate);
		const groupedByAccount = new Map<string, Transaction[]>();
		for (const tx of txs) {
			if (!tx.accountId) continue;
			const arr = groupedByAccount.get(tx.accountId) ?? [];
			arr.push(tx);
			groupedByAccount.set(tx.accountId, arr);
		}

		for (const accountTxs of groupedByAccount.values()) {
			const candidates = accountTxs.filter((tx) => {
				const amount = Math.abs(tx.amount || 0);
				const desc = tx.description ?? '';
				return amount < this.microAmountThreshold && INTEREST_REGEX.test(desc);
			});
			if (candidates.length < 3) continue;

			const byDescription = new Map<string, Transaction[]>();
			for (const tx of candidates) {
				const key = (tx.description || '').trim().toLowerCase();
				const arr = byDescription.get(key) ?? [];
				arr.push(tx);
				byDescription.set(key, arr);
			}

			for (const descGroup of byDescription.values()) {
				const within30d = descGroup.filter((tx) => {
					const base = Date.parse(tx.clearedDate!);
					if (Number.isNaN(base)) return false;
					return descGroup.some((other) => {
						if (other.id === tx.id) return false;
						const ts = Date.parse(other.clearedDate!);
						return !Number.isNaN(ts) && Math.abs(ts - base) <= 30 * 24 * 60 * 60 * 1000;
					});
				});
				if (within30d.length < 3) continue;

				for (const tx of within30d) {
					const next = byId.get(tx.id);
					if (!next) continue;
					next.automation = (tx.amount || 0) >= 0 ? 'interest-income' : 'interest-charge';
				}
			}
		}
	}
}

export const automationDetector = new AutomationDetector();
