export const BUDGIC_BACKUP_VERSION = '2.0';

export type BudgicBackupV2 = {
	version: typeof BUDGIC_BACKUP_VERSION;
	exportDate: string;
	tables: Record<string, unknown[]>;
};

/** Legacy export shape from early /data page. */
export type BudgicBackupV1 = {
	version: string;
	exportDate: string;
	accounts?: unknown[];
	transactions?: unknown[];
	categories?: unknown[];
	goals?: unknown[];
	insights?: unknown[];
	userActions?: unknown[];
	userPreferences?: unknown[];
};

export type BudgicBackupPayload = BudgicBackupV2 | BudgicBackupV1;

export function isV2BackupPayload(data: BudgicBackupPayload): data is BudgicBackupV2 {
	return (
		data.version === BUDGIC_BACKUP_VERSION &&
		typeof (data as BudgicBackupV2).tables === 'object' &&
		(data as BudgicBackupV2).tables !== null
	);
}

export function backupPayloadCounts(data: unknown): { accounts: number; transactions: number } {
	if (!data || typeof data !== 'object') {
		return { accounts: 0, transactions: 0 };
	}
	const backup = data as BudgicBackupPayload;
	if (isV2BackupPayload(backup)) {
		return {
			accounts: backup.tables.accounts?.length ?? 0,
			transactions: backup.tables.transactions?.length ?? 0
		};
	}
	const v1 = backup as BudgicBackupV1;
	return {
		accounts: v1.accounts?.length ?? 0,
		transactions: v1.transactions?.length ?? 0
	};
}

/** True when backup contains at least one account or transaction (user data). */
export function backupPayloadHasUserData(data: unknown): data is BudgicBackupPayload {
	if (!data || typeof data !== 'object') {
		return false;
	}
	const backup = data as BudgicBackupPayload;
	if (!backup.version || !backup.exportDate) {
		return false;
	}
	const { accounts, transactions } = backupPayloadCounts(backup);
	return accounts > 0 || transactions > 0;
}
