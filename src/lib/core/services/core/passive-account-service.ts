import type { Account } from '$lib/core/db';

function effectiveDailyRate(apr: number, compounding: 'daily' | 'monthly' | 'annual'): number {
	if (compounding === 'daily') return apr / 365;
	if (compounding === 'monthly') return apr / 12 / 30;
	return apr / 365;
}

/**
 * Pure projection of balance from last confirmation using `rateProfile`.
 * `apr` is annual decimal (e.g. 0.04 for 4%). Positive apr earns on positive balances;
 * negative apr charges (grows debt magnitude on negative / credit balances).
 */
function projectSignedBalance(
	baseSigned: number,
	apr: number,
	compounding: 'daily' | 'monthly' | 'annual',
	days: number
): number {
	if (days <= 0 || baseSigned === 0 || apr === 0) return baseSigned;

	const debt = baseSigned < 0;
	const magnitude = Math.abs(baseSigned);
	/** Daily rate applied to magnitude (always ≥ 0 for growth direction). */
	let daily: number;
	if (debt) {
		// Charging APR is stored negative; grow debt magnitude with −apr when apr < 0.
		const chargeAnnual = apr <= 0 ? -apr : Math.abs(apr);
		daily = effectiveDailyRate(chargeAnnual, compounding);
	} else {
		daily = effectiveDailyRate(apr, compounding);
	}

	const factor = Math.pow(1 + daily, days);
	const projectedMag = magnitude * factor;
	return debt ? -projectedMag : projectedMag;
}

class PassiveAccountService {
	projectBalance(account: Account, asOf: Date): number {
		const rp = account.rateProfile;
		if (!rp) {
			return account.currentBalance ?? 0;
		}

		const baseSigned =
			account.lastConfirmedBalance !== undefined && account.lastConfirmedBalance !== null
				? account.lastConfirmedBalance
				: (account.currentBalance ?? 0);

		const anchorIso = account.lastConfirmedAt ?? rp.effectiveFrom;
		const anchor = new Date(anchorIso);
		const ms = asOf.getTime() - anchor.getTime();
		const days = ms / 86_400_000;
		if (!Number.isFinite(days)) {
			return account.currentBalance ?? 0;
		}

		return projectSignedBalance(baseSigned, rp.apr, rp.compounding, days);
	}

	/** Balance to show in the Update sheet before user edits (spec: projected or last confirmed or ledger). */
	suggestedSheetOpeningBalance(account: Account, asOf: Date): number {
		const rp = account.rateProfile;
		if (rp && (account.lastConfirmedAt || account.lastConfirmedBalance != null)) {
			return this.projectBalance(account, asOf);
		}
		if (account.lastConfirmedBalance != null) return account.lastConfirmedBalance;
		return account.currentBalance ?? 0;
	}
}

export const passiveAccountService = new PassiveAccountService();

export const __test = { projectSignedBalance, effectiveDailyRate };
