import { db, generateUUID } from '$lib/core/db';
import type { RoundUpRule, Transaction } from '$lib/core/db';

class RoundUpService {
	computeRoundUp(amount: number, rule: RoundUpRule): number {
		switch (rule.method) {
			case 'nearest-1':
				return Math.ceil(amount) - amount;
			case 'nearest-10':
				return Math.ceil(amount / 10) * 10 - amount;
			case 'nearest-100':
				return Math.ceil(amount / 100) * 100 - amount;
			case 'fixed':
				return rule.methodParam ?? 0;
			case 'percentage':
				return amount * (rule.methodParam ?? 0);
			case 'multiplier':
				return (Math.ceil(amount) - amount) * (rule.methodParam ?? 1);
			default:
				return 0;
		}
	}

	private periodKey(mode: RoundUpRule['batchMode'], date: Date): string {
		const d = new Date(date);
		if (mode === 'daily') return d.toISOString().slice(0, 10);
		const start = new Date(d);
		const day = start.getUTCDay();
		start.setUTCDate(start.getUTCDate() - day);
		return start.toISOString().slice(0, 10);
	}

	async applyRulesForExpense(expenseTx: Transaction): Promise<void> {
		if (expenseTx.type !== 'expense' || expenseTx.status !== 'cleared' || !expenseTx.accountId) return;
		const rules = await db.roundUpRules
			.where('sourceAccountId')
			.equals(expenseTx.accountId)
			.filter((rule) => rule.isActive)
			.toArray();
		if (rules.length === 0) return;

		const expenseAmount = Math.abs(expenseTx.amount ?? 0);
		for (const rule of rules) {
			const computed = this.computeRoundUp(expenseAmount, rule);
			if (computed < (rule.minimumTransferAmount ?? 0.01)) continue;
			if (rule.batchMode === 'per-transaction') {
				await this.createRoundUpTransfer(expenseTx, rule, computed, undefined);
				continue;
			}
			const key = this.periodKey(rule.batchMode, new Date(expenseTx.clearedDate ?? expenseTx.createdAt));
			await this.upsertBatchTransfer(expenseTx, rule, computed, key);
		}
	}

	private async upsertBatchTransfer(
		expenseTx: Transaction,
		rule: RoundUpRule,
		amount: number,
		periodKey: string
	): Promise<void> {
		const reference = `roundup:${rule.id}:${periodKey}`;
		const existing = await db.transactions
			.where('reference')
			.equals(reference)
			.filter((tx) => tx.status === 'cleared' && tx.type === 'transfer' && !tx.deletedAt)
			.first();
		if (!existing) {
			await this.createRoundUpTransfer(expenseTx, rule, amount, periodKey);
			return;
		}
		const nextAmount = Math.abs(existing.transferDetails?.transferAmount ?? existing.amount ?? 0) + amount;
		await db.transactions.update(existing.id, {
			amount: -nextAmount,
			transferDetails: {
				...existing.transferDetails!,
				transferAmount: nextAmount
			},
			updatedAt: new Date().toISOString()
		});
	}

	private async createRoundUpTransfer(
		expenseTx: Transaction,
		rule: RoundUpRule,
		amount: number,
		periodKey?: string
	): Promise<void> {
		const now = new Date().toISOString();
		await db.transactions.add({
			id: generateUUID(),
			type: 'transfer',
			status: 'cleared',
			accountId: rule.sourceAccountId,
			toAccountId: rule.targetAccountId,
			amount: -amount,
			currency: expenseTx.currency,
			description: 'Round-up savings',
			automation: 'round-up',
			clearedDate: now,
			reference: periodKey ? `roundup:${rule.id}:${periodKey}` : `roundup:${rule.id}:${expenseTx.id}`,
			transferDetails: {
				toAccountId: rule.targetAccountId,
				transferAmount: amount,
				feeAmount: 0
			},
			createdAt: now,
			updatedAt: now,
			deletedAt: null
		});
	}
}

export const roundUpService = new RoundUpService();
