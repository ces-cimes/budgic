import { db } from '$lib/core/db';
import type { Account } from '$lib/core/db';
import { accountService } from '$lib/core/services/core/account-service';
import { userService } from '$lib/core/services/core/user-service';
import { personService } from './person-service';

const ACCOUNT_TYPE_PRIORITY: Account['type'][] = ['checking', 'cash', 'savings', 'credit'];

/**
 * Resolve default anchor: wizard override → global pref → per-person pref → transfer volume.
 */
export async function resolveDefaultAnchorAccountId(params: {
	ledgerAccountId?: string;
	personId?: string;
	wizardOverride?: string;
}): Promise<string | null> {
	if (params.wizardOverride) {
		const override = await accountService.getAccount(params.wizardOverride);
		if (override && override.isActive !== false) return override.id;
	}

	const prefs = await userService.getUserPreferences();
	if (prefs?.defaultReimbursementAnchorAccountId) {
		const prefAccount = await accountService.getAccount(prefs.defaultReimbursementAnchorAccountId);
		if (prefAccount && prefAccount.isActive !== false) return prefAccount.id;
	}

	if (params.personId) {
		const person = await personService.getPerson(params.personId);
		if (person?.preferredAnchorAccountId) {
			const preferred = await accountService.getAccount(person.preferredAnchorAccountId);
			if (preferred && preferred.isActive !== false) return preferred.id;
		}
	}

	if (params.ledgerAccountId) {
		return await inferAnchorFromTransferVolume(params.ledgerAccountId);
	}
	return await getFallbackWalletAccountId();
}

async function inferAnchorFromTransferVolume(ledgerAccountId: string): Promise<string | null> {
	const wallets = await accountService.getWalletAccounts();
	if (wallets.length === 0) return null;

	const cutoff = new Date();
	cutoff.setMonth(cutoff.getMonth() - 18);
	const cutoffIso = cutoff.toISOString();

	const txs = await db.transactions
		.where('accountId')
		.equals(ledgerAccountId)
		.filter(
			(t) =>
				t.deletedAt == null &&
				t.status === 'cleared' &&
				t.type === 'transfer' &&
				!!t.clearedDate &&
				t.clearedDate >= cutoffIso
		)
		.toArray();

	const volumeByAccount = new Map<string, number>();
	for (const tx of txs) {
		const otherId = tx.transferDetails?.toAccountId;
		if (!otherId || otherId === ledgerAccountId) continue;
		const wallet = wallets.find((w) => w.id === otherId);
		if (!wallet) continue;
		const amt = Math.abs(tx.accountAmount ?? tx.amount ?? 0);
		volumeByAccount.set(otherId, (volumeByAccount.get(otherId) ?? 0) + amt);
	}

	if (volumeByAccount.size === 0) {
		const checking = wallets.find((w) => w.type === 'checking');
		return checking?.id ?? wallets[0]?.id ?? null;
	}

	let bestId: string | null = null;
	let bestVolume = -1;
	let bestPriority = ACCOUNT_TYPE_PRIORITY.length;

	for (const [accountId, volume] of volumeByAccount) {
		const acc = wallets.find((w) => w.id === accountId);
		if (!acc) continue;
		const priority = ACCOUNT_TYPE_PRIORITY.indexOf(acc.type);
		const p = priority === -1 ? ACCOUNT_TYPE_PRIORITY.length : priority;
		if (volume > bestVolume || (volume === bestVolume && p < bestPriority)) {
			bestVolume = volume;
			bestPriority = p;
			bestId = accountId;
		}
	}

	return bestId;
}

async function getFallbackWalletAccountId(): Promise<string | null> {
	const wallets = await accountService.getWalletAccounts();
	if (wallets.length === 0) return null;
	const checking = wallets.find((w) => w.type === 'checking');
	return checking?.id ?? wallets[0]?.id ?? null;
}
