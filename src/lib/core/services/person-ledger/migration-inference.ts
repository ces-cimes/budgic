import { db, generateUUID } from '$lib/core/db';
import type { Person, ReimbursementEntry, Transaction } from '$lib/core/db';
import { accountService } from '$lib/core/services/core/account-service';
import { transactionService } from '$lib/core/services/core/transaction-service';
import type {
	MigrationProposal,
	ProposalConfidence,
	ProposalKind,
	SettlementCandidate
} from './types';

const DATE_TOLERANCE_MS = 3 * 86400000;
const AMOUNT_TOLERANCE = 0.02;
const DUPLICATE_DATE_TOLERANCE_MS = 5 * 86400000;

export type InferProposalsParams = {
	ledgerAccountId: string;
	anchorAccountId: string;
	person: Person;
};

export type ProposalsByConfidence = {
	high: MigrationProposal[];
	medium: MigrationProposal[];
	low: MigrationProposal[];
};

function absAmount(tx: Transaction): number {
	return Math.abs(tx.transferDetails?.transferAmount ?? tx.amount ?? 0);
}

function txDate(tx: Transaction): number {
	const d = tx.clearedDate || tx.plannedDate || tx.createdAt;
	return new Date(d).getTime();
}

function amountsMatch(a: number, b: number): boolean {
	return Math.abs(a - b) <= AMOUNT_TOLERANCE;
}

function datesMatch(a: Transaction, b: Transaction): boolean {
	return Math.abs(txDate(a) - txDate(b)) <= DATE_TOLERANCE_MS;
}

function transferDestId(tx: Transaction): string | undefined {
	return tx.transferDetails?.toAccountId ?? tx.toAccountId;
}

function personMatchesReimbursement(
	reimbursement: ReimbursementEntry,
	person: Person
): boolean {
	if (reimbursement.personId && reimbursement.personId === person.id) return true;
	const name = reimbursement.person?.trim().toLowerCase();
	if (!name) return false;
	if (person.displayName.trim().toLowerCase() === name) return true;
	return (person.aliases ?? []).some((a) => a.trim().toLowerCase() === name);
}

function collectGroupIds(txs: Transaction[]): Map<string, string[]> {
	const byGroup = new Map<string, string[]>();
	for (const tx of txs) {
		if (!tx.groupId) continue;
		const list = byGroup.get(tx.groupId) ?? [];
		list.push(tx.id);
		byGroup.set(tx.groupId, list);
	}
	return byGroup;
}

function expandSourceIds(
	tx: Transaction,
	groupMap: Map<string, string[]>,
	consumed: Set<string>
): string[] {
	if (tx.groupId) {
		const ids = groupMap.get(tx.groupId) ?? [tx.id];
		return ids.filter((id) => !consumed.has(id));
	}
	return consumed.has(tx.id) ? [] : [tx.id];
}

function findDuplicateExpecting(
	anchorTxs: Transaction[],
	person: Person,
	amount: number,
	currency: string,
	referenceDate: number
): { transactionId: string; reimbursementId: string } | null {
	for (const tx of anchorTxs) {
		for (const r of tx.reimbursements ?? []) {
			if (r.status !== 'expecting' || r.currency !== currency) continue;
			if (!personMatchesReimbursement(r, person)) continue;
			if (!amountsMatch(r.amount, amount)) continue;
			const rDate = new Date(tx.clearedDate || tx.createdAt).getTime();
			if (Math.abs(rDate - referenceDate) > DUPLICATE_DATE_TOLERANCE_MS) continue;
			return { transactionId: tx.id, reimbursementId: r.id };
		}
	}
	return null;
}

function rankSettlementCandidates(
	anchorTxs: Transaction[],
	person: Person,
	amount: number,
	currency: string
): SettlementCandidate[] {
	const open: Array<SettlementCandidate & { dateMs: number }> = [];
	for (const tx of anchorTxs) {
		const clearedDate = tx.clearedDate || tx.createdAt;
		for (const r of tx.reimbursements ?? []) {
			if (r.status !== 'expecting' || r.currency !== currency) continue;
			if (!personMatchesReimbursement(r, person)) continue;
			open.push({
				transactionId: tx.id,
				reimbursementId: r.id,
				label: `${tx.description || 'Transaction'} · ${r.amount} ${r.currency}`,
				clearedDate,
				dateMs: new Date(clearedDate).getTime()
			});
		}
	}
	open.sort((a, b) => a.dateMs - b.dateMs);
	return open.map(({ dateMs: _d, ...rest }) => rest);
}

function confidenceFromTransferMatch(
	ledgerTx: Transaction,
	walletTx: Transaction | undefined,
	amountMatch: boolean
): ProposalConfidence {
	if (walletTx && amountMatch && datesMatch(ledgerTx, walletTx)) return 'high';
	if (amountMatch) return 'medium';
	return 'low';
}

export function groupProposalsByConfidence(proposals: MigrationProposal[]): ProposalsByConfidence {
	const high: MigrationProposal[] = [];
	const medium: MigrationProposal[] = [];
	const low: MigrationProposal[] = [];
	for (const p of proposals) {
		if (p.confidence === 'high') high.push(p);
		else if (p.confidence === 'medium') medium.push(p);
		else low.push(p);
	}
	return { high, medium, low };
}

export async function inferProposalsForLedger(
	params: InferProposalsParams
): Promise<MigrationProposal[]> {
	const { ledgerAccountId, anchorAccountId, person } = params;
	const [ledgerTxs, anchorTxs, walletAccounts, relatedTxs] = await Promise.all([
		transactionService.getTransactionsByAccount(ledgerAccountId),
		transactionService.getTransactionsByAccount(anchorAccountId),
		accountService.getWalletAccounts(),
		db.getTransactionsRelatedToAccount(ledgerAccountId)
	]);

	const walletIds = new Set(walletAccounts.map((w) => w.id));
	const clearedLedger = ledgerTxs.filter(
		(t) => t.deletedAt == null && t.status === 'cleared'
	);
	const groupMap = collectGroupIds(clearedLedger);
	const consumed = new Set<string>();
	const proposals: MigrationProposal[] = [];

	const walletTransferTxs = relatedTxs.filter(
		(t) =>
			t.deletedAt == null &&
			t.status === 'cleared' &&
			t.type === 'transfer' &&
			t.accountId &&
			walletIds.has(t.accountId) &&
			transferDestId(t) === ledgerAccountId
	);

	function findMatchingWalletToLedger(ledgerTx: Transaction): Transaction | undefined {
		return walletTransferTxs.find(
			(w) =>
				!consumed.has(w.id) &&
				transferDestId(w) === ledgerAccountId &&
				w.currency === ledgerTx.currency &&
				amountsMatch(absAmount(w), absAmount(ledgerTx)) &&
				datesMatch(w, ledgerTx)
		);
	}

	for (const ledgerTx of clearedLedger) {
		if (consumed.has(ledgerTx.id)) continue;

		if (ledgerTx.type === 'transfer') {
			const dest = transferDestId(ledgerTx);

			// Ledger → wallet (repayment leaving person ledger)
			if (dest && walletIds.has(dest)) {
				const amount = absAmount(ledgerTx);
				const walletTx = relatedTxs.find(
					(w) =>
						w.id !== ledgerTx.id &&
						w.accountId === dest &&
						w.type === 'transfer' &&
						w.deletedAt == null &&
						w.status === 'cleared' &&
						w.currency === ledgerTx.currency &&
						amountsMatch(absAmount(w), amount) &&
						datesMatch(w, ledgerTx)
				);
				const sourceIds = expandSourceIds(ledgerTx, groupMap, consumed);
				if (sourceIds.length === 0) continue;
				if (walletTx) consumed.add(walletTx.id);
				for (const id of sourceIds) consumed.add(id);

				const candidates = rankSettlementCandidates(
					anchorTxs,
					person,
					amount,
					ledgerTx.currency
				);

				proposals.push({
					id: generateUUID(),
					kind: 'collapse_transfer_from_ledger',
					confidence: confidenceFromTransferMatch(ledgerTx, walletTx, true),
					sourceTransactionIds: sourceIds,
					groupId: ledgerTx.groupId,
					summary: `Repayment ${amount} ${ledgerTx.currency} from person ledger → wallet`,
					settlementCandidates: candidates,
					selectedSettlementKey:
						candidates.length === 1
							? `${candidates[0].transactionId}::${candidates[0].reimbursementId}`
							: undefined,
					walletTransactionId: walletTx?.id
				});
				continue;
			}

			// Wallet → ledger (paired wallet transfer into this ledger)
			const walletInbound = findMatchingWalletToLedger(ledgerTx);
			if (walletInbound) {
				const amount = absAmount(ledgerTx);
				const dup = findDuplicateExpecting(
					anchorTxs,
					person,
					amount,
					ledgerTx.currency,
					txDate(ledgerTx)
				);
				const sourceIds = expandSourceIds(ledgerTx, groupMap, consumed);
				if (sourceIds.length === 0) continue;
				consumed.add(walletInbound.id);
				for (const id of sourceIds) consumed.add(id);

				proposals.push({
					id: generateUUID(),
					kind: 'collapse_transfer_to_ledger',
					confidence: confidenceFromTransferMatch(ledgerTx, walletInbound, true),
					sourceTransactionIds: sourceIds,
					groupId: ledgerTx.groupId,
					summary: `Wallet → ledger ${amount} ${ledgerTx.currency} as expense + reimbursement`,
					walletTransactionId: walletInbound.id,
					linkExistingTransactionId: dup?.transactionId,
					linkExistingReimbursementId: dup?.reimbursementId,
					conflict: dup
						? 'Matching open reimbursement on anchor — will link instead of creating'
						: undefined
				});
				continue;
			}
		}

		if (ledgerTx.type === 'expense') {
			const amount = Math.abs(ledgerTx.amount ?? 0);
			if (amount <= AMOUNT_TOLERANCE) continue;
			const dup = findDuplicateExpecting(
				anchorTxs,
				person,
				amount,
				ledgerTx.currency,
				txDate(ledgerTx)
			);
			const sourceIds = expandSourceIds(ledgerTx, groupMap, consumed);
			if (sourceIds.length === 0) continue;
			for (const id of sourceIds) consumed.add(id);

			proposals.push({
				id: generateUUID(),
				kind: 'reattach_ledger_expense',
				confidence: dup ? 'medium' : 'medium',
				sourceTransactionIds: sourceIds,
				groupId: ledgerTx.groupId,
				summary: `Move expense ${amount} ${ledgerTx.currency} to anchor with reimbursement`,
				linkExistingTransactionId: dup?.transactionId,
				linkExistingReimbursementId: dup?.reimbursementId,
				conflict: dup ? 'Duplicate expecting on anchor — will skip creating new' : undefined
			});
			continue;
		}

		if (ledgerTx.type === 'income') {
			const amount = Math.abs(ledgerTx.amount ?? 0);
			if (amount <= AMOUNT_TOLERANCE) continue;
			const candidates = rankSettlementCandidates(
				anchorTxs,
				person,
				amount,
				ledgerTx.currency
			);
			const sourceIds = expandSourceIds(ledgerTx, groupMap, consumed);
			if (sourceIds.length === 0) continue;
			for (const id of sourceIds) consumed.add(id);

			let confidence: ProposalConfidence = 'medium';
			if (candidates.length === 1 && amountsMatch(candidates[0] ? amount : 0, amount)) {
				confidence = 'high';
			} else if (candidates.length > 1) {
				confidence = 'low';
			}

			proposals.push({
				id: generateUUID(),
				kind: 'reattach_ledger_income',
				confidence,
				sourceTransactionIds: sourceIds,
				groupId: ledgerTx.groupId,
				summary: `Move income ${amount} ${ledgerTx.currency} to anchor (settle or record)`,
				settlementCandidates: candidates,
				selectedSettlementKey:
					candidates.length === 1
						? `${candidates[0].transactionId}::${candidates[0].reimbursementId}`
						: undefined
			});
		}
	}

	return proposals;
}

/** Balances remaining on ledger after accepted proposals consume source txs. */
export async function estimateResidualBalances(
	ledgerAccountId: string,
	acceptedProposals: MigrationProposal[]
): Promise<Record<string, number>> {
	const consumed = new Set<string>();
	for (const p of acceptedProposals) {
		for (const id of p.sourceTransactionIds) consumed.add(id);
		if (p.walletTransactionId) consumed.add(p.walletTransactionId);
	}

	const txs = await transactionService.getTransactionsByAccount(ledgerAccountId);
	const byCurrency: Record<string, number> = {};

	for (const tx of txs) {
		if (tx.deletedAt != null || tx.status !== 'cleared' || consumed.has(tx.id)) continue;
		if (tx.amount == null) continue;
		byCurrency[tx.currency] = (byCurrency[tx.currency] ?? 0) + tx.amount;
	}

	const account = await accountService.getAccount(ledgerAccountId);
	if (account && Math.abs(account.currentBalance) > 0.001) {
		const fromTxs = byCurrency[account.currency] ?? 0;
		if (Math.abs(fromTxs) < 0.001) {
			byCurrency[account.currency] = account.currentBalance;
		}
	}

	return Object.fromEntries(
		Object.entries(byCurrency).filter(([, v]) => Math.abs(v) > 0.001)
	);
}
